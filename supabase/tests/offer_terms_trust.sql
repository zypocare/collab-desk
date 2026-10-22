-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/offer_terms_trust.sql
-- Offer checks, payment terms, payment demands and trust scores (migration 129).
-- Runs in one transaction and rolls back. Each check prints PASS or FAIL.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
create temp table caught (k text primary key, msg text) on commit drop;
grant all on caught to authenticated, anon;
select set_config('request.headers', '{}', true);

-- Two creators, the same brand company (one GST number) at each.
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen, listed, niche, site_url)
values ('ot-a@test.dev', 'ota', 'ota', 'Asha Terms', 'TA', 'TAINV', 'active', true, true, 'Skincare', 'https://ota.example.test'),
       ('ot-b@test.dev', 'otb', 'otb', 'Bina Terms', 'TB', 'TBINV', 'active', true, true, 'Skincare', 'https://otb.example.test');
select id as a_id from public.creator_settings where slug = 'ota' \gset
select id as b_id from public.creator_settings where slug = 'otb' \gset
select gen_random_uuid() as a_uid, gen_random_uuid() as b_uid \gset
insert into auth.users (id, email, aud, role) values (:'a_uid', 'ot-a@test.dev', 'authenticated', 'authenticated'), (:'b_uid', 'ot-b@test.dev', 'authenticated', 'authenticated');
insert into public.profiles (id, email) values (:'a_uid', 'ot-a@test.dev'), (:'b_uid', 'ot-b@test.dev') on conflict do nothing;

insert into public.brands (creator_id, name, gstin) values (:a_id, 'Kora Botanicals', '27AAPFU0939F1ZV'), (:b_id, 'Kora', '27aapfu0939f1zv');
insert into public.brands (creator_id, name) values (:a_id, 'Glow Up Agency');
select id as ka from public.brands where creator_id = :a_id and name = 'Kora Botanicals' \gset
select id as kb from public.brands where creator_id = :b_id and name = 'Kora' \gset
select id as glow from public.brands where creator_id = :a_id and name = 'Glow Up Agency' \gset

-- At B: two paid invoices from Kora (one on time in 9 days, one late after a demand), one open late.
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand, contact_email, contact_name, live_date, created_at)
values (:b_id, :'kb', '', 'wrapped', 20000, false, 'riya@kora.test', 'Riya', current_date - 25, now() - interval '40 days'),
       (:b_id, :'kb', '', 'wrapped', 30000, false, 'riya@kora.test', 'Riya', current_date - 80, now() - interval '100 days'),
       (:b_id, :'kb', '', 'live', 24000, false, 'riya@kora.test', 'Riya', current_date - 35, now() - interval '50 days');
select id as c1 from public.collabs where creator_id = :b_id and fee = 20000 \gset
select id as c2 from public.collabs where creator_id = :b_id and fee = 30000 \gset
select id as c3 from public.collabs where creator_id = :b_id and fee = 24000 \gset
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand) values (:a_id, :'ka', '', 'request', 25000, false), (:a_id, :'glow', '', 'request', 75000, false);
select id as ca from public.collabs where creator_id = :a_id and brand_id = :'ka' \gset

insert into public.invoices (collab_id, creator_id, number, issue_date, due_date, items, status, sent_at)
values (:'c1', :b_id, 'TB-1', current_date - 20, current_date - 5, '[{"description":"Reel","qty":1,"rate":20000}]', 'sent', now()),
       (:'c2', :b_id, 'TB-2', current_date - 75, current_date - 60, '[{"description":"Reel","qty":1,"rate":30000}]', 'sent', now()),
       (:'c3', :b_id, 'TB-3', current_date - 30, current_date - 18, '[{"description":"Reel","qty":1,"rate":24000}]', 'sent', now());
select id as i1 from public.invoices where number = 'TB-1' \gset
select id as i2 from public.invoices where number = 'TB-2' \gset
select id as i3 from public.invoices where number = 'TB-3' \gset
insert into public.payment_demands (creator_id, invoice_id, step, kind, final_date, via, sent_at) values (:b_id, :'i2', 3, 'demand', current_date - 15, 'email', now() - interval '22 days');
update public.invoices set amount_received = total, paid_on = current_date - 11, status = 'paid' where id = :'i1';
update public.invoices set amount_received = total, paid_on = current_date - 20, status = 'paid' where id = :'i2';
insert into public.bank_alerts (creator_id, sender, amount, ref, excerpt, hash, status, invoice_id)
  values (:b_id, 'HDFC', 23600, 'UTR1', 'credited', 'h-ot-1', 'matched', :'i1');

