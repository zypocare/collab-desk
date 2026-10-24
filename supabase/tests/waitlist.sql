-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/waitlist.sql
-- The pre-launch waitlist (migration 160). Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
create temp table caught (k text primary key, msg text) on commit drop;
grant all on caught to authenticated, anon;
delete from public.waitlist;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.7"}', true);
select slug as taken from public.creator_settings where id = 1 \gset

set local role anon;
select public.waitlist_join('{"email": "Asha@Test.dev", "role": "creator", "name": "Asha", "instagram": "@asha.eats", "city": "Pune", "link": "asha-eats"}') as a1 \gset
select public.waitlist_join(jsonb_build_object('email', 'ravi@test.dev', 'role', 'creator', 'name', 'Ravi', 'link', :'taken', 'ref', :'a1'::jsonb ->> 'ref_code')) as r1 \gset
select public.waitlist_join(jsonb_build_object('email', 'meera@test.dev', 'role', 'creator', 'ref', :'a1'::jsonb ->> 'ref_code', 'link', 'asha-eats')) as m1 \gset
select public.waitlist_join('{"email": "glow@brand.dev", "role": "brand", "company": "Glow Co", "site": "glow.in"}') as b1 \gset
select public.waitlist_join('{"email": "asha@test.dev", "role": "creator", "city": "Mumbai"}') as a2 \gset
select public.waitlist_join('{"email": "bot@spam.dev", "role": "creator", "website_url": "http://spam"}') as bot \gset
select public.waitlist_status(:'a1'::jsonb ->> 'ref_code') as st \gset
do $$ begin perform public.waitlist_join('{"email": "not-an-email", "role": "creator"}'); exception when others then insert into caught values ('bad-email', sqlerrm); end $$;
do $$ begin perform public.waitlist_join('{"email": "x@y.dev", "role": "alien"}'); exception when others then insert into caught values ('bad-role', sqlerrm); end $$;
reset role;

insert into results select 'The first creator is first in line, with a referral code', (:'a1'::jsonb ->> 'position')::int = 1 and length(:'a1'::jsonb ->> 'ref_code') = 7 and (:'a1'::jsonb ->> 'new')::boolean, :'a1';
insert into results select 'Emails are stored in lower case', exists (select 1 from public.waitlist where email = 'asha@test.dev'), null;
insert into results select 'The link name she wants is held for her', (select link = 'asha-eats' from public.waitlist where email = 'asha@test.dev'), null;
insert into results select 'A creator''s existing link can''t be held', :'r1'::jsonb ->> 'link_note' like '%is taken%' and (:'r1'::jsonb ->> 'link') is null, :'r1'::jsonb ->> 'link_note';
insert into results select '... nor one someone on the list asked for first', :'m1'::jsonb ->> 'link_note' like '%is taken%', null;
insert into results select 'Joining with a friend''s code counts for the friend', (:'st'::jsonb ->> 'referrals')::int = 2, :'st';
insert into results select 'Brands are counted in their own line', (:'b1'::jsonb ->> 'position')::int = 1 and (:'b1'::jsonb ->> 'total')::int = 1, :'b1';
insert into results select 'Joining again updates the details, not a second place', not (:'a2'::jsonb ->> 'new')::boolean and (select count(*) = 1 from public.waitlist where email = 'asha@test.dev') and (select city = 'Mumbai' from public.waitlist where email = 'asha@test.dev'), null;
insert into results select 'A bot filling the hidden field is quietly ignored', not exists (select 1 from public.waitlist where email = 'bot@spam.dev'), null;
insert into results select 'A bad email or role is refused', exists (select 1 from caught where k = 'bad-email') and exists (select 1 from caught where k = 'bad-role'), null;
insert into results select 'One welcome email per person', (select count(*) = 1 from public.outbox where kind = 'waitlist_welcome' and to_email = 'asha@test.dev' and creator_id is null), null;

-- Referrals move you up: Ravi joined later than Meera? No: Meera joined after Ravi; give Meera two friends.
set local role anon;
select public.waitlist_join(jsonb_build_object('email', 'f1@test.dev', 'role', 'brand', 'ref', :'m1'::jsonb ->> 'ref_code')) as f1 \gset
select public.waitlist_join(jsonb_build_object('email', 'f2@test.dev', 'role', 'brand', 'ref', :'m1'::jsonb ->> 'ref_code')) as f2 \gset
select public.waitlist_status(:'m1'::jsonb ->> 'ref_code') as mst \gset
select public.waitlist_status(:'r1'::jsonb ->> 'ref_code') as rst \gset
reset role;
insert into results select 'Friends joining move you up the line', (:'mst'::jsonb ->> 'position')::int < (:'rst'::jsonb ->> 'position')::int, :'mst'::jsonb ->> 'position' || ' vs ' || (:'rst'::jsonb ->> 'position');

-- Too many from one network in an hour.
set local role anon;
do $$ begin perform public.waitlist_join('{"email": "n7@test.dev", "role": "creator"}'); exception when others then insert into caught values ('rate', sqlerrm); end $$;
reset role;
insert into results select 'More than six an hour from one network waits', exists (select 1 from caught where k = 'rate'), (select msg from caught where k = 'rate');

-- Signing up later marks the person as joined.
insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'asha@test.dev', 'authenticated', 'authenticated');
insert into results select 'Signing up later marks them joined', (select joined_at is not null from public.waitlist where email = 'asha@test.dev'), null;

-- Only admins see the list.
set local role anon;
do $$ begin perform public.admin_waitlist(); exception when others then insert into caught values ('admin', sqlerrm); end $$;
reset role;
insert into results select 'Only admins see the list', exists (select 1 from caught where k = 'admin'), null;
insert into results select 'Nobody reads the table directly', not has_table_privilege('anon', 'public.waitlist', 'select') and not has_table_privilege('authenticated', 'public.waitlist', 'select'), null;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
