-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/turnaround.sql
-- Turnaround clocks, owners and escalation (migration 150). Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
create temp table caught (k text primary key, msg text) on commit drop;
grant all on caught to authenticated, anon;
select set_config('request.headers', '{}', true);

-- ================================================================== 1. Clock arithmetic (India time)
insert into results select 'Monday 10:00 to Tuesday 10:00 is 24 hours',
  private.tat_hours('2026-10-19 10:00+05:30', '2026-10-20 10:00+05:30', true) = 24, null;
insert into results select 'Saturday noon to Monday noon is 24 hours when Sundays are skipped',
  private.tat_hours('2026-10-24 12:00+05:30', '2026-10-26 12:00+05:30', true) = 24, null;
insert into results select '... and 48 when they count',
  private.tat_hours('2026-10-24 12:00+05:30', '2026-10-26 12:00+05:30', false) = 48, null;
insert into results select '24 hours from Saturday noon falls due Monday noon (Sundays skipped)',
  private.tat_due('2026-10-24 12:00+05:30', 24, true) = '2026-10-26 12:00+05:30'::timestamptz, private.tat_due('2026-10-24 12:00+05:30', 24, true)::text;
insert into results select 'A clock started on a Sunday starts Monday',
  private.tat_due('2026-10-25 15:00+05:30', 2, true) = '2026-10-26 02:00+05:30'::timestamptz, private.tat_due('2026-10-25 15:00+05:30', 2, true)::text;

-- ================================================================== 2. A team with handoffs waiting
select gen_random_uuid() as a_uid, gen_random_uuid() as m_uid, gen_random_uuid() as ap_uid, gen_random_uuid() as f_uid, gen_random_uuid() as b_uid, gen_random_uuid() as x_uid \gset
insert into auth.users (id, email, aud, role) values
  (:'a_uid', 'admin@tat.test', 'authenticated', 'authenticated'), (:'m_uid', 'maya@tat.test', 'authenticated', 'authenticated'),
  (:'ap_uid', 'approver@tat.test', 'authenticated', 'authenticated'), (:'f_uid', 'finance@tat.test', 'authenticated', 'authenticated'),
  (:'b_uid', 'other@tat.test', 'authenticated', 'authenticated'), (:'x_uid', 'outsider@tat.test', 'authenticated', 'authenticated');
insert into public.profiles (id, email, full_name) values (:'a_uid', 'admin@tat.test', 'Asha Admin'), (:'m_uid', 'maya@tat.test', 'Maya'),
  (:'ap_uid', 'approver@tat.test', 'Arjun'), (:'f_uid', 'finance@tat.test', 'Farah'), (:'b_uid', 'other@tat.test', ''), (:'x_uid', 'outsider@tat.test', '') on conflict (id) do update set full_name = excluded.full_name;
insert into public.brand_teams (owner) values (:'a_uid'), (:'b_uid');
insert into public.brand_team_members (owner, email, role, profile_id, joined_at) values
  (:'a_uid', 'maya@tat.test', 'member', :'m_uid', now() - interval '9 days'),
  (:'a_uid', 'approver@tat.test', 'approver', :'ap_uid', now() - interval '8 days'),
  (:'a_uid', 'finance@tat.test', 'finance', :'f_uid', now() - interval '7 days');
insert into public.brands (creator_id, name) values (1, 'TAT Foods') returning id as br \gset
insert into public.brand_members (profile_id, brand_id, owner) values (:'a_uid', :'br', :'a_uid');
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand, created_at)
  values (1, :'br', '', 'negotiating', 40000, false, now() - interval '80 hours') returning id as c1 \gset
