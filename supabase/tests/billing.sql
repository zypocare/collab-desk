-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/billing.sql
-- Paid plans (migration 154): trials, the free plan's limits, Agency cover, buying through Razorpay events,
-- lapsing, and the admin. Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
create temp table caught (k text primary key, msg text) on commit drop;
grant all on caught to authenticated, anon;
select set_config('request.headers', '{}', true);
delete from public.app_limit_overrides;

-- ================================================================== 1. A new creator gets a trial
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen, niche)
values ('bill@test.dev', 'billtest', 'billtest', 'Bill Test', 'BT', 'BT', 'active', true, 'Food') returning id as cid \gset
select gen_random_uuid() as c_uid \gset
insert into auth.users (id, email, aud, role) values (:'c_uid', 'bill@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'bill@test.dev', 'sub', :'c_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', 'billtest')::text, true);
set local role authenticated;
select public.my_plan() as p0 \gset
reset role;
insert into results select 'A new creator starts a 14-day Creator Pro trial', :'p0'::jsonb ->> 'plan' = 'creator_pro' and :'p0'::jsonb ->> 'period' = 'trial' and (:'p0'::jsonb ->> 'days_left')::int = 14, :'p0'::jsonb::text;
insert into results select 'She can buy for her own studio', (:'p0'::jsonb ->> 'can_buy')::boolean, null;
insert into results select 'Only one trial, ever', (select count(*) = 1 from public.billing_subscriptions where subject_kind = 'creator' and subject = :'cid'::text), null;

-- The trial runs out: she's on Free.
update public.billing_subscriptions set ends_at = now() - interval '1 day' where subject_kind = 'creator' and subject = :'cid'::text;
insert into results select 'After the trial she is on Free', private.plan_code('creator', :'cid'::text) = 'creator_free', null;
-- The daily job switches off what the trial had on (several paid switches start on for new creators).
select private.billing_daily() as lapse \gset
insert into results select 'When the trial lapses, its paid switches go off', not (select autopilot_invoice or show_insights or reminders_enabled from public.creator_settings where id = :cid), null;

-- ================================================================== 2. Free creator limits
-- (fixtures go in as the database itself, with no sign-in, so nothing fills in another creator)
select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
insert into public.brands (creator_id, name) values (:cid, 'Free Brand') returning id as fb \gset
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand)
select :cid, :'fb', '', 'negotiating', 1000 * g, false from generate_series(1, 5) g;
select set_config('request.jwt.claims', json_build_object('email', 'bill@test.dev', 'sub', :'c_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', 'billtest')::text, true);
create temp table cs as select id, row_number() over (order by fee) as n from public.collabs where creator_id = :cid;
grant select on cs to authenticated;
set local role authenticated;
-- Quotes for three collabs are fine (and a second version for the first doesn't count again).
insert into public.quotes (collab_id, creator_id, status, sent_at) select id, :cid, 'sent', now() from cs where n <= 3;
insert into results select 'Three quotes go out on Free', (select count(*) = 3 from public.quotes where creator_id = :cid), null;
do $$ begin
  insert into public.quotes (collab_id, creator_id, status, sent_at, version) select id, (select creator_id from public.collabs where id = cs.id), 'sent', now(), 2 from cs where n = 1;
exception when others then insert into caught values ('q-again', sqlerrm); end $$;
insert into results select 'A new version to the same collab still goes', not exists (select 1 from caught where k = 'q-again'), (select msg from caught where k = 'q-again');
do $$ begin
  insert into public.quotes (collab_id, creator_id, status, sent_at) select id, (select creator_id from public.collabs where id = cs.id), 'sent', now() from cs where n = 4;
exception when others then insert into caught values ('q4', sqlerrm); end $$;
insert into results select 'The fourth collab''s quote asks for Pro', (select msg like 'Miracle Pro:%' from caught where k = 'q4'), (select msg from caught where k = 'q4');
-- Invoices: three a month.
insert into public.invoices (collab_id, creator_id, status, sent_at) select id, :cid, 'sent', now() from cs where n <= 3;
do $$ begin
  insert into public.invoices (collab_id, creator_id, status, sent_at) select id, (select creator_id from public.collabs where id = cs.id), 'sent', now() from cs where n = 4;
exception when others then insert into caught values ('inv4', sqlerrm); end $$;
insert into results select 'The fourth invoice of the month asks for Pro', (select msg like 'Miracle Pro:%' from caught where k = 'inv4'), null;
-- Paid switches.
reset role;
select set_config('my.cid', :'cid', true);
set local role authenticated;
do $$ begin update public.creator_settings set autopilot_invoice = true where id = current_setting('my.cid')::int; exception when others then insert into caught values ('ap', sqlerrm); end $$;
do $$ begin update public.creator_settings set show_insights = true where id = current_setting('my.cid')::int; exception when others then insert into caught values ('ins', sqlerrm); end $$;
do $$ begin update public.creator_settings set display_name = 'Bill T' where id = current_setting('my.cid')::int; exception when others then insert into caught values ('name', sqlerrm); end $$;
insert into results select 'Free: an autopilot can''t be switched on', exists (select 1 from caught where k = 'ap' and msg like 'Miracle Pro:%'), null;
insert into results select 'Free: the insights page can''t be switched on', exists (select 1 from caught where k = 'ins'), null;
insert into results select 'Free: ordinary settings still save', not exists (select 1 from caught where k = 'name') and (select display_name = 'Bill T' from public.creator_settings where id = :cid), null;
do $$ begin insert into public.team_members (creator_id, email, role) values (current_setting('my.cid')::int, 'editor@test.dev', 'assistant'); exception when others then insert into caught values ('seat', sqlerrm); end $$;
insert into results select 'Free: adding a team member asks for Pro', exists (select 1 from caught where k = 'seat' and msg like 'Miracle Pro:%'), null;
-- AI: a small daily allowance.
select public.ai_take2('caption', 1200) as a1 \gset
select public.ai_take2('caption', 400) as a2 \gset
reset role;
insert into results select 'Free: AI runs within the daily allowance', (:'a1'::jsonb ->> 'ok')::boolean, :'a1';
insert into results select 'Free: past 1,500 it stops with "budget"', not (:'a2'::jsonb ->> 'ok')::boolean and :'a2'::jsonb ->> 'reason' = 'budget' and :'a2'::jsonb ->> 'plan' = 'creator_free', :'a2';
insert into public.app_limit_overrides (key, subject_kind, subject, value, reason, set_by) values ('ai_day', 'creator', :'cid'::text, 5000, 'test', 'test');
set local role authenticated;
select public.ai_take2('caption', 400) as a3 \gset
select public.my_plan() as p1 \gset
reset role;
insert into results select 'An admin override beats the plan''s cap', (:'a3'::jsonb ->> 'ok')::boolean, :'a3';
insert into results select 'My plan shows what''s used', (:'p1'::jsonb -> 'usage' ->> 'quotes_month')::int = 3 and (:'p1'::jsonb -> 'usage' ->> 'invoices_month')::int = 3, (:'p1'::jsonb -> 'usage')::text;

-- ================================================================== 3. Buying: intent, Razorpay events
set local role authenticated;
select public.billing_intent('creator_pro', 'month') as i1 \gset
select public.billing_intent('creator_pro', 'year') as i2 \gset
do $$ begin perform public.billing_intent('brand_pro', 'month'); exception when others then insert into caught values ('wrong-side', sqlerrm); end $$;
reset role;
insert into results select 'Monthly Creator Pro is ₹299', (:'i1'::jsonb ->> 'amount')::int = 299 and :'i1'::jsonb ->> 'kind' = 'creator', :'i1';
insert into results select 'Yearly at the founding price while it lasts (₹1,499)', (:'i2'::jsonb ->> 'amount')::int = 1499 and (:'i2'::jsonb ->> 'founding')::boolean, :'i2';
insert into results select 'A creator can''t buy a brand plan', exists (select 1 from caught where k = 'wrong-side'), null;
select public.billing_pending(jsonb_build_object('kind', 'creator', 'subject', :'cid'::text, 'plan', 'creator_pro', 'period', 'year', 'founding', true, 'gateway_id', 'sub_TEST1', 'email', 'bill@test.dev')) as sid \gset
insert into results select 'Before payment, a pending plan unlocks nothing', private.plan_code('creator', :'cid'::text) = 'creator_free', null;
select (select founding_left from public.billing_settings) as fl0 \gset
select public.billing_event(jsonb_build_object('event', 'subscription.charged', 'subscription_id', 'sub_TEST1', 'payment_id', 'pay_TEST1', 'amount', 149900,
  'current_end', extract(epoch from now() + interval '1 year')::bigint)) as e1 \gset
insert into results select 'Paid: she is on Creator Pro for a year', private.plan_code('creator', :'cid'::text) = 'creator_pro'
  and (select ends_at > now() + interval '364 days' from public.billing_subscriptions where gateway_id = 'sub_TEST1'), :'e1';
insert into results select 'The payment is recorded with an invoice number and GST', (select amount = 1499 and gst = 228.66 and invoice_no like 'MIR/%' from public.billing_payments where gateway_payment_id = 'pay_TEST1'), (select row_to_json(y)::text from public.billing_payments y where gateway_payment_id = 'pay_TEST1');
insert into results select 'A receipt email goes out from Miracle', exists (select 1 from public.outbox where kind = 'plan_receipt' and to_email = 'bill@test.dev' and creator_id is null), null;
-- Invoices (migration 157): without the seller's GSTIN it's a plain invoice; with it, a tax invoice.
select token as tok1, invoice as inv1 from public.billing_payments where gateway_payment_id = 'pay_TEST1' \gset
insert into results select 'Each payment keeps its invoice, with the buyer and the period', :'inv1'::jsonb ->> 'number' like 'MIR/%' and :'inv1'::jsonb -> 'buyer' ->> 'name' = 'Bill T' and :'inv1'::jsonb -> 'item' ->> 'to' is not null, :'inv1';
insert into results select 'No seller GSTIN yet: a plain invoice, no GST lines', :'inv1'::jsonb ->> 'title' = 'Invoice' and (:'inv1'::jsonb ->> 'taxable')::numeric = 1499, null;
insert into results select 'The receipt carries the invoice link', (select payload ->> 'token' = :'tok1' and payload -> 'invoice' ->> 'number' is not null from public.outbox where kind = 'plan_receipt' and to_email = 'bill@test.dev' limit 1), null;
set local role anon;
select public.plan_invoice(:'tok1') as pub \gset
select public.plan_invoice('short') is null as short_null \gset
reset role;
insert into results select 'Anyone with the link sees the invoice (no sign-in)', :'pub'::jsonb ->> 'number' = :'inv1'::jsonb ->> 'number', null;
insert into results select 'A guessed short link sees nothing', :'short_null'::boolean, null;
update public.billing_settings set seller = seller || '{"gstin": "29ABCDE1234F1Z5"}' where id = 1;
update public.creator_settings set state = 'Karnataka' where id = :cid;
insert into results select 'Same state: CGST and SGST, 18% inside the price', (select x ->> 'title' = 'Tax invoice' and (x ->> 'taxable')::numeric = 1270.34 and (x ->> 'cgst')::numeric + (x ->> 'sgst')::numeric = 228.66 and (x ->> 'igst')::numeric = 0
  from (select private.plan_invoice_build(id) as x from public.billing_payments where gateway_payment_id = 'pay_TEST1') q), (select private.plan_invoice_build(id)::text from public.billing_payments where gateway_payment_id = 'pay_TEST1');
update public.creator_settings set state = 'Maharashtra' where id = :cid;
insert into results select 'Another state: IGST', (select (x ->> 'igst')::numeric = 228.66 and (x ->> 'cgst')::numeric = 0 from (select private.plan_invoice_build(id) as x from public.billing_payments where gateway_payment_id = 'pay_TEST1') q), null;
insert into results select 'One founding place is used', (select founding_left from public.billing_settings) = :fl0 - 1, null;
select public.billing_event(jsonb_build_object('event', 'subscription.charged', 'subscription_id', 'sub_TEST1', 'payment_id', 'pay_TEST1', 'amount', 149900,
  'current_end', extract(epoch from now() + interval '1 year')::bigint)) as e2 \gset
insert into results select 'The same payment twice is recorded once', (select count(*) = 1 from public.billing_payments where gateway_payment_id = 'pay_TEST1'), null;
set local role authenticated;
update public.creator_settings set autopilot_invoice = true where id = :cid;
do $$ begin perform public.billing_intent('creator_pro', 'month'); exception when others then insert into caught values ('again', sqlerrm); end $$;
reset role;
insert into results select 'On Pro the autopilot switches on', (select autopilot_invoice from public.creator_settings where id = :cid), null;
insert into results select 'Can''t buy twice while paying', exists (select 1 from caught where k = 'again'), null;
select public.billing_event(jsonb_build_object('event', 'subscription.cancelled', 'subscription_id', 'sub_TEST1')) as e3 \gset
insert into results select 'Cancelled: Pro until the paid year ends', private.plan_code('creator', :'cid'::text) = 'creator_pro', null;

-- ================================================================== 4. Lapsing, and the daily job
update public.billing_subscriptions set ends_at = now() - interval '1 day' where gateway_id = 'sub_TEST1';
select private.billing_daily() as d1 \gset
insert into results select 'When it lapses, her paid switches go off', not (select autopilot_invoice from public.creator_settings where id = :cid), null;
insert into results select 'She''s told her plan ended', exists (select 1 from public.outbox where kind = 'plan_ended' and to_email = 'bill@test.dev'), null;
insert into results select 'Running it again sends nothing new', private.billing_daily() = 0, null;
-- A trial two days from its end gets one reminder.
select gen_random_uuid() as t_uid \gset
insert into auth.users (id, email, aud, role) values (:'t_uid', 'trialbrand@test.dev', 'authenticated', 'authenticated');
insert into public.profiles (id, email) values (:'t_uid', 'trialbrand@test.dev') on conflict do nothing;
insert into public.brand_profiles (owner, name) values (:'t_uid', 'Trial Brand');
insert into results select 'A new brand team starts a Brand Pro trial', private.plan_code('workspace', :'t_uid'::text) = 'brand_pro', null;
update public.billing_subscriptions set ends_at = now() + interval '2 days' where subject_kind = 'workspace' and subject = :'t_uid'::text;
select private.billing_daily() as d2 \gset
insert into results select 'Two days before a trial ends, one reminder', (select count(*) = 1 from public.outbox where kind = 'plan_ending' and to_email = 'trialbrand@test.dev'), null;
select private.billing_daily() as d3 \gset
insert into results select 'and not twice', (select count(*) = 1 from public.outbox where kind = 'plan_ending' and to_email = 'trialbrand@test.dev'), null;

-- ================================================================== 5. A free brand team
update public.billing_subscriptions set ends_at = now() - interval '1 day' where subject_kind = 'workspace' and subject = :'t_uid'::text;
select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
insert into public.brands (creator_id, name) values (1, 'Trial Brand') returning id as tb \gset
insert into public.brand_members (profile_id, brand_id, owner) values (:'t_uid', :'tb', :'t_uid');
select set_config('request.jwt.claims', json_build_object('email', 'trialbrand@test.dev', 'sub', :'t_uid', 'role', 'authenticated')::text, true);
-- (a brand works on a creator's page: creator 1's here)
select set_config('request.headers', json_build_object('x-creator', (select slug from public.creator_settings where id = 1))::text, true);
select set_config('my.tb', :'tb', true), set_config('my.t', :'t_uid', true);
-- (inserted as the database with the brand signed in, as the app's own functions do)
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand) select 1, :'tb', '', 'request', 5000, false from generate_series(1, 3);
do $$ begin insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand) values (1, current_setting('my.tb')::uuid, '', 'request', 5000, false); exception when others then insert into caught values ('req4', sqlerrm); end $$;
do $$ begin insert into public.brand_autopilots (owner, negotiate) values (current_setting('my.t')::uuid, 'auto'); exception when others then insert into caught values ('bap', sqlerrm); end $$;
do $$ begin insert into public.brand_campaigns (owner, name, open) values (current_setting('my.t')::uuid, 'Open call', true); exception when others then insert into caught values ('open', sqlerrm); end $$;
do $$ begin insert into public.brand_team_members (owner, email, role) values (current_setting('my.t')::uuid, 'mate@test.dev', 'member'); exception when others then insert into caught values ('bseat', sqlerrm); end $$;
do $$ begin insert into public.brand_orders (owner, order_ref, amount) values (current_setting('my.t')::uuid, '#1', 100); exception when others then insert into caught values ('sales', sqlerrm); end $$;
set local role authenticated;
select public.my_plan() as bp \gset
reset role;
insert into results select 'Free brand: three requests a month go', (select count(*) = 3 from public.collabs where brand_id = :'tb'), null;
insert into results select 'the fourth asks for Brand Pro', (select msg like 'Miracle Pro:%' from caught where k = 'req4'), (select msg from caught where k = 'req4');
insert into results select 'Free brand: autopilots, open briefs, team and sales tracking ask for Pro',
  (select count(*) = 4 from caught where k in ('bap', 'open', 'bseat', 'sales') and msg like 'Miracle Pro:%'), (select string_agg(k || ': ' || msg, ' | ') from caught where k in ('bap', 'open', 'bseat', 'sales'));
