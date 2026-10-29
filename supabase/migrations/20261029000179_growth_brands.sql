-- Growth Autopilot finds brands too: Indian D2C brands that work with Instagram creators and publish a marketing or
-- collab email on their own website. They go through the same search, page check, approval queue, daily number and
-- one-tap unsubscribe as creators; their email points to the brand sign-up, and a brand that signs up is marked joined.

-- 1. Who a lead is, and who to look for ----------------------------------------------------------------------------
alter table public.growth_leads add column if not exists kind text not null default 'creator';
alter table public.growth_leads drop constraint if exists growth_leads_kind_check;
alter table public.growth_leads add constraint growth_leads_kind_check check (kind in ('creator', 'brand'));

alter table public.growth_settings
  add column if not exists audience text not null default 'creators',
  add column if not exists brand_offer text not null default 'Brand Pro is free for your first 14 days.';
alter table public.growth_settings drop constraint if exists growth_settings_audience_check;
alter table public.growth_settings add constraint growth_settings_audience_check check (audience in ('creators', 'brands', 'both'));
alter table public.growth_settings drop constraint if exists growth_settings_brand_offer_check;
alter table public.growth_settings add constraint growth_settings_brand_offer_check check (char_length(brand_offer) <= 300);

-- 2. Sending: a brand's link goes to the brand sign-up ----------------------------------------------------------------
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

  v_link := 'https://app.miracleapp.live/signup?as=' || l.kind || '&g=' || l.token || '&utm_source=growth';
  insert into public.outbox (creator_id, kind, to_email, payload)
  values (null, 'growth_invite', l.email, jsonb_build_object('app', true, 'as', l.kind,
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

-- 3. A brand that signs up: marked joined (by the account's email, its website or its Instagram) -----------------------
create or replace function private.growth_on_brand_signup()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := (select lower(u.email) from auth.users u where u.id = new.owner);
  v_site text := lower(regexp_replace(regexp_replace(coalesce(new.website, ''), '^https?://(www\.)?', ''), '[/?#].*$', ''));
  v_ig text := lower(regexp_replace(regexp_replace(coalesce(new.instagram, ''), '^.*instagram\.com/', ''), '^@+|[/?#].*$', '', 'g'));
begin
  update public.growth_leads l set status = 'joined', joined_at = coalesce(l.joined_at, now())
  where l.kind = 'brand' and l.status <> 'joined' and (
    (v_email is not null and lower(l.email) = v_email)
    or (v_site <> '' and lower(regexp_replace(regexp_replace(l.website, '^https?://(www\.)?', ''), '[/?#].*$', '')) = v_site)
    or (v_ig <> '' and l.handle <> '' and lower(l.handle) = v_ig));
  return new;
end;
$$;
revoke execute on function private.growth_on_brand_signup() from public, anon, authenticated;
drop trigger if exists growth_on_brand_signup on public.brand_profiles;
create trigger growth_on_brand_signup after insert or update of website, instagram on public.brand_profiles
  for each row execute function private.growth_on_brand_signup();

-- 4. The admin panel: the audience and brand offer can be saved; counts for brands too ---------------------------------
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
    audience = coalesce(p ->> 'audience', audience),
    brand_offer = coalesce(p ->> 'brand_offer', brand_offer),
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
        'suppressed', (select count(*) from public.growth_suppress),
        'brands', count(*) filter (where kind = 'brand'),
        'brands_sent', count(*) filter (where kind = 'brand' and sent_at is not null),
        'brands_joined', count(*) filter (where kind = 'brand' and joined_at is not null))
      from public.growth_leads),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'sent', s, 'joined', j) order by d) from (
        select (coalesce(sent_at, followed_at) at time zone 'Asia/Kolkata')::date as d, count(*) as s, count(*) filter (where joined_at is not null) as j
        from public.growth_leads where coalesce(sent_at, followed_at) > now() - interval '30 days' group by 1) x), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(to_jsonb(l) - 'token' order by l.created_at desc) from (select * from public.growth_leads order by created_at desc limit 400) l), '[]'::jsonb),
    -- The last searches, and what Claude has cost this month (estimated at list prices).
    'runs', coalesce((select jsonb_agg(to_jsonb(r) - 'request' - 'found' - 'next_requests' order by r.at desc) from (select * from public.growth_runs order by at desc limit 10) r), '[]'::jsonb),
    'month_cost', (select coalesce(sum(cost_usd), 0) from public.growth_runs where at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'));
end;
$$;
revoke execute on function public.admin_growth(), public.admin_growth_settings(jsonb) from public, anon;
grant execute on function public.admin_growth(), public.admin_growth_settings(jsonb) to authenticated;
