-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/admin_quotas.sql
-- Daily quotas (migration 153): email, Workers AI and Gemini used today and left. Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
select set_config('request.headers', '{}', true);

select gen_random_uuid() as admin_uid, gen_random_uuid() as x_uid \gset
insert into public.app_admins (email) values ('q-admin@test.dev') on conflict do nothing;
insert into auth.users (id, email, aud, role) values (:'admin_uid', 'q-admin@test.dev', 'authenticated', 'authenticated'), (:'x_uid', 'q-stranger@test.dev', 'authenticated', 'authenticated');

-- What was used before today's test rows.
select set_config('request.jwt.claims', json_build_object('email', 'q-admin@test.dev', 'sub', :'admin_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_quotas() as q0 \gset
reset role;

-- Today: 700 neurons and 3 Gemini calls by a creator, 300 neurons by a brand, two emails sent and one failed.
insert into public.ai_usage (creator_id, day, kind, calls, cost) values (1, private.ai_day(), 'q-test', 2, 700), (1, private.ai_day(), 'gemini:q-test', 3, 0)
on conflict (creator_id, day, kind) do update set calls = public.ai_usage.calls + excluded.calls, cost = public.ai_usage.cost + excluded.cost;
insert into public.brand_ai_usage (owner, day, kind, calls, cost) values (:'admin_uid', private.ai_day(), 'q-test', 1, 300);
insert into public.outbox (creator_id, kind, to_email, payload, status, sent_at) values (1, 'q_test', 'a@test.dev', '{}', 'sent', now()), (1, 'q_test', 'b@test.dev', '{}', 'sent', now());
insert into public.outbox (creator_id, kind, to_email, payload, status) values (1, 'q_test', 'c@test.dev', '{}', 'failed');

-- Only admins.
select set_config('request.jwt.claims', json_build_object('email', 'q-stranger@test.dev', 'sub', :'x_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.admin_quotas(); insert into results values ('A non-admin can''t see quotas', false, 'ran'); exception when others then insert into results values ('A non-admin can''t see quotas', true, null); end $$;
do $$ begin perform public.admin_quota_set('mail_main', 300); insert into results values ('Nor set them', false, 'ran'); exception when others then insert into results values ('Nor set them', true, null); end $$;
reset role;
insert into results select 'Signed out can''t call them', not has_function_privilege('anon', 'public.admin_quotas()', 'execute') and not has_function_privilege('anon', 'public.admin_quota_set(text, integer, text)', 'execute'), null;

select set_config('request.jwt.claims', json_build_object('email', 'q-admin@test.dev', 'sub', :'admin_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_quotas() as q1 \gset
insert into results select 'Workers AI used today adds creators and brands', (:'q1'::jsonb -> 'ai' ->> 'neurons')::int - (:'q0'::jsonb -> 'ai' ->> 'neurons')::int = 1000, null;
insert into results select 'Gemini calls are counted apart', (:'q1'::jsonb -> 'ai' ->> 'gemini')::int - (:'q0'::jsonb -> 'ai' ->> 'gemini')::int = 3, null;
insert into results select 'Emails sent and failed today are counted', (:'q1'::jsonb -> 'mail' ->> 'sent')::int - (:'q0'::jsonb -> 'mail' ->> 'sent')::int = 2
  and (:'q1'::jsonb -> 'mail' ->> 'failed')::int - (:'q0'::jsonb -> 'mail' ->> 'failed')::int = 1, null;
insert into results select 'Workers AI has its free daily allowance', (:'q1'::jsonb -> 'limits' -> 'ai_neurons' ->> 'daily')::int = 10000, null;
insert into results select 'Email limits start unset', :'q1'::jsonb -> 'limits' -> 'mail_main' ->> 'daily' is null, null;
insert into results select 'The heaviest AI users today are listed', exists (select 1 from jsonb_array_elements(:'q1'::jsonb -> 'ai' -> 'top') x where x ->> 'side' = 'creator' and x ->> 'id' = '1'), null;
insert into results select 'Fourteen days of history', jsonb_array_length(:'q1'::jsonb -> 'days') = 14
  and ((:'q1'::jsonb -> 'days' -> 13 ->> 'mail_sent')::int >= 2), null;
insert into results select 'Workers AI resets at 5:30 am in India', ((:'q1'::jsonb -> 'ai' ->> 'resets')::timestamptz at time zone 'Asia/Kolkata')::time = '05:30', :'q1'::jsonb -> 'ai' ->> 'resets';

-- Setting the email limit.
do $$ begin perform public.admin_quota_set('mail_main', -5); insert into results values ('A negative limit is refused', false, 'ran'); exception when others then insert into results values ('A negative limit is refused', true, null); end $$;
do $$ begin perform public.admin_quota_set('nope', 5); insert into results values ('An unknown quota is refused', false, 'ran'); exception when others then insert into results values ('An unknown quota is refused', true, null); end $$;
insert into results select 'The main email limit is set', (public.admin_quota_set('mail_main', 300, 'Brevo free plan') -> 'limits' -> 'mail_main' ->> 'daily')::int = 300, null;
insert into results select 'And can be cleared', public.admin_quota_set('mail_backup', null) -> 'limits' -> 'mail_backup' ->> 'daily' is null, null;
reset role;
insert into results select 'The change is in the audit trail', exists (select 1 from public.admin_audit where action = 'quota' and record = 'mail_main' and (after ->> 'daily')::int = 300 and reason = 'Brevo free plan'), null;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
