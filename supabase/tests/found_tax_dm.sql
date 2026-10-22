-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/found_tax_dm.sql
-- Get found, the tax desk and comment-to-DM (migration 130). Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
create temp table caught (k text primary key, msg text) on commit drop;
grant all on caught to authenticated, anon;
select set_config('request.headers', '{}', true);

insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen, bio)
values ('fd-a@test.dev', 'fda', 'fda', 'Asha Found', 'FA', 'FAINV', 'active', true, 'Bengaluru skincare reels in Kannada and English.'),
       ('fd-b@test.dev', 'fdb', 'fdb', 'Bina Found', 'FB', 'FBINV', 'active', true, '');
select id as a_id from public.creator_settings where slug = 'fda' \gset
select id as b_id from public.creator_settings where slug = 'fdb' \gset
select gen_random_uuid() as a_uid, gen_random_uuid() as b_uid \gset
insert into auth.users (id, email, aud, role) values (:'a_uid', 'fd-a@test.dev', 'authenticated', 'authenticated'), (:'b_uid', 'fd-b@test.dev', 'authenticated', 'authenticated');
insert into public.profiles (id, email) values (:'a_uid', 'fd-a@test.dev'), (:'b_uid', 'fd-b@test.dev') on conflict do nothing;

-- ================================================================== 1. Page views and her about line
set local role anon;
select public.page_hit('fda', 'instagram');
select public.page_hit('FDA', 'instagram');
select public.page_hit('fda', '');
select public.page_hit('fda', '<script>x');
select public.page_hit('nobody-here', 'instagram');
reset role;
insert into results select 'Anyone opening her page counts a view', (select views from public.page_views where creator_id = :a_id and source = 'instagram') = 2, null;
insert into results select 'No source counts as direct', exists (select 1 from public.page_views where creator_id = :a_id and source = 'direct'), null;
insert into results select 'Odd characters are cleaned out', exists (select 1 from public.page_views where creator_id = :a_id and source = 'scriptx'), (select string_agg(source, ',') from public.page_views where creator_id = :a_id);
insert into results select 'Unknown pages count nothing', (select count(*) from public.page_views where creator_id not in (:a_id)) = 0, null;
select set_config('request.headers', json_build_object('x-creator', 'fda')::text, true);
insert into results select 'Her about line is on her page', public.page_extras() ->> 'bio' = 'Bengaluru skincare reels in Kannada and English.', public.page_extras()::text;
select set_config('request.headers', '{}', true);
select set_config('request.jwt.claims', json_build_object('email', 'fd-b@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Another creator can''t see her views', not exists (select 1 from public.page_views where creator_id = :a_id), null;
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'fd-a@test.dev', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'She sees her own', (select sum(views) from public.page_views) = 4, null;
reset role;

-- ================================================================== 2. Tax
insert into public.brands (creator_id, name) values (:a_id, 'Tax Brand');
select id as br from public.brands where name = 'Tax Brand' \gset
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand) values (:a_id, :'br', '', 'live', 60000, false);
select id as col from public.collabs where brand_id = :'br' \gset
insert into public.invoices (collab_id, creator_id, issue_date, items, status, tds_rate, tds_section)
values (:'col', :a_id, current_date, '[{"description":"Reel","qty":1,"rate":60000}]', 'sent', 10, '194J');
select id as inv from public.invoices where collab_id = :'col' \gset
select set_config('request.jwt.claims', json_build_object('email', 'fd-a@test.dev', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
update public.invoices set tds_seen_at = now() where id = :'inv';
insert into results select 'She can tick TDS seen in 26AS on an issued invoice', (select tds_seen_at is not null from public.invoices where id = :'inv'), null;
update public.brands set tan = 'BLRK12345E' where id = :'br';
insert into results select 'A brand''s TAN saves', (select tan = 'BLRK12345E' from public.brands where id = :'br'), null;
do $$ begin update public.brands set tan = 'nope' where name = 'Tax Brand'; exception when others then insert into caught values ('tan', sqlerrm); end $$;
insert into results select 'A wrong TAN is refused', exists (select 1 from caught where k = 'tan'), null;
do $$ begin update public.invoices set tds_section = '194X' where tds_section = '194J'; exception when others then insert into caught values ('sec', sqlerrm); end $$;
insert into results select 'Only 194J or 194C', exists (select 1 from caught where k = 'sec'), null;
reset role;

-- ================================================================== 3. Comment-to-DM
select set_config('request.jwt.claims', json_build_object('email', 'fd-a@test.dev', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
update public.creator_settings set comment_dm_mode = 'ask' where id = :a_id;
insert into public.dm_rules (keyword, reply) values ('COLLAB', 'My rates: {link}');
insert into results select 'A keyword is hers', (select creator_id = :a_id from public.dm_rules where keyword = 'COLLAB'), null;
do $$ begin insert into public.dm_rules (keyword, reply) values ('collab', 'again'); exception when others then insert into caught values ('dup', sqlerrm); end $$;
insert into results select 'The same keyword twice is refused', exists (select 1 from caught where k = 'dup'), null;
do $$ begin update public.creator_settings set comment_dm_mode = 'always' where id = (select public.current_creator()); exception when others then insert into caught values ('mode', sqlerrm); end $$;
insert into results select 'Mode is off, ask or auto', exists (select 1 from caught where k = 'mode'), null;
reset role;
insert into public.dm_auto_log (creator_id, comment_id, from_username, text, reply) values (:a_id, 'c-1', 'fan', 'COLLAB pls', 'My rates: x');
do $$ begin insert into public.dm_auto_log (creator_id, comment_id, from_username, text, reply) values ((select id from public.creator_settings where slug = 'fda'), 'c-1', 'fan', 'again', 'x'); exception when others then insert into caught values ('twice', sqlerrm); end $$;
insert into results select 'A comment is answered once', exists (select 1 from caught where k = 'twice'), null;
select set_config('request.jwt.claims', json_build_object('email', 'fd-b@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Another creator can''t see her keywords', not exists (select 1 from public.dm_rules where keyword = 'COLLAB'), null;
insert into results select 'or her waiting replies', not exists (select 1 from public.dm_auto_log where comment_id = 'c-1'), null;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