insert into public.brand_tat_settings (owner, skip_sundays) values (:'a_uid', false);
-- A quote decided in 10 hours, a newer one waiting 50 hours (48 allowed): overdue.
insert into public.quotes (collab_id, creator_id, version, status, sent_at, responded_at) values (:'c1', 1, 1, 'changes', now() - interval '70 hours', now() - interval '60 hours');
insert into public.quotes (collab_id, creator_id, version, status, sent_at) values (:'c1', 1, 2, 'sent', now() - interval '50 hours') returning id as q2 \gset
-- (sending a new version withdraws the old one and stamps the send time: set it back for the test)
update public.quotes set sent_at = now() - interval '50 hours' where id = :'q2';
-- An approval inside the team waiting 30 hours (24 allowed), a draft waiting 5 hours, an invoice due yesterday.
insert into public.brand_approvals (owner, quote_id, collab_id, total, created_at) values (:'a_uid', :'q2', :'c1', 40000, now() - interval '30 hours');
insert into public.drafts (collab_id, creator_id, round, caption, submitted_at) values (:'c1', 1, 1, 'Draft caption', now() - interval '5 hours');
insert into public.invoices (collab_id, creator_id, status, sent_at, due_date) values (:'c1', 1, 'sent', now() - interval '20 days', current_date - 5);
-- She wrote 30 hours ago and twice since: one clock, from her first message.
insert into public.collab_messages (collab_id, sender, body, created_at) values (:'c1', 'brand', 'Hi!', now() - interval '40 hours'),
  (:'c1', 'creator', 'Any news?', now() - interval '30 hours'), (:'c1', 'creator', 'Hello?', now() - interval '20 hours');