-- ================================================================== 1. How a brand pays, as A sees it
select set_config('request.jwt.claims', json_build_object('email', 'ot-a@test.dev', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.brand_trust_all() as t \gset
insert into results select 'A sees how Kora paid other creators', (:'t'::jsonb -> :'ka' ->> 'invoices')::int = 2, :'t';
insert into results select 'one of them on time', (:'t'::jsonb -> :'ka' ->> 'on_time')::int = 1, null;
insert into results select 'one checked against a bank alert', (:'t'::jsonb -> :'ka' ->> 'by_bank')::int = 1, null;
insert into results select 'one paid after a formal demand', (:'t'::jsonb -> :'ka' ->> 'after_demand')::int = 1, null;
insert into results select 'and one unpaid past its date now', (:'t'::jsonb -> :'ka' ->> 'late_now')::int = 1, null;
insert into results select 'The average counts the open one as late', (:'t'::jsonb -> :'ka' ->> 'avg_days')::int = round((9 + 55 + 30) / 3.0), :'t'::jsonb -> :'ka' ->> 'avg_days';
insert into results select 'A brand with no history has none', (:'t'::jsonb -> :'glow' ->> 'invoices')::int = 0 and (:'t'::jsonb -> :'glow' ->> 'late_now')::int = 0, null;
insert into results select 'Only her own brands are listed', not (:'t'::jsonb ? :'kb'), null;
insert into results select 'Other creators'' invoices stay hidden', not exists (select 1 from public.invoices where number like 'TB-%'), null;
reset role;

-- ================================================================== 2. Offer checks and terms
select set_config('request.jwt.claims', json_build_object('email', 'ot-a@test.dev', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.offer_checks (collab_id, source, result) values (:'ca', '{"name":"agreement.pdf","kind":"pdf","pages":2}', '{"score":58,"flags":[]}');
insert into results select 'An offer check is hers', (select creator_id = :a_id from public.offer_checks where collab_id = :'ca'), null;
update public.creator_settings set terms_advance_pct = 50, terms_pay_days = 15, terms_wait_advance = true, udyam_no = 'UDYAM-KR-03-0012345' where id = :a_id;
insert into results select 'Her usual terms save', (select terms_advance_pct = 50 and terms_wait_advance from public.creator_settings where id = :a_id), null;
do $$ begin update public.creator_settings set terms_advance_pct = 40 where id = (select public.current_creator()); exception when others then insert into caught values ('pct', sqlerrm); end $$;
insert into results select 'Only none, 30, 50 or all as an advance', exists (select 1 from caught where k = 'pct'), null;
insert into public.quotes (collab_id, items, advance_pct, pay_days, wait_advance, status) values (:'ca', '[{"kind":"Reel","qty":1,"rate":25000}]', 50, 15, true, 'draft');
insert into results select 'A quote can wait for the advance', exists (select 1 from public.quotes where collab_id = :'ca' and wait_advance), null;
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'ot-b@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Another creator can''t see her offer checks', not exists (select 1 from public.offer_checks where collab_id = :'ca'), null;
reset role;

-- ================================================================== 3. Payment demands
select set_config('request.jwt.claims', json_build_object('email', 'ot-b@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.payment_demand_send(:'i3', 3, 'demand', current_date + 7, 'email', array['riya@kora.test', 'accounts@kora.test', 'not-an-email'], 'Dear Riya,\n\nThis is a formal demand.') as d \gset
insert into results select 'The demand is recorded', exists (select 1 from public.payment_demands where id = :'d' and kind = 'demand' and final_date = current_date + 7), null;
insert into results select 'It shows on the collab for the brand', exists (select 1 from public.collab_events where collab_id = :'c3' and visible_to_brand and text like 'Formal payment demand sent for TB-3%'), null;
reset role;
insert into results select 'It is emailed to each real address', (select count(*) = 2 from public.outbox where kind = 'payment_demand' and payload ->> 'number' = 'TB-3'), (select count(*)::text from public.outbox where kind = 'payment_demand');
insert into results select 'with the amount, final date and the invoice link', exists (select 1 from public.outbox where kind = 'payment_demand' and (payload ->> 'due_amount')::numeric > 0 and payload ->> 'final_date' = (current_date + 7)::text and payload ->> 'link' like 'https://otb.example.test/invoice/%'), null;
select set_config('request.jwt.claims', json_build_object('email', 'ot-a@test.dev', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.payment_demand_send((select id from public.invoices where number = 'TB-3'), 3, 'demand', current_date + 7, 'email', '{}', ''); exception when others then insert into caught values ('other', sqlerrm); end $$;
insert into results select 'Nobody else can send a demand on her invoice', exists (select 1 from caught where k = 'other'), (select msg from caught where k = 'other');
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'ot-b@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.payment_demand_send((select id from public.invoices where number = 'TB-1'), 3, 'demand', current_date + 7, 'email', '{}', ''); exception when others then insert into caught values ('paid', sqlerrm); end $$;
insert into results select 'A paid invoice gets no demand', exists (select 1 from caught where k = 'paid'), null;
select public.payment_demand_send(:'i3', 4, 'msme', null, 'download', '{}', '') as d4 \gset
insert into results select 'Step 4 is recorded without an email', exists (select 1 from public.payment_demands where id = :'d4' and step = 4) and (select count(*) = 2 from public.outbox where kind = 'payment_demand'), null;
reset role;

-- ================================================================== 4. How a creator delivers
insert into public.ig_media (id, creator_id, media_type, posted_at, views) values ('ot-m1', :b_id, 'VIDEO', (current_date - 26)::timestamptz + interval '12 hours', 1000), ('ot-m2', :b_id, 'VIDEO', (current_date - 78)::timestamptz, 1000);
insert into public.collab_posts (collab_id, media_id, creator_id) values (:'c1', 'ot-m1', :b_id), (:'c2', 'ot-m2', :b_id);
select private.creator_trust(:b_id) as ct \gset
insert into results select 'Paid deals count as verified', (:'ct'::jsonb ->> 'deals')::int = 2, :'ct';
insert into results select 'Posts on or before the agreed day count as on time', (:'ct'::jsonb ->> 'posted')::int = 2 and (:'ct'::jsonb ->> 'on_time')::int = 1, :'ct';
insert into results select 'Brands see it on her card', private.creator_card(:b_id) ? 'trust', null;
insert into results select 'A creator with nothing done yet has no deals', (private.creator_trust(:a_id) ->> 'deals')::int = 0, null;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
