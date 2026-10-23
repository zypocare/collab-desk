-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/rights_ledger.sql
-- Rights and partnership ads (migration 132). Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
create temp table caught (k text primary key, msg text) on commit drop;
grant all on caught to authenticated, anon;
select set_config('request.headers', '{}', true);
select slug as cr_slug from public.creator_settings where id = 1 \gset

-- A brand login and a live collab with paid usage and an exclusivity.
select gen_random_uuid() as b_uid \gset
insert into auth.users (id, email, aud, role) values (:'b_uid', 'rightsbrand@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'rightsbrand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role authenticated;
select public.brand_signup('Dew Labs', 'Skincare', '', '@dewlabs', 'Ria', 'Founder', '', 'Pune', '{}', '', '') is not null as s1 \gset
select public.brand_from_profile() is not null as s1b \gset
reset role;
select set_config('request.headers', '{}', true);
insert into public.collabs (creator_id, brand_id, code, stage, fee, usage, live_date, notify_brand)
select 1, b.id, '', 'live', 30000, 'Brand ads for 30 days', current_date, false
from public.brands b join public.brand_members m on m.brand_id = b.id where m.profile_id = :'b_uid' and b.creator_id = 1 limit 1;
select id as col, code as ccode from public.collabs where brand_id in (select brand_id from public.brand_members where profile_id = :'b_uid') limit 1 \gset
insert into public.quotes (collab_id, creator_id, version, status, items, exclusivity_days, responded_at)
values (:'col', 1, 1, 'accepted', '[{"kind":"Reel","qty":1,"rate":30000}]', 45, now());

insert into results select 'New deals default to India, no ad set-up', (select territory = 'India' and ad_how = '' and ad_code = '' from public.collabs where id = :'col'), null;
do $$ begin update public.collabs set ad_how = 'boost' where id = (select id from public.collabs order by created_at desc limit 1); exception when others then insert into caught values ('how', sqlerrm); end $$;
insert into results select 'Only known ad set-ups are allowed', exists (select 1 from caught where k = 'how'), null;

-- She shares her partnership-ad code.
update public.collabs set ad_how = 'partnership', excl_scope = 'skincare' where id = :'col';
insert into results select 'Setting how ads run doesn''t stamp a code', (select ad_code_at is null from public.collabs where id = :'col'), null;
update public.collabs set ad_code = 'PAC-123-XYZ' where id = :'col';
insert into results select 'Sharing the code stamps when', (select ad_code_at is not null from public.collabs where id = :'col'), null;
insert into results select 'The brand hears about the code', (select count(*) = 1 from public.collab_events where collab_id = :'col' and visible_to_brand and text like 'Partnership ad code shared%'), null;
update public.collabs set fee = 31000 where id = :'col';
insert into results select 'Other edits don''t repeat the note', (select count(*) = 1 from public.collab_events where collab_id = :'col' and text like 'Partnership ad code shared%'), null;
do $$ begin update public.collabs set ad_code = repeat('x', 201) where ad_code = 'PAC-123-XYZ'; exception when others then insert into caught values ('long', sqlerrm); end $$;
insert into results select 'Codes have a sane length', exists (select 1 from caught where k = 'long'), null;

-- The brand's view.
select set_config('request.jwt.claims', json_build_object('email', 'rightsbrand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role authenticated;
select public.brand_rights(:'ccode') as br \gset
reset role;
insert into results select 'The brand sees the code', :'br'::jsonb ->> 'ad_code' = 'PAC-123-XYZ', :'br';
insert into results select 'and the exclusivity from the accepted quote', (:'br'::jsonb ->> 'excl_days')::int = 45 and :'br'::jsonb ->> 'excl_scope' = 'skincare', null;
insert into results select 'and how the ads run', :'br'::jsonb ->> 'ad_how' = 'partnership', null;

-- Another brand login can't read it.
select gen_random_uuid() as o_uid \gset
insert into auth.users (id, email, aud, role) values (:'o_uid', 'otherbrand@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'otherbrand@test.dev', 'sub', :'o_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.brand_signup('Rival Co', 'Skincare', '', '@rivalco', 'Sam', 'Founder', '', 'Delhi', '{}', '', '') is not null as s2 \gset
select public.brand_from_profile() is not null as s2b \gset
insert into results select 'Another brand can''t see the code', public.brand_rights(:'ccode') is null, null;
reset role;
set local role anon;
do $$ begin perform public.brand_rights('X'); exception when others then insert into caught values ('anon', sqlerrm); end $$;
insert into results select 'Signed-out visitors can''t call it', exists (select 1 from caught where k = 'anon'), null;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
