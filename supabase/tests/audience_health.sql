-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/audience_health.sql
-- Audience health and brand safety (migration 137): who sees it, and where. Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
select set_config('request.headers', '{}', true);

-- Creator 1 is listed, with Instagram connected and a check saved by the sync.
select lower(creator_email) as cr_email, slug as cr_slug from public.creator_settings where id = 1 \gset
update public.creator_settings set listed = true where id = 1;
insert into public.ig_account (id, connected, followers, health) values (1, true, 50000,
  '{"v": 1, "at": "2026-10-24T00:00:00Z", "score": 86, "grade": "strong", "posts": 12, "checks": [{"key": "reach", "label": "Real reach", "score": 90, "tone": "ok", "value": "18% of followers", "note": ""}], "safety": {"level": "note", "checked_at": "2026-10-24T00:00:00Z", "posts": 30, "flags": [{"kind": "strong_language", "label": "Strong language", "severity": "low", "why": "", "post": {"id": "m1", "permalink": "https://www.instagram.com/p/x", "posted_at": "2026-10-20"}}]}}')
on conflict (id) do update set connected = true, followers = 50000, health = excluded.health;

-- Creator 2 isn't listed, also checked; creator 3 is listed but Instagram isn't connected.
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen, listed)
values ('ah-b@test.dev', 'ahb', 'ahb', 'Bina Health', 'HB', 'HBINV', 'active', true, false),
       ('ah-c@test.dev', 'ahc', 'ahc', 'Chitra Health', 'HC', 'HCINV', 'active', true, true);
select id as b_id from public.creator_settings where slug = 'ahb' \gset
select id as c_id from public.creator_settings where slug = 'ahc' \gset
insert into public.ig_account (id, connected, followers, health) values (:b_id, true, 9000, '{"v": 1, "score": 70, "grade": "good", "checks": [], "safety": {"level": "clear", "flags": []}}');

-- A brand signs up through creator 1's page (so it works with her), and a stranger signs in.
select gen_random_uuid() as br_uid, gen_random_uuid() as st_uid \gset
insert into auth.users (id, email, aud, role) values (:'br_uid', 'ahbrand@test.dev', 'authenticated', 'authenticated'), (:'st_uid', 'ahstranger@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'ahbrand@test.dev', 'sub', :'br_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role authenticated;
select public.brand_signup('Glow Health', 'Skincare', '', '@glowhealth', 'Isha', 'Founder', '', 'Pune', '{}', '', '') is not null as s1 \gset

-- On her request page (her address), the brand sees her check.
insert into results select 'The brand sees it on her request page', (public.creator_health() ->> 'score')::int = 86, public.creator_health()::text;
insert into results select 'with the brand-safety notes and the post', public.creator_health() -> 'safety' -> 'flags' -> 0 -> 'post' ->> 'permalink' = 'https://www.instagram.com/p/x', null;
select set_config('request.headers', '{}', true);
insert into results select 'In Discover, on her card', (select (x -> 'health' ->> 'score')::int = 86 from jsonb_array_elements(public.discover_creators()) x where (x ->> 'id')::int = 1), null;
insert into results select 'A creator without Instagram shows no check', (select x -> 'health' = 'null'::jsonb from jsonb_array_elements(public.discover_creators()) x where (x ->> 'id')::int = :c_id), null;
insert into results select 'and says Instagram isn''t connected', public.creator_health(:c_id) = '{"connected": false}'::jsonb, public.creator_health(:c_id)::text;
insert into results select 'Not an unlisted creator the brand never worked with', public.creator_health(:b_id) is null, public.creator_health(:b_id)::text;
reset role;

-- A stranger who's signed in: listed creators only.
select set_config('request.jwt.claims', json_build_object('email', 'ahstranger@test.dev', 'sub', :'st_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Anyone signed in sees a listed creator''s check', (public.creator_health(1) ->> 'score')::int = 86, null;
insert into results select 'but not an unlisted one', public.creator_health(:b_id) is null, null;
reset role;

-- The unlisted creator sees her own.
select set_config('request.jwt.claims', json_build_object('email', 'ah-b@test.dev', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'She sees her own, listed or not', (public.creator_health(:b_id) ->> 'score')::int = 70, null;
do $$ begin update public.ig_account set health = '{"score": 100}' where id = (select public.current_creator()); insert into results values ('She can''t change her score', (select (health ->> 'score')::int = 70 from public.ig_account where id = (select public.current_creator())), null); exception when others then insert into results values ('She can''t change her score', true, null); end $$;
reset role;

-- Signed out: nothing.
set local role anon;
do $$ begin perform public.creator_health(1); insert into results values ('Signed out gets nothing', false, 'ran'); exception when others then insert into results values ('Signed out gets nothing', true, null); end $$;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
