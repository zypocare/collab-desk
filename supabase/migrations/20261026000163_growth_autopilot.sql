-- Growth Autopilot: Miracle finds creators and invites them by email, run from the admin panel.
--
-- * growth-finder (edge function, daily at 9 AM India, or "Find now" in the panel): Indian creators who show a
--   business email on a public page, an email written for each. In "approve" mode they wait in the panel; in
--   "auto" they're queued straight away.
-- * private.growth_send_due() (every 10 minutes): one email at a time between 10 AM and 6 PM India, up to the
--   daily number, and one short follow-up a few days later to anyone who hasn't clicked, joined or said no.
-- * Every email has a one-tap unsubscribe; anyone who unsubscribes (or is on the never-email list) is never
--   written to again. Someone who signs up is marked joined (by email, Instagram handle, or the link they used).
-- * Creators who sign up are approved straight away while auto-approval is on (admins can still pause anyone).

-- 1. Settings ------------------------------------------------------------------------------------------------
create table if not exists public.growth_settings (
  id smallint primary key default 1 check (id = 1),
  "on" boolean not null default false,
  mode text not null default 'approve' check (mode in ('approve', 'auto')),
  daily integer not null default 20 check (daily between 1 and 60),
  niches text[] not null default '{Fashion,Beauty,Food,Travel,Lifestyle,Fitness}',
  cities text[] not null default '{}',
  min_followers integer not null default 5000,
  max_followers integer not null default 100000,
  sender_name text not null default 'Team Miracle' check (char_length(sender_name) between 1 and 60),
  reply_to text not null default 'support@miracleapp.live',
  offer text not null default 'Founding creators get Creator Pro free for a year.' check (char_length(offer) <= 300),
  follow_up_days integer not null default 4 check (follow_up_days between 2 and 14),
  auto_approve boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.growth_settings (id) values (1) on conflict do nothing;
alter table public.growth_settings enable row level security;
revoke all on public.growth_settings from anon, authenticated;

-- 2. The creators found ------------------------------------------------------------------------------------------
create table if not exists public.growth_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  handle text not null default '',
  email text not null,
  website text not null default '',
  -- The public page where the email was seen.
  source_url text not null default '',
  niche text not null default '',
  city text not null default '',
  followers integer,
  why text not null default '',
  subject text not null default '',
  body text not null default '',
  -- ready (waiting for approval) → approved → sent → followed; or skipped, unsubscribed, joined.
  status text not null default 'ready' check (status in ('ready', 'approved', 'sent', 'followed', 'skipped', 'unsubscribed', 'joined')),
  found_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  send_after timestamptz,
  sent_at timestamptz,
  follow_after timestamptz,
  followed_at timestamptz,
  clicked_at timestamptz,
  joined_at timestamptz,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
create unique index if not exists growth_leads_email_idx on public.growth_leads (lower(email));
create index if not exists growth_leads_handle_idx on public.growth_leads (lower(handle)) where handle <> '';
create index if not exists growth_leads_due_idx on public.growth_leads (status, send_after);
alter table public.growth_leads enable row level security;
revoke all on public.growth_leads from anon, authenticated;

-- Never email again.
create table if not exists public.growth_suppress (
  email text primary key,
  reason text not null default '',
  at timestamptz not null default now()
);
alter table public.growth_suppress enable row level security;
revoke all on public.growth_suppress from anon, authenticated;

-- 3. Sending, a few minutes apart in working hours -----------------------------------------------------------------
create or replace function private.growth_send_due(p_any_time boolean default false)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  g public.growth_settings;
  l public.growth_leads;
  v_hour integer := extract(hour from now() at time zone 'Asia/Kolkata');
  v_today integer;
  v_follow boolean := false;
  v_link text;
begin
  select * into g from public.growth_settings where id = 1;
  if not g."on" or (not p_any_time and (v_hour < 10 or v_hour >= 18)) then return 0; end if;
  select count(*) into v_today from public.growth_leads
  where (sent_at >= private.day_start()) or (followed_at >= private.day_start());
  if v_today >= g.daily then return 0; end if;

  -- First emails first; follow-ups when none are due.
  select * into l from public.growth_leads x
  where x.status = 'approved' and coalesce(x.send_after, now()) <= now()
    and not exists (select 1 from public.growth_suppress s where s.email = lower(x.email))
  order by x.send_after nulls first, x.created_at limit 1 for update skip locked;
  if l.id is null then
    select * into l from public.growth_leads x
    where x.status = 'sent' and x.follow_after <= now() and x.clicked_at is null and x.joined_at is null
      and not exists (select 1 from public.growth_suppress s where s.email = lower(x.email))
    order by x.follow_after limit 1 for update skip locked;
    v_follow := l.id is not null;
  end if;
  if l.id is null then return 0; end if;

  v_link := 'https://app.miracleapp.live/signup?as=creator&g=' || l.token || '&utm_source=growth';
  insert into public.outbox (creator_id, kind, to_email, payload)
  values (null, 'growth_invite', l.email, jsonb_build_object('app', true,
    'subject', case when v_follow then 'Re: ' || l.subject else l.subject end,
    'body', l.body, 'name', l.name, 'link', v_link, 'follow', v_follow, 'source', l.source_url,
    'unsubscribe', 'https://app.miracleapp.live/unsubscribe?g=' || l.token,
    'sender_name', g.sender_name, 'reply_to', g.reply_to));
  if v_follow then
    update public.growth_leads set status = 'followed', followed_at = now() where id = l.id;
  else
    update public.growth_leads set status = 'sent', sent_at = now(), follow_after = now() + make_interval(days => g.follow_up_days) where id = l.id;
  end if;
  return 1;
end;
$$;
revoke execute on function private.growth_send_due(boolean) from public, anon, authenticated;
select cron.unschedule('growth-send') where exists (select 1 from cron.job where jobname = 'growth-send');
select cron.schedule('growth-send', '*/10 * * * *', $$select private.growth_send_due()$$);
select cron.unschedule('growth-finder') where exists (select 1 from cron.job where jobname = 'growth-finder');
select cron.schedule('growth-finder', '30 3 * * *', $$select private.call_function('growth-finder')$$);

-- 4. From the email: the link opened, and unsubscribing (no sign-in) ------------------------------------------------
create or replace function public.growth_seen(p_token text)
returns void
language sql security definer
set search_path = public
as $$
  update public.growth_leads set clicked_at = coalesce(clicked_at, now()) where token = p_token and length(p_token) = 32;
$$;
create or replace function public.growth_unsubscribe(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  l public.growth_leads;
begin
  select * into l from public.growth_leads where token = p_token and length(p_token) = 32;
  if l.id is null then return jsonb_build_object('ok', false); end if;
  insert into public.growth_suppress (email, reason) values (lower(l.email), 'unsubscribed') on conflict (email) do nothing;
  update public.growth_leads set status = 'unsubscribed' where id = l.id and status <> 'joined';
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.growth_seen(text), public.growth_unsubscribe(text) from public;
grant execute on function public.growth_seen(text), public.growth_unsubscribe(text) to anon, authenticated;

-- 5. Sign-ups: marked joined, and approved straight away -------------------------------------------------------------
create or replace function private.growth_on_signup()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status or old.handle is distinct from new.handle then
    update public.growth_leads set status = 'joined', joined_at = coalesce(joined_at, now())
    where status <> 'joined' and (lower(email) = lower(new.creator_email) or (handle <> '' and lower(handle) = lower(new.handle)));
  end if;
  -- The invitation's founding offer: approved creators who came from it get Creator Pro for a year (the first 100).
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active')
     and exists (select 1 from public.growth_leads l where l.status = 'joined' and (lower(l.email) = lower(new.creator_email) or (l.handle <> '' and lower(l.handle) = lower(new.handle))))
     and not exists (select 1 from public.billing_subscriptions b where b.subject_kind = 'creator' and b.subject = new.id::text and b.note like 'Founding creator%')
     and (select count(*) from public.billing_subscriptions b where b.note like 'Founding creator%') < 100 then
    insert into public.billing_subscriptions (subject_kind, subject, plan, period, status, ends_at, source, email, note)
    values ('creator', new.id::text, 'creator_pro', 'comp', 'active', now() + interval '365 days', 'admin', coalesce(new.creator_email, ''),
      'Founding creator: invited by the Growth Autopilot');
  end if;
  -- Auto-approval: a new sign-up (not a declined one asking again, nor a banned email).
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') and (tg_op = 'INSERT' or old.status <> 'declined')
     and (select auto_approve from public.growth_settings where id = 1)
     and not exists (select 1 from public.banned b where b.kind = 'email' and b.value = lower(new.creator_email)) then
    update public.creator_settings set status = 'active', approved_at = coalesce(approved_at, now()) where id = new.id;
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (new.id, 'creator_approved', new.creator_email, jsonb_build_object('slug', case when new.slug_chosen then new.slug else '' end,
      'name', new.display_name,
      'url', case when new.slug_chosen then 'https://' || new.slug || '.miracleapp.live/studio' else 'https://app.miracleapp.live/signup' end));
  end if;
  return new;
end;
$$;
revoke execute on function private.growth_on_signup() from public, anon, authenticated;
drop trigger if exists growth_on_signup on public.creator_settings;
create trigger growth_on_signup after insert or update of status, handle on public.creator_settings for each row execute function private.growth_on_signup();

-- 6. The admin panel ---------------------------------------------------------------------------------------------
create or replace function public.admin_growth()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  return jsonb_build_object(
    'settings', (select to_jsonb(g) - 'id' from public.growth_settings g where id = 1),
    'counts', (select jsonb_build_object(
        'found', count(*),
        'waiting', count(*) filter (where status = 'ready'),
        'queued', count(*) filter (where status = 'approved'),
        'sent', count(*) filter (where sent_at is not null),
        'sent_today', count(*) filter (where sent_at >= private.day_start() or followed_at >= private.day_start()),
        'clicked', count(*) filter (where clicked_at is not null),
        'joined', count(*) filter (where joined_at is not null),
        'unsubscribed', count(*) filter (where status = 'unsubscribed'),
        'suppressed', (select count(*) from public.growth_suppress))
      from public.growth_leads),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'sent', s, 'joined', j) order by d) from (
        select (coalesce(sent_at, followed_at) at time zone 'Asia/Kolkata')::date as d, count(*) as s, count(*) filter (where joined_at is not null) as j
        from public.growth_leads where coalesce(sent_at, followed_at) > now() - interval '30 days' group by 1) x), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(to_jsonb(l) - 'token' order by l.created_at desc) from (select * from public.growth_leads order by created_at desc limit 400) l), '[]'::jsonb));
