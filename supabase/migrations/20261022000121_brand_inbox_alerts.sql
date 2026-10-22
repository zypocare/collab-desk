-- Brand must-haves:
--   1. One Requests list and one inbox across every creator. A request (and its messages) belongs to the
--      brand whatever creator's address the brand is on, so "is this my collab" now means any company
--      this login is a member of, not only the one for the creator whose address is open.
--   2. Phone alerts for brands: each brand login's own devices and what it wants to hear about.
--   3. Open-brief alerts: creators whose niche, content and rates fit hear when a brief opens (at most
--      3 a week); the brand hears about applications (each one, or a 6 pm summary); a shortlisted creator
--      is told.

-- 1. Requests and messages across creators ----------------------------------------------------------------
create or replace function public.is_my_collab(p_collab uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.collabs c join public.brand_members m on m.brand_id = c.brand_id
    where c.id = p_collab and m.profile_id = auth.uid());
$$;

-- Every request of this login, with the creator, what waits on the brand and the latest message.
create or replace function public.brand_requests_all()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x.obj order by x.waits desc, x.last_at desc nulls last), '[]'::jsonb)
  from (
    select
      (q.id is not null or d.id is not null or i.id is not null) as waits,
      greatest(lm.created_at, c.created_at) as last_at,
      jsonb_build_object(
        'id', c.id, 'code', c.code, 'stage', c.stage, 'stage_label', public.stage_label(c.stage), 'type', c.type,
        'fee', c.fee, 'product_value', c.product_value, 'received_on', c.received_on, 'live_date', c.live_date,
        'pay_status', c.pay_status,
        'deliverables', (select string_agg(dl.qty || ' ' || dl.kind || case when dl.qty > 1 and dl.kind !~ 's$' then 's' else '' end, ', ' order by dl.position)
                         from public.deliverables dl where dl.collab_id = c.id),
        'creator', jsonb_build_object('id', s.id, 'name', s.display_name, 'slug', s.slug,
          'photo', (select case when a.connected then nullif(a.profile_picture_url, '') end from public.ig_account a where a.id = s.id)),
        -- What waits on the brand: a quote to answer, a draft to approve, an invoice to pay.
        'needs', case when q.id is not null then 'quote' when d.id is not null then 'draft' when i.id is not null then 'pay' end,
        'quote_total', q.total, 'quote_currency', q.currency,
        'invoice_due', i.due_date, 'invoice_amount', i.payable,
        'unread', (select count(*) from public.collab_messages m left join public.collab_reads r on r.collab_id = c.id and r.side = 'brand'
                   where m.collab_id = c.id and m.sender = 'creator' and (r.read_at is null or m.created_at > r.read_at)),
        'last', case when lm.id is not null then jsonb_build_object('body', left(lm.body, 160), 'sender', lm.sender, 'at', lm.created_at) end
      ) as obj
    from private.my_collabs() c
    join public.creator_settings s on s.id = c.creator_id
    left join lateral (select qq.id, qq.total, qq.currency from public.quotes qq where qq.collab_id = c.id and qq.status = 'sent'
                       and qq.version = (select max(q2.version) from public.quotes q2 where q2.collab_id = c.id) limit 1) q on true
    left join lateral (select dd.id from public.drafts dd where dd.collab_id = c.id and dd.status = 'pending' limit 1) d on true
    left join lateral (select ii.id, ii.due_date, ii.payable from public.invoices ii where ii.collab_id = c.id
                       and ii.status in ('sent', 'partly_paid') and ii.claim_at is null order by ii.due_date nulls last limit 1) i on true
    left join lateral (select mm.id, mm.body, mm.sender, mm.created_at from public.collab_messages mm where mm.collab_id = c.id
                       order by mm.created_at desc limit 1) lm on true
  ) x
  where auth.uid() is not null and not public.is_creator();
$$;
revoke execute on function public.brand_requests_all() from public, anon;
grant execute on function public.brand_requests_all() to authenticated;

-- 2. Phone alerts for brands -------------------------------------------------------------------------------
create table if not exists public.brand_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists brand_push_subscriptions_user_idx on public.brand_push_subscriptions (user_id);
alter table public.brand_push_subscriptions enable row level security;
drop policy if exists "brand manages own devices" on public.brand_push_subscriptions;
create policy "brand manages own devices" on public.brand_push_subscriptions for all to authenticated
  using (user_id = auth.uid() and not (select public.is_creator()))
  with check (user_id = auth.uid() and not (select public.is_creator()));

create table if not exists public.brand_alert_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  quotes boolean not null default true,
  drafts boolean not null default true,
  messages boolean not null default true,
  invoices boolean not null default true,
  live boolean not null default true,
  -- Applications to open briefs: each one, or a summary at 6 pm.
  briefs text not null default 'digest' check (briefs in ('each', 'digest', 'off')),
  quiet boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.brand_alert_prefs enable row level security;
drop policy if exists "brand reads own alert settings" on public.brand_alert_prefs;
create policy "brand reads own alert settings" on public.brand_alert_prefs for select to authenticated using (user_id = auth.uid());

