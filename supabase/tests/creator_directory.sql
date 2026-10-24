-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/creator_directory.sql
-- The public creator directory (migration 136). Makes its own creators, runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
select set_config('request.headers', '{}', true);

-- Nobody is in it until they switch it on.
update public.creator_settings set directory_listed = false;
set local role anon;
insert into results select 'Empty until a creator switches it on', (public.directory_facets()->>'total')::int = 0 and (public.directory_search()->>'total')::int = 0, public.directory_facets()::text;
reset role;

-- Asha (Bengaluru, Instagram connected), Bina (Mumbai, not connected), Chitra (not listed for brands)
-- and Devi (still signing up) all switch it on.
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen, listed, directory_listed, niche, city, bio)
values ('dir-a@test.dev', 'asha_dir', 'dira', 'Asha Dir', 'DA', 'DAINV', 'active', true, true, true, 'Lifestyle, Skincare, Fashion', 'Bengaluru', 'Kannada skincare reels.'),
       ('dir-b@test.dev', 'binadir', 'dirb', 'Bina Dir', 'DB', 'DBINV', 'active', true, true, true, 'Skincare, Beauty', 'Mumbai', ''),
       ('dir-c@test.dev', 'chitradir', 'dirc', 'Chitra Dir', 'DC', 'DCINV', 'active', true, false, true, 'Food', 'Delhi', ''),
       ('dir-d@test.dev', 'devidir', 'dird', 'Devi Dir', 'DD', 'DDINV', 'pending', false, true, true, 'Travel', 'Goa', '');
select id as a_id from public.creator_settings where slug = 'dira' \gset
select id as b_id from public.creator_settings where slug = 'dirb' \gset
insert into public.ig_account (id, connected, followers) values (:a_id, true, 52000), (:b_id, false, 90000)
on conflict (id) do update set connected = excluded.connected, followers = excluded.followers;

set local role anon;
insert into results select 'Only active, listed creators who switched it on', (public.directory_facets()->>'total')::int = 2, public.directory_facets()->>'total';
insert into results select 'Cities as pages', (select array_agg(x->>'slug' order by x->>'slug') = array['bengaluru', 'mumbai'] from jsonb_array_elements(public.directory_facets()->'cities') x), (public.directory_facets()->'cities')::text;
insert into results select 'Niches as pages, split from her list', (select bool_and(x->>'slug' in ('lifestyle', 'skincare', 'fashion', 'beauty')) and count(*) = 4 from jsonb_array_elements(public.directory_facets()->'niches') x), (public.directory_facets()->'niches')::text;
insert into results select 'Skincare counts both of them', (select (x->>'n')::int = 2 from jsonb_array_elements(public.directory_facets()->'niches') x where x->>'slug' = 'skincare'), null;
insert into results select 'Niche and city pairs', exists (select 1 from jsonb_array_elements(public.directory_facets()->'pairs') x where x->>'niche' = 'skincare' and x->>'city' = 'bengaluru'), null;
insert into results select 'A niche page', (public.directory_search('skincare')->>'total')::int = 2, null;
insert into results select 'A city page', (select (r->>'total')::int = 1 and r->'items'->0->>'slug' = 'dira' from (select public.directory_search('', 'bengaluru') r) x), null;
insert into results select 'Niche in a city', (public.directory_search('fashion', 'mumbai')->>'total')::int = 0 and (public.directory_search('skincare', 'mumbai')->>'total')::int = 1, null;
insert into results select 'Search by words', (public.directory_search('', '', 'bina')->>'total')::int = 1 and (public.directory_search('', '', 'KANNADA')->>'total')::int = 1, null;
insert into results select 'Verified first, even with fewer followers', public.directory_search()->'items'->0->>'slug' = 'dira', public.directory_search()->'items'->0->>'slug';
insert into results select 'Verified badge only with Instagram connected', (select bool_and((x->>'verified')::boolean = (x->>'slug' = 'dira')) from jsonb_array_elements(public.directory_search()->'items') x), null;
insert into results select 'No Instagram numbers without the connection', (select x->'followers' = 'null'::jsonb from jsonb_array_elements(public.directory_search()->'items') x where x->>'slug' = 'dirb'), null;
insert into results select 'Her real followers with it', (select (x->>'followers')::int = 52000 from jsonb_array_elements(public.directory_search()->'items') x where x->>'slug' = 'dira'), null;
insert into results select 'No email, phone or payment details in a card', (select bool_and(not (x ?| array['creator_email', 'email', 'phone', 'upi', 'pan', 'gstin', 'bank'])) from jsonb_array_elements(public.directory_search()->'items') x), null;
insert into results select 'A page past the end is empty', jsonb_array_length(public.directory_search('', '', '', 5)->'items') = 0, null;
insert into results select 'Odd input is harmless', (public.directory_search('%', '''; drop', '_')->>'total')::int = 0, null;
insert into results select 'Wildcards are plain text', (public.directory_search('', '', '%')->>'total')::int = 0 and (public.directory_search('', '', '%e%')->>'total')::int = 0, null;
do $$ begin perform private.directory_card(1); insert into results values ('The card helper is private', false, 'ran'); exception when others then insert into results values ('The card helper is private', true, null); end $$;
reset role;

-- Switching it off takes her out.
update public.creator_settings set directory_listed = false where slug = 'dirb';
set local role anon;
insert into results select 'Switching it off takes her out', (public.directory_facets()->>'total')::int = 1, null;
reset role;

insert into results select 'Slugs: food & drink', private.slugify(' Food & Drink ') = 'food-and-drink', private.slugify(' Food & Drink ');

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
