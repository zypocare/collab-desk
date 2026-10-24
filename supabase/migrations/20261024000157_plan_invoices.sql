-- GST tax invoices for Miracle's own plans. Each plan payment keeps its invoice as it was on the day
-- (seller, buyer, place of supply, SAC, taxable value and CGST/SGST or IGST), with a private link the
-- receipt email carries; the email also attaches it as a PDF. Admins get every invoice for a period, with
-- totals, for GST returns.

-- 1. Where the invoice lives, and the seller's details (an admin fills in the GSTIN; until then the
--    document is a plain invoice without a GST breakup).
alter table public.billing_payments add column if not exists invoice jsonb;
alter table public.billing_payments add column if not exists token text;
update public.billing_payments set token = encode(extensions.gen_random_bytes(16), 'hex') where token is null;
alter table public.billing_payments alter column token set default encode(extensions.gen_random_bytes(16), 'hex');
alter table public.billing_payments alter column token set not null;
create unique index if not exists billing_payments_token_uq on public.billing_payments (token);

update public.billing_settings set seller = jsonb_build_object(
    'legal_name', 'Zyposoft Technologies Private Limited',
    'address', '#7, Nisarga Layout, Chikkalsandra, Bangalore 560061',
    'state', 'Karnataka',
    'gstin', '',
    'pan', '',
    'sac', '997331',
    'email', 'support@miracleapp.live'
  ) || seller
where id = 1;

-- 2. The invoice for one payment.
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
    'item', jsonb_build_object('description', 'Miracle ' || pl.name || ' plan, ' || case s.period when 'year' then 'yearly' else 'monthly' end || ' subscription'
                                 || case when s.founding then ' (founding price)' else '' end,
                               'from', (v_from at time zone 'Asia/Kolkata')::date, 'to', (y.period_end at time zone 'Asia/Kolkata')::date,
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

-- 3. Payments make their invoice; the receipt carries it.
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
  v_pid uuid;
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
      on conflict (gateway_payment_id) do nothing
      returning id into v_pid;
      if v_pid is not null then
        -- The GST tax invoice, fixed as it was on the day (later changes to names or addresses don't alter it).
        update public.billing_payments set invoice = private.plan_invoice_build(v_pid) where id = v_pid;
        insert into public.outbox (creator_id, kind, to_email, payload)
        select null, 'plan_receipt', s.email, jsonb_build_object('app', true, 'plan', pl.name, 'period', s.period, 'amount', v_amount,
          'gst', y.gst, 'invoice_no', v_inv, 'until', v_end, 'first', v_first, 'token', y.token, 'invoice', y.invoice,
          'side', case s.subject_kind when 'creator' then 'creator' else 'brand' end)
        from public.billing_plans pl, public.billing_payments y where pl.code = s.plan and y.id = v_pid and s.email <> '';
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

revoke execute on function public.billing_event(jsonb) from public, anon, authenticated;
grant execute on function public.billing_event(jsonb) to service_role;

-- 4. The plan page lists each payment with its invoice link.
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
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'amount', y.amount, 'gst', y.gst, 'invoice_no', y.invoice_no, 'paid_at', y.paid_at, 'plan', b.plan, 'period', b.period, 'token', y.token) order by y.paid_at desc)
      from public.billing_payments y join public.billing_subscriptions b on b.id = y.subscription_id
      where (b.subject_kind = me.kind and b.subject = me.subject) or (b.subject_kind = 'agency' and b.subject = auth.uid()::text)), '[]'::jsonb))
  from me
  where auth.uid() is not null;
$$;

revoke execute on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- 5. Payments made before invoices existed get theirs now.
update public.billing_payments set invoice = private.plan_invoice_build(id) where invoice is null;

-- 6. An invoice by its private link (the receipt email's, or Plan & billing's). No sign-in needed.
create or replace function public.plan_invoice(p_token text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select y.invoice || jsonb_build_object('token', y.token)
  from public.billing_payments y
  where y.token = p_token and length(coalesce(p_token, '')) >= 24;
$$;
revoke execute on function public.plan_invoice(text) from public;
grant execute on function public.plan_invoice(text) to anon, authenticated;

-- 7. Admin: every plan invoice in a period, with totals for GST returns.
create or replace function public.admin_billing_invoices(p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  d0 date := coalesce(p_from, date_trunc('month', now() at time zone 'Asia/Kolkata')::date);
  d1 date := coalesce(p_to, (now() at time zone 'Asia/Kolkata')::date);
begin
  perform private.admin_check();
  return (
    with r as (
      select y.*, b.subject_kind, b.subject, b.plan, b.period, b.email
      from public.billing_payments y join public.billing_subscriptions b on b.id = y.subscription_id
      where (y.paid_at at time zone 'Asia/Kolkata')::date between d0 and d1
    )
    select jsonb_build_object(
      'from', d0, 'to', d1,
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'id', r.id, 'invoice_no', r.invoice_no, 'date', r.invoice ->> 'date', 'plan', r.plan, 'period', r.period,
          'subject_kind', r.subject_kind, 'subject', r.subject, 'email', r.email,
          'buyer', r.invoice -> 'buyer' ->> 'name', 'buyer_gstin', r.invoice -> 'buyer' ->> 'gstin', 'place_of_supply', r.invoice ->> 'place_of_supply',
          'taxable', (r.invoice ->> 'taxable')::numeric, 'cgst', (r.invoice ->> 'cgst')::numeric, 'sgst', (r.invoice ->> 'sgst')::numeric,
          'igst', (r.invoice ->> 'igst')::numeric, 'total', r.amount, 'payment_ref', r.gateway_payment_id, 'token', r.token) order by r.paid_at desc) from r), '[]'::jsonb),
      'totals', (select jsonb_build_object('count', count(*), 'taxable', coalesce(sum((r.invoice ->> 'taxable')::numeric), 0),
          'cgst', coalesce(sum((r.invoice ->> 'cgst')::numeric), 0), 'sgst', coalesce(sum((r.invoice ->> 'sgst')::numeric), 0),
          'igst', coalesce(sum((r.invoice ->> 'igst')::numeric), 0), 'total', coalesce(sum(r.amount), 0),
          'b2b', count(*) filter (where coalesce(r.invoice -> 'buyer' ->> 'gstin', '') <> '')) from r)));
end;
$$;
revoke execute on function public.admin_billing_invoices(date, date) from public, anon;
grant execute on function public.admin_billing_invoices(date, date) to authenticated;
