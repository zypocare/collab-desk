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
select id as a_invoice from public.invoices where creator_id = 1 order by created_at desc limit 1 \gset
select id as a_quote from public.quotes where creator_id = 1 order by created_at desc limit 1 \gset
select id as a_brand from public.brands where creator_id = 1 limit 1 \gset
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

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
