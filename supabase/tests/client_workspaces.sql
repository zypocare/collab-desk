-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/client_workspaces.sql
-- Client workspaces (migration 147). An agency's staff member works for two client teams; each client
-- sees only its own companies, and the staff member sees one client at a time. Most checks here are
-- negative: what someone must NOT see. Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
create temp table caught (k text primary key, msg text) on commit drop;
grant all on caught to authenticated, anon;
select set_config('request.headers', '{}', true);
select slug as cr_slug from public.creator_settings where id = 1 \gset

-- Two client teams (Alpha and Beta), each with a company on creator 1 and a collab, and Sam from the agency.
select gen_random_uuid() as a_uid, gen_random_uuid() as b_uid, gen_random_uuid() as s_uid, gen_random_uuid() as x_uid \gset
insert into auth.users (id, email, aud, role) values
  (:'a_uid', 'alpha@ws.test', 'authenticated', 'authenticated'), (:'b_uid', 'beta@ws.test', 'authenticated', 'authenticated'),
  (:'s_uid', 'sam@agency.test', 'authenticated', 'authenticated'), (:'x_uid', 'other@ws.test', 'authenticated', 'authenticated');
insert into public.profiles (id, email) values (:'a_uid', 'alpha@ws.test'), (:'b_uid', 'beta@ws.test'), (:'s_uid', 'sam@agency.test'), (:'x_uid', 'other@ws.test') on conflict do nothing;
insert into public.brand_profiles (owner, name) values (:'a_uid', 'Alpha Foods'), (:'b_uid', 'Beta Wear');
insert into public.brands (creator_id, name) values (1, 'Alpha Foods') returning id as ba \gset
insert into public.brands (creator_id, name) values (1, 'Beta Wear') returning id as bb \gset
insert into public.brand_members (profile_id, brand_id, owner) values (:'a_uid', :'ba', :'a_uid'), (:'b_uid', :'bb', :'b_uid');
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand) values (1, :'ba', '', 'request', 30000, false) returning id as ca \gset
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand) values (1, :'bb', '', 'request', 45000, false) returning id as cb \gset
insert into public.collab_messages (collab_id, sender, body) values (:'cb', 'creator', 'Beta-only message');
insert into public.brand_teams (owner) values (:'a_uid'), (:'b_uid');
insert into public.brand_team_members (owner, email, role, invited_at) values
  (:'a_uid', 'sam@agency.test', 'member', now() - interval '2 days'), (:'b_uid', 'sam@agency.test', 'member', now() - interval '1 day');
select set_config('my.ca', :'ca', true), set_config('my.cb', :'cb', true), set_config('my.a', :'a_uid', true), set_config('my.b', :'b_uid', true);