create or replace function private.alert_prefs(p_user uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object('quotes', quotes, 'drafts', drafts, 'messages', messages, 'invoices', invoices, 'live', live, 'briefs', briefs, 'quiet', quiet)
     from public.brand_alert_prefs where user_id = p_user),
    jsonb_build_object('quotes', true, 'drafts', true, 'messages', true, 'invoices', true, 'live', true, 'briefs', 'digest', 'quiet', true));
$$;
revoke execute on function private.alert_prefs(uuid) from public, anon, authenticated;

create or replace function public.brand_alerts_get()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select private.alert_prefs(auth.uid()) || jsonb_build_object('devices', (select count(*) from public.brand_push_subscriptions where user_id = auth.uid()))
  where auth.uid() is not null and not public.is_creator();
$$;
revoke execute on function public.brand_alerts_get() from public, anon;
grant execute on function public.brand_alerts_get() to authenticated;

create or replace function public.brand_alerts_set(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  cur jsonb;
begin
  if auth.uid() is null or public.is_creator() then
    raise exception 'Sign in with your brand email first.';
  end if;
  cur := private.alert_prefs(auth.uid()) || coalesce(p, '{}'::jsonb);
  if (cur ->> 'briefs') not in ('each', 'digest', 'off') then
    raise exception 'Pick each, 6 pm or off for applications.';
  end if;
  insert into public.brand_alert_prefs (user_id, quotes, drafts, messages, invoices, live, briefs, quiet)
  values (auth.uid(), (cur ->> 'quotes')::boolean, (cur ->> 'drafts')::boolean, (cur ->> 'messages')::boolean, (cur ->> 'invoices')::boolean,
          (cur ->> 'live')::boolean, cur ->> 'briefs', (cur ->> 'quiet')::boolean)
  on conflict (user_id) do update set quotes = excluded.quotes, drafts = excluded.drafts, messages = excluded.messages, invoices = excluded.invoices,
    live = excluded.live, briefs = excluded.briefs, quiet = excluded.quiet, updated_at = now();
  return public.brand_alerts_get();
end;
$$;
revoke execute on function public.brand_alerts_set(jsonb) from public, anon;
grant execute on function public.brand_alerts_set(jsonb) to authenticated;

-- For the server that sends alerts: the brand login an email goes to, its settings and its devices.
create or replace function public.brand_push_target(p_email text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('user_id', u.id, 'prefs', private.alert_prefs(u.id))
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
    and exists (select 1 from public.brand_push_subscriptions b where b.user_id = u.id)
    and not exists (select 1 from public.creator_settings s where lower(s.creator_email) = lower(u.email))
  limit 1;
$$;
revoke execute on function public.brand_push_target(text) from public, anon, authenticated;
grant execute on function public.brand_push_target(text) to service_role;

-- 3. Open-brief alerts ---------------------------------------------------------------------------------------
-- A creator can turn brief alerts off (Pitches > Open briefs).
alter table public.creator_settings add column if not exists brief_alerts boolean not null default true;

create table if not exists public.brief_alert_log (
  campaign_id uuid not null references public.brand_campaigns (id) on delete cascade,
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (campaign_id, creator_id)
);
create index if not exists brief_alert_log_creator_idx on public.brief_alert_log (creator_id, sent_at);
alter table public.brief_alert_log enable row level security; -- server-side only

create or replace function public.brief_alerts_set(p_on boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_creator() then
    raise exception 'Only creators have brief alerts.';
  end if;
  update public.creator_settings set brief_alerts = p_on where id = public.current_creator();
end;
$$;
revoke execute on function public.brief_alerts_set(boolean) from public, anon;
grant execute on function public.brief_alerts_set(boolean) to authenticated;

-- A brief just opened: tell the listed creators who fit it. Fit = they make what it asks for, their
-- niche is the brand's category (when the brand gave one), and their shown Reel rate isn't far above
-- the budget. At most 3 brief alerts a week each, never the same brief twice, 50 creators a brief.
create or replace function private.brief_notify(p_campaign uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  c public.brand_campaigns;
  b public.brands;
  v_kinds text[];
  v_desc text;
  n integer := 0;
  r record;
begin
  select * into c from public.brand_campaigns where id = p_campaign;
  if c.id is null or not c.open then
    return 0;
  end if;
  select * into b from public.brands where id = c.brand_from;
  select array_agg(btrim(x ->> 'kind')), string_agg((x ->> 'qty') || ' ' || btrim(x ->> 'kind'), ' + ')
    into v_kinds, v_desc
  from jsonb_array_elements(coalesce(c.brief -> 'deliverables', '[]'::jsonb)) x;
  for r in
    select s.id, s.creator_email, s.display_name
    from public.creator_settings s
    where s.status = 'active' and s.listed and s.slug_chosen and s.brief_alerts and s.creator_email <> ''
      and s.offered_kinds && coalesce(v_kinds, '{}')
      and (coalesce(btrim(b.category), '') = '' or b.category = 'Other' or s.niche ilike '%' || btrim(b.category) || '%')
      and (c.budget_max = 0 or not s.show_rates or coalesce(nullif(s.rates ->> 'Reel', '')::numeric, 0) <= c.budget_max * 1.25)
      and not exists (select 1 from public.brief_alert_log l where l.campaign_id = c.id and l.creator_id = s.id)
      and not exists (select 1 from public.campaign_applications a where a.campaign_id = c.id and a.creator_id = s.id)
      and (select count(*) from public.brief_alert_log l where l.creator_id = s.id and l.sent_at > now() - interval '7 days') < 3
      -- not the brand's own creators already working with it on this brief
      and not exists (select 1 from public.campaign_creators x where x.campaign_id = c.id and x.creator_id = s.id)
    order by random()
    limit 50
  loop
    insert into public.brief_alert_log (campaign_id, creator_id) values (c.id, r.id) on conflict do nothing;
    insert into public.outbox (kind, to_email, creator_id, payload)
    values ('brief_fit', r.creator_email, r.id, jsonb_build_object(
      'brand', coalesce(b.name, 'A brand'), 'campaign', c.name, 'deliverables', coalesce(v_desc, ''),
      'budget_min', c.budget_min, 'budget_max', c.budget_max, 'open_until', c.open_until,
      'verified', exists (select 1 from public.brand_ig g where g.owner = c.owner)));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function private.brief_notify(uuid) from public, anon, authenticated;

create or replace function private.brief_opened()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.open and not coalesce(old.open, false) then
    perform private.brief_notify(new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists brief_opened on public.brand_campaigns;
create trigger brief_opened after update of open on public.brand_campaigns
  for each row execute function private.brief_opened();

-- A creator applied: the brand hears now if it asked for each one (else in the 6 pm summary).
create or replace function private.brief_applied()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  c public.brand_campaigns;
  v_email text;
begin
  select * into c from public.brand_campaigns where id = new.campaign_id;
  select email into v_email from auth.users where id = c.owner;
  if v_email is null or (private.alert_prefs(c.owner) ->> 'briefs') <> 'each' then
    return new;
  end if;
  insert into public.outbox (kind, to_email, creator_id, payload)
  values ('brief_application', v_email, new.creator_id, jsonb_build_object(
    'campaign', c.name, 'campaign_id', c.id, 'creator', (select display_name from public.creator_settings where id = new.creator_id),
    'rate', new.rate, 'note', new.note, 'budget_max', c.budget_max));
  return new;
end;
$$;
drop trigger if exists brief_applied on public.campaign_applications;
create trigger brief_applied after insert on public.campaign_applications
  for each row execute function private.brief_applied();

-- Shortlisted: the creator is told.
create or replace function private.brief_shortlisted()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  c public.brand_campaigns;
  s public.creator_settings;
begin
  if new.status <> 'shortlist' or old.status = 'shortlist' then
    return new;
  end if;
  select * into c from public.brand_campaigns where id = new.campaign_id;
  select * into s from public.creator_settings where id = new.creator_id;
  if s.creator_email is null or s.creator_email = '' then
    return new;
  end if;
  insert into public.outbox (kind, to_email, creator_id, payload)
  values ('brief_shortlisted', s.creator_email, s.id, jsonb_build_object(
    'brand', coalesce((select name from public.brands where id = c.brand_from), 'A brand'), 'campaign', c.name, 'rate', new.rate));
  return new;
end;
$$;
drop trigger if exists brief_shortlisted on public.campaign_applications;
create trigger brief_shortlisted after update of status on public.campaign_applications
  for each row execute function private.brief_shortlisted();

-- 6 pm (India): one summary per brief that got applications in the last day, for brands on "6 pm".
create or replace function private.brief_digest()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select c.id, c.name, c.owner, c.budget_max, u.email,
      count(a.*) as fresh,
      min(a.rate) as low, max(a.rate) as high,
      (array_agg(a.creator_id order by a.created_at desc))[1] as latest
    from public.brand_campaigns c
    join auth.users u on u.id = c.owner
    join public.campaign_applications a on a.campaign_id = c.id and a.created_at > now() - interval '1 day'
    group by c.id, c.name, c.owner, c.budget_max, u.email
  loop
    continue when (private.alert_prefs(r.owner) ->> 'briefs') <> 'digest';
    insert into public.outbox (kind, to_email, creator_id, payload)
    values ('brief_digest', r.email, r.latest, jsonb_build_object(
      'campaign', r.name, 'campaign_id', r.id, 'count', r.fresh, 'low', r.low, 'high', r.high, 'budget_max', r.budget_max,
      'total', (select count(*) from public.campaign_applications x where x.campaign_id = r.id)));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function private.brief_digest() from public, anon, authenticated;
select cron.unschedule('brief-digest') where exists (select 1 from cron.job where jobname = 'brief-digest');
select cron.schedule('brief-digest', '30 12 * * *', $$select private.brief_digest()$$);
