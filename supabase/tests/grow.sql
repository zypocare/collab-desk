-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/grow.sql
-- Grow (migration 125): her own reel plans, posting her own reels, collab reel invites between creators.
-- Runs in one transaction and rolls back. Each check prints PASS or FAIL.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
create temp table caught (k text primary key, msg text) on commit drop;
grant all on caught to authenticated, anon;
select set_config('request.headers', '{}', true);

-- Two creators in the same niche, both listed.
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen, listed, niche, city)
values ('gr-a@test.dev', 'gra', 'gra', 'Asha Grow', 'GA', 'GAINV', 'active', true, true, 'Skincare, Lifestyle', 'Bengaluru'),
       ('gr-b@test.dev', 'grb', 'grb', 'Bina Grow', 'GB', 'GBINV', 'active', true, true, 'Skincare', 'Mumbai'),
       ('gr-c@test.dev', 'grc', 'grc', 'Chitra Food', 'GC', 'GCINV', 'active', true, true, 'Food', 'Delhi');
select id as a_id from public.creator_settings where slug = 'gra' \gset
select id as b_id from public.creator_settings where slug = 'grb' \gset
select id as c_id from public.creator_settings where slug = 'grc' \gset
select gen_random_uuid() as a_uid, gen_random_uuid() as b_uid \gset
insert into auth.users (id, email, aud, role) values (:'a_uid', 'gr-a@test.dev', 'authenticated', 'authenticated'), (:'b_uid', 'gr-b@test.dev', 'authenticated', 'authenticated');
insert into public.profiles (id, email) values (:'a_uid', 'gr-a@test.dev'), (:'b_uid', 'gr-b@test.dev') on conflict do nothing;

-- ================================================================== 1. Her own plans and reels
select set_config('request.jwt.claims', json_build_object('email', 'gr-a@test.dev', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.content_plans (title, why, post_at, status, source, week) values ('GRWM in 15s', 'Like your top reel', now() + interval '2 days', 'idea', 'autopilot', current_date);
insert into results select 'A plan is hers', (select creator_id = :a_id from public.content_plans where title = 'GRWM in 15s'), null;
insert into public.scheduled_posts (collab_id, file_path, file_type, caption, collaborators, publish_at) values (null, 'own/' || :a_id || '/x.mp4', 'video/mp4', 'Hi', '{}', now() + interval '2 days');
insert into results select 'Her own reel can be scheduled without a collab', exists (select 1 from public.scheduled_posts where file_path = 'own/' || :a_id || '/x.mp4'), null;
insert into results select 'Her own files belong to her', public.path_creator('own/' || :a_id || '/x.mp4') = :a_id, null;
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'gr-b@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Another creator can''t see her plans', not exists (select 1 from public.content_plans where title = 'GRWM in 15s'), null;
insert into results select 'or her scheduled reels', not exists (select 1 from public.scheduled_posts where file_path like 'own/' || :a_id || '/%'), null;
reset role;

-- ================================================================== 2. Matches
select set_config('request.jwt.claims', json_build_object('email', 'gr-a@test.dev', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Creators in her niche show up', exists (select 1 from jsonb_array_elements(public.grow_matches()) x where (x ->> 'id')::int = :b_id), public.grow_matches()::text;
insert into results select 'not ones in another niche and city', not exists (select 1 from jsonb_array_elements(public.grow_matches()) x where (x ->> 'id')::int = :c_id), null;
insert into results select 'and never herself', not exists (select 1 from jsonb_array_elements(public.grow_matches()) x where (x ->> 'id')::int = :a_id), null;
reset role;

-- ================================================================== 3. Invites
select set_config('request.jwt.claims', json_build_object('email', 'gr-a@test.dev', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('t.b', :'b_id', true);
select public.collab_reel_invite(:b_id, 'Bengaluru vs Mumbai monsoon skincare', 'from', current_date + 5, now() + interval '7 days') as inv \gset
insert into results select 'She invites a creator', (:'inv'::jsonb -> 0 ->> 'status') = 'pending' and not (:'inv'::jsonb -> 0 ->> 'incoming')::boolean, :'inv';
do $$ begin perform public.collab_reel_invite(current_setting('t.b')::integer, 'Again', 'from', null, null); exception when others then insert into caught values ('twice', sqlerrm); end $$;
insert into results select 'Not twice while one is waiting', exists (select 1 from caught where k = 'twice' and msg like '%hasn''t answered%'), (select msg from caught where k = 'twice');
do $$ begin perform public.collab_reel_invite((select id from public.creator_settings where slug = 'gra'), 'Myself', 'from', null, null); exception when others then insert into caught values ('self', sqlerrm); end $$;
insert into results select 'Not herself', exists (select 1 from caught where k = 'self'), null;
reset role;
insert into results select 'The creator invited gets an email', exists (select 1 from public.outbox where kind = 'collab_reel_invite' and creator_id = :b_id and payload ->> 'from' = 'Asha Grow'), null;

update public.creator_settings set collab_invites = false where id = :c_id;
select set_config('request.jwt.claims', json_build_object('email', 'gr-a@test.dev', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
do $$ begin perform public.collab_reel_invite((select id from public.creator_settings where slug = 'grc'), 'Food collab', 'from', null, null); exception when others then insert into caught values ('off', sqlerrm); end $$;
insert into results select 'Creators who turned invites off can''t be invited', exists (select 1 from caught where k = 'off' and msg like '%isn''t taking collab invites%'), null;

-- B answers yes.
select set_config('request.jwt.claims', json_build_object('email', 'gr-b@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select x ->> 'id' as reel_id from jsonb_array_elements(public.my_collab_reels()) x where (x ->> 'incoming')::boolean limit 1 \gset
insert into results select 'She sees the invite as incoming', :'reel_id' <> '', null;
select public.collab_reel_answer(:'reel_id'::uuid, true) as ans \gset
insert into results select 'Saying yes accepts it', (:'ans'::jsonb -> 0 ->> 'status') = 'accepted', null;
insert into results select 'It''s in her Calendar', exists (select 1 from public.content_plans where collab_reel_id = :'reel_id'::uuid and status = 'planned'), null;
do $$ begin perform public.collab_reel_answer((select id from public.collab_reels limit 1), false); exception when others then insert into caught values ('again', sqlerrm); end $$;
insert into results select 'An answered invite can''t be answered again', exists (select 1 from caught where k = 'again'), null;
reset role;
insert into results select 'and in both Calendars', (select count(*) = 2 from public.content_plans where collab_reel_id = :'reel_id'::uuid), null;
insert into results select 'The inviter hears yes', exists (select 1 from public.outbox where kind = 'collab_reel_answer' and creator_id = :a_id and (payload ->> 'yes')::boolean), null;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
