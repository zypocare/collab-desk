-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/briefs_links_cases.sql
-- Brief rules (142), tracked links (143) and case studies (144). Makes its own data; rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
select set_config('request.headers', '{}', true);
select lower(creator_email) as cr_email, slug as cr_slug from public.creator_settings where id = 1 \gset
delete from public.outbox where kind like 'case_study%';

-- Three creators for the brief: Asha fits; Bina is too small; Chitra hasn't connected Instagram.
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen, listed, niche, city, content_languages)
values ('blc-a@test.dev', 'blca', 'blca', 'Asha Rules', 'RA', 'RAINV', 'active', true, true, 'Skincare, Lifestyle', 'Bengaluru', '{Kannada,English}'),
       ('blc-b@test.dev', 'blcb', 'blcb', 'Bina Rules', 'RB', 'RBINV', 'active', true, true, 'Skincare', 'Bengaluru', '{Kannada}'),
       ('blc-c@test.dev', 'blcc', 'blcc', 'Chitra Rules', 'RC', 'RCINV', 'active', true, true, 'Skincare', 'Bengaluru', '{Kannada}');
select id as a_id from public.creator_settings where slug = 'blca' \gset
select id as b_id from public.creator_settings where slug = 'blcb' \gset
select id as c_id from public.creator_settings where slug = 'blcc' \gset
insert into public.ig_account (id, connected, followers) values (:a_id, true, 50000), (:b_id, true, 4000), (:c_id, false, null);

