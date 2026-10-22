-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/launch_blockers.sql
-- Delete and export (migration 122), problems (123), report, block and spam limits (124).
-- Runs in one transaction and rolls back. Each check prints PASS or FAIL.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
create temp table caught (k text primary key, msg text) on commit drop;
grant all on caught to authenticated, anon;
select set_config('request.headers', '{}', true);

-- A creator (C) with a brand company (Dew Labs, owner D) that has a running request and a message.
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen, listed)
values ('lb-creator@test.dev', 'lbcreator', 'lbcreator', 'Lena Creator', 'LC', 'LCINV', 'active', true, true);
select id as c_id from public.creator_settings where slug = 'lbcreator' \gset
select gen_random_uuid() as c_uid, gen_random_uuid() as o_uid, gen_random_uuid() as a_uid \gset
insert into auth.users (id, email, aud, role) values (:'c_uid', 'lb-creator@test.dev', 'authenticated', 'authenticated'),
  (:'o_uid', 'lb-other@test.dev', 'authenticated', 'authenticated'), (:'a_uid', 'lb-admin@test.dev', 'authenticated', 'authenticated');
insert into public.profiles (id, email) values (:'c_uid', 'lb-creator@test.dev'), (:'o_uid', 'lb-other@test.dev') on conflict do nothing;
select gen_random_uuid() as d_uid \gset
insert into auth.users (id, email, aud, role) values (:'d_uid', 'lb-brand@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'lb-brand@test.dev', 'sub', :'d_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', 'lbcreator')::text, true);
set local role authenticated;
select public.brand_signup('Dew Labs', 'Skincare', '', '@dewlabs', 'Nia', 'Founder', '', 'Pune', '{}', '', '') is not null as s1 \gset
select public.brand_from_profile() is not null as s2 \gset
reset role;
select set_config('request.headers', '{}', true);
select b.id as brand_id from public.brands b join public.brand_members m on m.brand_id = b.id where m.profile_id = :'d_uid' and b.creator_id = :c_id \gset
select set_config('request.jwt.claims', '{}', true);
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand, contact_email, contact_name)
values (:c_id, :'brand_id', '', 'negotiating', 20000, false, 'lb-brand@test.dev', 'Nia');
select id as col, code as col_code from public.collabs where brand_id = :'brand_id' limit 1 \gset
insert into public.collab_messages (collab_id, creator_id, sender, body) values (:'col', :c_id, 'creator', 'Here is my quote');