end;
$$;

create or replace function public.admin_growth_settings(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  before jsonb := (select to_jsonb(g) from public.growth_settings g where id = 1);
begin
  perform private.admin_check();
  update public.growth_settings set
    "on" = coalesce((p ->> 'on')::boolean, "on"),
    mode = coalesce(p ->> 'mode', mode),
    daily = coalesce((p ->> 'daily')::integer, daily),
    niches = coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(p -> 'niches') x where btrim(x) <> ''), case when p ? 'niches' then '{}' else niches end),
    cities = coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(p -> 'cities') x where btrim(x) <> ''), case when p ? 'cities' then '{}' else cities end),
    min_followers = coalesce((p ->> 'min_followers')::integer, min_followers),
    max_followers = coalesce((p ->> 'max_followers')::integer, max_followers),
    sender_name = coalesce(nullif(btrim(p ->> 'sender_name'), ''), sender_name),
    reply_to = coalesce(nullif(btrim(p ->> 'reply_to'), ''), reply_to),
    offer = coalesce(p ->> 'offer', offer),
    follow_up_days = coalesce((p ->> 'follow_up_days')::integer, follow_up_days),
    auto_approve = coalesce((p ->> 'auto_approve')::boolean, auto_approve),
    updated_at = now()
  where id = 1;
  -- In auto mode, whatever was waiting goes out too.
  if (select mode from public.growth_settings where id = 1) = 'auto' then
    update public.growth_leads set status = 'approved' where status = 'ready';
  end if;
  perform private.admin_log('growth_settings', 'growth', '1', 'Growth Autopilot', before, (select to_jsonb(g) from public.growth_settings g where id = 1), '');
  return public.admin_growth();