insert into results select 'The brand''s plan shows its requests used', :'bp'::jsonb ->> 'plan' = 'brand_free' and (:'bp'::jsonb -> 'usage' ->> 'requests_month')::int = 3, (:'bp'::jsonb -> 'usage')::text;

-- ================================================================== 6. Agency cover
select gen_random_uuid() as ag \gset
insert into auth.users (id, email, aud, role) values (:'ag', 'agency@billtest.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
insert into public.team_members (creator_id, email, role) values (:cid, 'agency@billtest.dev', 'manager');
insert into public.billing_subscriptions (subject_kind, subject, plan, period, ends_at, source) values ('agency', :'ag', 'agency', 'month', now() + interval '20 days', 'razorpay');
insert into results select 'An Agency plan covers the creators it manages', private.plan_code('creator', :'cid'::text) = 'agency' and private.plan_has('creator', :'cid'::text, 'autopilots'), null;
insert into results select '... and its own brand team', private.plan_code('workspace', :'ag'::text) = 'agency', null;
insert into results select '... but not a client team that hasn''t paid', private.plan_code('workspace', :'t_uid'::text) = 'brand_free', null;

-- ================================================================== 7. Admin only
set local role authenticated;
do $$ begin perform public.admin_billing(); exception when others then insert into caught values ('admin', sqlerrm); end $$;
do $$ begin perform public.admin_billing_invoices(); exception when others then insert into caught values ('admin-inv', sqlerrm); end $$;
do $$ begin perform public.billing_event('{}'); exception when others then insert into caught values ('event', sqlerrm); end $$;
reset role;
insert into results select 'Only admins see billing', exists (select 1 from caught where k = 'admin'), null;
insert into results select 'Only admins see the invoice register', exists (select 1 from caught where k = 'admin-inv'), null;
insert into results select 'Nobody signed in can post a Razorpay event', exists (select 1 from caught where k = 'event'), (select msg from caught where k = 'event');
insert into results select 'Nobody reads the billing tables directly', not has_table_privilege('authenticated', 'public.billing_subscriptions', 'select') and not has_table_privilege('authenticated', 'public.billing_payments', 'select'), null;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