-- ============================================================ Sam joins both clients
select set_config('request.jwt.claims', json_build_object('email', 'sam@agency.test', 'sub', :'s_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.team_join() is not null as j \gset
insert into results select 'Sam joins every team that invited him', jsonb_array_length(public.brand_workspaces()) = 2, public.brand_workspaces()::text;
insert into results select 'Each workspace has its own one company', (select bool_and((w ->> 'companies')::int = 1) from jsonb_array_elements(public.brand_workspaces()) w), null;
insert into results select 'He starts in the team he joined first (Alpha)', public.brand_owner() = :'a_uid', null;
insert into results select 'In Alpha he sees Alpha''s collab', public.is_my_collab(:'ca'), null;
insert into results select 'In Alpha he does NOT see Beta''s collab', not public.is_my_collab(:'cb'), null;
insert into results select 'In Alpha he can''t read Beta''s messages', (select count(*) = 0 from public.collab_messages where collab_id = :'cb'), null;
reset role;
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
-- my_brand_id is internal (not callable by a login): read as the database, with Sam's sign-in set.
insert into results select 'On the creator''s page, his company is Alpha''s', public.my_brand_id() = :'ba', null;
set local role authenticated;
insert into results select 'His account lists only Alpha''s company for her', (select jsonb_agg(x ->> 'name') = '["Alpha Foods"]'::jsonb from jsonb_array_elements(public.my_account() -> 'brands') x), (public.my_account() -> 'brands')::text;

-- ============================================================ Sam switches to Beta
select public.brand_use_workspace(:'b_uid') is not null as sw \gset
insert into results select 'Switching makes Beta current', public.brand_owner() = :'b_uid' and (select bool_or((w ->> 'current')::boolean and (w ->> 'owner')::uuid = :'b_uid') from jsonb_array_elements(public.brand_workspaces()) w), null;
insert into results select 'In Beta he sees Beta''s collab', public.is_my_collab(:'cb'), null;
insert into results select 'In Beta he does NOT see Alpha''s collab', not public.is_my_collab(:'ca'), null;
insert into results select 'In Beta he reads Beta''s messages', (select count(*) = 1 from public.collab_messages where collab_id = :'cb'), null;
do $$ begin perform public.brand_use_workspace(gen_random_uuid()); exception when others then insert into caught values ('stranger', sqlerrm); end $$;
insert into results select 'He can''t switch to a team he isn''t on', exists (select 1 from caught where k = 'stranger'), (select msg from caught where k = 'stranger');
reset role;
insert into results select 'On the creator''s page, his company is now Beta''s', public.my_brand_id() = :'bb', null;
select set_config('request.headers', '{}', true);

-- ============================================================ The clients see only their own
select set_config('request.jwt.claims', json_build_object('email', 'alpha@ws.test', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Alpha sees its own collab', public.is_my_collab(:'ca'), null;
insert into results select 'Alpha does NOT see Beta''s collab, though Sam is in both', not public.is_my_collab(:'cb'), null;
insert into results select 'Alpha has one workspace: its own', jsonb_array_length(public.brand_workspaces()) = 1 and (public.brand_workspaces() -> 0 ->> 'owner')::uuid = :'a_uid', public.brand_workspaces()::text;
do $$ begin perform public.brand_use_workspace(current_setting('my.b')::uuid); exception when others then insert into caught values ('alpha-to-beta', sqlerrm); end $$;
insert into results select 'Alpha can''t switch into Beta', exists (select 1 from caught where k = 'alpha-to-beta'), null;
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'beta@ws.test', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Beta does NOT see Alpha''s collab, though Sam is in both', not public.is_my_collab(:'ca'), null;
insert into results select 'Beta can''t read Alpha''s messages', (select count(*) = 0 from public.collab_messages where collab_id = :'ca'), null;
reset role;

-- A company Sam gets while working for Beta is Beta's alone.
insert into public.brands (creator_id, name) values (1, 'Beta Kids') returning id as bk \gset
insert into public.brand_members (profile_id, brand_id, owner) values (:'s_uid', :'bk', :'b_uid');
insert into results select 'A new company in Beta reaches Beta''s owner', exists (select 1 from public.brand_members where profile_id = :'b_uid' and brand_id = :'bk' and owner = :'b_uid'), null;
insert into results select 'and never Alpha''s owner', not exists (select 1 from public.brand_members where profile_id = :'a_uid' and brand_id = :'bk'), null;
insert into results select 'Team reports count only the team''s collabs', (select count(*) = 1 from private.company_collabs(:'a_uid')) and (select count(*) = 2 - 1 from private.company_collabs(:'a_uid') where id = :'ca'), null;
-- A membership added without a team goes to the login's current team (Sam: Beta).
insert into public.brands (creator_id, name) values (1, 'Loose One') returning id as bl \gset
insert into public.brand_members (profile_id, brand_id) values (:'s_uid', :'bl');
insert into results select 'Without a team, a membership joins the login''s current team', (select owner = :'b_uid' from public.brand_members where profile_id = :'s_uid' and brand_id = :'bl'), null;

-- ============================================================ Leaving one client keeps the other
select set_config('request.jwt.claims', json_build_object('email', 'alpha@ws.test', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.team_remove('sam@agency.test') is not null as rm \gset
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'sam@agency.test', 'sub', :'s_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Removed from Alpha, Sam has only Beta left', jsonb_array_length(public.brand_workspaces()) = 1 and (public.brand_workspaces() -> 0 ->> 'owner')::uuid = :'b_uid', public.brand_workspaces()::text;
insert into results select 'and no longer sees Alpha''s collab anywhere', not public.is_my_collab(:'ca'), null;
insert into results select 'and still sees Beta''s', public.is_my_collab(:'cb'), null;
select public.team_leave() is not null as lv \gset
insert into results select 'After leaving Beta too, he sees neither', not public.is_my_collab(:'ca') and not public.is_my_collab(:'cb'), null;
reset role;

-- ============================================================ Someone in no team
select set_config('request.jwt.claims', json_build_object('email', 'other@ws.test', 'sub', :'x_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'A login in no team sees no workspaces', jsonb_array_length(public.brand_workspaces()) = 0, public.brand_workspaces()::text;
insert into results select 'and neither client''s collab', not public.is_my_collab(:'ca') and not public.is_my_collab(:'cb'), null;
insert into results select 'Nobody reads the picked-team table directly', not has_table_privilege('authenticated', 'public.brand_active_team', 'select'), null;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
