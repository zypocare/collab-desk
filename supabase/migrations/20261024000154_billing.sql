-- Paid plans for Miracle itself: Free, Creator Pro, Brand Pro and Agency, monthly or yearly, sold through
-- Razorpay on the website and web app (never inside the Play Store or iPhone apps). Money between brands and
-- creators is untouched: no gateway and no commission there.
--
-- * billing_plans: the catalogue (prices include GST, limits for free plans, the features each unlocks).
-- * billing_subscriptions: who has which plan until when ('creator' = a creator's studio, 'workspace' = a
--   brand team, 'agency' = one login). A 14-day Pro trial starts with every new studio and brand team.
--   An Agency plan also covers every creator that login manages and its own brand team.
-- * billing_payments: each Razorpay charge, with our invoice number.
-- * Limits are checked where things happen (quotes, invoices, requests, campaigns, team seats, autopilots,
--   AI), so a free account can't get round them from another screen. Errors start with "Miracle Pro:" or
--   "Miracle Agency:" so the app can offer the upgrade.
-- * billing_daily(): trial-ending and ended notices; switches paid features off when a plan lapses.

-- 1. The catalogue ------------------------------------------------------------------------------------------
create table if not exists public.billing_plans (
  code text primary key,
  side text not null check (side in ('creator', 'brand', 'agency')),
  name text not null,
  tagline text not null default '',
  rank smallint not null,
  price_month integer not null default 0,
  price_year integer not null default 0,
  founding_year integer,
  limits jsonb not null default '{}'::jsonb,
  features text[] not null default '{}',
  gateway jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.billing_plans enable row level security;
revoke all on public.billing_plans from anon, authenticated;

insert into public.billing_plans (code, side, name, tagline, rank, price_month, price_year, founding_year, limits, features, sort) values
  ('creator_free', 'creator', 'Free', 'Your brand page, requests and collab board', 1, 0, 0, null,
   '{"quotes_month": 3, "invoices_month": 3, "pitches_month": 5, "ai_day": 1500, "seats": 1}', '{}', 10),
  ('creator_pro', 'creator', 'Creator Pro', 'Every autopilot working for you, unlimited quotes and invoices', 2, 299, 2999, 1499,
   '{"seats": 6}', '{autopilots,reminders,bank_match,insights_page,fan_list,results_reports}', 20),
  ('brand_free', 'brand', 'Free', 'Find creators and send your first requests', 1, 0, 0, null,
   '{"requests_month": 3, "campaigns_month": 1, "ai_day": 1000, "seats": 1}', '{}', 30),
  ('brand_pro', 'brand', 'Brand Pro', 'Unlimited requests and campaigns, autopilots and your team', 2, 1999, 19999, 9999,
   '{"seats": 5}', '{open_briefs,brand_autopilots,sales_tracking,turnaround}', 40),
  ('agency', 'agency', 'Agency', 'Every creator you manage and every client, on Pro', 3, 4999, 49999, 24999,
   '{"seats": 15}', '{autopilots,reminders,bank_match,insights_page,fan_list,results_reports,open_briefs,brand_autopilots,sales_tracking,turnaround,workspaces,roster}', 50)
on conflict (code) do nothing;

create table if not exists public.billing_settings (
  id smallint primary key default 1 check (id = 1),
  trial_days integer not null default 14 check (trial_days between 0 and 90),
  grace_days integer not null default 3 check (grace_days between 0 and 30),
  founding_on boolean not null default true,
  founding_left integer not null default 100 check (founding_left >= 0),
  seller jsonb not null default '{"legal_name": "Zyposoft Technologies Private Limited"}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.billing_settings (id) values (1) on conflict do nothing;
alter table public.billing_settings enable row level security;
revoke all on public.billing_settings from anon, authenticated;

-- 2. Subscriptions and payments -----------------------------------------------------------------------------
create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null check (subject_kind in ('creator', 'workspace', 'agency')),
  subject text not null,
  plan text not null references public.billing_plans (code),
  period text not null check (period in ('trial', 'month', 'year', 'comp')),
  status text not null default 'active' check (status in ('pending', 'active', 'cancelled', 'halted', 'ended')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  founding boolean not null default false,
  cancel_at_end boolean not null default false,
  source text not null default 'razorpay' check (source in ('trial', 'razorpay', 'admin')),
  gateway_id text unique,
  email text not null default '',
  bought_by uuid references auth.users (id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists billing_subscriptions_subject_idx on public.billing_subscriptions (subject_kind, subject, ends_at desc);
create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.billing_subscriptions (id) on delete cascade,
  gateway_payment_id text unique,
  amount numeric(12, 2) not null,
  gst numeric(12, 2) not null default 0,
  period_end timestamptz,
  invoice_no text unique,
  paid_at timestamptz not null default now()
);
create sequence if not exists public.billing_invoice_seq start 1;
create table if not exists public.billing_notices (
  subscription_id uuid not null references public.billing_subscriptions (id) on delete cascade,
  kind text not null,
  period_end timestamptz not null,
  at timestamptz not null default now(),
  primary key (subscription_id, kind, period_end)
);
alter table public.billing_subscriptions enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_notices enable row level security;
revoke all on public.billing_subscriptions, public.billing_payments, public.billing_notices from anon, authenticated;
revoke all on sequence public.billing_invoice_seq from anon, authenticated;

-- 3. Which plan an account is on ------------------------------------------------------------------------------
-- A subscription counts while its period lasts; a paid one that couldn't renew keeps working for the grace days.
create or replace function private.sub_live(s public.billing_subscriptions)
returns boolean
language sql stable
as $$
  select s.status in ('active', 'cancelled', 'halted') and s.ends_at is not null
    and s.ends_at + case when s.status = 'halted' or (s.status = 'active' and s.period in ('month', 'year'))
                        then make_interval(days => (select grace_days from public.billing_settings where id = 1)) else interval '0' end > now();
$$;

-- The logins whose Agency plan covers a creator: whoever runs her studio (the creator or her managers).
create or replace function private.agency_logins_for_creator(p_creator integer)
returns setof text
language sql stable security definer
set search_path = public
as $$
  select u.id::text from auth.users u
  where lower(u.email) in (
    select lower(s.creator_email) from public.creator_settings s where s.id = p_creator
    union select lower(t.email) from public.team_members t where t.creator_id = p_creator and t.role in ('owner', 'manager'));
$$;

-- The best live subscription for an account (its own, or an Agency plan that covers it).
create or replace function private.plan_sub(p_kind text, p_subject text)
returns public.billing_subscriptions
language sql stable security definer
set search_path = public
as $$
  select s.* from public.billing_subscriptions s join public.billing_plans p on p.code = s.plan
  where private.sub_live(s) and (
    (s.subject_kind = p_kind and s.subject = p_subject)
    or (s.subject_kind = 'agency' and p_kind = 'creator' and s.subject in (select private.agency_logins_for_creator(p_subject::integer)))
    or (s.subject_kind = 'agency' and p_kind = 'workspace' and s.subject = p_subject))
  order by p.rank desc, s.ends_at desc
  limit 1;
$$;

create or replace function private.plan_code(p_kind text, p_subject text)
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce((private.plan_sub(p_kind, p_subject)).plan,
    case p_kind when 'creator' then 'creator_free' when 'workspace' then 'brand_free' else null end);
$$;

-- A limit for an account: null means no limit (paid plans leave most out).
create or replace function private.plan_limit(p_kind text, p_subject text, p_key text)
returns integer
language sql stable security definer
set search_path = public
as $$
  select (p.limits ->> p_key)::integer from public.billing_plans p where p.code = private.plan_code(p_kind, p_subject);
$$;

create or replace function private.plan_has(p_kind text, p_subject text, p_feature text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(p_feature = any (p.features), false) from public.billing_plans p where p.code = private.plan_code(p_kind, p_subject);
$$;

-- System jobs, Miracle admins and the review demo account are never stopped by a plan.
create or replace function private.plan_exempt()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is null or coalesce(public.is_app_admin(), false);
$$;

-- "Miracle Pro: …" (or Agency). The app shows the upgrade when an error starts like this.
create or replace function private.plan_block(p_msg text, p_agency boolean default false)
returns void
language plpgsql
as $$
begin
  raise exception '%', (case when p_agency then 'Miracle Agency: ' else 'Miracle Pro: ' end) || p_msg using hint = 'upgrade';
end;
$$;

-- The start of this month in India.
create or replace function private.month_start()
returns timestamptz
language sql stable
as $$
  select date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
$$;

revoke execute on function private.sub_live(public.billing_subscriptions), private.agency_logins_for_creator(integer),
  private.plan_sub(text, text), private.plan_code(text, text), private.plan_limit(text, text, text), private.plan_has(text, text, text),
  private.plan_exempt(), private.plan_block(text, boolean), private.month_start() from public, anon, authenticated;

-- 4. Limits where things happen ------------------------------------------------------------------------------
-- Creator switches that are paid features: turning one on needs the plan (turning off is always fine).
create or replace function private.plan_creator_switches()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_id text := new.id::text;
begin
  if private.plan_exempt() then return new; end if;
  if (new.autopilot_packages and not old.autopilot_packages) or (new.autopilot_counter and not old.autopilot_counter)
     or (new.autopilot_nudge and not old.autopilot_nudge) or (new.autopilot_review and not old.autopilot_review)
     or (new.autopilot_brief and not old.autopilot_brief) or (new.autopilot_invoice and not old.autopilot_invoice)
     or (new.autopilot_dates and not old.autopilot_dates) or (new.autopilot_track and not old.autopilot_track)
     or (new.pitch_auto and not old.pitch_auto) or (new.demand_pricing and not old.demand_pricing)
     or (new.instant_booking and not old.instant_booking) or (new.rebook_offer and not old.rebook_offer) then
    if not private.plan_has('creator', v_id, 'autopilots') then perform private.plan_block('Autopilots work for you on Creator Pro.'); end if;
  end if;
  if new.reminders_enabled and not old.reminders_enabled and not private.plan_has('creator', v_id, 'reminders') then
    perform private.plan_block('Automatic payment reminders are on Creator Pro.');
  end if;
  if new.pay_alerts and not old.pay_alerts and not private.plan_has('creator', v_id, 'bank_match') then
    perform private.plan_block('Matching bank credits to invoices is on Creator Pro.');
  end if;
  if ((new.show_insights and not old.show_insights) or (new.insights_stories and not old.insights_stories)) and not private.plan_has('creator', v_id, 'insights_page') then
    perform private.plan_block('The live insights page for brands is on Creator Pro.');
  end if;
  if new.fan_list_on and not old.fan_list_on and not private.plan_has('creator', v_id, 'fan_list') then
    perform private.plan_block('Your fan email list is on Creator Pro.');
  end if;
  return new;
end;
$$;
drop trigger if exists plan_creator_switches on public.creator_settings;
create trigger plan_creator_switches before update on public.creator_settings for each row execute function private.plan_creator_switches();

-- Quotes: free plans send quotes to 3 collabs a month (new versions to the same collab don't count again).
create or replace function private.plan_quotes()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_cap integer;
begin
  if new.status <> 'sent' or (tg_op = 'UPDATE' and old.status = 'sent') or private.plan_exempt() then return new; end if;
  v_cap := private.plan_limit('creator', new.creator_id::text, 'quotes_month');
  if v_cap is not null and (select count(distinct q.collab_id) from public.quotes q
      where q.creator_id = new.creator_id and q.sent_at >= private.month_start() and q.collab_id <> new.collab_id) >= v_cap then
    perform private.plan_block(format('The free plan sends quotes for %s collabs a month. Go Pro for unlimited quotes.', v_cap));
  end if;
  return new;
end;
$$;
drop trigger if exists plan_quotes on public.quotes;
create trigger plan_quotes before insert or update of status on public.quotes for each row execute function private.plan_quotes();

-- Invoices: free plans send 3 a month.
create or replace function private.plan_invoices()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_cap integer;
begin
  if new.status <> 'sent' or (tg_op = 'UPDATE' and old.status <> 'draft') or private.plan_exempt() then return new; end if;
  v_cap := private.plan_limit('creator', new.creator_id::text, 'invoices_month');
  if v_cap is not null and (select count(*) from public.invoices i
      where i.creator_id = new.creator_id and i.sent_at >= private.month_start() and i.id <> new.id) >= v_cap then
    perform private.plan_block(format('The free plan sends %s invoices a month. Go Pro for unlimited invoices.', v_cap));
  end if;
  return new;
end;
$$;
drop trigger if exists plan_invoices on public.invoices;
create trigger plan_invoices before insert or update of status on public.invoices for each row execute function private.plan_invoices();

-- Pitches the creator sends by hand: 5 a month on the free plan.
create or replace function private.plan_pitches()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_cap integer;
begin
  if new.status <> 'sent' or (tg_op = 'UPDATE' and old.status = 'sent') or private.plan_exempt() then return new; end if;
  v_cap := private.plan_limit('creator', new.creator_id::text, 'pitches_month');
  if v_cap is not null and (select count(*) from public.pitches p
      where p.creator_id = new.creator_id and p.sent_at >= private.month_start() and p.id <> new.id) >= v_cap then
    perform private.plan_block(format('The free plan sends %s pitches a month. Go Pro for unlimited pitches and the pitch autopilot.', v_cap));
  end if;
  return new;
end;
$$;
drop trigger if exists plan_pitches on public.pitches;
create trigger plan_pitches before insert or update of status on public.pitches for each row execute function private.plan_pitches();

-- A creator's team: seats include the creator.
create or replace function private.plan_creator_seats()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_cap integer;
begin
  if private.plan_exempt() or new.role = 'owner' then return new; end if;
  v_cap := private.plan_limit('creator', new.creator_id::text, 'seats');
  if v_cap is not null and 1 + (select count(*) from public.team_members t where t.creator_id = new.creator_id and t.role <> 'owner') >= v_cap then
    perform private.plan_block(case when v_cap <= 1 then 'Adding your team (manager, editor, accountant) is on Creator Pro.'
      else format('Your plan has %s seats. Remove someone first, or go Agency.', v_cap) end);
  end if;
  return new;
end;
$$;
drop trigger if exists plan_creator_seats on public.team_members;
create trigger plan_creator_seats before insert on public.team_members for each row execute function private.plan_creator_seats();

-- Brand requests: a free brand team sends 3 a month (requests creators send to themselves don't count).
create or replace function private.plan_requests()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_cap integer;
begin
  if private.plan_exempt() or public.is_creator() then return new; end if;
  v_owner := public.brand_owner();
  v_cap := private.plan_limit('workspace', v_owner::text, 'requests_month');
  if v_cap is not null and (select count(distinct c.id) from public.collabs c join public.brand_members m on m.brand_id = c.brand_id and m.owner = v_owner
      where c.created_at >= private.month_start()) >= v_cap then
    perform private.plan_block(format('The free plan sends %s requests a month. Go Brand Pro for unlimited requests.', v_cap));
  end if;
  return new;
end;
$$;
drop trigger if exists plan_requests on public.collabs;
create trigger plan_requests before insert on public.collabs for each row execute function private.plan_requests();

-- Campaigns: one a month on the free plan; an open brief (creators apply) is Pro.
create or replace function private.plan_campaigns()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_cap integer;
begin
  if private.plan_exempt() then return new; end if;
  if new.open and (tg_op = 'INSERT' or not old.open) and not private.plan_has('workspace', new.owner::text, 'open_briefs') then
    perform private.plan_block('Open briefs that creators apply to are on Brand Pro.');
  end if;
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status <> 'sent') then
    v_cap := private.plan_limit('workspace', new.owner::text, 'campaigns_month');
    if v_cap is not null and (select count(*) from public.brand_campaigns c where c.owner = new.owner and c.sent_at >= private.month_start() and c.id <> new.id) >= v_cap then
      perform private.plan_block(format('The free plan sends %s campaign a month. Go Brand Pro for unlimited campaigns.', v_cap));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists plan_campaigns on public.brand_campaigns;
create trigger plan_campaigns before insert or update on public.brand_campaigns for each row execute function private.plan_campaigns();

-- Brand autopilots (shortlist, follow-up, draft check, negotiate, rebook, competitor watch) are Pro.
create or replace function private.plan_brand_autopilots()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if private.plan_exempt() or private.plan_has('workspace', new.owner::text, 'brand_autopilots') then return new; end if;
  if (coalesce(new.shortlist, 'off') <> 'off' and (tg_op = 'INSERT' or coalesce(old.shortlist, 'off') = 'off'))
     or (coalesce(new.followup, 'off') <> 'off' and (tg_op = 'INSERT' or coalesce(old.followup, 'off') = 'off'))
     or (coalesce(new.draftcheck, 'off') <> 'off' and (tg_op = 'INSERT' or coalesce(old.draftcheck, 'off') = 'off'))
     or (coalesce(new.negotiate, 'off') <> 'off' and (tg_op = 'INSERT' or coalesce(old.negotiate, 'off') = 'off'))
     or (coalesce(new.rebook, 'off') <> 'off' and (tg_op = 'INSERT' or coalesce(old.rebook, 'off') = 'off'))
     or (coalesce(new.watch, 'off') <> 'off' and (tg_op = 'INSERT' or coalesce(old.watch, 'off') = 'off')) then
    perform private.plan_block('Brand autopilots work for you on Brand Pro.');
  end if;
  return new;
end;
$$;
drop trigger if exists plan_brand_autopilots on public.brand_autopilots;
create trigger plan_brand_autopilots before insert or update on public.brand_autopilots for each row execute function private.plan_brand_autopilots();

-- A brand team's seats include its admin.
create or replace function private.plan_brand_seats()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_cap integer := private.plan_limit('workspace', new.owner::text, 'seats');
begin
  if private.plan_exempt() then return new; end if;
  if v_cap is not null and 1 + (select count(*) from public.brand_team_members m where m.owner = new.owner and m.email <> new.email) >= v_cap then
    perform private.plan_block(case when v_cap <= 1 then 'Inviting your team is on Brand Pro.'
      else format('Your plan has %s seats. Remove someone first, or go Agency.', v_cap) end);
  end if;
  return new;
end;
$$;
drop trigger if exists plan_brand_seats on public.brand_team_members;
create trigger plan_brand_seats before insert on public.brand_team_members for each row execute function private.plan_brand_seats();

-- Sales tracking (imported orders) is Pro.
create or replace function private.plan_sales()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if private.plan_exempt() or private.plan_has('workspace', new.owner::text, 'sales_tracking') then return new; end if;
  perform private.plan_block('Sales tracking from your store''s orders is on Brand Pro.');
  return new;
end;
$$;
drop trigger if exists plan_sales on public.brand_orders;
create trigger plan_sales before insert on public.brand_orders for each row execute function private.plan_sales();

revoke execute on function private.plan_creator_switches(), private.plan_quotes(), private.plan_invoices(), private.plan_pitches(),
  private.plan_creator_seats(), private.plan_requests(), private.plan_campaigns(), private.plan_brand_autopilots(),
  private.plan_brand_seats(), private.plan_sales() from public, anon, authenticated;

-- Turnaround owners and targets are Pro (the report itself stays visible); escalation runs for Pro teams.
create or replace function private.plan_tat()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if private.plan_exempt() or private.plan_has('workspace', new.owner::text, 'turnaround') then return new; end if;
  perform private.plan_block('Turnaround owners, targets and escalation are on Brand Pro.');
  return new;
end;
$$;
drop trigger if exists plan_tat_owners on public.brand_collab_owners;
create trigger plan_tat_owners before insert or update on public.brand_collab_owners for each row execute function private.plan_tat();
drop trigger if exists plan_tat_settings on public.brand_tat_settings;
create trigger plan_tat_settings before insert or update on public.brand_tat_settings for each row execute function private.plan_tat();
revoke execute on function private.plan_tat() from public, anon, authenticated;

-- AI: the admin's override for an account first, else the plan's daily cap, else the usual ceiling.
create or replace function public.ai_take2(p_kind text, p_cost integer)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_me integer := public.current_creator();
  v_cap integer;
  v_used integer;
begin
  if not private.flag_on('ai_creator') then return jsonb_build_object('ok', false, 'reason', 'budget', 'paused', true); end if;
  v_cap := coalesce(private.override_of('ai_day', 'creator', v_me::text), private.plan_limit('creator', v_me::text, 'ai_day'));
  if v_cap is not null then
    select coalesce(sum(cost), 0) into v_used from public.ai_usage where creator_id = v_me and day = private.ai_day() and kind not like 'gemini%';
    if v_used + greatest(1, least(coalesce(p_cost, 150), 2000)) > v_cap then return jsonb_build_object('ok', false, 'reason', 'budget', 'used', v_used, 'capped', true, 'plan', private.plan_code('creator', v_me::text)); end if;
  end if;
  return private.ai_take2_do(p_kind, p_cost);
end;
$$;

create or replace function public.ai_take_gemini(p_kind text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_me integer := public.current_creator();
  v_cap integer := coalesce(private.override_of('ai_day', 'creator', public.current_creator()::text), private.plan_limit('creator', public.current_creator()::text, 'ai_day'));
begin
  if not private.flag_on('ai_creator') or not private.flag_on('ai_gemini') then return jsonb_build_object('ok', false, 'reason', 'budget', 'paused', true); end if;
  if v_cap is not null and (select coalesce(sum(cost), 0) from public.ai_usage where creator_id = v_me and day = private.ai_day() and kind not like 'gemini%') >= v_cap then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'capped', true);
  end if;
  return private.ai_take_gemini_do(p_kind);
end;
$$;

create or replace function public.ai_take_brand(p_kind text, p_cost integer)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid := private.ai_brand_owner();
  v_cap integer;
  v_used integer;
begin
  if v_owner is not null and not private.flag_on('ai_brand') then return jsonb_build_object('ok', false, 'reason', 'budget', 'paused', true); end if;
  v_cap := coalesce(private.override_of('ai_day', 'workspace', v_owner::text), private.plan_limit('workspace', v_owner::text, 'ai_day'));
  if v_cap is not null then
    select coalesce(sum(cost), 0) into v_used from public.brand_ai_usage where owner = v_owner and day = private.ai_day() and kind not like 'gemini%';
    if v_used + greatest(1, least(coalesce(p_cost, 300), 2000)) > v_cap then return jsonb_build_object('ok', false, 'reason', 'budget', 'used', v_used, 'capped', true, 'plan', private.plan_code('workspace', v_owner::text)); end if;
  end if;
  return private.ai_take_brand_do(p_kind, p_cost);
end;
$$;

create or replace function public.ai_take_brand_gemini(p_kind text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid := private.ai_brand_owner();
  v_cap integer := coalesce(private.override_of('ai_day', 'workspace', private.ai_brand_owner()::text), private.plan_limit('workspace', private.ai_brand_owner()::text, 'ai_day'));
begin
  if not private.flag_on('ai_brand') or not private.flag_on('ai_gemini') then return jsonb_build_object('ok', false, 'reason', 'budget', 'paused', true); end if;
  if v_cap is not null and (select coalesce(sum(cost), 0) from public.brand_ai_usage where owner = v_owner and day = private.ai_day() and kind not like 'gemini%') >= v_cap then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'capped', true);
  end if;
  return private.ai_take_brand_gemini_do(p_kind);
end;
$$;
revoke execute on function public.ai_take2(text, integer), public.ai_take_gemini(text), public.ai_take_brand(text, integer), public.ai_take_brand_gemini(text) from public, anon;
grant execute on function public.ai_take2(text, integer), public.ai_take_gemini(text), public.ai_take_brand(text, integer), public.ai_take_brand_gemini(text) to authenticated;

-- Agency: working for more than one client team, and the roster of several creators.
do $$ begin
  if to_regprocedure('private.brand_use_workspace_do(uuid)') is null then
    alter function public.brand_use_workspace(uuid) rename to brand_use_workspace_do;
    alter function public.brand_use_workspace_do(uuid) set schema private;
  end if;
end $$;
revoke execute on function private.brand_use_workspace_do(uuid) from public, anon, authenticated;
create or replace function public.brand_use_workspace(p_owner uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  -- Your own team and one client are free; switching among more clients is the Agency plan.
  if not private.plan_exempt() and p_owner is distinct from auth.uid()
     and (select count(*) from private.my_teams() t where t <> auth.uid()) > 1
     and not private.plan_has('agency', auth.uid()::text, 'workspaces') then
    perform private.plan_block('Working for several client teams is on the Agency plan.', true);
  end if;
  return private.brand_use_workspace_do(p_owner);
end;
$$;
revoke execute on function public.brand_use_workspace(uuid) from public, anon;
grant execute on function public.brand_use_workspace(uuid) to authenticated;

do $$ begin
  if to_regprocedure('private.agency_roster_do()') is null then
    alter function public.agency_roster() rename to agency_roster_do;
    alter function public.agency_roster_do() set schema private;
  end if;
end $$;
revoke execute on function private.agency_roster_do() from public, anon, authenticated;
create or replace function public.agency_roster()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v jsonb := private.agency_roster_do();
begin
  if jsonb_array_length(v) > 1 and not private.plan_exempt() and not private.plan_has('agency', auth.uid()::text, 'roster') then
    perform private.plan_block('Managing several creators from one roster is on the Agency plan.', true);
  end if;
  return v;
end;
$$;
revoke execute on function public.agency_roster() from public, anon;
grant execute on function public.agency_roster() to authenticated;

-- 5. Trials and early accounts ----------------------------------------------------------------------------------
create or replace function private.start_trial(p_kind text, p_subject text, p_plan text, p_email text)
returns void
language sql security definer
set search_path = public
as $$
  insert into public.billing_subscriptions (subject_kind, subject, plan, period, status, ends_at, source, email)
  select p_kind, p_subject, p_plan, 'trial', 'active', now() + make_interval(days => s.trial_days), 'trial', coalesce(p_email, '')
  from public.billing_settings s
  where s.id = 1 and s.trial_days > 0
    and not exists (select 1 from public.billing_subscriptions x where x.subject_kind = p_kind and x.subject = p_subject);
$$;
revoke execute on function private.start_trial(text, text, text, text) from public, anon, authenticated;

create or replace function private.trial_on_approval()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    perform private.start_trial('creator', new.id::text, 'creator_pro', new.creator_email);
  end if;
  return new;
end;
$$;
drop trigger if exists trial_on_approval on public.creator_settings;
create trigger trial_on_approval after insert or update of status on public.creator_settings for each row execute function private.trial_on_approval();

create or replace function private.trial_on_brand_signup()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform private.start_trial('workspace', new.owner::text, 'brand_pro', (select u.email from auth.users u where u.id = new.owner));
  return new;
end;
$$;
drop trigger if exists trial_on_brand_signup on public.brand_profiles;
create trigger trial_on_brand_signup after insert on public.brand_profiles for each row execute function private.trial_on_brand_signup();
revoke execute on function private.trial_on_approval(), private.trial_on_brand_signup() from public, anon, authenticated;

-- Everyone already using Miracle before plans existed keeps Pro free until 31 March 2027; the demo account
-- Meta reviews keeps it to the end of 2027.
insert into public.billing_subscriptions (subject_kind, subject, plan, period, status, ends_at, source, email, note)
select 'creator', s.id::text, 'creator_pro', 'comp', 'active',
  case when s.id = 2 then timestamptz '2027-12-31 23:59:59+05:30' else timestamptz '2027-03-31 23:59:59+05:30' end,
  'admin', coalesce(s.creator_email, ''), 'Early access: on Miracle before plans existed'
from public.creator_settings s
where s.status = 'active' and not exists (select 1 from public.billing_subscriptions x where x.subject_kind = 'creator' and x.subject = s.id::text);
insert into public.billing_subscriptions (subject_kind, subject, plan, period, status, ends_at, source, email, note)
select 'workspace', o.owner::text, 'brand_pro', 'comp', 'active', timestamptz '2027-03-31 23:59:59+05:30', 'admin',
  coalesce((select u.email from auth.users u where u.id = o.owner), ''), 'Early access: on Miracle before plans existed'
from (select distinct owner from public.brand_members union select owner from public.brand_profiles) o
where not exists (select 1 from public.billing_subscriptions x where x.subject_kind = 'workspace' and x.subject = o.owner::text);

-- 6. What the app shows ----------------------------------------------------------------------------------------
-- The account this login is buying for or limited by, here: the studio for a creator, else the brand team.
create or replace function private.my_subject()
returns table (kind text, subject text)
language sql stable security definer
set search_path = public
as $$
  select case when public.is_creator() then 'creator' else 'workspace' end,
         case when public.is_creator() then public.current_creator()::text else public.brand_owner()::text end;
$$;
revoke execute on function private.my_subject() from public, anon, authenticated;

-- Can this login buy for that account? The creator herself (or her manager), or the brand team's admin.
create or replace function private.can_buy(p_kind text, p_subject text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case p_kind
    when 'creator' then exists (select 1 from public.creator_settings s where s.id = p_subject::integer and lower(s.creator_email) = public.jwt_email())
      or exists (select 1 from public.team_members t where t.creator_id = p_subject::integer and t.email = public.jwt_email() and t.role in ('owner', 'manager'))
    when 'workspace' then p_subject = auth.uid()::text or (p_subject = public.brand_owner()::text and private.team_role() = 'admin')
    when 'agency' then p_subject = auth.uid()::text
    else false end;
$$;
revoke execute on function private.can_buy(text, text) from public, anon, authenticated;

create or replace function private.plan_json(p_kind text, p_subject text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with s as (select * from private.plan_sub(p_kind, p_subject)),
  p as (select * from public.billing_plans where code = private.plan_code(p_kind, p_subject))
  select jsonb_build_object(
    'kind', p_kind, 'subject', p_subject,
    'plan', (select code from p), 'name', (select name from p), 'rank', (select rank from p),
    'limits', (select limits from p), 'features', (select to_jsonb(features) from p),
    'period', (select period from s where id is not null), 'status', (select status from s where id is not null),
    'ends_at', (select ends_at from s where id is not null), 'cancel_at_end', coalesce((select cancel_at_end from s where id is not null), false),
    'founding', coalesce((select founding from s where id is not null), false),
    'via_agency', coalesce((select subject_kind = 'agency' and p_kind <> 'agency' from s where id is not null), false),
    'days_left', (select greatest(0, ceil(extract(epoch from (ends_at - now())) / 86400))::integer from s where id is not null),
    'can_buy', private.can_buy(p_kind, p_subject));
$$;
revoke execute on function private.plan_json(text, text) from public, anon, authenticated;

create or replace function public.my_plan()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with me as (select * from private.my_subject())
  select private.plan_json(me.kind, me.subject) || jsonb_build_object(
    -- How much of the free allowances is used.
    'usage', case when me.kind = 'creator' then jsonb_build_object(
        'quotes_month', (select count(distinct q.collab_id) from public.quotes q where q.creator_id = me.subject::integer and q.sent_at >= private.month_start()),
        'invoices_month', (select count(*) from public.invoices i where i.creator_id = me.subject::integer and i.sent_at >= private.month_start()),
        'pitches_month', (select count(*) from public.pitches p where p.creator_id = me.subject::integer and p.sent_at >= private.month_start()),
        'ai_day', (select coalesce(sum(u.cost), 0) from public.ai_usage u where u.creator_id = me.subject::integer and u.day = private.ai_day() and u.kind not like 'gemini%'),
        'seats', 1 + (select count(*) from public.team_members t where t.creator_id = me.subject::integer and t.role <> 'owner'))
      else jsonb_build_object(
        'requests_month', (select count(distinct c.id) from public.collabs c join public.brand_members m on m.brand_id = c.brand_id and m.owner = me.subject::uuid where c.created_at >= private.month_start()),
        'campaigns_month', (select count(*) from public.brand_campaigns c where c.owner = me.subject::uuid and c.sent_at >= private.month_start()),
        'ai_day', (select coalesce(sum(u.cost), 0) from public.brand_ai_usage u where u.owner = me.subject::uuid and u.day = private.ai_day() and u.kind not like 'gemini%'),
        'seats', 1 + (select count(*) from public.brand_team_members t where t.owner = me.subject::uuid)) end,
    -- The plans this side can buy, with prices (GST included).
    'catalog', (select jsonb_agg(jsonb_build_object('code', p.code, 'side', p.side, 'name', p.name, 'tagline', p.tagline, 'rank', p.rank,
        'price_month', p.price_month, 'price_year', p.price_year, 'founding_year', p.founding_year, 'limits', p.limits, 'features', to_jsonb(p.features)) order by p.sort)
      from public.billing_plans p where p.active and (p.side = case when me.kind = 'creator' then 'creator' else 'brand' end or p.side = 'agency')),
    'offer', (select jsonb_build_object('on', s.founding_on and s.founding_left > 0, 'left', s.founding_left) from public.billing_settings s where s.id = 1),
    -- The login's own Agency plan, if any (it also covers this account when it manages it).
    'agency', private.plan_json('agency', auth.uid()::text),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'amount', y.amount, 'gst', y.gst, 'invoice_no', y.invoice_no, 'paid_at', y.paid_at, 'plan', b.plan, 'period', b.period) order by y.paid_at desc)
      from public.billing_payments y join public.billing_subscriptions b on b.id = y.subscription_id
      where (b.subject_kind = me.kind and b.subject = me.subject) or (b.subject_kind = 'agency' and b.subject = auth.uid()::text)), '[]'::jsonb))
  from me
  where auth.uid() is not null;
$$;
revoke execute on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- 7. Buying (called by the billing server function as the buyer, before Razorpay) ----------------------------------
-- Checks the buyer may buy this plan for this account and returns what to charge.
create or replace function public.billing_intent(p_plan text, p_period text, p_agency boolean default false)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  me record;
  p public.billing_plans;
  st public.billing_settings;
  v_kind text;
  v_subject text;
  v_founding boolean := false;
  v_amount integer;
  cur public.billing_subscriptions;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select * into p from public.billing_plans where code = p_plan and active and rank > 1;
  if p.code is null then raise exception 'That plan isn''t on sale.'; end if;
  if p_period not in ('month', 'year') then raise exception 'Pick monthly or yearly.'; end if;
  select * into me from private.my_subject();
  if p.side = 'agency' or p_agency then
    v_kind := 'agency'; v_subject := auth.uid()::text;
  else
    v_kind := me.kind; v_subject := me.subject;
    if (me.kind = 'creator' and p.side <> 'creator') or (me.kind = 'workspace' and p.side <> 'brand') then raise exception 'That plan is for the other side of Miracle.'; end if;
  end if;
  if not private.can_buy(v_kind, v_subject) then
    raise exception '%', case when v_kind = 'workspace' then 'Only your team''s Admin can change the plan.' else 'Only the creator or her manager can change the plan.' end;
  end if;
  -- Already paying for this or better: manage that instead.
  select * into cur from public.billing_subscriptions s where s.subject_kind = v_kind and s.subject = v_subject and s.source = 'razorpay' and s.status in ('active', 'pending') and private.sub_live(s) limit 1;
  if cur.id is not null and cur.status = 'active' and not cur.cancel_at_end then raise exception 'You already have a paid plan. Change it from Plan & billing.'; end if;
  select * into st from public.billing_settings where id = 1;
  v_founding := p_period = 'year' and p.founding_year is not null and st.founding_on and st.founding_left > 0;
  v_amount := case when v_founding then p.founding_year when p_period = 'year' then p.price_year else p.price_month end;
  return jsonb_build_object('plan', p.code, 'name', p.name, 'period', p_period, 'kind', v_kind, 'subject', v_subject,
    'amount', v_amount, 'founding', v_founding, 'gateway_key', case when v_founding then 'founding' else p_period end,
    'gateway_plan', p.gateway ->> case when v_founding then 'founding' else p_period end,
    'email', public.jwt_email(), 'name_on', coalesce(nullif((select full_name from public.profiles where id = auth.uid()), ''), public.jwt_email()));
end;
$$;
revoke execute on function public.billing_intent(text, text, boolean) from public, anon;
grant execute on function public.billing_intent(text, text, boolean) to authenticated;

-- The rest is for the billing server function only (it runs with the service key).
create or replace function public.billing_set_gateway_plan(p_plan text, p_key text, p_id text)
returns void
language sql security definer
set search_path = public
as $$
  update public.billing_plans set gateway = gateway || jsonb_build_object(p_key, p_id), updated_at = now() where code = p_plan;
$$;

create or replace function public.billing_pending(p jsonb)
returns uuid
language sql security definer
set search_path = public
as $$
  insert into public.billing_subscriptions (subject_kind, subject, plan, period, status, founding, source, gateway_id, email, bought_by)
  values (p ->> 'kind', p ->> 'subject', p ->> 'plan', p ->> 'period', 'pending', coalesce((p ->> 'founding')::boolean, false), 'razorpay',
          p ->> 'gateway_id', coalesce(p ->> 'email', ''), nullif(p ->> 'bought_by', '')::uuid)
  on conflict (gateway_id) do update set updated_at = now()
  returning id;
$$;

-- A Razorpay event (from its webhook, or our check right after checkout): activated, charged, halted, cancelled, completed.
create or replace function public.billing_event(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  s public.billing_subscriptions;
  v_event text := p ->> 'event';
  v_end timestamptz := to_timestamp(nullif(p ->> 'current_end', '')::bigint);
  v_amount numeric := coalesce((p ->> 'amount')::numeric, 0) / 100;
  v_first boolean;
  v_inv text;
begin
  select * into s from public.billing_subscriptions where gateway_id = p ->> 'subscription_id' for update;
  if s.id is null then return jsonb_build_object('ok', false, 'reason', 'unknown subscription'); end if;
  if v_event in ('subscription.activated', 'subscription.charged', 'subscription.authenticated') and v_end is not null then
    v_first := s.status = 'pending';
    update public.billing_subscriptions set status = case when cancel_at_end then 'cancelled' else 'active' end,
      starts_at = case when v_first then now() else starts_at end, ends_at = greatest(coalesce(ends_at, v_end), v_end), updated_at = now()
    where id = s.id returning * into s;
    -- The founding price is for the first 100 who buy it.
    if v_first and s.founding then update public.billing_settings set founding_left = greatest(0, founding_left - 1) where id = 1; end if;
    if p ->> 'payment_id' is not null and v_amount > 0 then
      v_inv := 'MIR/' || to_char(now() at time zone 'Asia/Kolkata', 'YY') || '-' || lpad(nextval('public.billing_invoice_seq')::text, 5, '0');
      insert into public.billing_payments (subscription_id, gateway_payment_id, amount, gst, period_end, invoice_no)
      values (s.id, p ->> 'payment_id', v_amount, round(v_amount * 18 / 118, 2), v_end, v_inv)
      on conflict (gateway_payment_id) do nothing;
      if found then
        insert into public.outbox (creator_id, kind, to_email, payload)
        select null, 'plan_receipt', s.email, jsonb_build_object('app', true, 'plan', pl.name, 'period', s.period, 'amount', v_amount,
          'gst', round(v_amount * 18 / 118, 2), 'invoice_no', v_inv, 'until', v_end, 'first', v_first)
        from public.billing_plans pl where pl.code = s.plan and s.email <> '';
      end if;
    end if;
  elsif v_event = 'subscription.halted' then
    update public.billing_subscriptions set status = 'halted', updated_at = now() where id = s.id;
  elsif v_event = 'subscription.cancelled' then
    update public.billing_subscriptions set status = 'cancelled', cancel_at_end = true, ends_at = coalesce(v_end, ends_at), updated_at = now() where id = s.id;
  elsif v_event = 'subscription.completed' then
    update public.billing_subscriptions set status = 'ended', updated_at = now() where id = s.id;
  end if;
  return jsonb_build_object('ok', true, 'subscription', s.id);
end;
$$;

-- The buyer's live Razorpay subscription for an account (to cancel it).
create or replace function public.billing_current(p_kind text, p_subject text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select to_jsonb(s) from public.billing_subscriptions s
  where s.subject_kind = p_kind and s.subject = p_subject and s.source = 'razorpay' and s.status in ('active', 'halted') and s.gateway_id is not null
  order by s.ends_at desc nulls last limit 1;
$$;
revoke execute on function public.billing_set_gateway_plan(text, text, text), public.billing_pending(jsonb), public.billing_event(jsonb),
  public.billing_current(text, text) from public, anon, authenticated;
grant execute on function public.billing_set_gateway_plan(text, text, text), public.billing_pending(jsonb), public.billing_event(jsonb),
  public.billing_current(text, text) to service_role;

-- 8. Every day: notices, and paid features off when a plan has lapsed ---------------------------------------------
create or replace function private.billing_daily()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  s record;
  n integer := 0;
begin
  -- Trials ending in 3 days and tomorrow, and plans that won't renew.
  for s in
    select b.*, case when b.ends_at < now() + interval '26 hours' then 'ending_1' else 'ending_3' end as notice
    from public.billing_subscriptions b
    where b.status in ('active', 'cancelled') and (b.period = 'trial' or b.cancel_at_end)
      and b.ends_at between now() and now() + interval '3 days 2 hours'
  loop
    continue when exists (select 1 from public.billing_notices x where x.subscription_id = s.id and x.kind = s.notice and x.period_end = s.ends_at);
    insert into public.billing_notices (subscription_id, kind, period_end) values (s.id, s.notice, s.ends_at);
    insert into public.outbox (creator_id, kind, to_email, payload)
    select null, 'plan_ending', s.email, jsonb_build_object('app', true, 'plan', p.name, 'trial', s.period = 'trial', 'ends_at', s.ends_at,
      'side', case s.subject_kind when 'creator' then 'creator' else 'brand' end)
    from public.billing_plans p where p.code = s.plan and s.email <> '';
    n := n + 1;
  end loop;
  -- Plans that ended in the last 3 days, where nothing else covers the account now: tell them, and switch paid features off.
  for s in
    select b.* from public.billing_subscriptions b
    where b.ends_at between now() - interval '3 days' - make_interval(days => (select grace_days from public.billing_settings where id = 1)) and now()
      and not private.sub_live(b) and b.status <> 'pending'
  loop
    continue when exists (select 1 from public.billing_notices x where x.subscription_id = s.id and x.kind = 'ended' and x.period_end = s.ends_at);
    continue when s.subject_kind <> 'agency' and private.plan_code(s.subject_kind, s.subject) not in ('creator_free', 'brand_free');
    insert into public.billing_notices (subscription_id, kind, period_end) values (s.id, 'ended', s.ends_at);
    update public.billing_subscriptions set status = 'ended', updated_at = now() where id = s.id and status <> 'ended';
    if s.subject_kind = 'creator' then
      update public.creator_settings set autopilot_packages = false, autopilot_counter = false, autopilot_nudge = false, autopilot_review = false,
        autopilot_brief = false, autopilot_invoice = false, autopilot_dates = false, autopilot_track = false, pitch_auto = false,
        demand_pricing = false, instant_booking = false, rebook_offer = false, reminders_enabled = false, pay_alerts = false,
        show_insights = false, insights_stories = false, fan_list_on = false
      where id = s.subject::integer;
    elsif s.subject_kind = 'workspace' then
      update public.brand_autopilots set shortlist = 'off', followup = 'off', draftcheck = 'off', negotiate = 'off', rebook = 'off', watch = 'off' where owner = s.subject::uuid;
      update public.brand_campaigns set open = false where owner = s.subject::uuid and open;
      update public.brand_tat_settings set escalate = false where owner = s.subject::uuid;
    end if;
    insert into public.outbox (creator_id, kind, to_email, payload)
    select null, 'plan_ended', s.email, jsonb_build_object('app', true, 'plan', p.name, 'trial', s.period = 'trial',
      'side', case s.subject_kind when 'creator' then 'creator' else 'brand' end)
    from public.billing_plans p where p.code = s.plan and s.email <> '';
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function private.billing_daily() from public, anon, authenticated;
select cron.unschedule('billing-daily') where exists (select 1 from cron.job where jobname = 'billing-daily');
select cron.schedule('billing-daily', '15 4 * * *', $$select private.billing_daily()$$);

-- Turnaround escalation only for teams with the feature (trials and Pro): their settings read "escalate off".
create or replace function private.tat_settings(p_owner uuid)
returns table (hours jsonb, skip_sundays boolean, escalate boolean, backup uuid)
language sql stable security definer
set search_path = public
as $$
  select private.tat_default_hours() || coalesce(s.hours, '{}'::jsonb), coalesce(s.skip_sundays, true),
    coalesce(s.escalate, true) and private.plan_has('workspace', p_owner::text, 'turnaround'), s.backup
  from (select 1) x left join public.brand_tat_settings s on s.owner = p_owner;
$$;
revoke execute on function private.tat_settings(uuid) from public, anon, authenticated;

-- 9. Admin ----------------------------------------------------------------------------------------------------------
create or replace function public.admin_billing()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  return jsonb_build_object(
    'plans', (select jsonb_agg(to_jsonb(p) order by p.sort) from public.billing_plans p),
    'settings', (select to_jsonb(s) from public.billing_settings s where s.id = 1),
    'counts', (select jsonb_object_agg(k, n) from (select b.plan || ':' || b.period as k, count(*) as n from public.billing_subscriptions b where private.sub_live(b) group by 1) x),
    'mrr', (select coalesce(round(sum(case b.period when 'month' then p.price_month when 'year' then case when b.founding then p.founding_year else p.price_year end / 12.0 else 0 end)), 0)
            from public.billing_subscriptions b join public.billing_plans p on p.code = b.plan where private.sub_live(b) and b.source = 'razorpay'),
    'subscriptions', (select coalesce(jsonb_agg(to_jsonb(b) || jsonb_build_object('live', private.sub_live(b)) order by b.updated_at desc), '[]'::jsonb)
                      from (select * from public.billing_subscriptions order by updated_at desc limit 300) b),
    'payments', (select coalesce(jsonb_agg(to_jsonb(y) || jsonb_build_object('plan', b.plan, 'subject_kind', b.subject_kind, 'subject', b.subject, 'email', b.email) order by y.paid_at desc), '[]'::jsonb)
                 from (select * from public.billing_payments order by paid_at desc limit 300) y join public.billing_subscriptions b on b.id = y.subscription_id));
end;
$$;

create or replace function public.admin_billing_plan_save(p_code text, p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  before jsonb := (select to_jsonb(x) from public.billing_plans x where x.code = p_code);
begin
  perform private.admin_check();
  if before is null then raise exception 'No such plan.'; end if;
  update public.billing_plans set
    name = coalesce(nullif(btrim(p ->> 'name'), ''), name), tagline = coalesce(p ->> 'tagline', tagline),
    price_month = coalesce((p ->> 'price_month')::integer, price_month), price_year = coalesce((p ->> 'price_year')::integer, price_year),
    founding_year = case when p ? 'founding_year' then nullif(p ->> 'founding_year', '')::integer else founding_year end,
    limits = coalesce(p -> 'limits', limits), features = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'features') x), features),
    active = coalesce((p ->> 'active')::boolean, active),
    -- A new price needs a new Razorpay plan: forget the old ids for the prices that changed.
    gateway = case when (p ? 'price_month' and (p ->> 'price_month')::integer <> price_month) or (p ? 'price_year' and (p ->> 'price_year')::integer <> price_year)
                   or (p ? 'founding_year' and nullif(p ->> 'founding_year', '')::integer is distinct from founding_year) then '{}'::jsonb else gateway end,
    updated_at = now()
  where code = p_code;
  perform private.admin_log('billing_plan', 'plan', p_code, p_code, before, (select to_jsonb(x) from public.billing_plans x where x.code = p_code), coalesce(p ->> 'reason', ''));
  return public.admin_billing();
end;
$$;

create or replace function public.admin_billing_settings_save(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  before jsonb := (select to_jsonb(s) from public.billing_settings s where s.id = 1);
begin
  perform private.admin_check();
  update public.billing_settings set
    trial_days = coalesce((p ->> 'trial_days')::integer, trial_days), grace_days = coalesce((p ->> 'grace_days')::integer, grace_days),
    founding_on = coalesce((p ->> 'founding_on')::boolean, founding_on), founding_left = coalesce((p ->> 'founding_left')::integer, founding_left),
    seller = coalesce(p -> 'seller', seller), updated_at = now()
  where id = 1;
  perform private.admin_log('billing_settings', 'billing', '1', 'Billing settings', before, (select to_jsonb(s) from public.billing_settings s where s.id = 1), coalesce(p ->> 'reason', ''));
  return public.admin_billing();
end;
$$;

-- Give an account a plan for free until a date (or end a free one early): partners, influencers, refunds.
create or replace function public.admin_billing_grant(p_kind text, p_subject text, p_plan text, p_until timestamptz, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform private.admin_check();
  if p_kind not in ('creator', 'workspace', 'agency') or not exists (select 1 from public.billing_plans where code = p_plan) then raise exception 'Pick an account and a plan.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Say why.'; end if;
  insert into public.billing_subscriptions (subject_kind, subject, plan, period, status, ends_at, source, email, note)
  values (p_kind, p_subject, p_plan, 'comp', case when p_until > now() then 'active' else 'ended' end, p_until, 'admin',
    coalesce(case p_kind when 'creator' then (select creator_email from public.creator_settings where id::text = p_subject)
                         else (select email from auth.users where id::text = p_subject) end, ''), left(p_reason, 300))
  returning id into v_id;
  perform private.admin_log('billing_grant', p_kind, p_subject, p_plan || ' until ' || p_until::date, null, jsonb_build_object('plan', p_plan, 'until', p_until), p_reason);
  return public.admin_billing();
end;
$$;

create or replace function public.admin_billing_end(p_subscription uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  before jsonb := (select to_jsonb(b) from public.billing_subscriptions b where b.id = p_subscription);
begin
  perform private.admin_check();
  if before is null then raise exception 'No such subscription.'; end if;
  if before ->> 'source' = 'razorpay' then raise exception 'Cancel a paid plan in Razorpay; it ends here when Razorpay says so.'; end if;
  update public.billing_subscriptions set status = 'ended', ends_at = least(coalesce(ends_at, now()), now()), updated_at = now() where id = p_subscription;
  perform private.admin_log('billing_end', 'subscription', p_subscription::text, before ->> 'plan', before, null, p_reason);
  return public.admin_billing();
end;
$$;
revoke execute on function public.admin_billing(), public.admin_billing_plan_save(text, jsonb), public.admin_billing_settings_save(jsonb),
  public.admin_billing_grant(text, text, text, timestamptz, text), public.admin_billing_end(uuid, text) from public, anon;
grant execute on function public.admin_billing(), public.admin_billing_plan_save(text, jsonb), public.admin_billing_settings_save(jsonb),
  public.admin_billing_grant(text, text, text, timestamptz, text), public.admin_billing_end(uuid, text) to authenticated;
