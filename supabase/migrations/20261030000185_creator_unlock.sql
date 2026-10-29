-- Unlock one creator (brands): a brand team on the free plan opens 10 full creator profiles a day; instead of
-- Brand Pro it can pay once (₹199 to start) to see one creator's full verified profile for good. No commission:
-- it's the brand paying for Miracle's data, never a cut of a deal.
-- * The price and the on/off switch are a plan in admin → Plans ("Creator unlock", code creator_unlock): its
--   "₹ a month" is the price of one unlock, and "Offered to new buyers" turns the offer on or off.
-- * Each purchase is a one-time row in billing_subscriptions (period 'once', with the creator it unlocks), so it
--   gets the same tax invoice, receipt email and admin invoice list as the plans. It's never "live": status
--   'ended' with no end date once paid, so plans, trials and the daily notices never see it.
-- * Paid through a Razorpay order (the billing function's unlock_checkout / unlock_verify, and the webhook's
--   order.paid as a backup).

-- 1. The catalogue entry and the one-time purchases ---------------------------------------------------------
insert into public.billing_plans (code, side, name, tagline, rank, price_month, price_year, founding_year, limits, features, active, sort)
values ('creator_unlock', 'brand', 'Creator unlock', 'One creator''s full verified profile, for good', 0, 199, 0, null, '{}', '{}', true, 45)
on conflict (code) do nothing;

alter table public.billing_subscriptions drop constraint if exists billing_subscriptions_period_check;
alter table public.billing_subscriptions add constraint billing_subscriptions_period_check check (period in ('trial', 'month', 'year', 'comp', 'once'));
alter table public.billing_subscriptions add column if not exists unlock_creator integer references public.creator_settings (id) on delete set null;