select set_config('request.jwt.claims', json_build_object('email', 'admin@tat.test', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.brand_tat(null, null) as tat \gset
reset role;
create temp table o as select x from jsonb_array_elements(:'tat'::jsonb -> 'open') x;
create temp table s as select x from jsonb_array_elements(:'tat'::jsonb -> 'stages') x;
insert into results select 'The waiting quote is overdue, held by the admin', (select bool_and((x ->> 'overdue')::boolean and x -> 'owner' ->> 'name' = 'Asha Admin') from o where x ->> 'stage' = 'quote_decision'), (select string_agg(x::text, ' | ') from o where x ->> 'stage' = 'quote_decision');
insert into results select 'The approval goes to the team''s approver', (select x -> 'owner' ->> 'name' = 'Arjun' and (x ->> 'overdue')::boolean from o where x ->> 'stage' = 'approval'), null;
insert into results select 'The invoice goes to finance and is overdue', (select x -> 'owner' ->> 'name' = 'Farah' and (x ->> 'overdue')::boolean from o where x ->> 'stage' = 'payment'), null;
insert into results select 'The draft is waiting but not late', (select not (x ->> 'overdue')::boolean and (x ->> 'hours_left')::numeric between 42 and 44 from o where x ->> 'stage' = 'draft_review'), (select x::text from o where x ->> 'stage' = 'draft_review');
insert into results select 'Two messages in a row start one clock', (select count(*) = 1 from o where x ->> 'stage' = 'message_reply'), null;
insert into results select 'The creator''s first quote counts on her side', (select x ->> 'side' = 'creator' and (x ->> 'done')::int = 1 from s where x ->> 'stage' = 'quote_reply'), (select x::text from s where x ->> 'stage' = 'quote_reply');
insert into results select 'The decided quote counts: 10 hours, on time', (select (x ->> 'done')::int = 1 and (x ->> 'median')::numeric = 10 and (x ->> 'on_time')::int = 100 from s where x ->> 'stage' = 'quote_decision'), (select x::text from s where x ->> 'stage' = 'quote_decision');
insert into results select 'Most urgent comes first', (:'tat'::jsonb -> 'open' -> 0 ->> 'overdue')::boolean, null;

-- ================================================================== 3. Owners and backups
set local role authenticated;
select public.brand_tat_assign(:'c1', :'m_uid', :'a_uid') is not null as asg \gset
select public.brand_tat(null, null) as tat2 \gset
insert into results select 'An admin makes Maya the owner, with the admin as backup',
  (select x -> 'owner' ->> 'name' = 'Maya' and x -> 'backup' ->> 'name' = 'Asha Admin' from jsonb_array_elements(:'tat2'::jsonb -> 'open') x where x ->> 'stage' = 'quote_decision' limit 1), null;
insert into results select 'Approvals still go to the approver', (select x -> 'owner' ->> 'name' = 'Arjun' from jsonb_array_elements(:'tat2'::jsonb -> 'open') x where x ->> 'stage' = 'approval'), null;
insert into results select 'Maya shows with her late handoffs', (select (x ->> 'overdue')::int >= 2 from jsonb_array_elements(:'tat2'::jsonb -> 'people') x where x -> 'person' ->> 'name' = 'Maya'), (:'tat2'::jsonb -> 'people')::text;
reset role;
select set_config('my.c1', :'c1', true), set_config('my.x', :'x_uid', true);
set local role authenticated;
do $$ begin perform public.brand_tat_assign(current_setting('my.c1')::uuid, current_setting('my.x')::uuid, null); exception when others then insert into caught values ('outsider', sqlerrm); end $$;
insert into results select 'Someone off the team can''t be made owner', exists (select 1 from caught where k = 'outsider'), (select msg from caught where k = 'outsider');
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'maya@tat.test', 'sub', :'m_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.brand_tat_assign(current_setting('my.c1')::uuid, null, null); exception when others then insert into caught values ('member-assign', sqlerrm); end $$;
do $$ begin perform public.brand_tat_save('{"escalate": false}'); exception when others then insert into caught values ('member-save', sqlerrm); end $$;
insert into results select 'A member can''t reassign owners', exists (select 1 from caught where k = 'member-assign'), null;
insert into results select 'A member can''t change the targets', exists (select 1 from caught where k = 'member-save'), null;
insert into results select 'A member still sees the team''s clocks', jsonb_array_length(public.brand_tat(null, null) -> 'open') >= 5, null;
reset role;

-- Another team sees nothing of this one.
select set_config('request.jwt.claims', json_build_object('email', 'other@tat.test', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Another team sees none of these clocks', jsonb_array_length(public.brand_tat(null, null) -> 'open') = 0, null;
do $$ begin perform public.brand_tat_assign(current_setting('my.c1')::uuid, null, null); exception when others then insert into caught values ('other-team', sqlerrm); end $$;
reset role;
insert into results select '... and can''t assign on them', exists (select 1 from caught where k = 'other-team'), null;

-- ================================================================== 4. Escalation
select private.tat_escalate() as n1 \gset
insert into results select 'Past due: Maya hears about her quote', exists (select 1 from public.outbox where kind = 'tat_overdue' and to_email = 'maya@tat.test' and payload ->> 'stage' = 'quote_decision'), null;
insert into results select 'The approver hears about the approval', exists (select 1 from public.outbox where kind in ('tat_overdue', 'tat_escalated') and to_email = 'approver@tat.test'), null;
insert into results select 'Well past due (the invoice): the backup and admin are told, once', (select count(*) = 1 from public.outbox where kind = 'tat_escalated' and to_email = 'admin@tat.test' and payload ->> 'stage' = 'payment'), (select string_agg(kind || '>' || to_email || ':' || (payload ->> 'stage'), ', ') from public.outbox where kind like 'tat_%');
insert into results select 'Alerts are from Miracle, not a creator', (select bool_and(creator_id is null and (payload ->> 'app')::boolean) from public.outbox where kind like 'tat_%'), null;
insert into results select 'A second run sends nothing new', private.tat_escalate() = 0, null;
insert into results select 'The draft (not due yet) sent nothing', not exists (select 1 from public.outbox where kind like 'tat_%' and payload ->> 'stage' = 'draft_review'), null;

-- ================================================================== 5. Targets and pauses
select set_config('request.jwt.claims', json_build_object('email', 'admin@tat.test', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.brand_tat_save('{"hours": {"quote_decision": 72, "draft_review": 9999}}') as sv \gset
insert into results select 'Giving quotes 72 hours makes that one on time again',
  (select not (x ->> 'overdue')::boolean from jsonb_array_elements(:'sv'::jsonb -> 'open') x where x ->> 'stage' = 'quote_decision'), null;
insert into results select 'Targets are capped at 30 days', (:'sv'::jsonb -> 'settings' -> 'hours' ->> 'draft_review')::int = 720, null;
reset role;
update public.collabs set stage = 'paused', lifecycle_reason = 'Waiting for stock', paused_at = now() where id = :'c1';
set local role authenticated;
insert into results select 'A paused collab''s clocks are paused, not late',
  (select bool_and((x ->> 'paused')::boolean and not (x ->> 'overdue')::boolean) from jsonb_array_elements(public.brand_tat(null, null) -> 'open') x), null;
reset role;
delete from public.brand_tat_alerts;
insert into results select 'Nothing escalates while paused', private.tat_escalate() = 0, null;
insert into results select 'Nobody reads the TAT tables directly', not has_table_privilege('authenticated', 'public.brand_collab_owners', 'select') and not has_table_privilege('authenticated', 'public.brand_tat_alerts', 'select'), null;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