end;
$$;

-- Approve, skip or edit creators found (approve keeps the order they were found in, a few minutes apart).
create or replace function public.admin_growth_leads(p_ids uuid[], p_action text, p_subject text default null, p_body text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  if p_action = 'approve' then
    update public.growth_leads set status = 'approved', send_after = coalesce(send_after, now()) where id = any (p_ids) and status in ('ready', 'skipped');
  elsif p_action = 'skip' then
    update public.growth_leads set status = 'skipped' where id = any (p_ids) and status in ('ready', 'approved');
  elsif p_action = 'edit' then
    update public.growth_leads set subject = coalesce(nullif(btrim(p_subject), ''), subject), body = coalesce(nullif(btrim(p_body), ''), body)
    where id = any (p_ids) and status in ('ready', 'approved', 'skipped');
  elsif p_action = 'never' then
    insert into public.growth_suppress (email, reason) select lower(email), 'admin' from public.growth_leads where id = any (p_ids) on conflict do nothing;
    update public.growth_leads set status = 'skipped' where id = any (p_ids) and status in ('ready', 'approved', 'sent');
  else
    raise exception 'Unknown action.';
  end if;
  return public.admin_growth();
end;
$$;
revoke execute on function public.admin_growth(), public.admin_growth_settings(jsonb), public.admin_growth_leads(uuid[], text, text, text) from public, anon;
grant execute on function public.admin_growth(), public.admin_growth_settings(jsonb), public.admin_growth_leads(uuid[], text, text, text) to authenticated;
