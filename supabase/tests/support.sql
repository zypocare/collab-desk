-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/support.sql
-- Support tickets (migration 139). Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
select set_config('request.headers', '{}', true);
delete from public.outbox where kind like 'support%';

select lower(creator_email) as cr_email from public.creator_settings where id = 1 \gset
select gen_random_uuid() as cr_uid, gen_random_uuid() as other_uid, gen_random_uuid() as admin_uid \gset
insert into public.app_admins (email) values ('support-admin@test.dev') on conflict do nothing;

-- The creator raises one, with her own screenshot and someone else's.
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', :'cr_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.support_create(jsonb_build_object('category', 'money', 'subject', 'Invoice shows the wrong GST', 'body', 'My invoice for Kora shows 18% but I am not registered.',
  'name', 'Nivy', 'device', jsonb_build_object('app', '1.0.0', 'device', 'Android app'),
  'files', jsonb_build_array(jsonb_build_object('path', :'cr_uid' || '/shot.png', 'name', 'shot.png', 'type', 'image/png', 'size', 1200),
                             jsonb_build_object('path', :'other_uid' || '/theirs.png', 'name', 'theirs.png')))) as t \gset
reset role;
select :'t'::jsonb ->> 'id' as t_id \gset
insert into results select 'A ticket gets a number', (:'t'::jsonb ->> 'number')::int >= 1001, :'t'::jsonb ->> 'number';
insert into results select 'From the creator side', :'t'::jsonb ->> 'side' = 'creator' and (:'t'::jsonb ->> 'creator_id')::int = 1, null;
insert into results select 'Only her own file is kept', jsonb_array_length(:'t'::jsonb -> 'messages' -> 0 -> 'files') = 1 and :'t'::jsonb -> 'messages' -> 0 -> 'files' -> 0 ->> 'name' = 'shot.png', null;
insert into results select 'The support inbox is told by email', exists (select 1 from public.outbox where kind = 'support_new' and to_email = 'support@miracleapp.live' and payload ->> 'number' = :'t'::jsonb ->> 'number'), null;
insert into results select 'Not the admins'' own emails', not exists (select 1 from public.outbox where kind like 'support_%' and to_email = 'support-admin@test.dev'), null;

set local role authenticated;
insert into results select 'It''s in her list', (select jsonb_array_length(public.support_mine()) = 1), null;
reset role;

-- Someone else can't see or answer it.
select set_config('my.t', :'t_id', true);
select set_config('request.jwt.claims', json_build_object('email', 'stranger@test.dev', 'sub', :'other_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Others can''t open it', public.support_ticket(:'t_id'::uuid) is null, null;
do $$ begin perform public.support_reply((select current_setting('my.t', true))::uuid, 'hi'); insert into results values ('Others can''t reply', false, 'ran'); exception when others then insert into results values ('Others can''t reply', true, null); end $$;
do $$ begin perform public.admin_support('all'); insert into results values ('Only admins see the queue', false, 'ran'); exception when others then insert into results values ('Only admins see the queue', true, null); end $$;
do $$ begin perform 1 from public.support_tickets limit 1; insert into results values ('Nor read the table', false, 'read'); exception when others then insert into results values ('Nor read the table', true, null); end $$;
reset role;

-- The Miracle team answers, and adds a note only they see.
select set_config('request.jwt.claims', json_build_object('email', 'support-admin@test.dev', 'sub', :'admin_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'The team sees it as new', (select (x ->> 'team_unread')::boolean from jsonb_array_elements(public.admin_support('all') -> 'tickets') x where x ->> 'id' = :'t_id'), null;
select public.admin_support_reply(:'t_id'::uuid, 'Checked with finance: refund done', true) is not null as n1 \gset
select public.admin_support_reply(:'t_id'::uuid, 'Fixed: your invoice now shows no GST. Download it again from Money.') as a \gset
insert into results select 'Answering waits on her', :'a'::jsonb ->> 'status' = 'waiting', :'a'::jsonb ->> 'status';
insert into results select 'The team sees its note', jsonb_array_length(:'a'::jsonb -> 'messages') = 3, null;
reset role;
insert into results select 'She''s told by email and alert', exists (select 1 from public.outbox where kind = 'support_reply' and to_email = :'cr_email' and creator_id = 1 and payload ->> 'link' like '/studio/help/tickets/%'), null;
insert into results select 'Not for the note', (select count(*) = 1 from public.outbox where kind = 'support_reply'), null;

-- She reads it: no note, unread cleared; she replies and it opens again; then solved with a rating.
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', :'cr_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'She has an unread answer', public.support_unread() = 1, null;
select public.support_ticket(:'t_id'::uuid) as mine \gset
insert into results select 'She never sees the team''s note', jsonb_array_length(:'mine'::jsonb -> 'messages') = 2 and not (:'mine'::jsonb ? 'tried'), null;
insert into results select 'Opening it marks it read', public.support_unread() = 0, null;
select public.support_reply(:'t_id'::uuid, 'Thanks! One more: can I edit the old one?') ->> 'status' as st \gset
insert into results select 'Her reply opens it again', :'st' = 'open', :'st';
select public.support_solved(:'t_id'::uuid, 5, 'Quick') as sol \gset
insert into results select 'Solved, with her rating', :'sol'::jsonb ->> 'status' = 'solved' and (:'sol'::jsonb ->> 'rating')::int = 5, null;
reset role;
insert into results select 'The team hears about her reply', exists (select 1 from public.outbox where kind = 'support_user_reply'), null;

-- A brand raises one: brand side, no creator.
select set_config('request.jwt.claims', json_build_object('email', 'brand-support@test.dev', 'sub', :'other_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.support_create(jsonb_build_object('category', 'brand', 'subject', 'Can''t accept a quote', 'body', 'The accept button does nothing on my phone.')) as b \gset
insert into results select 'A brand''s ticket isn''t tied to a creator', :'b'::jsonb ->> 'creator_id' is null and :'b'::jsonb ->> 'side' in ('brand', 'other'), :'b'::jsonb ->> 'side';
do $$ begin perform public.support_create('{"subject": "x", "body": "too short"}'); insert into results values ('A subject is needed', false, 'ran'); exception when others then insert into results values ('A subject is needed', true, null); end $$;
do $$ declare i int; begin for i in 1..5 loop perform public.support_create(jsonb_build_object('subject', 'Ticket ' || i, 'body', 'Something about this, at length.')); end loop; insert into results values ('Five a day at most', false, 'ran'); exception when others then insert into results values ('Five a day at most', sqlerrm like 'LIMIT:support:%', sqlerrm); end $$;
reset role;

set local role anon;
do $$ begin perform public.support_mine(); insert into results values ('Signed out gets nothing', false, 'ran'); exception when others then insert into results values ('Signed out gets nothing', true, null); end $$;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
