-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/competitor_watch.sql
-- Competitor watch (migration 141). Makes its own brand, creators and posts; runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon, service_role;
select set_config('request.headers', '{}', true);
select slug as cr_slug from public.creator_settings where id = 1 \gset

-- Four creators: Asha (listed, tags @mamaearth.in in a paid post), Bina (listed, names Plum with #collab),
-- Chitra (not listed, tags @mamaearth.in), Devi (listed, names Plum but no ad label).
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen, listed, niche, city)
values ('cw-a@test.dev', 'asha.cw', 'cwa', 'Asha Watch', 'WA', 'WAINV', 'active', true, true, 'Skincare', 'Bengaluru'),
       ('cw-b@test.dev', 'bina.cw', 'cwb', 'Bina Watch', 'WB', 'WBINV', 'active', true, true, 'Beauty', 'Mumbai'),
       ('cw-c@test.dev', 'chitra.cw', 'cwc', 'Chitra Watch', 'WC', 'WCINV', 'active', true, false, 'Skincare', 'Pune'),
       ('cw-d@test.dev', 'devi.cw', 'cwd', 'Devi Watch', 'WD', 'WDINV', 'active', true, true, 'Beauty', 'Delhi');
select id as a_id from public.creator_settings where slug = 'cwa' \gset
select id as b_id from public.creator_settings where slug = 'cwb' \gset
select id as c_id from public.creator_settings where slug = 'cwc' \gset
select id as d_id from public.creator_settings where slug = 'cwd' \gset
insert into public.ig_account (id, connected, followers) values (:a_id, true, 40000), (:b_id, true, 25000), (:c_id, true, 30000), (:d_id, true, 20000);
insert into public.ig_media (id, creator_id, owner_id, caption, media_type, product_type, permalink, posted_at, views) values
  ('cw1', :a_id, '', 'Monsoon skin routine with @mamaearth.in #ad', 'VIDEO', 'REELS', 'https://www.instagram.com/reel/cw1', now() - interval '10 days', 21000),
  ('cw2', :b_id, '', 'Trying the new Plum serum #collab', 'VIDEO', 'REELS', 'https://www.instagram.com/reel/cw2', now() - interval '20 days', 15000),
  ('cw3', :c_id, '', 'Morning with @mamaearth.in #ad', 'VIDEO', 'REELS', 'https://www.instagram.com/reel/cw3', now() - interval '5 days', 9000),
  ('cw4', :d_id, '', 'My Plum haul, bought it myself', 'VIDEO', 'REELS', 'https://www.instagram.com/reel/cw4', now() - interval '8 days', 7000),
  ('cw5', :a_id, '', 'Old post @mamaearth.in #ad', 'VIDEO', 'REELS', 'https://www.instagram.com/reel/cw5', now() - interval '200 days', 5000);