-- Creators a brand team has unlocked: their full profile opens any day and never counts towards the 10.
create table if not exists public.brand_unlocks (
  owner uuid not null,
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  subscription_id uuid references public.billing_subscriptions (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (owner, creator_id)
);
alter table public.brand_unlocks enable row level security;
revoke all on public.brand_unlocks from anon, authenticated;

-- 2. Opening a profile: unlocked creators always open; when the day's 10 are used, offer the unlock ------------
create or replace function public.brand_profile_open(p_creator integer)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid := public.brand_owner();
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_cap integer;
  v_used integer;
  v_price integer;
begin
  if v_owner is null or private.plan_exempt() then return jsonb_build_object('ok', true); end if;
  if exists (select 1 from public.brand_unlocks u where u.owner = v_owner and u.creator_id = p_creator) then
    return jsonb_build_object('ok', true, 'unlocked', true);
  end if;
  v_cap := private.plan_limit('workspace', v_owner::text, 'profiles_day');
  if v_cap is null or exists (select 1 from public.collabs c join public.brand_members m on m.brand_id = c.brand_id and m.owner = v_owner where c.creator_id = p_creator) then
    return jsonb_build_object('ok', true);
  end if;
  select count(*) into v_used from public.brand_profile_views where owner = v_owner and day = v_day;
  if exists (select 1 from public.brand_profile_views where owner = v_owner and day = v_day and creator_id = p_creator) then
    return jsonb_build_object('ok', true, 'used', v_used, 'cap', v_cap);
  end if;
  if v_used >= v_cap then
    select price_month into v_price from public.billing_plans where code = 'creator_unlock' and active and price_month > 0;
    return jsonb_build_object('ok', false, 'used', v_used, 'cap', v_cap, 'unlock_price', v_price,
      'can_buy', private.can_buy('workspace', v_owner::text),
      'msg', format('The free plan opens %s full creator profiles a day. More tomorrow, or go Brand Pro for unlimited.', v_cap));
  end if;
  insert into public.brand_profile_views (owner, creator_id, day) values (v_owner, p_creator, v_day) on conflict do nothing;
  return jsonb_build_object('ok', true, 'used', v_used + 1, 'cap', v_cap);
end;
$$;
revoke execute on function public.brand_profile_open(integer) from public, anon;
grant execute on function public.brand_profile_open(integer) to authenticated;

-- 3. Buying: what this brand team would pay to unlock a creator (run as the buyer by the billing function) -----
create or replace function public.unlock_intent(p_creator integer)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_owner uuid := public.brand_owner();
  v_price integer;
  v_name text;
begin
  if v_owner is null then raise exception 'Sign in as a brand to unlock a creator.'; end if;
  if not private.can_buy('workspace', v_owner::text) then raise exception 'Only your team''s admin can buy for this brand team.'; end if;
  select price_month into v_price from public.billing_plans where code = 'creator_unlock' and active and price_month > 0;
  if v_price is null then raise exception 'Unlocking single creators isn''t available right now.'; end if;
  select display_name into v_name from public.creator_settings where id = p_creator and status = 'active';
  if v_name is null then raise exception 'That creator isn''t on Miracle any more.'; end if;
  if exists (select 1 from public.brand_unlocks u where u.owner = v_owner and u.creator_id = p_creator) then raise exception 'You''ve already unlocked %.', v_name; end if;
  return jsonb_build_object('owner', v_owner, 'creator', p_creator, 'creator_name', v_name, 'amount', v_price,
    'email', coalesce(public.jwt_email(), ''), 'name_on', coalesce((select f.name from public.brand_profiles f where f.owner = v_owner), ''));
end;
$$;
revoke execute on function public.unlock_intent(integer) from public, anon;
grant execute on function public.unlock_intent(integer) to authenticated;

-- The order is made: remember it until it's paid.
create or replace function public.unlock_pending(p jsonb)
returns void
language sql security definer
set search_path = public
as $$
  insert into public.billing_subscriptions (subject_kind, subject, plan, period, status, ends_at, source, gateway_id, email, bought_by, unlock_creator, note)
  values ('workspace', p ->> 'owner', 'creator_unlock', 'once', 'pending', null, 'razorpay', p ->> 'order_id', coalesce(p ->> 'email', ''),
    nullif(p ->> 'bought_by', '')::uuid, (p ->> 'creator')::integer, left('Unlock: ' || coalesce(p ->> 'creator_name', ''), 300))
  on conflict (gateway_id) do nothing;
$$;
revoke execute on function public.unlock_pending(jsonb) from public, anon, authenticated;
grant execute on function public.unlock_pending(jsonb) to service_role;

-- Paid (from the checkout's verify or Razorpay's order.paid; both may arrive, the second does nothing).
create or replace function public.unlock_paid(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  s public.billing_subscriptions;
  v_amount numeric := coalesce((p ->> 'amount')::numeric, 0) / 100;
  v_inv text;
  v_pid uuid;
begin
  select * into s from public.billing_subscriptions where gateway_id = p ->> 'order_id' and period = 'once' for update;
  if s.id is null then return jsonb_build_object('ok', false, 'reason', 'unknown order'); end if;
  if s.status = 'pending' and coalesce(p ->> 'payment_id', '') <> '' and v_amount > 0 then
    update public.billing_subscriptions set status = 'ended', starts_at = now(), updated_at = now() where id = s.id returning * into s;
    insert into public.brand_unlocks (owner, creator_id, subscription_id) values (s.subject::uuid, s.unlock_creator, s.id) on conflict do nothing;
    v_inv := 'MIR/' || to_char(now() at time zone 'Asia/Kolkata', 'YY') || '-' || lpad(nextval('public.billing_invoice_seq')::text, 5, '0');
    insert into public.billing_payments (subscription_id, gateway_payment_id, amount, gst, period_end, invoice_no)
    values (s.id, p ->> 'payment_id', v_amount, round(v_amount * 18 / 118, 2), null, v_inv)
    on conflict (gateway_payment_id) do nothing
    returning id into v_pid;
    if v_pid is not null then
      update public.billing_payments set invoice = private.plan_invoice_build(v_pid) where id = v_pid;
      insert into public.outbox (creator_id, kind, to_email, payload)
      select null, 'plan_receipt', s.email, jsonb_build_object('app', true, 'plan', 'Creator unlock', 'period', 'once', 'amount', v_amount,
        'gst', y.gst, 'invoice_no', v_inv, 'token', y.token, 'invoice', y.invoice, 'side', 'brand',
        'creator', (select display_name from public.creator_settings where id = s.unlock_creator), 'creator_id', s.unlock_creator)
      from public.billing_payments y where y.id = v_pid and s.email <> '';
    end if;
  end if;
  return jsonb_build_object('ok', true, 'creator', s.unlock_creator, 'unlocked', exists (select 1 from public.brand_unlocks u where u.owner = s.subject::uuid and u.creator_id = s.unlock_creator));
end;
$$;
revoke execute on function public.unlock_paid(jsonb) from public, anon, authenticated;
grant execute on function public.unlock_paid(jsonb) to service_role;

-- 4. The invoice names the creator unlocked -------------------------------------------------------------------
create or replace function private.plan_invoice_build(p_payment uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  y public.billing_payments;
  s public.billing_subscriptions;
  pl public.billing_plans;
  seller jsonb := (select seller from public.billing_settings where id = 1);
  buyer jsonb := '{}'::jsonb;
  v_gst boolean;
  v_inter boolean;
  v_taxable numeric;
  v_tax numeric;
  v_from timestamptz;
begin
  select * into y from public.billing_payments where id = p_payment;
  if y.id is null then return null; end if;
  select * into s from public.billing_subscriptions where id = y.subscription_id;
  select * into pl from public.billing_plans where code = s.plan;
  if s.subject_kind = 'creator' then
    select jsonb_build_object('name', coalesce(nullif(c.legal_name, ''), c.display_name), 'trade_name', c.display_name, 'gstin', coalesce(c.gstin, ''),
        'address', coalesce(c.address, ''), 'state', coalesce(c.state, ''), 'city', coalesce(c.city, ''), 'email', coalesce(nullif(s.email, ''), c.creator_email))
      into buyer from public.creator_settings c where c.id = s.subject::integer;
  elsif s.subject_kind = 'workspace' then
    select jsonb_build_object('name', coalesce(nullif(f.legal_name, ''), f.name), 'trade_name', f.name,
        'gstin', coalesce(nullif(f.gstin, ''), b.gstin, ''), 'address', coalesce(b.billing_address, ''), 'state', coalesce(b.state, ''),
        'city', coalesce(f.city, ''), 'email', coalesce(nullif(s.email, ''), b.accounts_email, ''))
      into buyer
    from (select 1) x
    left join public.brand_profiles f on f.owner = s.subject::uuid
    left join lateral (select bb.* from public.brands bb join public.brand_members m on m.brand_id = bb.id and m.owner = s.subject::uuid
                       order by (coalesce(bb.gstin, '') <> '') desc, bb.created_at desc limit 1) b on true;
  end if;
  if buyer is null or buyer = '{}'::jsonb or coalesce(buyer ->> 'name', '') = '' then
    buyer := coalesce(buyer, '{}'::jsonb) || jsonb_build_object('name', coalesce(nullif((select full_name from public.profiles where id::text = s.subject or lower(email) = lower(s.email) limit 1), ''), s.email), 'email', s.email);
  end if;
  -- GST only once the seller's GSTIN is in; IGST when the buyer is in another state, else CGST + SGST.
  v_gst := coalesce(seller ->> 'gstin', '') <> '';
  v_inter := coalesce(buyer ->> 'state', '') <> '' and lower(btrim(buyer ->> 'state')) <> lower(btrim(coalesce(seller ->> 'state', '')));
  v_taxable := case when v_gst then round(y.amount * 100 / 118, 2) else y.amount end;
  v_tax := y.amount - v_taxable;
  v_from := case s.period when 'year' then y.period_end - interval '1 year' when 'month' then y.period_end - interval '1 month' else y.paid_at end;
  return jsonb_build_object(
    'title', case when v_gst then 'Tax invoice' else 'Invoice' end,
    'number', y.invoice_no,
    'date', (y.paid_at at time zone 'Asia/Kolkata')::date,
    'seller', seller,
    'buyer', buyer,
    'place_of_supply', coalesce(nullif(buyer ->> 'state', ''), seller ->> 'state'),
    'item', jsonb_build_object('description', case when s.period = 'once'
                                   then 'Miracle creator unlock: full profile of ' || coalesce((select c.display_name from public.creator_settings c where c.id = s.unlock_creator), 'a creator')
                                   else 'Miracle ' || pl.name || ' plan, ' || case s.period when 'year' then 'yearly' else 'monthly' end || ' subscription'
                                 || case when s.founding then ' (founding price)' else '' end end,
                               'from', (v_from at time zone 'Asia/Kolkata')::date, 'to', (coalesce(y.period_end, y.paid_at) at time zone 'Asia/Kolkata')::date,
                               'sac', coalesce(seller ->> 'sac', '997331'), 'qty', 1),
    'taxable', v_taxable,
    'gst_rate', case when v_gst then 18 else 0 end,
    'igst', case when v_gst and v_inter then v_tax else 0 end,
    'cgst', case when v_gst and not v_inter then round(v_tax / 2, 2) else 0 end,
    'sgst', case when v_gst and not v_inter then v_tax - round(v_tax / 2, 2) else 0 end,
    'total', y.amount,
    'gst_charged', v_gst,
    'paid', jsonb_build_object('on', (y.paid_at at time zone 'Asia/Kolkata')::date, 'via', 'Razorpay', 'ref', y.gateway_payment_id));
end;
$$;

revoke execute on function private.plan_invoice_build(uuid) from public, anon, authenticated;

-- 5. Admin overview: unlocks aren't subscribers (no "new paid" or "ended" for them); counted on their own.
create or replace function public.admin_billing_overview()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_month timestamptz := date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  perform private.admin_check();
  return jsonb_build_object(
    'mrr', (select coalesce(round(sum(case b.period when 'month' then p.price_month
              when 'year' then (case when b.founding then coalesce(p.founding_year, p.price_year) else p.price_year end) / 12.0 else 0 end)), 0)
            from public.billing_subscriptions b join public.billing_plans p on p.code = b.plan where private.sub_live(b) and b.source = 'razorpay'),
    'paid', (select count(*) from public.billing_subscriptions b where private.sub_live(b) and b.source = 'razorpay'),
    'trials', (select count(*) from public.billing_subscriptions b where private.sub_live(b) and b.period = 'trial'),
    'comps', (select count(*) from public.billing_subscriptions b where private.sub_live(b) and b.period = 'comp'),
    'halted', (select count(*) from public.billing_subscriptions b where b.status = 'halted' and private.sub_live(b)),
    'cancelling', (select count(*) from public.billing_subscriptions b where private.sub_live(b) and (b.cancel_at_end or b.status = 'cancelled')),
    'by_plan', coalesce((select jsonb_agg(jsonb_build_object('code', p.code, 'name', p.name, 'side', p.side, 'active', p.active,
        'price_month', p.price_month, 'price_year', p.price_year,
        'month', (select count(*) from public.billing_subscriptions b where b.plan = p.code and b.period = 'month' and private.sub_live(b)),
        'year', (select count(*) from public.billing_subscriptions b where b.plan = p.code and b.period = 'year' and private.sub_live(b)),
        'trial', (select count(*) from public.billing_subscriptions b where b.plan = p.code and b.period = 'trial' and private.sub_live(b)),
        'comp', (select count(*) from public.billing_subscriptions b where b.plan = p.code and b.period = 'comp' and private.sub_live(b))) order by p.sort)
      from public.billing_plans p), '[]'::jsonb),
    'trials_ending', coalesce((select jsonb_agg(x order by x ->> 'ends_at') from (
      select jsonb_build_object('id', b.id, 'kind', b.subject_kind, 'subject', b.subject, 'name', private.billing_subject_name(b.subject_kind, b.subject),
        'plan', b.plan, 'ends_at', b.ends_at, 'email', b.email) x
      from public.billing_subscriptions b where b.period = 'trial' and private.sub_live(b) and b.ends_at < now() + interval '7 days' order by b.ends_at limit 30) z), '[]'::jsonb),
    'revenue_month', (select coalesce(sum(y.amount), 0) from public.billing_payments y where y.paid_at >= v_month),
    'gst_month', (select coalesce(sum(y.gst), 0) from public.billing_payments y where y.paid_at >= v_month),
    'payments_month', (select count(*) from public.billing_payments y where y.paid_at >= v_month),
    'new_paid_30d', (select count(*) from public.billing_subscriptions b where b.source = 'razorpay' and b.period <> 'once' and b.created_at > now() - interval '30 days' and b.status <> 'pending'),
    'ended_30d', (select count(*) from public.billing_subscriptions b where b.source = 'razorpay' and b.period <> 'once' and b.status in ('ended', 'cancelled') and b.updated_at > now() - interval '30 days'),
    -- One-time creator unlocks bought by brands (not subscriptions): how many this month, and the money.
    'unlocks_month', (select count(*) from public.billing_payments y join public.billing_subscriptions b on b.id = y.subscription_id where b.period = 'once' and y.paid_at >= v_month),
    'unlock_revenue_month', (select coalesce(sum(y.amount), 0) from public.billing_payments y join public.billing_subscriptions b on b.id = y.subscription_id where b.period = 'once' and y.paid_at >= v_month),
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'revenue', (select coalesce(sum(y.amount), 0) from public.billing_payments y
        where y.paid_at >= m::timestamp at time zone 'Asia/Kolkata' and y.paid_at < (m + interval '1 month')::timestamp at time zone 'Asia/Kolkata')) order by m)
      from generate_series(date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '5 months', date_trunc('month', now() at time zone 'Asia/Kolkata'), interval '1 month') g(m)), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', y.id, 'invoice_no', y.invoice_no, 'token', y.token, 'amount', y.amount, 'gst', y.gst, 'paid_at', y.paid_at, 'plan', b.plan,
        'kind', b.subject_kind, 'subject', b.subject, 'name', private.billing_subject_name(b.subject_kind, b.subject)) x
      from public.billing_payments y join public.billing_subscriptions b on b.id = y.subscription_id order by y.paid_at desc limit 10) z), '[]'::jsonb));
end;
$$;

revoke execute on function public.admin_billing_overview() from public, anon;
grant execute on function public.admin_billing_overview() to authenticated;
