-- Invite and earn: a creator's own address is her invite link (app.miracleapp.live/signup?invite=her-link).
-- Someone she brings in earns her a free month of Creator Pro: a creator once Miracle approves her, a brand
-- once it sends its first request. Up to 6 months a year. The screens brands already see (invoices,
-- quotes, agreements, tracking links, reports) invite them with her link.

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer integer not null references public.creator_settings (id) on delete cascade,
  kind text not null check (kind in ('creator', 'brand')),
  -- Who joined: their sign-in email (one person is invited once; the first link wins) and, for a brand,
  -- the team's login.
  email text not null unique,
  owner uuid,
  name text not null default '' check (char_length(name) <= 80),
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  -- Why no month came of it (the year's 6 were already earned).
  skipped text not null default ''
);
create index if not exists referrals_referrer_idx on public.referrals (referrer, created_at desc);
create index if not exists referrals_owner_idx on public.referrals (owner) where owner is not null;
alter table public.referrals enable row level security;
revoke all on public.referrals from anon, authenticated;

-- Someone who just signed up through a creator's link (called by the sign-up screens).
create or replace function public.referral_claim(p_ref text, p_kind text, p_name text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := public.jwt_email();
  r public.creator_settings;
begin
  if auth.uid() is null or coalesce(v_email, '') = '' or p_kind not in ('creator', 'brand') then return jsonb_build_object('ok', false); end if;
  select * into r from public.creator_settings s where s.slug = lower(btrim(coalesce(p_ref, ''))) and s.status = 'active' and s.slug_chosen;
  if r.id is null then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  -- Not herself, nor anyone on her team.
  if lower(r.creator_email) = v_email or exists (select 1 from public.team_members t where t.creator_id = r.id and lower(t.email) = v_email) then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;
  -- Only someone new: a creator who isn't on Miracle yet, a brand team made in the last two days.
  if p_kind = 'creator' and exists (select 1 from public.creator_settings s where lower(s.creator_email) = v_email and s.status = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'existing');
  end if;
  if p_kind = 'brand' and not exists (select 1 from public.brand_profiles b where b.owner = auth.uid() and b.created_at > now() - interval '2 days') then
    return jsonb_build_object('ok', false, 'reason', 'existing');
  end if;
  insert into public.referrals (referrer, kind, email, owner, name)
  values (r.id, p_kind, v_email, case when p_kind = 'brand' then auth.uid() end, left(btrim(coalesce(p_name, '')), 80))
  on conflict (email) do nothing;
  return jsonb_build_object('ok', true, 'by', r.display_name);
end;
$$;
revoke execute on function public.referral_claim(text, text, text) from public, anon;
grant execute on function public.referral_claim(text, text, text) to authenticated;

-- The month: Creator Pro until a month after whatever Pro she has now ends (or from today).
create or replace function private.referral_reward(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  f public.referrals;
  v_until timestamptz;
  v_email text;
begin
  select * into f from public.referrals where id = p_id and rewarded_at is null and skipped = '' for update;
  if f.id is null then return; end if;
  if (select count(*) from public.referrals x where x.referrer = f.referrer and x.rewarded_at > now() - interval '365 days') >= 6 then
    update public.referrals set skipped = 'cap' where id = f.id;
    return;
  end if;
  select greatest(now(), coalesce(max(s.ends_at), now())) + interval '30 days' into v_until
  from public.billing_subscriptions s join public.billing_plans p on p.code = s.plan
  where s.subject_kind = 'creator' and s.subject = f.referrer::text and p.rank >= 2 and private.sub_live(s);
  select coalesce(creator_email, '') into v_email from public.creator_settings where id = f.referrer;
  insert into public.billing_subscriptions (subject_kind, subject, plan, period, status, ends_at, source, email, note)
  values ('creator', f.referrer::text, 'creator_pro', 'comp', 'active', v_until, 'admin', v_email,
    left('Invite reward: ' || coalesce(nullif(f.name, ''), f.email) || ' joined as a ' || f.kind, 300));
  update public.referrals set rewarded_at = now() where id = f.id;
  insert into public.outbox (creator_id, kind, to_email, payload)
  values (f.referrer, 'invite_reward', v_email, jsonb_build_object('who', nullif(f.name, ''), 'as', f.kind, 'until', v_until));
end;
$$;
revoke execute on function private.referral_reward(uuid) from public, anon, authenticated;

-- A creator she invited is approved.
create or replace function private.referral_on_creator()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    perform private.referral_reward(f.id) from public.referrals f
    where f.kind = 'creator' and f.email = lower(new.creator_email) and f.rewarded_at is null and f.referrer <> new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists referral_on_creator on public.creator_settings;
create trigger referral_on_creator after insert or update of status on public.creator_settings for each row execute function private.referral_on_creator();

-- A brand she invited sends its first request.
create or replace function private.referral_on_request()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null or public.is_creator() then return new; end if;
  v_owner := public.brand_owner();
  if v_owner is null then return new; end if;
  perform private.referral_reward(f.id) from public.referrals f where f.kind = 'brand' and f.owner = v_owner and f.rewarded_at is null;
  return new;
end;
$$;
drop trigger if exists referral_on_request on public.collabs;
create trigger referral_on_request after insert on public.collabs for each row execute function private.referral_on_request();
revoke execute on function private.referral_on_creator(), private.referral_on_request() from public, anon, authenticated;

-- Her invite card: the link, who joined, and the months earned this year.
create or replace function public.my_referrals()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slug', s.slug,
    'cap', 6,
    'earned_year', (select count(*) from public.referrals f where f.referrer = s.id and f.rewarded_at > now() - interval '365 days'),
    'people', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(nullif(split_part(f.name, ' ', 1), ''), 'Someone'), 'kind', f.kind,
        'at', f.created_at, 'rewarded_at', f.rewarded_at, 'skipped', f.skipped) order by f.created_at desc)
      from (select * from public.referrals x where x.referrer = s.id order by x.created_at desc limit 20) f), '[]'::jsonb))
  from public.creator_settings s
  where s.id = public.current_creator() and auth.uid() is not null;
$$;
revoke execute on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;
