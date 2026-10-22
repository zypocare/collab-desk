-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/brand_phase4.sql
-- Reports, Discover with audience, private ratings and open briefs (migration 120).
-- Runs in one transaction and rolls back. Each check prints PASS or FAIL.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
select set_config('request.headers', '{}', true);

-- The creator (id 1) is listed, shares an audience and shows rates.
select lower(creator_email) as cr_email, slug as cr_slug from public.creator_settings where id = 1 \gset
update public.creator_settings set listed = true, show_rates = true, offered_kinds = '{Reel,Story}' where id = 1;
insert into public.ig_account (id, connected, followers, demographics) values (1, true, 20000,
  '{"gender": {"F": 680, "M": 320}, "age": {"18-24": 180, "25-34": 540, "35-44": 220, "45-54": 60}, "city": {"Bangalore, Karnataka": 410, "Mysore, Karnataka": 90, "Mumbai, Maharashtra": 70}}')
on conflict (id) do update set connected = true, followers = 20000, demographics = excluded.demographics;

-- A brand signs up, makes its company for the creator and sends one request.
select gen_random_uuid() as b_uid \gset
insert into auth.users (id, email, aud, role) values (:'b_uid', 'phase4brand@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'phase4brand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role authenticated;
select public.brand_signup('Glow Labs', 'Skincare', '', '@glowlabs', 'Isha', 'Founder', '', 'Pune', '{}', '', '') is not null as s1 \gset
select public.brand_from_profile() is not null as s2 \gset
reset role;
select set_config('request.headers', '{}', true);

-- 1. Discover with audience
select set_config('request.jwt.claims', json_build_object('email', 'phase4brand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select x as card from jsonb_array_elements(public.discover_audience()) x where (x ->> 'id')::int = 1 \gset
insert into results select 'Discover lists the creator with her audience', (:'card'::jsonb -> 'audience' ->> 'women') = '68', :'card';
insert into results select 'Age bands come as shares', (:'card'::jsonb -> 'audience' -> 'age' ->> '25-34') = '54', null;
insert into results select 'Top city first, without the state', (:'card'::jsonb -> 'audience' -> 'cities' -> 0 ->> 'name') = 'Bangalore', null;
insert into results select 'Rates show when she shows them', (:'card'::jsonb -> 'rates') is not null, null;
insert into results select 'Rating a creator you never worked with is refused', false, null;
do $$ begin perform public.creator_rate(1, 5, 5, 5, ''); exception when others then update results set ok = true, detail = sqlerrm where check_name = 'Rating a creator you never worked with is refused'; end $$;
reset role;

-- A collab exists between them now (as if the request went through).
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand)
select 1, b.id, '', 'wrapped', 20000, false from public.brands b join public.brand_members m on m.brand_id = b.id where m.profile_id = :'b_uid' and b.creator_id = 1 limit 1;

-- 3. Private ratings
set local role authenticated;
insert into results select 'The brand rates the creator', (public.creator_rate(1, 5, 4, 4, 'Fast drafts') ->> 'quality') = '4', null;
insert into results select 'The rating comes back on Discover', (select (x -> 'rating' ->> 'note') = 'Fast drafts' from jsonb_array_elements(public.discover_audience()) x where (x ->> 'id')::int = 1), null;
insert into results select 'Stars out of range are refused', false, null;
do $$ begin perform public.creator_rate(1, 6, 1, 1, ''); exception when others then update results set ok = true, detail = sqlerrm where check_name = 'Stars out of range are refused'; end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'The creator never sees the rating', not exists (select 1 from public.brand_creator_ratings), null;
insert into results select 'The creator gets no Discover list', jsonb_array_length(public.discover_audience()) = 0, null;
reset role;

-- 4. Open briefs
select set_config('request.jwt.claims', json_build_object('email', 'phase4brand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.campaign_save(jsonb_build_object('name', 'Winter face oil', 'brief', jsonb_build_object('type', 'paid', 'fee', 0,
  'deliverables', jsonb_build_array(jsonb_build_object('kind', 'Reel', 'qty', 1)))))::text as camp \gset
insert into results select 'A closing date is needed to open a brief', false, null;
do $$ begin perform public.campaign_open((select id from public.brand_campaigns where name = 'Winter face oil'), true, null, 15000, 30000);
exception when others then update results set ok = true, detail = sqlerrm where check_name = 'A closing date is needed to open a brief'; end $$;
insert into results select 'The brand opens the brief', (public.campaign_open(:'camp'::uuid, true, current_date + 8, 15000, 30000) -> 'campaign' ->> 'open')::boolean, null;
reset role;

select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'The creator sees the open brief', exists (select 1 from jsonb_array_elements(public.open_briefs()) x where x ->> 'id' = :'camp'), null;
insert into results select 'The creator applies with a rate', (select (x -> 'mine' ->> 'rate')::numeric = 18000 from jsonb_array_elements(public.brief_apply(:'camp'::uuid, 18000, 'My audience is 68% women')) x where x ->> 'id' = :'camp'), null;
insert into results select 'Applying again updates the rate', (select (x -> 'mine' ->> 'rate')::numeric = 17500 from jsonb_array_elements(public.brief_apply(:'camp'::uuid, 17500, 'Can post by 12 Nov')) x where x ->> 'id' = :'camp'), null;
insert into results select 'The creator sees only their own application', (select count(*) = 1 from public.campaign_applications), null;
reset role;

select set_config('request.jwt.claims', json_build_object('email', 'phase4brand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select x ->> 'application' as app from jsonb_array_elements(public.campaign_applications_list(:'camp'::uuid)) x limit 1 \gset
insert into results select 'The brand sees the application with her audience', (select (x -> 'audience' ->> 'women') = '68' from jsonb_array_elements(public.campaign_applications_list(:'camp'::uuid)) x limit 1), null;
insert into results select 'Sending needs a shortlist', false, null;
do $$ begin perform public.applications_send((select id from public.brand_campaigns where name = 'Winter face oil'));
exception when others then update results set ok = true, detail = sqlerrm where check_name = 'Sending needs a shortlist'; end $$;
select public.application_set(:'app'::uuid, 'shortlist') is null as sh \gset
select public.applications_send(:'camp'::uuid) is not null as sent \gset
reset role;
insert into results select 'Her request is at the rate she asked', exists (select 1 from public.campaign_applications a join public.collabs k on k.id = a.collab_id
  where a.id = :'app'::uuid and a.status = 'sent' and k.fee = 17500), (select status || ' ' || coalesce(collab_id::text, '-') from public.campaign_applications where id = :'app'::uuid);
insert into results select 'The campaign brief is put back afterwards', (select (brief ->> 'fee')::numeric = 0 from public.brand_campaigns where id = :'camp'::uuid), null;

-- 5. Reports
select set_config('request.jwt.claims', json_build_object('email', 'phase4brand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.brand_reports(current_date - 365, current_date) as rep \gset
insert into results select 'Reports count the collabs', (:'rep'::jsonb -> 'kpi' ->> 'collabs')::int >= 2, :'rep'::jsonb ->> 'kpi';
insert into results select 'Reports list the creator with your rating', (:'rep'::jsonb -> 'by_creator' -> 0 ->> 'rating') is not null, :'rep'::jsonb ->> 'by_creator';
insert into results select 'Reports list the campaign and its application', (:'rep'::jsonb -> 'campaigns' -> 0 ->> 'applications') = '1', null;
insert into results select 'Reports have a row per request for Excel', jsonb_array_length(:'rep'::jsonb -> 'requests') >= 2, null;
insert into results select 'A period over two years is refused', public.brand_reports(current_date - 1000, current_date) is null, null;
reset role;

select set_config('request.jwt.claims', '', true);
set local role anon;
insert into results select 'Signed-out visitors can''t call any of it',
  not has_function_privilege('anon', 'public.brand_reports(date,date)', 'execute')
  and not has_function_privilege('anon', 'public.discover_audience()', 'execute')
  and not has_function_privilege('anon', 'public.open_briefs()', 'execute')
  and not has_function_privilege('anon', 'public.creator_rate(integer,integer,integer,integer,text)', 'execute'), null;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
