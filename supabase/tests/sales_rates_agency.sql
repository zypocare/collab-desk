-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/sales_rates_agency.sql
-- Sales tracking, the rate benchmark and agency mode (migration 131). Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
create temp table caught (k text primary key, msg text) on commit drop;
grant all on caught to authenticated, anon;
select set_config('request.headers', '{}', true);
select lower(creator_email) as cr_email, slug as cr_slug from public.creator_settings where id = 1 \gset

-- ================================================================== 1. Sales from codes
select gen_random_uuid() as b_uid \gset
insert into auth.users (id, email, aud, role) values (:'b_uid', 'salesbrand@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'salesbrand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role authenticated;
select public.brand_signup('Glow Co', 'Skincare', '', '@glowco', 'Ria', 'Founder', '', 'Pune', '{}', '', '') is not null as s1 \gset
select public.brand_from_profile() is not null as s2 \gset
reset role;
select set_config('request.headers', '{}', true);
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand)
select 1, b.id, '', 'live', 20000, false from public.brands b join public.brand_members m on m.brand_id = b.id where m.profile_id = :'b_uid' and b.creator_id = 1 limit 1;
select id as col from public.collabs where brand_id in (select brand_id from public.brand_members where profile_id = :'b_uid') limit 1 \gset
insert into public.collab_links (collab_id, creator_id, slug, target, promo_code) values (:'col', 1, 'glowtest1', 'https://glow.test', 'NIVY10');

select set_config('request.jwt.claims', json_build_object('email', 'salesbrand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.brand_orders_import('[{"ref":"#1001","date":"2026-10-20","amount":"1,299.00","code":"nivy10"},{"ref":"#1002","date":"2026-10-21","amount":2500,"code":"NIVY10"},{"ref":"#1003","amount":900,"code":"OTHER5"},{"ref":"#1004","amount":400,"code":""}]', 'shopify') as imp \gset
insert into results select 'Orders are imported', (:'imp'::jsonb ->> 'imported')::int = 4, :'imp';
insert into results select 'Orders with her code count as hers', (:'imp'::jsonb ->> 'matched')::int = 2, null;
insert into results select 'Codes no creator has are listed', :'imp'::jsonb -> 'unmatched_codes' ? 'OTHER5', null;
select public.brand_orders_import('[{"ref":"#1001","amount":1299,"code":"NIVY10"}]', 'shopify') as again \gset
select x as srow from jsonb_array_elements(public.brand_sales()) x limit 1 \gset
insert into results select 'Importing the same order again doesn''t double it', (:'srow'::jsonb ->> 'orders')::int = 2, :'srow';
insert into results select 'Her sales add up', (:'srow'::jsonb ->> 'revenue')::numeric = 3799, null;
insert into results select 'The brand sees its fee next to the sales', (:'srow'::jsonb ->> 'fee')::numeric = 20000, null;
insert into results select 'The brand only sees its own orders', (select count(*) = 4 from public.brand_orders), null;
reset role;
insert into results select 'Her link shows the imported sales', (select sales = 2 and sales_by = 'brand' and sales_note like 'Imported from Shopify%' from public.collab_links where collab_id = :'col'), null;
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.brand_orders_import('[]', 'csv'); exception when others then insert into caught values ('creator', sqlerrm); end $$;
insert into results select 'A creator can''t import orders', exists (select 1 from caught where k = 'creator'), null;
insert into results select 'or read a brand''s orders', not exists (select 1 from public.brand_orders), null;
reset role;

-- ================================================================== 2. Rate benchmark
-- Six other creators of a similar size with accepted Reel quotes.
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen, niche)
select 'rb' || g || '@test.dev', 'rb' || g, 'rbx' || g, 'Bench ' || g, 'R' || chr(64 + g), 'RB' || g, 'active', true, 'Skincare' from generate_series(1, 6) g;
insert into public.ig_account (id, connected, followers) select id, true, 20000 from public.creator_settings where slug like 'rbx%'
on conflict (id) do update set followers = 20000, connected = true;
insert into public.brands (creator_id, name) select id, 'B' from public.creator_settings where slug like 'rbx%';
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand) select b.creator_id, b.id, '', 'confirmed', 10000, false from public.brands b join public.creator_settings s on s.id = b.creator_id where s.slug like 'rbx%';
insert into public.quotes (collab_id, creator_id, version, status, items, responded_at)
select c.id, c.creator_id, 1, 'accepted', jsonb_build_array(jsonb_build_object('kind', 'Reel', 'qty', 1, 'rate', 10000 + 2000 * row_number() over (order by c.creator_id))), now()
from public.collabs c join public.creator_settings s on s.id = c.creator_id where s.slug like 'rbx%';
insert into public.ig_account (id, connected, followers) values (1, true, 25000) on conflict (id) do update set followers = 25000, connected = true;
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.rate_benchmark() as rb \gset
insert into results select 'Creators her size: the middle of their Reel prices', (:'rb'::jsonb -> 'kinds' -> 'Reel' ->> 'p50')::numeric = 17000, :'rb';
insert into results select 'from 6 creators', (:'rb'::jsonb -> 'kinds' -> 'Reel' ->> 'creators')::int = 6, null;
insert into results select 'Too few creators: nothing shown', not (:'rb'::jsonb -> 'kinds' ? 'Story'), null;
reset role;
delete from public.quotes where creator_id = (select id from public.creator_settings where slug = 'rbx1');
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Under 5 creators it stays hidden', public.rate_benchmark() -> 'kinds' -> 'Reel' is not null and (public.rate_benchmark() -> 'kinds' -> 'Reel' ->> 'creators')::int = 5, null;
reset role;
delete from public.quotes where creator_id = (select id from public.creator_settings where slug = 'rbx2');
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'With 4 it is hidden', not (public.rate_benchmark() -> 'kinds' ? 'Reel'), null;
reset role;

