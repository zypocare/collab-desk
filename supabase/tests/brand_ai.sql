-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/brand_ai.sql
-- AI for brands (migration 133): each brand team's daily share. Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
select set_config('request.headers', '{}', true);
select slug as cr_slug, lower(creator_email) as cr_email from public.creator_settings where id = 1 \gset

-- A brand login with a company.
select gen_random_uuid() as b_uid \gset
insert into auth.users (id, email, aud, role) values (:'b_uid', 'aibrand@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'aibrand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role authenticated;
select public.brand_signup('Bright Co', 'Skincare', '', '@brightco', 'Ria', 'Founder', '', 'Pune', '{}', '', '') is not null as s1 \gset
select public.brand_from_profile() is not null as s2 \gset
select public.ai_take_brand('brandask', 450) as t1 \gset
insert into results select 'A brand can use AI', (:'t1'::jsonb ->> 'ok')::boolean, :'t1';
select public.ai_take_brand('brandbrief', 2000) as t2 \gset
select public.ai_take_brand('brandbrief', 600) as t3 \gset
insert into results select 'Its daily share runs out', not (:'t3'::jsonb ->> 'ok')::boolean and :'t3'::jsonb ->> 'reason' = 'budget', :'t3';
select public.ai_take_brand_gemini('brandask') as g1 \gset
insert into results select 'Then the backup takes over', (:'g1'::jsonb ->> 'ok')::boolean, null;
do $$ begin for i in 1..19 loop perform public.ai_take_brand_gemini('brandask'); end loop; end $$;
select public.ai_take_brand_gemini('brandask') as g2 \gset
insert into results select 'The backup has a daily limit too', not (:'g2'::jsonb ->> 'ok')::boolean, null;
insert into results select 'A brand can''t read the usage table', not exists (select 1 from public.brand_ai_usage), null;
reset role;
insert into results select 'Usage is counted per team', (select sum(calls) = 22 from public.brand_ai_usage where owner = :'b_uid'), null;

-- A creator is not a brand.
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
select set_config('request.headers', '{}', true);
set local role authenticated;
select public.ai_take_brand('brandask', 450) as c1 \gset
insert into results select 'A creator can''t use the brand share', :'c1'::jsonb ->> 'reason' = 'not_brand', :'c1';
reset role;

-- A login with no company either.
select gen_random_uuid() as n_uid \gset
insert into auth.users (id, email, aud, role) values (:'n_uid', 'nobody@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'nobody@test.dev', 'sub', :'n_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.ai_take_brand('brandask', 450) as n1 \gset
insert into results select 'A login without a company can''t either', :'n1'::jsonb ->> 'reason' = 'not_brand', :'n1';
reset role;
set local role anon;
do $$ begin perform public.ai_take_brand('brandask', 450); insert into results values ('Signed out is refused', false, 'ran'); exception when others then insert into results values ('Signed out is refused', true, null); end $$;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