-- ================================================================== 1. Delete & export, brand
select set_config('request.jwt.claims', json_build_object('email', 'lb-brand@test.dev', 'sub', :'d_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'The delete screen lists the running request', jsonb_array_length(public.my_delete_check() -> 'running') = 1 and (public.my_delete_check() ->> 'owner')::boolean, public.my_delete_check()::text;
do $$ begin perform public.account_delete('Wrong name', true); exception when others then insert into caught values ('wrong', sqlerrm); end $$;
insert into results select 'A wrong name is refused', exists (select 1 from caught where k = 'wrong' and msg like 'Type Dew Labs%'), (select msg from caught where k = 'wrong');
do $$ begin perform public.account_delete('Dew Labs', false); exception when others then insert into caught values ('running', sqlerrm); end $$;
insert into results select 'Running requests must be closed first', exists (select 1 from caught where k = 'running' and msg like 'Finish or cancel%'), (select msg from caught where k = 'running');
insert into results select 'The download has the request and its chat', (select (public.brand_export() -> 'requests' -> 0 ->> 'code') = :'col_code'
  and jsonb_array_length(public.brand_export() -> 'requests' -> 0 -> 'messages') = 1), null;
do $$ begin perform public.team_leave(); exception when others then insert into caught values ('leave', sqlerrm); end $$;
insert into results select 'The owner can''t just leave', exists (select 1 from caught where k = 'leave' and msg like 'You own this company%'), null;
select public.account_delete('dew labs', true) as closing \gset
insert into results select 'Deleting closes the company for 30 days', (:'closing'::jsonb ->> 'state') = 'deleting' and (:'closing'::jsonb ->> 'erase_after')::timestamptz > now() + interval '29 days', :'closing';
reset role;
insert into results select 'Its request is cancelled', (select stage::text = 'cancelled' from public.collabs where id = :'col'), null;
insert into results select 'and the creator is told', exists (select 1 from public.outbox where kind = 'collab_closed_creator' and creator_id = :c_id and payload ->> 'code' = :'col_code'), null;
do $$ begin insert into public.collabs (creator_id, brand_id, code, stage) select b.creator_id, b.id, '', 'request' from public.brand_members m join public.brands b on b.id = m.brand_id where m.profile_id = auth.uid() limit 1;
  exception when others then insert into caught values ('closing_req', sqlerrm); end $$;
insert into results select 'A company being deleted can''t send requests', exists (select 1 from caught where k = 'closing_req' and msg like 'Your company is being deleted%'), (select msg from caught where k = 'closing_req');
set local role authenticated;
select public.account_restore() is null as restored \gset
insert into results select 'Bringing it back undoes it', :'restored'::boolean and public.account_closing() is null, null;
reset role;
select set_config('request.headers', '{}', true);

-- ================================================================== 2. Delete, creator
select set_config('request.jwt.claims', json_build_object('email', 'lb-creator@test.dev', 'sub', :'c_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'The creator confirms with their link', (public.my_delete_check() ->> 'confirm') = 'lbcreator', public.my_delete_check()::text;
select public.account_delete('lbcreator', true) as c_closing \gset
insert into results select 'The page closes', (:'c_closing'::jsonb ->> 'state') = 'deleting', :'c_closing';
insert into results select 'The owner still signs in to bring it back', public.is_creator(), null;
reset role;
select set_config('request.headers', json_build_object('x-creator', 'lbcreator')::text, true);
insert into results select 'The page is offline', (select status from public.creator_settings where id = :c_id) = 'deleted' and private.page_creator() is null, null;
select set_config('request.headers', '{}', true);
set local role authenticated;
select public.account_restore() is null as c_restored \gset
reset role;
insert into results select 'and it comes back', (select status from public.creator_settings where id = :c_id) = 'active' and :'c_restored'::boolean, null;

-- ================================================================== 3. Problems
insert into public.app_admins (email) values ('lb-admin@test.dev') on conflict do nothing;
select set_config('request.jwt.claims', '{}', true);
set local role anon;
select public.problem_report('{"message": "Cannot read properties of null (reading ''fee'') at 41", "place": "/brand/r/KB-0142", "session": "sess-aaaa-1111", "release": "7c38", "steps": ["Opened Today", "Tapped Collabs"]}') as ref1 \gset
select public.problem_report('{"message": "Cannot read properties of null (reading ''fee'') at 97", "place": "/brand/r/KB-0151", "session": "sess-bbbb-2222", "release": "7c38"}') as ref2 \gset
select public.problem_note(:'ref1', 'I tapped Done and it went blank');
select public.problem_visit('sess-aaaa-1111');
reset role;
insert into results select 'Reports come back with a reference', :'ref1' ~ '^M-[0-9A-F]{5}$', :'ref1';
insert into results select 'The same problem with other numbers is grouped', (select count(*) = 1 and sum(times) = 2 from public.app_problems where message like 'Cannot read properties of null%'), null;
insert into results select 'The note is kept with it', exists (select 1 from public.app_problem_events where ref = :'ref1' and note like 'I tapped Done%'), null;
insert into results select 'Admins are emailed once about a new problem', (select count(*) = 1 from public.outbox where kind = 'problem_new' and to_email = 'lb-admin@test.dev'), null;
insert into results select 'App emails need no creator', (select creator_id is null from public.outbox where kind = 'problem_new' and to_email = 'lb-admin@test.dev'), null;
select id as prob from public.app_problems where message like 'Cannot read properties of null%' \gset
select set_config('request.jwt.claims', json_build_object('email', 'lb-brand@test.dev', 'sub', :'d_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.admin_problems(); exception when others then insert into caught values ('notadmin', sqlerrm); end $$;
reset role;
insert into results select 'Only admins see problems', exists (select 1 from caught where k = 'notadmin'), null;
select set_config('request.jwt.claims', json_build_object('email', 'lb-admin@test.dev', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Admins see it with its count and people', (select (x ->> 'times')::int = 2 and (x ->> 'people')::int = 2 from jsonb_array_elements(public.admin_problems() -> 'list') x where (x ->> 'id')::bigint = :prob), null;
insert into results select 'The detail has the steps and the note', (public.admin_problem(:prob) -> 'notes' -> 0 ->> 'note') like 'I tapped Done%', null;
select public.admin_problem_set(:prob, 'fixed') is not null as fx \gset
reset role;
set local role anon;
select public.problem_report('{"message": "Cannot read properties of null (reading ''fee'') at 3", "place": "/brand/r/KB-0001", "session": "sess-cccc-3333"}') as ref3 \gset
reset role;
insert into results select 'A fixed problem that comes back opens again', (select status from public.app_problems where id = :prob) = 'open', null;
insert into results select 'and the admins hear it came back', exists (select 1 from public.outbox where kind = 'problem_new' and (payload ->> 'back')::boolean), null;

-- ================================================================== 4. Report, block, limits
-- The creator reports and blocks Dew Labs.
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand) values (:c_id, :'brand_id', '', 'request', 15000, false);
select id as col2 from public.collabs where brand_id = :'brand_id' and stage = 'request' limit 1 \gset
select set_config('request.jwt.claims', json_build_object('email', 'lb-creator@test.dev', 'sub', :'c_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.safety_report(jsonb_build_object('collab_id', :'col2', 'reason', 'pay_to_work', 'details', 'Wanted 2999 on UPI glowup@ybl', 'block', true)) as rep \gset
insert into results select 'The creator reports and blocks the brand', (:'rep'::jsonb ->> 'blocked')::boolean and jsonb_array_length(public.my_blocks()) = 1, public.my_blocks()::text;
reset role;
insert into results select 'The report knows the company behind the brand', exists (select 1 from public.safety_reports where target_owner = :'d_uid' and reason = 'pay_to_work'), null;
insert into results select 'Their open request moves to Declined', (select stage::text = 'declined' from public.collabs where id = :'col2'), null;
select set_config('request.jwt.claims', json_build_object('email', 'lb-brand@test.dev', 'sub', :'d_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', 'lbcreator')::text, true);
do $$ begin insert into public.collabs (creator_id, brand_id, code, stage) select b.creator_id, b.id, '', 'request' from public.brands b where b.name = 'Dew Labs' and b.creator_id = (select id from public.creator_settings where slug = 'lbcreator');
  exception when others then insert into caught values ('blocked_req', sqlerrm); end $$;
insert into results select 'A blocked brand can''t send requests', exists (select 1 from caught where k = 'blocked_req' and msg like 'This creator isn''t taking requests%'), (select msg from caught where k = 'blocked_req');
do $$ begin insert into public.collab_messages (collab_id, sender, author, body) select id, 'brand', auth.uid(), 'Hello?' from public.collabs where code <> '' and brand_id in (select id from public.brands where name = 'Dew Labs') limit 1;
  exception when others then insert into caught values ('blocked_msg', sqlerrm); end $$;
insert into results select 'or messages', exists (select 1 from caught where k = 'blocked_msg' and msg like 'This creator isn''t taking messages%'), (select msg from caught where k = 'blocked_msg');
select set_config('request.headers', '{}', true);
-- The creator unblocks again.
select set_config('request.jwt.claims', json_build_object('email', 'lb-creator@test.dev', 'sub', :'c_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.safety_unblock((public.my_blocks() -> 0 ->> 'id')::uuid) as unb \gset
insert into results select 'Unblocking works', jsonb_array_length(:'unb'::jsonb) = 0, null;
reset role;

-- New brands: a few new creators a day.
update public.app_limits set new_v = 0 where key = 'requests_day';
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen)
values ('lb-other@test.dev', 'lbother', 'lbother', 'Omar Other', 'LO', 'LOINV', 'active', true);
select id as o_id from public.creator_settings where slug = 'lbother' \gset
insert into public.brands (creator_id, name) values (:o_id, 'Dew Labs');
select id as o_brand from public.brands where creator_id = :o_id \gset
insert into public.brand_members (profile_id, brand_id) values (:'d_uid', :'o_brand');
select set_config('request.jwt.claims', json_build_object('email', 'lb-brand@test.dev', 'sub', :'d_uid', 'role', 'authenticated')::text, true);
do $$ begin insert into public.collabs (creator_id, brand_id, code, stage) select creator_id, id, '', 'request' from public.brands where creator_id = (select id from public.creator_settings where slug = 'lbother');
  exception when others then insert into caught values ('limit', sqlerrm); end $$;
insert into results select 'A new brand at its daily limit is stopped', exists (select 1 from caught where k = 'limit' and msg like 'LIMIT:requests_day:%connect Instagram%'), (select msg from caught where k = 'limit');
do $$ begin insert into public.collabs (creator_id, brand_id, code, stage) select b.creator_id, b.id, '', 'request' from public.brands b where b.name = 'Dew Labs' and b.creator_id = (select id from public.creator_settings where slug = 'lbcreator');
  exception when others then insert into caught values ('again', sqlerrm); end $$;
insert into results select 'Writing again to a creator you work with doesn''t count', not exists (select 1 from caught where k = 'again' and msg like 'LIMIT:%'), (select msg from caught where k = 'again');
select set_config('request.jwt.claims', '{}', true);
update public.app_limits set new_v = 10 where key = 'requests_day';

-- Messages an hour.
update public.app_limits set new_v = 1 where key = 'messages_hour';
select set_config('request.jwt.claims', json_build_object('email', 'lb-brand@test.dev', 'sub', :'d_uid', 'role', 'authenticated')::text, true);
insert into public.collab_messages (collab_id, sender, author, body) values (:'col', 'brand', :'d_uid', 'One');
do $$ begin insert into public.collab_messages (collab_id, sender, author, body) select id, 'brand', auth.uid(), 'Two' from public.collabs where code <> '' and stage = 'cancelled' and brand_id in (select id from public.brands where name = 'Dew Labs') limit 1;
  exception when others then insert into caught values ('msgs', sqlerrm); end $$;
insert into results select 'Messages an hour are limited', exists (select 1 from caught where k = 'msgs' and msg like 'LIMIT:messages_hour:%'), (select msg from caught where k = 'msgs');
select set_config('request.jwt.claims', '{}', true);
update public.app_limits set new_v = 30 where key = 'messages_hour';

-- Questions a day.
update public.app_limits set new_v = 1 where key = 'questions_day';
insert into public.brand_questions (creator_id, name, email, brand, body) values (:c_id, 'Q', 'q@test.dev', 'Q', 'One?');
do $$ begin insert into public.brand_questions (creator_id, name, email, brand, body) values ((select id from public.creator_settings where slug = 'lbcreator'), 'Q', 'q@test.dev', 'Q', 'Two?');
  exception when others then insert into caught values ('qs', sqlerrm); end $$;
insert into results select 'Questions a day are limited', exists (select 1 from caught where k = 'qs' and msg like 'LIMIT:questions_day:%'), (select msg from caught where k = 'qs');

-- Three reports from different people pause the account (here: one, with the limit at 1).
update public.app_limits set new_v = 1 where key = 'auto_pause';
select set_config('request.jwt.claims', json_build_object('email', 'lb-other@test.dev', 'sub', :'o_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.safety_report(jsonb_build_object('brand_id', :'o_brand', 'reason', 'spam')) is not null as rep2 \gset
reset role;
insert into results select 'Enough reports pause the brand by itself', (select paused_at is not null from public.brand_profiles where owner = :'d_uid'), null;
insert into results select 'and it is told', exists (select 1 from public.outbox where kind = 'account_paused' and to_email = 'lb-brand@test.dev' and creator_id is null), null;
select set_config('request.jwt.claims', json_build_object('email', 'lb-brand@test.dev', 'sub', :'d_uid', 'role', 'authenticated')::text, true);
do $$ begin insert into public.collab_messages (collab_id, sender, author, body) select id, 'brand', auth.uid(), 'Three' from public.collabs where code <> '' and brand_id in (select id from public.brands where name = 'Dew Labs') limit 1;
  exception when others then insert into caught values ('paused', sqlerrm); end $$;
insert into results select 'A paused brand can''t write', exists (select 1 from caught where k = 'paused' and msg like 'Your account is paused%'), (select msg from caught where k = 'paused');
set local role authenticated;
insert into results select 'and its app says so', (public.account_closing() ->> 'state') = 'paused', public.account_closing()::text;
reset role;

-- The admin closes it (they had sent a UPI ID in a message).
select set_config('request.jwt.claims', '{}', true);
insert into public.collab_messages (collab_id, creator_id, sender, author, body) values (:'col', :c_id, 'brand', :'d_uid', 'Pay the fee to glowup@ybl today');
select set_config('request.jwt.claims', json_build_object('email', 'lb-admin@test.dev', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Admins see the reported brand', exists (select 1 from jsonb_array_elements(public.admin_safety() -> 'targets') t where t ->> 'key' = 'brand:' || :'d_uid' and (t ->> 'people')::int = 2), null;
select public.admin_safety_act('brand:' || :'d_uid', 'close') is not null as closed \gset
select public.admin_limits_set('{"requests_day": {"new": 12, "trusted": 60}}') -> 'limits' -> 0 as lim \gset
reset role;
insert into results select 'Closing bans their email', exists (select 1 from public.banned where kind = 'email' and value = 'lb-brand@test.dev'), null;
insert into results select 'and the UPI ID they sent', exists (select 1 from public.banned where kind = 'upi' and value = 'glowup@ybl'), null;
insert into results select 'The reporters hear back', (select count(*) >= 2 from public.outbox where kind = 'report_update'), null;
insert into results select 'Limits can be changed', (:'lim'::jsonb ->> 'new')::int = 12 and (:'lim'::jsonb ->> 'trusted')::int = 60, :'lim';
select set_config('request.jwt.claims', json_build_object('email', 'lb-brand@test.dev', 'sub', :'d_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'A closed brand''s app says so', (public.account_closing() ->> 'state') = 'closed', null;
reset role;

-- A brand blocks a creator.
select set_config('request.jwt.claims', '{}', true);
select gen_random_uuid() as e_uid \gset
insert into auth.users (id, email, aud, role) values (:'e_uid', 'lb-brand2@test.dev', 'authenticated', 'authenticated');
insert into public.brand_profiles (owner, name) values (:'e_uid', 'Kora');
insert into public.brands (creator_id, name) values (:c_id, 'Kora');
select id as k_brand from public.brands where creator_id = :c_id and name = 'Kora' \gset
insert into public.brand_members (profile_id, brand_id) values (:'e_uid', :'k_brand');
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand) values (:c_id, :'k_brand', '', 'negotiating', 9000, false);
select id as k_col from public.collabs where brand_id = :'k_brand' \gset
select set_config('request.jwt.claims', json_build_object('email', 'lb-brand2@test.dev', 'sub', :'e_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.safety_block(jsonb_build_object('creator_id', :c_id)) as kb \gset
reset role;
insert into results select 'A brand blocks a creator', jsonb_array_length(:'kb'::jsonb) = 1, :'kb';
select set_config('request.jwt.claims', json_build_object('email', 'lb-creator@test.dev', 'sub', :'c_uid', 'role', 'authenticated')::text, true);
do $$ begin insert into public.collab_messages (collab_id, sender, body) select id, 'creator', 'Hi Kora' from public.collabs where brand_id in (select id from public.brands where name = 'Kora') limit 1;
  exception when others then insert into caught values ('cblock', sqlerrm); end $$;
insert into results select 'and the creator can''t message them', exists (select 1 from caught where k = 'cblock' and msg like 'This brand isn''t taking messages%'), (select msg from caught where k = 'cblock');

-- Sign-ups from one network.
update public.app_limits set new_v = 0 where key = 'signups_hour';
select set_config('request.headers', '{"cf-connecting-ip": "203.0.113.9"}', true);
select set_config('request.jwt.claims', json_build_object('email', 'lb-new@test.dev', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
do $$ begin insert into public.brand_profiles (owner, name) values (gen_random_uuid(), 'Spam Co'); exception when others then insert into caught values ('signup', sqlerrm); end $$;
insert into results select 'Too many sign-ups from one network are stopped', exists (select 1 from caught where k = 'signup' and msg like 'LIMIT:signups_hour:%'), (select msg from caught where k = 'signup');
select set_config('request.headers', '{}', true);
select set_config('request.jwt.claims', json_build_object('email', 'lb-brand@test.dev', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
do $$ begin insert into public.brand_profiles (owner, name) values (gen_random_uuid(), 'Dew Again'); exception when others then insert into caught values ('banned', sqlerrm); end $$;
insert into results select 'A closed account''s email can''t sign up again', exists (select 1 from caught where k = 'banned' and msg like 'This email can''t be used%'), (select msg from caught where k = 'banned');
select set_config('request.jwt.claims', '{}', true);

-- ================================================================== 5. Erasing for good (last: it deletes)
insert into public.invoices (collab_id, creator_id, number, issue_date, items, status)
values (:'col', :c_id, 'LCINV-001', current_date, '[]', 'sent');
update public.creator_settings set status = 'deleted', closing_at = now() - interval '31 days', erase_after = now() - interval '1 day' where id = :c_id;
select private.erase_closed() as erased \gset
insert into results select 'After 30 days the studio is erased', not exists (select 1 from public.creator_settings where id = :c_id) and :erased >= 1, :'erased';
insert into results select 'Its invoices are kept aside', exists (select 1 from public.kept_invoices where number = 'LCINV-001' and keep_until > current_date + 2900), null;
insert into results select 'Its link is held for 90 days', not public.slug_free('lbcreator'), null;
do $$ begin insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix) values ('x@test.dev', 'x', 'lbcreator', 'X', 'XX', 'XINV');
  exception when others then insert into caught values ('held', sqlerrm); end $$;
insert into results select 'Nobody can take it', exists (select 1 from caught where k = 'held' and msg like 'That link is taken%'), (select msg from caught where k = 'held');

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
