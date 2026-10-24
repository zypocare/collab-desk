-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/creator_alerts.sql
-- Alerts kept in the app (migration 135). Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
select set_config('request.headers', '{}', true);
select lower(creator_email) as cr_email from public.creator_settings where id = 1 \gset
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen)
values ('al-meher@test.dev', 'almeher', 'almeher', 'Meher Alerts', 'AM', 'AMINV', 'active', true);
select id as c2_id, creator_email as c2_email from public.creator_settings where slug = 'almeher' \gset
delete from public.creator_alerts where creator_id = 1;

-- The server keeps three for her and one for another creator.
insert into public.creator_alerts (creator_id, kind, title, body, url, tag) values
  (1, 'request_received_creator', 'Sunveda may want a collab', 'Paid reel · ₹20,000', '/studio/collabs', 'req-1'),
  (1, 'quote_accepted', 'Kora accepted your quote', '₹15,000', '/studio/c/X', 'q-1'),
  (1, 'payment_claimed', 'Glasshouse says they paid', '₹35,000', '/studio/payments', 'pay-1'),
  (:c2_id, 'message_to_creator', 'A message for Meher', 'Hi', '/studio/inbox', 'm-1');

select gen_random_uuid() as owner_uid \gset
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', :'owner_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'She sees her alerts only', (select count(*) = 3 from public.creator_alerts), null;
insert into results select 'All three are new to her', public.alerts_unread() = 3, null;
select coalesce(public.alerts_seen()::text, '') as first_seen \gset
insert into results select 'Opening Alerts clears her count', public.alerts_unread() = 0, null;
insert into results select 'The first time, there was no earlier visit', :'first_seen' = '', :'first_seen';
do $$ begin insert into public.creator_alerts (creator_id, title) values (1, 'fake'); insert into results values ('She can''t write alerts herself', false, 'inserted'); exception when others then insert into results values ('She can''t write alerts herself', true, null); end $$;
reset role;

-- A new one arrives after she looked.
insert into public.creator_alerts (creator_id, kind, title, created_at) values (1, 'draft_reviewed', 'Draft approved', now() + interval '1 second');
set local role authenticated;
insert into results select 'A later alert is new again', public.alerts_unread() = 1, null;
reset role;

-- Another creator sees only hers.
select set_config('request.jwt.claims', json_build_object('email', :'c2_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Another creator sees only her own', (select count(*) = 1 and bool_and(title = 'A message for Meher') from public.creator_alerts), null;
reset role;

-- A teammate has their own count.
insert into public.team_members (creator_id, email, name, role) values (1, 'mgr@alerts.test', 'Rahul', 'manager');
select set_config('request.jwt.claims', json_build_object('email', 'mgr@alerts.test', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', (select slug from public.creator_settings where id = 1))::text, true);
set local role authenticated;
insert into results select 'Her manager sees her alerts', (select count(*) = 4 from public.creator_alerts), null;
insert into results select 'and has their own unread count', public.alerts_unread() = 4, null;
reset role;

-- Deleting (migration 138): each login clears their own list.
select id as q_id from public.creator_alerts where tag = 'q-1' \gset
select id as m_id from public.creator_alerts where tag = 'm-1' \gset
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', :'owner_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', '{}', true);
set local role authenticated;
insert into results select 'She has four in her list', (select count(*) = 4 from public.alerts_list()), null;
select public.alerts_hide(array[:q_id]::bigint[]) as hid \gset
insert into results select 'She deletes one', :hid = 1 and (select count(*) = 3 from public.alerts_list()) and not exists (select 1 from public.alerts_list() where id = :q_id), :'hid';
insert into results select 'Not another creator''s alert', public.alerts_hide(array[:m_id]::bigint[]) = 0, null;
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'mgr@alerts.test', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', (select slug from public.creator_settings where id = 1))::text, true);
set local role authenticated;
insert into results select 'Her manager still has it', (select count(*) = 4 from public.alerts_list()), null;
reset role;
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', :'owner_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', '{}', true);
set local role authenticated;
select public.alerts_clear();
insert into results select 'Clear all empties her list', not exists (select 1 from public.alerts_list() where created_at <= now()), null;
reset role;
insert into public.creator_alerts (creator_id, kind, title, created_at) values (1, 'payment_claimed', 'Kora says they paid', now() + interval '2 seconds');
set local role authenticated;
insert into results select 'A new alert after clearing shows', exists (select 1 from public.alerts_list() where title = 'Kora says they paid') and public.alerts_unread() >= 1, null;
reset role;

set local role anon;
do $$ begin perform public.alerts_unread(); insert into results values ('Signed out gets nothing', false, 'ran'); exception when others then insert into results values ('Signed out gets nothing', true, null); end $$;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