-- A brand (through creator 1's page), a campaign with rules, opened.
select gen_random_uuid() as b_uid, gen_random_uuid() as o_uid \gset
insert into auth.users (id, email, aud, role) values (:'b_uid', 'blcbrand@test.dev', 'authenticated', 'authenticated'), (:'o_uid', 'blcother@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'blcbrand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role authenticated;
select public.brand_signup('Glow Rules', 'Skincare', '', '@glowrules', 'Isha', 'Founder', '', 'Pune', '{}', '', '') is not null as s1 \gset
select public.brand_from_profile() is not null as s2 \gset
select set_config('request.headers', '{}', true);
select public.campaign_save(jsonb_build_object('name', 'Kannada skincare', 'brief', jsonb_build_object('type', 'paid', 'fee', 20000,
  'deliverables', jsonb_build_array(jsonb_build_object('kind', 'Reel', 'qty', 1)))))::text as camp \gset
select public.campaign_rules(:'camp'::uuid, '{"min_followers": 10000, "max_followers": 100000, "niches": ["Skincare"], "languages": ["Kannada"], "cities": ["Bengaluru"]}') as rules \gset
insert into results select 'The brand sets who can apply', (:'rules'::jsonb ->> 'min_followers')::int = 10000 and :'rules'::jsonb -> 'languages' ->> 0 = 'Kannada', :'rules';
do $$ begin perform public.campaign_rules((select id from public.brand_campaigns where name = 'Kannada skincare'), '{"min_followers": 50000, "max_followers": 1000}'); insert into results values ('A range that runs backwards is refused', false, 'ran'); exception when others then insert into results values ('A range that runs backwards is refused', true, null); end $$;
select public.campaign_open(:'camp'::uuid, true, current_date + 7, 10000, 25000) is not null as op \gset
reset role;

-- The creators look.
select set_config('request.jwt.claims', json_build_object('email', 'blc-a@test.dev', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
select (select x from jsonb_array_elements(public.open_briefs()) x where x ->> 'id' = :'camp') as ob \gset
insert into results select 'Asha qualifies', (:'ob'::jsonb -> 'fit' ->> 'ok')::boolean, (:'ob'::jsonb -> 'fit')::text;
insert into results select 'and can apply', (select count(*) = 1 from jsonb_array_elements(public.brief_apply(:'camp'::uuid, 18000, 'Kannada skincare is my thing')) x where x -> 'mine' is not null and x ->> 'id' = :'camp'), null;
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'blc-b@test.dev', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
select (select x from jsonb_array_elements(public.open_briefs()) x where x ->> 'id' = :'camp') as ob \gset
insert into results select 'Bina sees why not (followers)', not (:'ob'::jsonb -> 'fit' ->> 'ok')::boolean and :'ob'::jsonb -> 'fit' -> 'misses' ->> 0 like '%you have 4K%', (:'ob'::jsonb -> 'fit')::text;
select set_config('my.camp', :'camp', true);
do $$ begin perform public.brief_apply(current_setting('my.camp')::uuid, 15000, ''); insert into results values ('and can''t apply', false, 'ran'); exception when others then insert into results values ('and can''t apply', sqlerrm like 'This brief is for%', sqlerrm); end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'blc-c@test.dev', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
select (select x from jsonb_array_elements(public.open_briefs()) x where x ->> 'id' = :'camp') as ob \gset
insert into results select 'Without Instagram, she''s told to connect it', :'ob'::jsonb -> 'fit' -> 'misses' ->> 0 like '%connect Instagram%', (:'ob'::jsonb -> 'fit')::text;
reset role;

-- Tracked links: a collab whose brief has a product link gets one by itself.
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand, brief_details, contact_email, contact_name)
select 1, b.id, '', 'live', 20000, false, '{"link": "https://glowrules.in/serum", "promo": "NIVY15"}', 'isha@glowrules.in', 'Isha'
from public.brands b join public.brand_members m on m.brand_id = b.id where m.profile_id = :'b_uid' and b.creator_id = 1 limit 1;
select id as k_id, code as k_code from public.collabs where creator_id = 1 and contact_email = 'isha@glowrules.in' \gset
select slug as l_slug, target as l_target, promo_code as l_promo from public.collab_links where collab_id = :'k_id' \gset
insert into results select 'The brief''s link becomes a tracked link', :'l_target' = 'https://glowrules.in/serum' and :'l_promo' = 'NIVY15', :'l_slug';
set local role anon;
select public.link_go(:'l_slug') as go1 \gset
select public.link_go(:'l_slug') as go2 \gset
reset role;
insert into results select 'Opening it goes to the product', :'go1' = 'https://glowrules.in/serum', null;
insert into results select 'Taps are counted by day', (select clicks = 2 from public.collab_link_days where link_id = (select id from public.collab_links where slug = :'l_slug')), null;
select set_config('request.jwt.claims', json_build_object('email', 'blcbrand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role authenticated;
select coalesce(public.brand_link(:'k_code')::text, '{}') as bl \gset
insert into results select 'The brand sees taps this week and by day', (:'bl'::jsonb ->> 'week')::int = 2 and jsonb_array_length(:'bl'::jsonb -> 'days') = 14 and :'bl'::jsonb ->> 'short' like '%/go/%', null;
reset role;
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand, contact_email)
select 1, b.id, '', 'confirmed', 10000, false, 'isha@glowrules.in' from public.brands b join public.brand_members m on m.brand_id = b.id where m.profile_id = :'b_uid' and b.creator_id = 1 limit 1;
select code as k2_code from public.collabs where creator_id = 1 and stage = 'confirmed' and contact_email = 'isha@glowrules.in' \gset
set local role authenticated;
select public.brand_link_set(:'k2_code', 'https://glowrules.in/oil', 'ISHA10') as bl2 \gset
insert into results select 'The brand can add the link itself', :'bl2'::jsonb ->> 'has_target' = 'true' and :'bl2'::jsonb ->> 'promo_code' = 'ISHA10', null;
do $$ begin perform public.brand_link_set((select code from public.collabs where stage = 'confirmed' and contact_email = 'isha@glowrules.in' limit 1), 'javascript:alert(1)', ''); insert into results values ('Only real web links', false, 'ran'); exception when others then insert into results values ('Only real web links', true, null); end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'blcother@test.dev', 'sub', :'o_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Another login sees no link', public.brand_link(:'k_code') is null, null;
reset role;

-- Case studies: Nivy writes one about the live collab, asks the brand, the brand approves it.
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.case_study_save(:'k_id'::uuid, jsonb_build_object('title', 'How a Kannada serum reel reached 1.2L people for Glow', 'summary', 'A 30-second monsoon routine that got 1.2L views and 2 taps on the link.',
  'goal', 'Glow wanted Bengaluru women to try its new serum.', 'made', 'A monsoon skincare reel in Kannada.', 'results', '1.2L views.',
  'highlights', jsonb_build_array(jsonb_build_object('label', 'Views', 'value', '1.2L')))) as cs \gset
insert into results select 'She saves a draft', :'cs'::jsonb ->> 'status' = 'draft', null;
select public.case_study_ask(:'k_id'::uuid) ->> 'status' as st \gset
insert into results select 'and asks the brand', :'st' = 'asked', :'st';
reset role;
insert into results select 'The brand gets an email', exists (select 1 from public.outbox where kind = 'case_study_ask' and to_email = 'isha@glowrules.in'), null;

-- Not on her page until the brand says yes.
select set_config('request.jwt.claims', '{}', true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role anon;
insert into results select 'Not on her page before the OK', jsonb_array_length(public.page_extras() -> 'cases') = 0, null;
reset role;
select set_config('request.headers', '{}', true);

select set_config('request.jwt.claims', json_build_object('email', 'blcother@test.dev', 'sub', :'o_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Another login can''t see it', public.brand_case_study(:'k_code') is null, null;
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'blcbrand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role authenticated;
insert into results select 'The brand sees it', public.brand_case_study(:'k_code') ->> 'status' = 'asked', null;
do $$ begin perform public.brand_case_study_answer((select code from public.collabs where contact_email = 'isha@glowrules.in' and stage = 'live' limit 1), false, ''); insert into results values ('Changes need a note', false, 'ran'); exception when others then insert into results values ('Changes need a note', true, null); end $$;
select public.brand_case_study_answer(:'k_code', true, '', 'Our best creator collab this season.', 'Isha, Founder') ->> 'status' as st2 \gset
insert into results select 'The brand approves it', :'st2' = 'published', :'st2';
reset role;
insert into results select 'She hears about it', exists (select 1 from public.outbox where kind = 'case_study_answer' and creator_id = 1 and (payload ->> 'ok')::boolean), null;

select set_config('request.jwt.claims', '{}', true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role anon;
select public.page_extras() -> 'cases' as pc \gset
insert into results select 'Now it''s on her page, with the brand''s line', jsonb_array_length(:'pc'::jsonb) = 1 and :'pc'::jsonb -> 0 ->> 'quote' = 'Our best creator collab this season.', :'pc';
reset role;
select set_config('request.headers', '{}', true);

-- Editing it takes it off her page until the brand approves again.
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.case_study_save(:'k_id'::uuid, jsonb_build_object('title', 'How a Kannada serum reel reached 1.3L people for Glow', 'summary', 'A 30-second monsoon routine that got 1.3L views.',
  'goal', 'Glow wanted Bengaluru women to try its new serum.', 'made', 'A monsoon skincare reel in Kannada.', 'results', '1.3L views.',
  'highlights', jsonb_build_array(jsonb_build_object('label', 'Views', 'value', '1.3L')))) ->> 'status' as st3 \gset
reset role;
insert into results select 'Editing sends it back for an OK', :'st3' = 'draft', :'st3';
select set_config('request.jwt.claims', '{}', true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role anon;
insert into results select 'and takes it off her page meanwhile', jsonb_array_length(public.page_extras() -> 'cases') = 0, null;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