-- ================================================================== 3. Agency mode
-- A manager on creator 1 and on bench creator 3; an assistant on bench creator 4.
select id as c3 from public.creator_settings where slug = 'rbx3' \gset
select id as c4 from public.creator_settings where slug = 'rbx4' \gset
select gen_random_uuid() as m_uid \gset
insert into auth.users (id, email, aud, role) values (:'m_uid', 'agency@test.dev', 'authenticated', 'authenticated');
insert into public.profiles (id, email) values (:'m_uid', 'agency@test.dev') on conflict do nothing;
insert into public.team_members (creator_id, email, role) values (1, 'agency@test.dev', 'manager'), (:c3, 'agency@test.dev', 'manager'), (:c4, 'agency@test.dev', 'assistant');
select set_config('request.jwt.claims', json_build_object('email', 'agency@test.dev', 'sub', :'m_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'She sees every studio she works for', jsonb_array_length(public.my_studios()) = 3, public.my_studios()::text;
insert into results select 'The roster has the ones she manages', jsonb_array_length(public.agency_roster()) = 2, null;
select public.use_creator(:c3);
insert into results select 'Switching makes that creator current', public.current_creator() = :c3, null;
do $$ begin perform public.use_creator((select id from public.creator_settings where slug = 'rbx5')); exception when others then insert into caught values ('other', sqlerrm); end $$;
insert into results select 'She can''t switch to a creator she doesn''t work for', exists (select 1 from caught where k = 'other'), null;
reset role;
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role authenticated;
insert into results select 'On a creator''s own address, that creator is current', public.current_creator() = 1, null;
reset role;
select set_config('request.headers', json_build_object('x-creator', 'rbx5')::text, true);
set local role authenticated;
insert into results select 'On someone else''s address, her own pick stays', public.current_creator() = :c3, null;
reset role;
select set_config('request.headers', '{}', true);
set local role authenticated;
select public.agency_set(:c3, 20, null, false);
insert into results select 'Her commission saves', (select (x ->> 'pct')::numeric = 20 from jsonb_array_elements(public.agency_roster()) x where (x ->> 'id')::int = :c3), null;
do $$ begin perform public.agency_set(1, null, (select id from public.collabs where creator_id <> 1 limit 1), true); exception when others then insert into caught values ('deal', sqlerrm); end $$;
insert into results select 'A deal must be that creator''s', exists (select 1 from caught where k = 'deal'), null;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
