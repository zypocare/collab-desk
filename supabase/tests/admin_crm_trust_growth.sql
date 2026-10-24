-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/admin_crm_trust_growth.sql
-- The admin CRM, part 4 (migration 152): support, problems and safety as lists with record pages; bans,
-- blocks, directory, case studies, creator pages, reel swaps, autopilot items and DM rules; the logged
-- actions on them. Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
select set_config('request.headers', '{}', true);
delete from public.outbox where kind like 'support%';

select gen_random_uuid() as admin_uid, gen_random_uuid() as x_uid, gen_random_uuid() as b_uid, gen_random_uuid() as cr_uid \gset
select lower(creator_email) as cr_email from public.creator_settings where id = 1 \gset
insert into public.app_admins (email) values ('tg-admin@test.dev') on conflict do nothing;
insert into auth.users (id, email, aud, role) values (:'admin_uid', 'tg-admin@test.dev', 'authenticated', 'authenticated'),
  (:'x_uid', 'tg-stranger@test.dev', 'authenticated', 'authenticated'), (:'b_uid', 'tg-brand@test.dev', 'authenticated', 'authenticated');

-- A ticket from the creator, a problem, a report about a brand login, a block, a case study,
-- a waiting autopilot item and a DM rule.
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', :'cr_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.support_create(jsonb_build_object('category', 'money', 'subject', 'Invoice shows the wrong GST', 'body', 'My invoice shows 18% but I am not registered.')) ->> 'id' as tk \gset
reset role;
insert into public.app_problems (fingerprint, source, message, place, release) values ('tg-fp', 'app', 'TypeError in Quote editor', '/studio/quotes', '1.4.0') returning id as pb \gset
insert into public.app_problem_events (problem_id, ref, who, session, device, place, release) values (:pb, 'r1', 'a@test.dev', 's1', 'Android', '/studio/quotes', '1.4.0');
select set_config('request.jwt.claims', json_build_object('email', 'tg-brand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.brand_signup('Glow Scam Co', 'Skincare', '', '', 'Ravi', 'Founder', '', 'Pune', '{}', '', '') is not null as s1 \gset
reset role;
select set_config('request.jwt.claims', '{}', true);
insert into public.safety_reports (by_side, by_creator, by_name, target_kind, target_owner, target_name, reason, details)
values ('creator', 1, 'Nivy', 'brand', :'b_uid', 'Glow Scam Co', 'pay_to_work', 'Asked me to pay a fee first');
insert into public.safety_blocks (side, creator_id, owner, name) values ('creator', 1, :'b_uid', 'Glow Scam Co');
insert into public.brands (name, creator_id) values ('TG Case Brand', 1) returning id as br \gset
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand) values (1, :'br', '', 'wrapped', 20000, false) returning id as col \gset
insert into public.case_studies (creator_id, collab_id, title, status, published_at) values (1, :'col', 'Glow launch reel', 'published', now()) returning id as cs \gset
insert into public.brand_autopilot_items (owner, kind, title, status) values (:'b_uid', 'negotiate', 'Counter ₹58k → ₹50k', 'pending') returning id as item \gset
insert into public.dm_rules (creator_id, keyword, reply, active) values (1, 'PRICE', 'Sending you the price list!', true) returning id as rule \gset

-- Only admins.
select set_config('request.jwt.claims', json_build_object('email', 'tg-stranger@test.dev', 'sub', :'x_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.admin_list('tickets'); insert into results values ('A non-admin can''t list tickets', false, 'ran'); exception when others then insert into results values ('A non-admin can''t list tickets', true, null); end $$;
do $$ begin perform public.admin_ban_set('email', 'x@test.dev', true, 'x'); insert into results values ('Nor ban anyone', false, 'ran'); exception when others then insert into results values ('Nor ban anyone', true, null); end $$;
do $$ begin perform public.admin_autopilots(); insert into results values ('Nor see autopilot use', false, 'ran'); exception when others then insert into results values ('Nor see autopilot use', true, null); end $$;
reset role;
insert into results select 'Signed out can''t call them', not has_function_privilege('anon', 'public.admin_safety_target(text)', 'execute')
  and not has_function_privilege('anon', 'public.admin_ban_set(text, text, boolean, text)', 'execute'), null;

select set_config('request.jwt.claims', json_build_object('email', 'tg-admin@test.dev', 'sub', :'admin_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
-- Every new list loads.
insert into results select 'Every new list loads', (select bool_and((public.admin_list(k) ->> 'total') is not null)
  from unnest(array['tickets', 'problems', 'safety', 'bans', 'blocks', 'directory', 'cases', 'pages', 'reels', 'autopilot_items', 'dm_rules']) k), null;
select public.admin_list('tickets', 'wrong gst', '{"status": "open"}') -> 'rows' -> 0 as t \gset
insert into results select 'The ticket is listed, unread, with its creator', (:'t'::jsonb ->> 'unread')::boolean and (:'t'::jsonb ->> 'creator_id')::int = 1 and :'t'::jsonb ->> 'category' = 'money', :'t';
select public.admin_list('problems', 'quote editor') -> 'rows' -> 0 as p \gset
insert into results select 'The problem is listed as new, with people this week', (:'p'::jsonb ->> 'new')::boolean and (:'p'::jsonb ->> 'people')::int = 1, :'p';

-- Safety: one row per reported account; its page has every report and its block.
select public.admin_list('safety', 'glow scam') -> 'rows' -> 0 as s \gset
insert into results select 'The reported brand is one row, open', :'s'::jsonb ->> 'key' = 'brand:' || :'b_uid' and (:'s'::jsonb ->> 'open')::boolean and (:'s'::jsonb ->> 'reports')::int = 1, :'s';
select public.admin_safety_target('brand:' || :'b_uid') as st \gset
insert into results select 'The safety page has the report, the block and the login', jsonb_array_length(:'st'::jsonb -> 'reports') = 1 and (:'st'::jsonb ->> 'blocked_by')::int = 1
  and :'st'::jsonb ->> 'record_kind' = 'brand_login' and :'st'::jsonb -> 'about' ->> 'email' = 'tg-brand@test.dev', null;
do $$ begin perform public.admin_safety_target('brand:00000000-0000-0000-0000-000000000000'); insert into results values ('An unknown account isn''t found', false, 'ran'); exception when others then insert into results values ('An unknown account isn''t found', true, null); end $$;
insert into results select 'Blocks are listed', (public.admin_list('blocks', 'glow scam') ->> 'total')::int = 1, null;

-- Bans: checked, added, lifted, logged.
do $$ begin perform public.admin_ban_set('email', 'not-an-email', true, 'x'); insert into results values ('A ban needs a real email', false, 'ran'); exception when others then insert into results values ('A ban needs a real email', true, null); end $$;
do $$ begin perform public.admin_ban_set('email', 'tg-admin@test.dev', true, 'x'); insert into results values ('An admin can''t be banned', false, 'ran'); exception when others then insert into results values ('An admin can''t be banned', true, null); end $$;
do $$ begin perform public.admin_ban_set('upi', 'scam@okaxis', true, ''); insert into results values ('A ban needs a reason', false, 'ran'); exception when others then insert into results values ('A ban needs a reason', true, null); end $$;
select public.admin_ban_set('upi', 'Scam@OKAXIS', true, 'Sent to three creators') ->> 'value' as bv \gset
insert into results select 'The UPI ID is banned, in lower case', :'bv' = 'scam@okaxis' and (public.admin_list('bans', 'scam@okaxis') ->> 'total')::int = 1, :'bv';
select public.admin_ban_set('upi', 'scam@okaxis', false, 'Mistake') ->> 'banned' as bl \gset
insert into results select 'And lifted', :'bl' = 'false' and (public.admin_list('bans', 'scam@okaxis') ->> 'total')::int = 0, null;
do $$ begin perform public.admin_ban_set('upi', 'scam@okaxis', false, 'again'); insert into results values ('Lifting a ban that isn''t there is refused', false, 'ran'); exception when others then insert into results values ('Lifting a ban that isn''t there is refused', true, null); end $$;

-- Case study, autopilot item, DM rule.
select public.admin_case_unpublish(:'cs', 'The brand asked to take it down') ->> 'status' as cst \gset
insert into results select 'The case study is unpublished', :'cst' = 'draft', :'cst';
do $$ begin perform public.admin_case_unpublish((select id from public.case_studies where title = 'Glow launch reel'), 'again'); insert into results values ('Only a published case study can be unpublished', false, 'ran'); exception when others then insert into results values ('Only a published case study can be unpublished', true, null); end $$;
select public.admin_autopilot_item_skip(:'item', 'Brand asked us to stop countering') ->> 'status' as ist \gset
insert into results select 'The autopilot item is skipped', :'ist' = 'skipped', :'ist';
select public.admin_dm_rule_off(:'rule', 'Replies look like spam') ->> 'active' as dr \gset
insert into results select 'The DM rule is off', :'dr' = 'false', :'dr';
reset role;
insert into results select 'The note on the item says why', (select note from public.brand_autopilot_items where id = :'item') = 'Skipped by Miracle: Brand asked us to stop countering', null;
insert into results select 'Each action is in the audit trail', (select count(*) from public.admin_audit where action in ('ban', 'unban', 'case_unpublish', 'autopilot_item_skip', 'dm_rule_off')
  and admin = 'tg-admin@test.dev') = 5, null;

-- Directory and creator pages, autopilot use, and notes on a ticket.
set local role authenticated;
insert into results select 'The directory lists active creators', (select bool_and(x ? 'listed') from jsonb_array_elements(public.admin_list('directory', '', '{}', 'views_30d', true, 50) -> 'rows') x), null;
insert into results select 'Creator pages count fans and views', (public.admin_list('pages', '', '{}', 'fans', true, 1) -> 'rows' -> 0) ?& array['fans', 'views_30d', 'link_clicks'], null;
select public.admin_autopilots() as ap \gset
insert into results select 'Autopilot use is counted', (:'ap'::jsonb ->> 'creators')::int >= 1 and :'ap'::jsonb -> 'creator' ? 'pitch' and (:'ap'::jsonb -> 'items' ->> 'skipped')::int >= 1, null;
insert into results select 'Notes can go on a ticket and a problem', jsonb_array_length(public.admin_note_add('ticket', :'tk', 'Finance is checking') -> 'notes') = 1
  and jsonb_array_length(public.admin_note_add('problem', :pb::text, 'Fix in 1.4.1') -> 'notes') = 1, null;
insert into results select 'A ticket''s notes and log come back for its page', jsonb_array_length(public.admin_record_extras('ticket', :'tk') -> 'notes') = 1
  and jsonb_array_length(public.admin_record_extras('ticket', :'tk') -> 'audit') = 1, null;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