-- A brand signs up (through creator 1's page) and makes a campaign.
select gen_random_uuid() as b_uid \gset
insert into auth.users (id, email, aud, role) values (:'b_uid', 'cwbrand@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'cwbrand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role authenticated;
select public.brand_signup('Glow Watch', 'Skincare', '', '@glowwatch', 'Isha', 'Founder', '', 'Pune', '{}', '', '') is not null as s1 \gset
select set_config('request.headers', '{}', true);
select public.campaign_save(jsonb_build_object('name', 'Monsoon serum', 'brief', jsonb_build_object('type', 'paid', 'fee', 10000,
  'deliverables', jsonb_build_array(jsonb_build_object('kind', 'Reel', 'qty', 1)))))::text as camp \gset
select public.autopilots_save(jsonb_build_object('watch', 'ask', 'watch_campaign', :'camp',
  'watch_brands', jsonb_build_array(jsonb_build_object('name', 'Mamaearth', 'handle', '@mamaearth.in'), jsonb_build_object('name', 'Plum', 'handle', ''),
    jsonb_build_object('name', '', 'handle', 'bad handle!'), jsonb_build_object('name', 'Four'), jsonb_build_object('name', 'Five'), jsonb_build_object('name', 'Six')))) as st \gset
insert into results select 'Up to five competitors, bad ones left out', jsonb_array_length(:'st'::jsonb -> 'watch_brands') = 4, (:'st'::jsonb -> 'watch_brands')::text;
insert into results select 'The handle is cleaned', :'st'::jsonb -> 'watch_brands' -> 0 ->> 'handle' = 'mamaearth.in', null;
do $$ begin perform public.watch_run_service((select id from auth.users where email = 'cwbrand@test.dev'), '[]'); insert into results values ('Brands can''t run the job themselves', false, 'ran'); exception when others then insert into results values ('Brands can''t run the job themselves', true, null); end $$;
reset role;

-- The Monday job: with what the web search found.
set local role service_role;
select public.watch_run_service(:'b_uid'::uuid, jsonb_build_array(jsonb_build_object('competitor', 'Mamaearth', 'creators', jsonb_build_array(
  jsonb_build_object('handle', '@bina.cw', 'name', 'Bina', 'url', 'https://www.instagram.com/p/web1'),
  jsonb_build_object('handle', 'offmiracle.girl', 'name', 'Off Girl', 'url', 'https://www.instagram.com/p/web2', 'note', 'Reel for the monsoon range'),
  jsonb_build_object('handle', 'no url', 'url', 'http://insecure'),
  jsonb_build_object('handle', 'nolink', 'url', ''))))) as run1 \gset
reset role;
insert into results select 'The job reports what it found', (:'run1'::jsonb ->> 'creators')::int >= 3, :'run1';

select payload as brief from public.brand_autopilot_items where owner = :'b_uid' and kind = 'watch' \gset
select (select x from jsonb_array_elements(:'brief'::jsonb -> 'competitors') x where x ->> 'name' = 'Mamaearth') as mama \gset
select (select x from jsonb_array_elements(:'brief'::jsonb -> 'competitors') x where x ->> 'name' = 'Plum') as plum \gset
insert into results select 'Asha’s paid post tagging Mamaearth is seen', exists (select 1 from jsonb_array_elements(:'mama'::jsonb -> 'miracle') x where (x ->> 'creator_id')::int = :a_id), :'mama';
insert into results select 'Not her post from 200 days ago', (select jsonb_array_length(x -> 'posts') = 1 from jsonb_array_elements(:'mama'::jsonb -> 'miracle') x where (x ->> 'creator_id')::int = :a_id), null;
insert into results select 'Bina found on the web is linked to her Miracle page', exists (select 1 from jsonb_array_elements(:'mama'::jsonb -> 'miracle') x where (x ->> 'creator_id')::int = :b_id), null;
insert into results select 'Not a creator who isn''t listed', not exists (select 1 from jsonb_array_elements(:'mama'::jsonb -> 'miracle') x where (x ->> 'creator_id')::int = :c_id), null;
insert into results select 'Creators not on Miracle show with their source', exists (select 1 from jsonb_array_elements(:'mama'::jsonb -> 'web') x where x ->> 'handle' = 'offmiracle.girl' and x ->> 'link' like 'https://%'), (:'mama'::jsonb -> 'web')::text;
insert into results select 'Web results without a safe link are dropped', jsonb_array_length(:'mama'::jsonb -> 'web') = 1, null;
insert into results select 'Bina’s #collab post naming Plum is seen', exists (select 1 from jsonb_array_elements(:'plum'::jsonb -> 'miracle') x where (x ->> 'creator_id')::int = :b_id), :'plum';
insert into results select 'Not a post naming Plum without an ad label', not exists (select 1 from jsonb_array_elements(:'plum'::jsonb -> 'miracle') x where (x ->> 'creator_id')::int = :d_id), null;
insert into results select 'The brief waits for a look, it does nothing itself', (select status = 'pending' and payload ->> 'action' = 'review' from public.brand_autopilot_items where owner = :'b_uid' and kind = 'watch'), null;

-- Invites (Ask me): one per new creator, waiting.
insert into results select 'An invite waits for each new creator', (select count(*) = 3 from public.brand_autopilot_items where owner = :'b_uid' and kind = 'invite' and status = 'pending'),
  (select string_agg(title, ' | ') from public.brand_autopilot_items where owner = :'b_uid' and kind = 'invite');
select id as inv from public.brand_autopilot_items where owner = :'b_uid' and kind = 'invite' and (payload ->> 'creator_id')::int = :a_id \gset
select id as inv_web from public.brand_autopilot_items where owner = :'b_uid' and kind = 'invite' and payload ->> 'handle' = 'offmiracle.girl' \gset
select set_config('request.jwt.claims', json_build_object('email', 'cwbrand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.autopilot_act(:'inv'::uuid, 'approve') is not null as a1 \gset
select public.autopilot_act(:'inv_web'::uuid, 'approve') is not null as a2 \gset
reset role;
insert into results select 'Approving invites Asha to the campaign', exists (select 1 from public.campaign_creators where campaign_id = :'camp'::uuid and creator_id = :a_id), null;
insert into results select 'and adds a creator not on Miracle by handle', exists (select 1 from public.campaign_creators where campaign_id = :'camp'::uuid and handle = 'offmiracle.girl'), null;

-- A second check the same week updates the brief, and doesn't invite anyone twice.
set local role service_role;
select public.watch_run_service(:'b_uid'::uuid, '[]') is not null as r2 \gset
reset role;
insert into results select 'Still one brief this week', (select count(*) = 1 from public.brand_autopilot_items where owner = :'b_uid' and kind = 'watch'), null;
insert into results select 'Nobody invited twice', (select count(*) = 3 from public.brand_autopilot_items where owner = :'b_uid' and kind = 'invite'), null;

-- Auto: invites go out by themselves, within the weekly limit; creators the brand knows are left out.
update public.brand_autopilots set watch = 'auto', watch_max = 1, watch_checked_at = now() - interval '7 days' where owner = :'b_uid';
delete from public.brand_autopilot_items where owner = :'b_uid' and kind = 'invite' and status = 'pending';
insert into public.ig_media (id, creator_id, owner_id, caption, media_type, product_type, permalink, posted_at, views) values
  ('cw6', :d_id, '', 'Collab with @mamaearth.in #ad', 'VIDEO', 'REELS', 'https://www.instagram.com/reel/cw6', now() - interval '1 day', 8000);
set local role service_role;
select public.watch_run_service(:'b_uid'::uuid, '[]') as run3 \gset
reset role;
insert into results select 'Auto invites, up to the weekly limit', (select count(*) = 1 from public.brand_autopilot_items where owner = :'b_uid' and kind = 'invite' and status = 'auto' and acted_at > now() - interval '1 minute'), :'run3';
insert into results select 'and the invite really went', (select count(*) >= 2 from public.campaign_creators where campaign_id = :'camp'::uuid and creator_id is not null), null;

-- Signed out, or another brand: nothing.
set local role anon;
do $$ begin perform public.watch_due(); insert into results values ('Signed out can''t list who is watched', false, 'ran'); exception when others then insert into results values ('Signed out can''t list who is watched', true, null); end $$;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
