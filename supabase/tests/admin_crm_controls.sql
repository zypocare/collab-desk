-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/admin_crm_controls.sql
-- The admin CRM, part 3 (migration 151): switches that really stop features, per-account limits and AI
-- shares, autopilot switches, the outbox, scheduled jobs and admins. Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon, service_role;
select set_config('request.headers', '{}', true);

select gen_random_uuid() as admin_uid, gen_random_uuid() as x_uid, gen_random_uuid() as b_uid, gen_random_uuid() as n_uid \gset
select lower(creator_email) as cr_email from public.creator_settings where id = 1 \gset
select set_config('my.cr', :'cr_email', false) is not null as mc \gset
insert into public.app_admins (email) values ('ctl-admin@test.dev') on conflict do nothing;
insert into auth.users (id, email, aud, role) values (:'admin_uid', 'ctl-admin@test.dev', 'authenticated', 'authenticated'),
  (:'x_uid', 'ctl-stranger@test.dev', 'authenticated', 'authenticated'), (:'b_uid', 'ctl-brand@test.dev', 'authenticated', 'authenticated'),
  (:'n_uid', 'ctl-newbrand@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'ctl-brand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.brand_signup('Ctl Labs', 'Skincare', '', '@ctllabs', 'Rhea', 'Founder', '', 'Pune', '{}', '', '') is not null as s1 \gset
reset role;
insert into public.brands (name, creator_id) values ('Ctl Labs', 1) returning id as br \gset
insert into public.brand_members (profile_id, brand_id, owner) values (:'b_uid', :'br', :'b_uid');
delete from public.ai_usage where creator_id = 1 and day = private.ai_day();
delete from public.brand_ai_usage where owner = :'b_uid';

-- Only admins.
select set_config('request.jwt.claims', json_build_object('email', 'ctl-stranger@test.dev', 'sub', :'x_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.admin_flag_set('ai_creator', false, 'x'); insert into results values ('A non-admin can''t flip a switch', false, 'ran'); exception when others then insert into results values ('A non-admin can''t flip a switch', true, null); end $$;
do $$ begin perform public.admin_jobs(); insert into results values ('Nor see the jobs', false, 'ran'); exception when others then insert into results values ('Nor see the jobs', true, null); end $$;
do $$ begin perform public.admin_admin_set('me@test.dev', true, 'x'); insert into results values ('Nor make themself an admin', false, 'ran'); exception when others then insert into results values ('Nor make themself an admin', true, null); end $$;
do $$ begin perform 1 from public.app_flags; insert into results values ('Nor read the switches table', false, 'read'); exception when others then insert into results values ('Nor read the switches table', true, null); end $$;
reset role;
insert into results select 'Signed out can''t call them', not has_function_privilege('anon', 'public.admin_flag_set(text, boolean, text)', 'execute')
  and not has_function_privilege('anon', 'public.admin_job_run(text, text)', 'execute') and not has_function_privilege('anon', 'public.ai_take2(text, integer)', 'execute'), null;
insert into results select 'The moved bodies can''t be called directly', not has_function_privilege('authenticated', 'private.ai_take2_do(text, integer)', 'execute')
  and not has_function_privilege('authenticated', 'private.claim_outbox_do(integer)', 'execute') and not has_function_privilege('authenticated', 'private.call_function_do(text)', 'execute'), null;

-- AI: on by default; switched off it answers "budget" (the app's "used up" message); back on it works.
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Creator AI works', (public.ai_take2('reply', 100) ->> 'ok')::boolean, null;
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'ctl-admin@test.dev', 'sub', :'admin_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.admin_flag_set('ai_creator', false, ''); insert into results values ('Switching off needs a reason', false, 'ran'); exception when others then insert into results values ('Switching off needs a reason', true, null); end $$;
select jsonb_path_query_first(public.admin_flag_set('ai_creator', false, 'Workers AI outage'), '$.flags[*] ? (@.key == "ai_creator")') ->> 'on' as f1 \gset
insert into results select 'The switch is off', :'f1' = 'false', :'f1';
reset role;
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.ai_take2('reply', 100) as t2 \gset
insert into results select 'Creator AI is stopped, as "budget"', not (:'t2'::jsonb ->> 'ok')::boolean and :'t2'::jsonb ->> 'reason' = 'budget' and (:'t2'::jsonb ->> 'paused')::boolean, :'t2';
insert into results select 'And the Gemini backup too', not (public.ai_take_gemini('reply') ->> 'ok')::boolean, null;
insert into results select 'The old ai_take goes through the switch', not (public.ai_take('reply') ->> 'ok')::boolean, null;
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'ctl-admin@test.dev', 'sub', :'admin_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_flag_set('ai_creator', true) is not null as f2 \gset
reset role;
insert into results select 'Both flips are in the audit trail', (select count(*) from public.admin_audit where kind = 'flag' and record = 'ai_creator') = 2
  and exists (select 1 from public.admin_audit where kind = 'flag' and action = 'switch_off' and reason = 'Workers AI outage'), null;

-- A lower AI share for one creator.
set local role authenticated;
do $$ begin perform public.admin_override_set('ai_day', 'creator', '1', 20000, null, 'more'); insert into results values ('The AI share can''t be raised', false, 'ran'); exception when others then insert into results values ('The AI share can''t be raised', true, null); end $$;
do $$ begin perform public.admin_override_set('requests_day', 'creator', '1', 5, null, 'x'); insert into results values ('Requests limits are for workspaces only', false, 'ran'); exception when others then insert into results values ('Requests limits are for workspaces only', true, null); end $$;
select jsonb_array_length(public.admin_override_set('ai_day', 'creator', '1', 100, null, 'Heavy use, protecting the free share') -> 'overrides') as o1 \gset
reset role;
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.ai_take2('reply', 100) as t3 \gset
insert into results select 'Her capped share is used up', not (:'t3'::jsonb ->> 'ok')::boolean and (:'t3'::jsonb ->> 'capped')::boolean, :'t3';
insert into results select 'No Gemini past her cap either', not (public.ai_take_gemini('reply') ->> 'ok')::boolean, null;
reset role;

-- Brand AI and its switch.
select set_config('request.jwt.claims', json_build_object('email', 'ctl-brand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Brand AI works', (public.ai_take_brand('brandask', 100) ->> 'ok')::boolean, null;
reset role;
update public.app_flags set "on" = false where key = 'ai_brand';
set local role authenticated;
insert into results select 'Brand AI is stopped by its switch', (public.ai_take_brand('brandask', 100) ->> 'reason') = 'budget' and not (public.ai_take_brand_gemini('brandask') ->> 'ok')::boolean, null;
reset role;
update public.app_flags set "on" = true where key = 'ai_brand';

-- Limits for one workspace apply to whoever works in it.
select set_config('request.jwt.claims', json_build_object('email', 'ctl-admin@test.dev', 'sub', :'admin_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select jsonb_array_length(public.admin_override_set('requests_day', 'workspace', :'b_uid', 2, now() + interval '7 days', 'Under review') -> 'overrides') as o2 \gset
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'ctl-brand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
insert into results select 'The workspace gets its own limit', private.limit_of('requests_day', true) = 2, private.limit_of('requests_day', true)::text;
insert into results select 'Other limits stay as they are', private.limit_of('messages_hour', false) = (select new_v from public.app_limits where key = 'messages_hour'), null;
select set_config('request.jwt.claims', json_build_object('email', 'ctl-stranger@test.dev', 'sub', :'x_uid', 'role', 'authenticated')::text, true);
insert into results select 'Other brands keep the usual limit', private.limit_of('requests_day', false) = (select new_v from public.app_limits where key = 'requests_day'), null;
insert into results select 'The override shows on the workspace''s log', exists (select 1 from public.admin_audit where kind = 'workspace' and record = :'b_uid' and action = 'limit_override'), null;
select id as ov from public.app_limit_overrides where subject = :'b_uid' \gset
select set_config('request.jwt.claims', json_build_object('email', 'ctl-admin@test.dev', 'sub', :'admin_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_override_delete(:ov, 'Review done') is not null as od \gset
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'ctl-brand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
insert into results select 'Removing it brings the usual limit back', private.limit_of('requests_day', true) = (select coalesce(trusted_v, new_v) from public.app_limits where key = 'requests_day'), null;

-- Sign-ups: switched off, new ones are refused; an existing brand can still edit its company.
update public.app_flags set "on" = false where key in ('creator_signup', 'brand_signup');
do $$ begin insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status) values ('ctl-new@test.dev', 'ctlnew', 'ctlnew', 'New', 'CN', 'CNINV', 'pending');
  insert into results values ('New creator sign-ups are refused', false, 'ran'); exception when others then insert into results values ('New creator sign-ups are refused', sqlerrm like 'New sign-ups are paused%', sqlerrm); end $$;
set local role authenticated;
insert into results select 'An existing brand can still edit its company', public.brand_signup('Ctl Labs Two', 'Skincare', '', '@ctllabs', 'Rhea', 'Founder', '', 'Pune', '{}', '', '') is not null, null;
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'ctl-newbrand@test.dev', 'sub', :'n_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.brand_signup('Brand New Co', 'Skincare', '', '', 'Ana', 'Founder', '', 'Pune', '{}', '', ''); insert into results values ('New brand sign-ups are refused', false, 'ran'); exception when others then insert into results values ('New brand sign-ups are refused', sqlerrm like 'New sign-ups are paused%', sqlerrm); end $$;
reset role;
update public.app_flags set "on" = true where key in ('creator_signup', 'brand_signup');

-- Email: nothing is claimed while sending is off.
insert into public.outbox (creator_id, kind, to_email, payload, status) values (1, 'ctl_test', 'someone@test.dev', '{}', 'pending');
update public.app_flags set "on" = false where key = 'email_send';
set local role service_role;
insert into results select 'Nothing is sent while email is off', (select count(*) from public.claim_outbox(50)) = 0, null;
reset role;
update public.app_flags set "on" = true where key = 'email_send';
set local role service_role;
insert into results select 'Back on, emails go', (select count(*) from public.claim_outbox(500)) >= 1, null;
reset role;

-- The outbox: retry and skip, logged.
insert into public.outbox (creator_id, kind, to_email, payload, status, attempts, last_error) values (1, 'ctl_test', 'bounce@test.dev', '{}', 'failed', 3, '550 user unknown') returning id as ob \gset
select set_config('request.jwt.claims', json_build_object('email', 'ctl-admin@test.dev', 'sub', :'admin_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Failed emails are listed', (public.admin_list('outbox', 'bounce@test.dev', '{"status": "failed"}') ->> 'total')::int = 1, null;
insert into results select 'Retry sends it again', public.admin_outbox_set(array[:ob]::bigint[], 'retry', 'Mailbox fixed') = 1, null;
reset role;
insert into results select 'It''s waiting again from scratch', (select status = 'pending' and attempts = 0 from public.outbox where id = :ob), null;
set local role authenticated;
insert into results select 'Skip stops it', public.admin_outbox_set(array[:ob]::bigint[], 'skip', 'Wrong address') = 1, null;
reset role;
insert into results select 'Skipped with the reason', (select status = 'skipped' and last_error like 'Skipped by Miracle: Wrong address' from public.outbox where id = :ob)
  and (select count(*) from public.admin_audit where kind = 'outbox' and action in ('outbox_retry', 'outbox_skip')) = 2, null;

-- Autopilot switches on a creator and a workspace.
set local role authenticated;
select public.admin_creator_autopilot(1, 'counter', false, 'Countering too low') -> 'autopilots' ->> 'counter' as ap \gset
insert into results select 'A creator autopilot switched off', :'ap' = 'false', :'ap';
do $$ begin perform public.admin_creator_autopilot(1, 'comment_dm', true, 'x'); insert into results values ('Only the creator turns comment replies on', false, 'ran'); exception when others then insert into results values ('Only the creator turns comment replies on', true, null); end $$;
do $$ begin perform public.admin_creator_autopilot(1, 'counter', true, ''); insert into results values ('Autopilot switches need a reason', false, 'ran'); exception when others then insert into results values ('Autopilot switches need a reason', true, null); end $$;
select public.admin_workspace_autopilot(:'b_uid', 'negotiate', 'off', 'Too aggressive') -> 'autopilots' ->> 'negotiate' as wap \gset
insert into results select 'A workspace autopilot switched off', :'wap' = 'off', :'wap';
reset role;
insert into results select 'Both are logged on the account', exists (select 1 from public.admin_audit where kind = 'creator' and record = '1' and action = 'autopilot_off')
  and exists (select 1 from public.admin_audit where kind = 'workspace' and record = :'b_uid' and action = 'autopilot_off'), null;

-- Scheduled jobs: listed without their commands; pausing needs a reason; run now; switches named.
set local role authenticated;
select public.admin_jobs() as jobs \gset
insert into results select 'Jobs are listed without what they run', jsonb_array_length(:'jobs'::jsonb) > 0 and :'jobs'::jsonb::text not like '%call_function%' and :'jobs'::jsonb::text not like '%cron_secret%', null;
insert into results select 'Each job knows its switch', (select x ->> 'switch' from jsonb_array_elements(:'jobs'::jsonb) x where x ->> 'name' = 'brand-autopilots') = 'brand_autopilots'
  and (select x ->> 'switch' from jsonb_array_elements(:'jobs'::jsonb) x where x ->> 'name' = 'instagram-sync') = 'ig_sync', null;
do $$ begin perform public.admin_job_set('safety-cleanup', false, ''); insert into results values ('Pausing a job needs a reason', false, 'ran'); exception when others then insert into results values ('Pausing a job needs a reason', true, null); end $$;
insert into results select 'A job pauses', (select (x ->> 'active')::boolean from jsonb_array_elements(public.admin_job_set('safety-cleanup', false, 'Testing')) x where x ->> 'name' = 'safety-cleanup') = false, null;
insert into results select 'And resumes', (select (x ->> 'active')::boolean from jsonb_array_elements(public.admin_job_set('safety-cleanup', true)) x where x ->> 'name' = 'safety-cleanup'), null;
insert into results select 'Run now', (public.admin_job_run('safety-cleanup', 'Testing') ->> 'ok')::boolean, null;
reset role;
insert into results select 'SQL jobs check their switch', (select command like '%flag_on(''brand_autopilots'')%' from cron.job where jobname = 'brand-autopilots')
  and (select command like '%flag_on(''pitch_autopilot'')%' from cron.job where jobname = 'pitch-sender'), null;

-- Admins.
set local role authenticated;
insert into results select 'An admin is added', jsonb_array_length(public.admin_admin_set('ctl-second@test.dev', true, 'Support help')) >= 2, null;
do $$ begin perform public.admin_admin_set('ctl-admin@test.dev', false, 'x'); insert into results values ('You can''t remove yourself', false, 'ran'); exception when others then insert into results values ('You can''t remove yourself', true, null); end $$;
do $$ begin perform public.admin_admin_set(current_setting('my.cr', true), true, 'x'); insert into results values ('A creator''s email can''t be an admin', false, 'ran'); exception when others then insert into results values ('A creator''s email can''t be an admin', true, null); end $$;
insert into results select 'And removed', not exists (select 1 from jsonb_array_elements(public.admin_admin_set('ctl-second@test.dev', false, 'Done')) a where a ->> 'email' = 'ctl-second@test.dev'), null;

-- The System lists.
insert into results select 'System lists load', (select bool_and((public.admin_list(k) ->> 'total') is not null) from unnest(array['outbox', 'inbound', 'ai_usage', 'instagram']) k), null;
insert into results select 'AI usage counts the brand''s use', exists (select 1 from jsonb_array_elements(public.admin_list('ai_usage', 'ctl labs') -> 'rows') x where x ->> 'side' = 'workspace'), null;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
