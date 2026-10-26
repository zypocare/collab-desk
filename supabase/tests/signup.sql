-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/signup.sql
-- Sign-up at app.miracleapp.live: a creator without a link, approval, picking the link; a brand on its own.
-- Runs in one transaction and rolls back. Each check prints PASS or FAIL.
\set ON_ERROR_STOP 1
begin;
-- These checks are for approving creators by hand (migration 163 can approve them straight away).
update public.growth_settings set auto_approve = false where id = 1;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
select set_config('request.headers', '{}', true);

-- A new creator signs up (no link yet)
select gen_random_uuid() as c_uid \gset
insert into auth.users (id, email, aud, role) values (:'c_uid', 'newcreator@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'newcreator@test.dev', 'sub', :'c_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'A creator needs a WhatsApp number', false, null;
do $$ begin perform public.creator_signup('Riya Test', 'riya.test', '', 'Pune', '{Food}', '{English}', '10K to 50K', 'None yet', 'Instagram', ''); exception when others then update results set ok = true, detail = sqlerrm where check_name = 'A creator needs a WhatsApp number'; end $$;
insert into results select 'Sign-up without a link is pending',
  (select r ->> 'status' = 'pending' and r ->> 'slug' is null from (select public.creator_signup('Riya Test', '@Riya.Test', '+91 98765 43210', 'Pune',
    '{Food,Travel,Fitness,Tech}', '{English,Hindi}', '10K to 50K', 'None yet', 'Instagram', 'Hi') as r) x), null;
insert into results select 'The account says pending', (public.my_account() ->> 'role') = 'pending', public.my_account() ->> 'role';
insert into results select 'Only 3 niches are kept', (public.my_creator_request() ->> 'niche') = 'Food, Travel, Fitness', public.my_creator_request() ->> 'niche';
insert into results select 'A brand can''t sign up with a creator''s email', false, null;
do $$ begin perform public.brand_signup('X', '', '', '', 'Riya', '', '', '', '{}', '', ''); exception when others then update results set ok = true, detail = sqlerrm where check_name = 'A brand can''t sign up with a creator''s email'; end $$;
reset role;
select id as c_id, slug as c_placeholder from public.creator_settings where creator_email = 'newcreator@test.dev' \gset
insert into results select 'The placeholder name starts with new-', :'c_placeholder' like 'new-%', :'c_placeholder';
insert into results select 'The admins were told', exists (select 1 from public.outbox where kind = 'creator_request' and creator_id = :c_id) or not exists (select 1 from public.app_admins), null;

-- Approved: the welcome email points to app.miracleapp.live to pick a link
update public.creator_settings set status = 'active', approved_at = now() where id = :c_id;
select set_config('request.headers', json_build_object('x-creator', :'c_placeholder')::text, true);
insert into results select 'The placeholder name never opens a page', private.page_creator() is null, coalesce(private.page_creator()::text, 'null');
select set_config('request.headers', '{}', true);

select set_config('request.jwt.claims', json_build_object('email', 'newcreator@test.dev', 'sub', :'c_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Approved creator needs a link', (public.my_account() ->> 'needs_link')::boolean, public.my_account()::text;
insert into results select 'A taken or reserved link is refused', false, null;
do $$ begin perform public.choose_my_link('app'); exception when others then update results set ok = true, detail = sqlerrm where check_name = 'A taken or reserved link is refused'; end $$;
insert into results select 'A placeholder-style link is refused', not public.slug_free('new-abc'), null;
insert into results select 'Picking a free link works', (public.choose_my_link('riya-eats') ->> 'slug') = 'riya-eats', null;
insert into results select 'The link sticks', (public.choose_my_link('other-name') ->> 'slug') = 'riya-eats', null;
insert into results select 'No more link needed', not (public.my_account() ->> 'needs_link')::boolean and public.my_account() ->> 'slug' = 'riya-eats', public.my_account()::text;
reset role;
select set_config('request.headers', json_build_object('x-creator', 'riya-eats')::text, true);
insert into results select 'The chosen link opens the page', private.page_creator() = :c_id, coalesce(private.page_creator()::text, 'null');
select set_config('request.headers', '{}', true);

-- A brand signs up on its own, then sends a first request to creator 1
select gen_random_uuid() as b_uid \gset
insert into auth.users (id, email, aud, role) values (:'b_uid', 'newbrand@test.dev', 'authenticated', 'authenticated');
select slug as a_slug from public.creator_settings where id = 1 \gset
select set_config('request.jwt.claims', json_build_object('email', 'newbrand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'A bad GSTIN is refused', false, null;
do $$ begin perform public.brand_signup('Lumen Labs', 'Skincare', '', '@lumenlabs', 'Asha', 'Marketing', '', 'Pune', '{find}', '', 'ABC'); exception when others then update results set ok = true, detail = sqlerrm where check_name = 'A bad GSTIN is refused'; end $$;
insert into results select 'Brand sign-up keeps the company',
  (select r -> 'profile' ->> 'name' = 'Lumen Labs' and r ->> 'role' = 'brand' and r ->> 'full_name' = 'Asha'
   from (select public.brand_signup('Lumen Labs', 'Skincare', 'https://lumen.example', '@lumenlabs', 'Asha', 'Marketing', '+91 90000 00000', 'Pune',
     '{Find new creators}', 'Lumen Labs Pvt Ltd', '29abcde1234f1z5') as r) x), null;
insert into results select 'The brand sees only its own profile', (select count(*) = 1 from public.brand_profiles), null;
insert into results select 'Without a creator page there is nothing to copy to', false, null;
do $$ begin perform public.brand_from_profile(); exception when others then update results set ok = true, detail = sqlerrm where check_name = 'Without a creator page there is nothing to copy to'; end $$;
select set_config('request.headers', json_build_object('x-creator', :'a_slug')::text, true);
insert into results select 'First request: the company is made for this creator',
  (select r -> 'brand' ->> 'name' = 'Lumen Labs' from (select public.brand_from_profile() as r) x), null;
insert into results select 'Doing it again keeps the same company', (select public.brand_from_profile() -> 'brand' ->> 'name') = 'Lumen Labs', null;
reset role;
insert into results select 'Only one company was made', (select count(*) = 1 from public.brands where name = 'Lumen Labs'), (select count(*)::text from public.brands where name = 'Lumen Labs');
insert into results select 'The GSTIN came along', (select gstin = '29ABCDE1234F1Z5' from public.brands where name = 'Lumen Labs' and creator_id = 1), null;
select set_config('request.headers', '{}', true);

-- A brand with only its sign-up company can send a campaign; each creator gets a copy of the company
select gen_random_uuid() as k_uid \gset
insert into auth.users (id, email, aud, role) values (:'k_uid', 'campaignbrand@test.dev', 'authenticated', 'authenticated');
update public.creator_settings set listed = true where id = 1;
select set_config('request.jwt.claims', json_build_object('email', 'campaignbrand@test.dev', 'sub', :'k_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.brand_signup('Orbit Snacks', 'Food & drink', '', '@orbitsnacks', 'Kiran', 'Founder', '', 'Mumbai', '{}', '', '') is not null as signed_up \gset
select public.campaign_save(jsonb_build_object('name', 'Launch', 'brief', jsonb_build_object('deliverables', jsonb_build_array(jsonb_build_object('kind', 'Reel', 'qty', 1)))))::text as k_campaign \gset
insert into results select 'A signed-up brand can start a campaign', :'k_campaign' <> '', :'k_campaign';
insert into results select 'Sending makes the company for the creator', false, null;
do $$ begin perform public.send_campaign((select id from public.brand_campaigns where name = 'Launch' limit 1), array[1]); update results set ok = true where check_name = 'Sending makes the company for the creator'; exception when others then update results set detail = sqlerrm where check_name = 'Sending makes the company for the creator'; end $$;
reset role;
insert into results select 'The creator sees Orbit Snacks', exists (select 1 from public.brands where name = 'Orbit Snacks' and creator_id = 1), null;
select set_config('request.headers', '{}', true);

-- The brand connects its own Instagram (the server function writes these rows); creators see it as verified
insert into public.brand_ig (owner, ig_user_id, username, name, followers) values (:'k_uid', 'ig-orbit-1', 'orbitsnacks', 'Orbit Snacks', 12400);
insert into public.brand_ig_token (owner, access_token) values (:'k_uid', 'test-token');
select set_config('request.jwt.claims', json_build_object('email', 'campaignbrand@test.dev', 'sub', :'k_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'The brand sees its Instagram', (public.brand_ig_get() ->> 'username') = 'orbitsnacks', public.brand_ig_get()::text;
insert into results select 'The brand admin may connect', public.brand_ig_owner() = :'k_uid'::uuid, null;
insert into results select 'Nobody signed in reads the token', not has_table_privilege('authenticated', 'public.brand_ig_token', 'select'), null;
reset role;
select creator_email as cr_email from public.creator_settings where id = 1 \gset
select id as orbit_id from public.brands where name = 'Orbit Snacks' and creator_id = 1 \gset
select set_config('request.jwt.claims', json_build_object('email', lower(:'cr_email'), 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'The creator sees the brand as verified', (public.brand_verified(:'orbit_id') ->> 'username') = 'orbitsnacks', coalesce(public.brand_verified(:'orbit_id')::text, 'null');
insert into results select 'A creator gets no brand Instagram of their own', public.brand_ig_get() is null and public.brand_ig_owner() is null, null;
reset role;
select set_config('request.jwt.claims', json_build_object('email', 'campaignbrand@test.dev', 'sub', :'k_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.brand_ig_disconnect() is null as gone \gset
insert into results select 'Disconnecting removes it', public.brand_ig_get() is null, null;
reset role;
insert into results select 'and the token with it', not exists (select 1 from public.brand_ig_token where owner = :'k_uid'), null;

-- Anyone signed out can't sign up
select set_config('request.jwt.claims', '', true);
set local role anon;
insert into results select 'Signed-out visitors can''t call sign-up', not has_function_privilege('anon', 'public.creator_signup(text,text,text,text,text[],text[],text,text,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.brand_signup(text,text,text,text,text,text,text,text,text[],text,text)', 'execute'), null;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
