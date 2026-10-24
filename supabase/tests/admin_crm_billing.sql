-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/admin_crm_billing.sql
-- The admin CRM's Billing area (migration 156, on top of billing in 154): overview, subscriptions and payments
-- lists, and one account's plan. Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
select set_config('request.headers', '{}', true);

select gen_random_uuid() as admin_uid, gen_random_uuid() as x_uid, gen_random_uuid() as w_uid \gset
insert into public.app_admins (email) values ('bill-admin@test.dev') on conflict do nothing;
insert into auth.users (id, email, aud, role) values (:'admin_uid', 'bill-admin@test.dev', 'authenticated', 'authenticated'),
  (:'x_uid', 'bill-stranger@test.dev', 'authenticated', 'authenticated'), (:'w_uid', 'bill-brand@test.dev', 'authenticated', 'authenticated');
insert into public.brand_profiles (owner, name) values (:'w_uid', 'Bill Test Brand');
select price_month as pro_price from public.billing_plans where code = 'brand_pro' \gset

select set_config('request.jwt.claims', json_build_object('email', 'bill-admin@test.dev', 'sub', :'admin_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_billing_overview() as o0 \gset
reset role;

-- A paid monthly Brand Pro with a payment this month, and a creator trial ending in 3 days.
insert into public.billing_subscriptions (subject_kind, subject, plan, period, status, ends_at, source, email, gateway_id)
values ('workspace', :'w_uid', 'brand_pro', 'month', 'active', now() + interval '20 days', 'razorpay', 'bill-brand@test.dev', 'sub_billtest') returning id as paid_sub \gset
insert into public.billing_payments (subscription_id, gateway_payment_id, amount, gst, invoice_no) values (:'paid_sub', 'pay_billtest', 2359.82, 359.97, 'MIR/26-99999');
insert into public.billing_subscriptions (subject_kind, subject, plan, period, status, ends_at, source, email)
values ('creator', '1', 'creator_pro', 'trial', 'active', now() + interval '3 days', 'trial', 'creator@example.test') returning id as trial_sub \gset

-- Only admins.
select set_config('request.jwt.claims', json_build_object('email', 'bill-stranger@test.dev', 'sub', :'x_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.admin_billing_overview(); insert into results values ('A non-admin can''t see billing', false, 'ran'); exception when others then insert into results values ('A non-admin can''t see billing', true, null); end $$;
do $$ begin perform public.admin_list('subscriptions'); insert into results values ('Nor list subscriptions', false, 'ran'); exception when others then insert into results values ('Nor list subscriptions', true, null); end $$;
do $$ begin perform public.admin_plan('creator', '1'); insert into results values ('Nor read an account''s plan', false, 'ran'); exception when others then insert into results values ('Nor read an account''s plan', true, null); end $$;
reset role;
insert into results select 'Signed out can''t call them', not has_function_privilege('anon', 'public.admin_billing_overview()', 'execute') and not has_function_privilege('anon', 'public.admin_plan(text, text)', 'execute'), null;

select set_config('request.jwt.claims', json_build_object('email', 'bill-admin@test.dev', 'sub', :'admin_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_billing_overview() as o1 \gset
insert into results select 'MRR counts the paid monthly plan', (:'o1'::jsonb ->> 'mrr')::numeric - (:'o0'::jsonb ->> 'mrr')::numeric = :pro_price, :'o1'::jsonb ->> 'mrr';
insert into results select 'Paid and trial counts move', (:'o1'::jsonb ->> 'paid')::int - (:'o0'::jsonb ->> 'paid')::int = 1 and (:'o1'::jsonb ->> 'trials')::int - (:'o0'::jsonb ->> 'trials')::int = 1, null;
insert into results select 'The trial ending this week is listed with its creator', exists (select 1 from jsonb_array_elements(:'o1'::jsonb -> 'trials_ending') t where t ->> 'id' = :'trial_sub' and t ->> 'kind' = 'creator' and t ->> 'name' is not null), null;
insert into results select 'This month''s revenue includes the payment', (:'o1'::jsonb ->> 'revenue_month')::numeric - (:'o0'::jsonb ->> 'revenue_month')::numeric = 2359.82, null;
insert into results select 'Plans list their live counts', (select (p ->> 'month')::int from jsonb_array_elements(:'o1'::jsonb -> 'by_plan') p where p ->> 'code' = 'brand_pro') >= 1, null;
insert into results select 'Six months of revenue', jsonb_array_length(:'o1'::jsonb -> 'months') = 6, null;

-- Lists.
select public.admin_list('subscriptions', 'bill test brand', '{"live": true, "period": "month"}') -> 'rows' -> 0 as s \gset
insert into results select 'The subscription lists its account, price and days left', :'s'::jsonb ->> 'name' = 'Bill Test Brand' and (:'s'::jsonb ->> 'price')::int = :pro_price
  and (:'s'::jsonb ->> 'days_left')::int between 19 and 21 and (:'s'::jsonb ->> 'paid')::numeric = 2359.82, :'s';
select public.admin_list('billing_payments', 'MIR/26-99999') -> 'rows' -> 0 as p \gset
insert into results select 'The payment lists its invoice, GST and account', (:'p'::jsonb ->> 'gst')::numeric = 359.97 and (:'p'::jsonb ->> 'net')::numeric = 1999.85 and :'p'::jsonb ->> 'name' = 'Bill Test Brand', :'p';

-- One account's plan, and ending the trial through the billing functions.
select public.admin_plan('creator', '1') as pl \gset
insert into results select 'The creator''s plan page shows the trial in its history', exists (select 1 from jsonb_array_elements(:'pl'::jsonb -> 'history') h where h ->> 'id' = :'trial_sub' and (h ->> 'live')::boolean)
  and (select bool_and(x ->> 'side' = 'creator') from jsonb_array_elements(:'pl'::jsonb -> 'plans') x), null;
do $$ begin perform public.admin_plan('nope', '1'); insert into results values ('An unknown account kind is refused', false, 'ran'); exception when others then insert into results values ('An unknown account kind is refused', true, null); end $$;
select public.admin_billing_end(:'trial_sub', 'Testing') is not null as ended \gset
insert into results select 'The ended trial is no longer live', not exists (select 1 from jsonb_array_elements(public.admin_plan('creator', '1') -> 'history') h where h ->> 'id' = :'trial_sub' and (h ->> 'live')::boolean), null;
insert into results select 'A workspace plan shows the brand plans to give', (select bool_and(x ->> 'side' = 'brand') from jsonb_array_elements(public.admin_plan('workspace', :'w_uid') -> 'plans') x)
  and public.admin_plan('workspace', :'w_uid') ->> 'plan' = 'brand_pro', null;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
