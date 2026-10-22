-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/two_creators.sql
-- Two creators, kept apart. Runs in one transaction and rolls back, so the local data is untouched.
-- A = the existing creator (id 1). B = a new creator made here. Each check prints PASS or FAIL.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;

-- creator B, with its own owner login
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix)
values ('creator-b@test.dev', 'creatorb', 'creatorb', 'Creator B', 'BB', 'BINV');
select id as b_id from public.creator_settings where handle = 'creatorb' \gset
select id as a_id, lower(creator_email) as a_email from public.creator_settings where id = 1 \gset

-- act as B (signed in)
select set_config('request.jwt.claims', json_build_object('email', 'creator-b@test.dev', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'B is a creator', public.is_creator(), public.current_creator()::text;
insert into results select 'B works for B', public.current_creator() = :b_id, public.current_creator()::text;
insert into public.brands (name) values ('Brand Of B') ;
insert into results select 'B''s new brand is tagged B', (select creator_id from public.brands where name = 'Brand Of B') = :b_id, null;
insert into public.collabs (brand_id, brief) select id, 'Collab of B' from public.brands where name = 'Brand Of B';
insert into results select 'B''s collab is tagged B and coded BB', (select creator_id = :b_id and code like 'BB%' from public.collabs where brief = 'Collab of B'), (select code from public.collabs where brief = 'Collab of B');
insert into results select 'B sees only B''s collabs', (select bool_and(creator_id = :b_id) from public.collabs), (select count(*)::text from public.collabs);
insert into results select 'B sees only B''s brands', (select bool_and(creator_id = :b_id) from public.brands), (select count(*)::text from public.brands);
insert into results select 'B sees only B''s settings', (select count(*) = 1 and bool_and(id = :b_id) from public.creator_settings), null;
insert into results select 'B sees no invoices of A', not exists (select 1 from public.invoices where creator_id = :a_id), null;
insert into results select 'B sees no outbox of A', not exists (select 1 from public.outbox where creator_id = :a_id), null;
reset role;

-- act as A
select set_config('request.jwt.claims', json_build_object('email', :'a_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'A works for A', public.current_creator() = :a_id, public.current_creator()::text;
insert into results select 'A can''t see B''s collab', not exists (select 1 from public.collabs where brief = 'Collab of B'), null;
insert into results select 'A can''t see B''s brand', not exists (select 1 from public.brands where name = 'Brand Of B'), null;
with u as (update public.collabs set brief = 'hacked' where brief = 'Collab of B' returning 1)
insert into results select 'A can''t change B''s collab', (select count(*) = 0 from u), null;
insert into results select 'A can''t switch to B', false, null;
do $$ begin perform public.switch_creator((select id from public.creator_settings where handle = 'creatorb')); exception when others then update results set ok = true, detail = sqlerrm where check_name = 'A can''t switch to B'; end $$;
reset role;


-- B tries A's rows through the database functions (these skip the access rules, so they must check)
select coalesce((select id::text from public.invoices where creator_id = 1 order by created_at desc limit 1), '00000000-0000-0000-0000-000000000000') as a_invoice \gset
select coalesce((select id::text from public.quotes where creator_id = 1 order by created_at desc limit 1), '00000000-0000-0000-0000-000000000000') as a_quote \gset
select brand_id as a_brand from public.collabs where creator_id = 1 order by created_at limit 1 \gset
select set_config('request.jwt.claims', json_build_object('email', 'creator-b@test.dev', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'B gets nothing from A''s agreement', public.get_agreement(:'a_quote') is null, null;
insert into results select 'B can''t delete A''s brand', false, null;
do $$ begin perform public.delete_brand((select id from public.brands where creator_id = 1 limit 1)); exception when others then update results set ok = true, detail = sqlerrm where check_name = 'B can''t delete A''s brand'; end $$;
insert into results select 'B can''t remind A''s brands', false, null;
do $$ declare r jsonb; begin r := to_jsonb(public.send_reminders(array[(select id from public.invoices where creator_id = 1 order by created_at desc limit 1)])); update results set ok = coalesce(r::text, '') in ('0', 'null', '[]', '{}', '') or r::text ~ '"(sent|count)": ?0' or not (r::text ~ '[1-9]'), detail = r::text where check_name = 'B can''t remind A''s brands'; exception when others then update results set ok = true, detail = sqlerrm where check_name = 'B can''t remind A''s brands'; end $$;
insert into results select 'B''s studio account names B', (public.studio_account() ->> 'creator_id')::int = :b_id, public.studio_account()::text;
reset role;
select count(*) as a_outbox_before from public.outbox where creator_id = 1 \gset

-- One brand login that works with both creators. Which company it acts as follows the page it's on.
select slug as a_slug from public.creator_settings where id = 1 \gset
select id as b_brand from public.brands where name = 'Brand Of B' \gset
select code as b_code from public.collabs where brief = 'Collab of B' \gset
select id as a_collab, code as a_code from public.collabs where creator_id = 1 and brand_id = :'a_brand' limit 1 \gset
select gen_random_uuid() as brand_uid \gset
insert into auth.users (id, email, aud, role) values (:'brand_uid', 'shopper@test.dev', 'authenticated', 'authenticated');
insert into public.profiles (id, email) values (:'brand_uid', 'shopper@test.dev') on conflict do nothing;
insert into public.brand_members (profile_id, brand_id) values (:'brand_uid', :'a_brand'), (:'brand_uid', :'b_brand') on conflict do nothing;
update public.profiles set brand_id = :'a_brand' where id = :'brand_uid';
update public.creator_settings set listed = true where id = :b_id;

select set_config('request.jwt.claims', json_build_object('email', 'shopper@test.dev', 'sub', :'brand_uid', 'role', 'authenticated')::text, true);
-- on B's page
select set_config('request.headers', json_build_object('x-creator', 'creatorb')::text, true);
set local role authenticated;
insert into results select 'Brand on B''s page acts as its B company', (public.my_account() -> 'brand' ->> 'id')::uuid = :'b_brand', (public.my_account() -> 'brand' ->> 'id')::uuid::text;
insert into results select 'Brand on B''s page sees only B''s requests', (select coalesce(bool_and(x ->> 'code' like 'BB%'), true) and count(*) >= 1 from jsonb_array_elements(public.my_requests()) x), public.my_requests()::text;
insert into results select 'Brand on B''s page can''t read A''s collab messages', not public.is_my_collab(:'a_collab'), null;
insert into results select 'Brand account lists both creators', jsonb_array_length(public.my_account() -> 'creators') = 2, (public.my_account() -> 'creators')::text;
insert into results select 'Brand account offers only B''s companies here', (select bool_and((x ->> 'id')::uuid = :'b_brand') from jsonb_array_elements(public.my_account() -> 'brands') x), null;
insert into results select 'Brand can''t switch to A''s company on B''s page', false, null;
do $$ begin perform public.switch_brand((select id from public.brands where creator_id = 1 and id in (select brand_id from public.brand_members where profile_id = auth.uid()) limit 1)); exception when others then update results set ok = true, detail = sqlerrm where check_name = 'Brand can''t switch to A''s company on B''s page'; end $$;
insert into results select 'A request link says which creator it belongs to', public.request_place(:'a_code') ->> 'slug' = :'a_slug', public.request_place(:'a_code')::text;
insert into results select 'Dashboard covers both creators', jsonb_array_length(public.brand_dashboard() -> 'creators') = 2, null;
insert into results select 'Discover lists only listed creators', (select bool_and(x ->> 'slug' = 'creatorb') and count(*) = 1 from jsonb_array_elements(public.discover_creators('', '')) x), public.discover_creators('', '')::text;
-- on A's page
select set_config('request.headers', json_build_object('x-creator', :'a_slug')::text, true);
insert into results select 'Brand on A''s page acts as its A company', (public.my_account() -> 'brand' ->> 'id')::uuid = :'a_brand', (public.my_account() -> 'brand' ->> 'id')::uuid::text;
insert into results select 'Brand on A''s page sees none of B''s requests', not exists (select 1 from jsonb_array_elements(public.my_requests()) x where x ->> 'code' like 'BB%'), null;
insert into results select 'Brand on A''s page can''t read B''s collab', not public.is_my_collab((select id from public.collabs where code = :'b_code')), null;
reset role;
select set_config('request.headers', '', true);

-- Pools and campaigns: the brand login's own, sent as one ordinary request per creator
select set_config('request.jwt.claims', json_build_object('email', 'shopper@test.dev', 'sub', :'brand_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', 'creatorb')::text, true);
set local role authenticated;
select (public.pool_save(null, 'Test pool') ->> 'id') as pool_id \gset
select public.pool_add(:'pool_id', array[:b_id, :a_id], array['@Someone.New']) is not null as added \gset
insert into results select 'Pool holds both creators and an invited handle', (select jsonb_array_length(x -> 'members') = 3 from jsonb_array_elements(public.pools_list()) x where x ->> 'id' = :'pool_id'), null;
select public.campaign_save(jsonb_build_object('name', 'Test campaign', 'pool_id', :'pool_id', 'brief',
  jsonb_build_object('type', 'paid', 'deliverables', jsonb_build_array(jsonb_build_object('kind', 'Reel', 'qty', 1)), 'fee', 5000, 'usage', 'Organic only', 'brief', 'Campaign test'))) as camp_id \gset
select public.send_campaign(:'camp_id', array[:b_id], array['someone.new']) as board \gset
insert into results select 'Board shows the request and the invite', (select jsonb_array_length(public.campaign_board(:'camp_id') -> 'rows') = 2), null;
reset role;
insert into results select 'Campaign sends B an ordinary request, tagged B', (select k.creator_id = :b_id and k.code like 'BB%' from public.campaign_creators x join public.collabs k on k.id = x.collab_id where x.campaign_id = :'camp_id' and x.creator_id = :b_id), (select status || ' ' || note from public.campaign_creators where campaign_id = :'camp_id' and creator_id = :b_id);
insert into results select 'Campaign request uses the brand''s B company', (select b.creator_id = :b_id and b.id = :'b_brand' from public.campaign_creators x join public.collabs k on k.id = x.collab_id join public.brands b on b.id = k.brand_id where x.campaign_id = :'camp_id' and x.creator_id = :b_id), null;
-- creator B sees the request but nothing about the campaign or the pool
select set_config('request.headers', '', true);
select set_config('request.jwt.claims', json_build_object('email', 'creator-b@test.dev', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'B sees the campaign request as a normal collab', exists (select 1 from public.collabs where brief = 'Campaign test'), null;
insert into results select 'B sees no campaigns or pools', not exists (select 1 from public.brand_campaigns) and not exists (select 1 from public.brand_pools) and not exists (select 1 from public.campaign_creators), null;
insert into results select 'B gets no other login''s campaign board', public.campaign_board(:'camp_id') is null, null;
insert into results select 'B can''t send someone else''s campaign', false, null;
do $$ begin perform public.send_campaign((select id from public.brand_campaigns limit 1), array[1], '{}'); update results set ok = true where check_name = 'B can''t send someone else''s campaign'; exception when others then update results set ok = true, detail = sqlerrm where check_name = 'B can''t send someone else''s campaign'; end $$;
reset role;
select set_config('request.jwt.claims', '', true);
update results set ok = (select count(*) from public.campaign_creators where campaign_id = :'camp_id' and status = 'sent') = 1 where check_name = 'B can''t send someone else''s campaign';

-- A collab can't be given another creator's company
insert into results select 'A collab can''t take another creator''s brand', false, null;
do $$ begin update public.collabs set brand_id = (select id from public.brands where creator_id = 1 limit 1) where brief = 'Collab of B'; exception when others then update results set ok = true, detail = sqlerrm where check_name = 'A collab can''t take another creator''s brand'; end $$;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
