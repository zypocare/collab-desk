-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/admin_crm.sql
-- The admin CRM, part 1 (migration 148): audit trail, saved views, notes, lists, record pages, search,
-- dashboard and the logged People actions. Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;
-- These checks are for approving creators by hand (migration 163 can approve them straight away).
update public.growth_settings set auto_approve = false where id = 1;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
select set_config('request.headers', '{}', true);

select gen_random_uuid() as admin_uid, gen_random_uuid() as other_uid, gen_random_uuid() as b_uid, gen_random_uuid() as m_uid, gen_random_uuid() as x_uid \gset
insert into public.app_admins (email) values ('crm-admin@test.dev'), ('crm-admin2@test.dev') on conflict do nothing;

-- A creator waiting for approval, and a brand workspace with one teammate.
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen, requested_at, niche, city, request_note)
values ('crm-wait@test.dev', 'crmwait', 'crmwait', 'Zara Waiting', 'ZW', 'ZWINV', 'pending', true, now(), 'Beauty', 'Pune', 'Please let me in');
select id as w_id from public.creator_settings where slug = 'crmwait' \gset
insert into auth.users (id, email, aud, role) values (:'b_uid', 'crm-brand@test.dev', 'authenticated', 'authenticated'),
  (:'m_uid', 'crm-mate@test.dev', 'authenticated', 'authenticated'), (:'x_uid', 'crm-stranger@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'crm-brand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.brand_signup('Crimson Labs', 'Skincare', '', '@crimsonlabs', 'Rhea', 'Founder', '', 'Pune', '{}', '', '') is not null as s1 \gset
reset role;
insert into public.brands (name, creator_id) values ('Crimson Labs', 1) returning id as brand_id \gset
insert into public.brand_members (profile_id, brand_id, owner) values (:'b_uid', :'brand_id', :'b_uid');
insert into public.brand_team_members (owner, email, name, role, profile_id, invited_by, joined_at)
values (:'b_uid', 'crm-mate@test.dev', 'Mate', 'member', :'m_uid', :'b_uid', now());
insert into public.brand_members (profile_id, brand_id, owner) values (:'m_uid', :'brand_id', :'b_uid') on conflict (profile_id, brand_id) do update set owner = excluded.owner;

-- Nobody but an admin gets in.
select set_config('request.jwt.claims', json_build_object('email', 'crm-stranger@test.dev', 'sub', :'x_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.admin_list('creators'); insert into results values ('A non-admin can''t list', false, 'ran'); exception when others then insert into results values ('A non-admin can''t list', true, null); end $$;
do $$ begin perform public.admin_creator(1); insert into results values ('Nor open a record', false, 'ran'); exception when others then insert into results values ('Nor open a record', true, null); end $$;
do $$ begin perform public.admin_dashboard(30); insert into results values ('Nor see the dashboard', false, 'ran'); exception when others then insert into results values ('Nor see the dashboard', true, null); end $$;
do $$ begin perform public.admin_search('crm'); insert into results values ('Nor search', false, 'ran'); exception when others then insert into results values ('Nor search', true, null); end $$;
do $$ begin perform 1 from public.admin_audit limit 1; insert into results values ('Nor read the audit table', false, 'read'); exception when others then insert into results values ('Nor read the audit table', true, null); end $$;
reset role;
insert into results select 'Signed out can''t call it at all', not has_function_privilege('anon', 'public.admin_list(text, text, jsonb, text, boolean, integer, integer, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.admin_creator(integer)', 'execute') and not has_function_privilege('anon', 'public.admin_set_creator(integer, text)', 'execute'), null;
insert into results select 'The moved bodies can''t be called directly', not has_function_privilege('authenticated', 'private.admin_set_creator_do(integer, text)', 'execute')
  and not has_function_privilege('authenticated', 'private.admin_rows(text)', 'execute'), null;

-- The admin: lists filter, search, sort, page and count presets.
select set_config('request.jwt.claims', json_build_object('email', 'crm-admin@test.dev', 'sub', :'admin_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_list('creators', 'zara', '{}', '', true, 50, 0, '{"waiting": {"status": "pending"}, "all": {}}') as l1 \gset
insert into results select 'Search finds the creator', (:'l1'::jsonb ->> 'total')::int = 1 and :'l1'::jsonb -> 'rows' -> 0 ->> 'name' = 'Zara Waiting', :'l1'::jsonb ->> 'total';
insert into results select 'Search text isn''t sent back', not (:'l1'::jsonb -> 'rows' -> 0 ? '_search'), null;
insert into results select 'Preset counts ignore the search', (:'l1'::jsonb -> 'counts' ->> 'waiting')::int >= 1 and (:'l1'::jsonb -> 'counts' ->> 'all')::int > (:'l1'::jsonb -> 'counts' ->> 'waiting')::int, :'l1'::jsonb ->> 'counts';
select public.admin_list('creators', '', '{"status": ["pending"], "city": "Pune"}') as l2 \gset
insert into results select 'Filters: any-of and equal', (select bool_and(x ->> 'status' = 'pending' and x ->> 'city' = 'Pune') from jsonb_array_elements(:'l2'::jsonb -> 'rows') x)
  and exists (select 1 from jsonb_array_elements(:'l2'::jsonb -> 'rows') x where x ->> 'name' = 'Zara Waiting'), null;
select public.admin_list('creators', '', '{"collabs:gte": 1}', 'collabs', false, 2, 0) as l3 \gset
insert into results select 'Range filter, sort low first, page size', jsonb_array_length(:'l3'::jsonb -> 'rows') <= 2
  and (select bool_and((x ->> 'collabs')::int >= 1) from jsonb_array_elements(:'l3'::jsonb -> 'rows') x)
  and coalesce((:'l3'::jsonb -> 'rows' -> 0 ->> 'collabs')::int <= (:'l3'::jsonb -> 'rows' -> 1 ->> 'collabs')::int, true), null;
do $$ begin perform public.admin_list('nope'); insert into results values ('An unknown list is refused', false, 'ran'); exception when others then insert into results values ('An unknown list is refused', true, null); end $$;
select public.admin_list('brand_logins', 'crm-') as bl \gset
insert into results select 'Brand logins list both people', (:'bl'::jsonb ->> 'total')::int = 2, :'bl'::jsonb ->> 'total';
insert into results select 'Creators aren''t brand logins', not exists (select 1 from jsonb_array_elements(public.admin_list('brand_logins', '', '{}', '', true, 5000) -> 'rows') x where x ->> 'email' = 'creator@example.test'), null;
select public.admin_list('workspaces', 'crimson') as ws \gset
insert into results select 'The workspace counts its people and companies', (:'ws'::jsonb -> 'rows' -> 0 ->> 'members')::int = 2 and (:'ws'::jsonb -> 'rows' -> 0 ->> 'companies')::int = 1, :'ws'::jsonb ->> 'rows';
insert into results select 'Creator teams list works', (public.admin_list('creator_teams') ->> 'total')::int >= 0, null;

-- Approving logs who did it, before and after; the welcome email still goes.
select public.admin_set_creator(:w_id, 'active') is not null as ap \gset
reset role;
insert into results select 'Approval is logged', exists (select 1 from public.admin_audit where kind = 'creator' and record = :'w_id' and action = 'approve' and admin = 'crm-admin@test.dev'
  and before ->> 'status' = 'pending' and after ->> 'status' = 'active'), null;
insert into results select 'The welcome email is still queued', exists (select 1 from public.outbox where kind = 'creator_approved' and to_email = 'crm-wait@test.dev'), null;
set local role authenticated;
select public.admin_set_creator(:w_id, 'paused') is not null as pa \gset
reset role;
insert into results select 'Pausing logs as pause', exists (select 1 from public.admin_audit where record = :'w_id' and action = 'pause'), null;
set local role authenticated;
select public.admin_set_creator(:w_id, 'active') is not null as re \gset
reset role;
insert into results select 'Bringing back logs as resume', exists (select 1 from public.admin_audit where record = :'w_id' and action = 'resume'), null;

-- Nobody can rewrite the trail, not even the database owner.
do $$ begin update public.admin_audit set admin = 'someone-else'; insert into results values ('The trail can''t be edited', false, 'ran'); exception when others then insert into results values ('The trail can''t be edited', true, null); end $$;
do $$ begin delete from public.admin_audit; insert into results values ('Nor deleted', false, 'ran'); exception when others then insert into results values ('Nor deleted', true, null); end $$;

-- Notes and the record page.
set local role authenticated;
select public.admin_note_add('creator', :'w_id', 'Asked for a new address after rebrand') as n1 \gset
insert into results select 'A note shows on the record', jsonb_array_length(:'n1'::jsonb -> 'notes') = 1, null;
select public.admin_creator(:w_id) as rec \gset
insert into results select 'The record has its note, audit and timeline', jsonb_array_length(:'rec'::jsonb -> 'notes') = 1 and jsonb_array_length(:'rec'::jsonb -> 'audit') >= 4
  and exists (select 1 from jsonb_array_elements(:'rec'::jsonb -> 'timeline') e where e ->> 'kind' = 'admin'), null;
insert into results select 'Bank details never come back', not (:'rec'::jsonb ? 'bank_details') and not (:'rec'::jsonb ? 'upi_id'), null;
do $$ begin perform public.admin_note_add('creator', '1', '   '); insert into results values ('An empty note is refused', false, 'ran'); exception when others then insert into results values ('An empty note is refused', true, null); end $$;
do $$ begin perform public.admin_creator_directory((select id from public.creator_settings where status = 'pending' limit 1), true); insert into results values ('Only active creators go in the directory', false, 'ran'); exception when others then insert into results values ('Only active creators go in the directory', true, null); end $$;
select public.admin_creator_directory(:w_id, true, 'Strong portfolio') ->> 'directory' as dir \gset
insert into results select 'Listing in the directory', :'dir' = 'true', :'dir';

-- Saved views belong to the admin who saved them.
select jsonb_array_length(public.admin_view_save('creators', 'Pune beauty', '{"city": "Pune", "niche": "Beauty"}', '', 'joined', true)) as v1 \gset
insert into results select 'A view is saved', :v1 = 1, :'v1';
select jsonb_array_length(public.admin_view_save('creators', 'Pune beauty', '{"city": "Pune"}', '', 'paid', false)) as v2 \gset
insert into results select 'Saving the same name updates it', :v2 = 1, :'v2';
select public.admin_views('creators') -> 0 ->> 'id' as view_id, public.admin_views('creators') -> 0 ->> 'sort' as view_sort \gset
insert into results select 'The update kept', :'view_sort' = 'paid', :'view_sort';
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'crm-admin2@test.dev', 'sub', :'other_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Another admin doesn''t see it', jsonb_array_length(public.admin_views('creators')) = 0, null;
insert into results select 'Nor delete it', jsonb_array_length(public.admin_view_delete(:'view_id'::uuid)) = 0, null;
reset role;
insert into results select 'It''s still there', exists (select 1 from public.admin_saved_views where id = :'view_id'::uuid), null;
select set_config('request.jwt.claims', json_build_object('email', 'crm-admin@test.dev', 'sub', :'admin_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Its owner deletes it', jsonb_array_length(public.admin_view_delete(:'view_id'::uuid)) = 0, null;

-- Brand logins: pausing needs a reason, is logged and mails them; resume brings it back.
do $$ begin perform public.admin_brand_login_set((select owner from public.brand_profiles where name = 'Crimson Labs' limit 1), 'pause', ''); insert into results values ('Pausing needs a reason', false, 'ran'); exception when others then insert into results values ('Pausing needs a reason', true, null); end $$;
select public.admin_brand_login_set(:'b_uid', 'pause', 'Asked creators to pay') ->> 'state' as st1 \gset
insert into results select 'The login is paused', :'st1' = 'paused', :'st1';
select public.admin_brand_login_set(:'b_uid', 'resume') ->> 'state' as st2 \gset
insert into results select 'And resumed', :'st2' = 'active', :'st2';
select public.admin_brand_login(:'b_uid') as blr \gset
insert into results select 'The login page shows its workspace and companies', jsonb_array_length(:'blr'::jsonb -> 'workspaces') = 1 and jsonb_array_length(:'blr'::jsonb -> 'companies') = 1
  and jsonb_array_length(:'blr'::jsonb -> 'audit') = 2, null;
reset role;
insert into results select 'Pause and resume are in the trail with the reason', exists (select 1 from public.admin_audit where kind = 'brand_login' and record = :'b_uid' and action = 'pause' and reason = 'Asked creators to pay')
  and exists (select 1 from public.admin_audit where kind = 'brand_login' and record = :'b_uid' and action = 'resume'), null;
insert into results select 'The brand hears it''s paused', exists (select 1 from public.outbox where kind = 'account_paused' and to_email = 'crm-brand@test.dev')
  or exists (select 1 from public.outbox where kind = 'account_paused' and payload::text like '%Crimson Labs%'), null;

-- Workspaces: approvals and removing someone, both logged.
set local role authenticated;
select public.admin_workspace_approvals(:'b_uid', true, 50000, 'Asked by support') as wa \gset
insert into results select 'Approvals switched on with a limit', (:'wa'::jsonb ->> 'approval_on')::boolean and (:'wa'::jsonb ->> 'approval_limit')::numeric = 50000, null;
do $$ begin perform public.admin_workspace_remove((select owner from public.brand_profiles where name = 'Crimson Labs' limit 1), 'crm-mate@test.dev', ''); insert into results values ('Removing needs a reason', false, 'ran'); exception when others then insert into results values ('Removing needs a reason', true, null); end $$;
select public.admin_workspace_remove(:'b_uid', 'crm-mate@test.dev', 'Left the company') as wr \gset
insert into results select 'They''re out of the workspace', jsonb_array_length(:'wr'::jsonb -> 'members') = 1, :'wr'::jsonb ->> 'members';
reset role;
insert into results select 'And lose its companies', not exists (select 1 from public.brand_members where profile_id = :'m_uid' and owner = :'b_uid'), null;
insert into results select 'Both are in the trail', (select count(*) from public.admin_audit where kind = 'workspace' and record = :'b_uid') = 2, null;

-- The old admin actions log too.
set local role authenticated;
select public.admin_limits_set('{"requests_day": {"new": 12}}') is not null as lim \gset
reset role;
insert into results select 'Limit changes are logged with before and after', exists (select 1 from public.admin_audit where action = 'limits'
  and (before -> 'requests_day' ->> 'new')::int <> 12 and (after -> 'requests_day' ->> 'new')::int = 12), null;
insert into public.app_problems (fingerprint, source, message, place, release) values ('crm-test-fp', 'app', 'TypeError in test', '/x', '1.0.0') returning id as p_id \gset
set local role authenticated;
select public.admin_problem_set(:p_id, 'fixed') is not null as pf \gset
reset role;
insert into results select 'Problem status is logged', exists (select 1 from public.admin_audit where kind = 'problem' and record = :'p_id' and after ->> 'status' = 'fixed'), null;

-- Search and the dashboard.
set local role authenticated;
select public.admin_search('crimson') as sr \gset
insert into results select 'Search finds the login, workspace and company', (select count(*) from jsonb_array_elements(:'sr'::jsonb) g where g ->> 'kind' in ('brand_login', 'workspace', 'brand')) = 3, :'sr';
insert into results select 'A one-letter search returns nothing', jsonb_array_length(public.admin_search('c')) = 0, null;
insert into results select 'Wildcards are plain text', jsonb_array_length(public.admin_search('%%')) = 0, null;
select public.admin_dashboard(7) as d \gset
insert into results select 'The dashboard has every block', :'d'::jsonb ?& array['kpis', 'queue', 'creator_funnel', 'brand_funnel', 'stages', 'weeks', 'health', 'feed']
  and jsonb_array_length(:'d'::jsonb -> 'weeks') = 12 and (:'d'::jsonb ->> 'days')::int = 7, null;
insert into results select 'The feed shows admin actions', exists (select 1 from jsonb_array_elements(:'d'::jsonb -> 'feed') e where e ->> 'kind' = 'admin'), null;
insert into results select 'All time works', (public.admin_dashboard(0) ->> 'days')::int = 0, null;
select public.admin_list('audit', 'crm-admin@test.dev', '{"kind": "creator"}') ->> 'total' as au \gset
insert into results select 'The audit list filters by kind', :au::int >= 5, :'au';
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
