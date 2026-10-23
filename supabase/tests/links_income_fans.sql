-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/links_income_fans.sql
-- Links on her page, other income and the fan email list (migration 134). Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
create temp table caught (k text primary key, msg text) on commit drop;
grant all on caught to authenticated, anon;
select slug as cr_slug, lower(creator_email) as cr_email from public.creator_settings where id = 1 \gset
select slug as c2_slug, lower(creator_email) as c2_email from public.creator_settings where id = 2 \gset
select set_config('request.headers', '{}', true);
-- Start from nothing for these two creators (undone at the end with everything else).
delete from public.page_links where creator_id in (1, 2);
delete from public.other_income where creator_id in (1, 2);
delete from public.fans where creator_id in (1, 2);
delete from public.fan_broadcasts where creator_id in (1, 2);
update public.creator_settings set fan_list_on = false where id = 1;

-- 1. Links ----------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.page_links (title, url, position) values ('My YouTube', 'https://youtube.com/@nivy', 1), ('Old shop', 'https://shop.example.in', 2);
update public.page_links set active = false where title = 'Old shop';
insert into results select 'She adds links (they belong to her)', (select count(*) = 2 from public.page_links), null;
do $$ begin insert into public.page_links (title, url) values ('Bad', 'javascript:alert(1)'); exception when others then insert into caught values ('badurl', sqlerrm); end $$;
insert into results select 'Only web addresses are taken', exists (select 1 from caught where k = 'badurl'), null;
select id as yt from public.page_links where title = 'My YouTube' \gset
select id as old from public.page_links where title = 'Old shop' \gset
reset role;

select set_config('request.jwt.claims', json_build_object('email', :'c2_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Another creator can''t see them', not exists (select 1 from public.page_links where id = :'yt'), null;
reset role;

select set_config('request.jwt.claims', '{}', true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role anon;
select public.page_extras() as px \gset
insert into results select 'Her page lists the shown links only', jsonb_array_length(:'px'::jsonb -> 'links') = 1 and :'px'::jsonb -> 'links' -> 0 ->> 'title' = 'My YouTube', :'px';
insert into results select 'The sign-up box is off at first', :'px'::jsonb -> 'fan_list' = 'null'::jsonb, null;
select public.link_click(:'yt');
select public.link_click(:'yt');
select public.link_click(:'old');
reset role;
insert into results select 'Taps are counted', (select clicks = 2 from public.page_links where id = :'yt'), null;
insert into results select 'A hidden link isn''t', (select clicks = 0 from public.page_links where id = :'old'), null;
select set_config('request.headers', json_build_object('x-creator', :'c2_slug')::text, true);
set local role anon;
select public.link_click(:'yt');
reset role;
insert into results select 'Another creator''s page can''t count her links', (select clicks = 2 from public.page_links where id = :'yt'), null;

-- 2. Other income ---------------------------------------------------------------------------------------
select set_config('request.headers', '{}', true);
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.other_income (source, payer, amount, tds, received_on) values ('youtube', 'Google AdSense', 18500, 0, current_date), ('affiliate', 'Amazon Associates', 4200, 210, current_date);
insert into results select 'She adds other income', (select sum(amount) = 22700 from public.other_income), null;
do $$ begin insert into public.other_income (source, payer, amount) values ('crypto', 'X', 10); exception when others then insert into caught values ('src', sqlerrm); end $$;
insert into results select 'Only known sources', exists (select 1 from caught where k = 'src'), null;
reset role;
select set_config('request.jwt.claims', json_build_object('email', :'c2_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Another creator can''t see it', not exists (select 1 from public.other_income where payer = 'Google AdSense'), null;
reset role;

-- 3. Fan list -------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{}', true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug', 'cf-connecting-ip', '203.0.113.7')::text, true);
set local role anon;
do $$ begin perform public.fan_join('a@fan.test', 'Asha'); exception when others then insert into caught values ('off', sqlerrm); end $$;
insert into results select 'No sign-ups while the box is off', exists (select 1 from caught where k = 'off'), null;
reset role;
update public.creator_settings set fan_list_on = true, fan_list_pitch = 'New videos twice a month' where id = 1;
set local role anon;
select public.page_extras() -> 'fan_list' ->> 'pitch' as pitch \gset
insert into results select 'Her page shows the box and her line', :'pitch' = 'New videos twice a month', null;
select public.fan_join('A@Fan.test ', 'Asha');
select public.fan_join('b@fan.test', '');
select public.fan_join('a@fan.test', 'Asha R');
do $$ begin perform public.fan_join('not-an-email', ''); exception when others then insert into caught values ('bademail', sqlerrm); end $$;
insert into results select 'A bad email is refused', exists (select 1 from caught where k = 'bademail'), null;
insert into results select 'Visitors can''t read the list', not exists (select 1 from public.fans), null;
reset role;
insert into results select 'Joining twice keeps one entry (lower-case)', (select count(*) = 2 from public.fans where creator_id = 1), null;
select token as tok_b from public.fans where email = 'b@fan.test' \gset

-- 20 sign-ups an hour from one address
select set_config('request.headers', json_build_object('x-creator', :'cr_slug', 'cf-connecting-ip', '198.51.100.9')::text, true);
set local role anon;
do $$ begin for i in 1..21 loop perform public.fan_join('spam' || i || '@x.test', ''); end loop; exception when others then insert into caught values ('flood', sqlerrm); end $$;
insert into results select 'One address can''t flood the list', (select msg like 'LIMIT:fan_join:%' from caught where k = 'flood'), (select msg from caught where k = 'flood');
select public.fan_unsubscribe(:'tok_b') as un \gset
insert into results select 'The leave link works without signing in', (:'un'::jsonb ->> 'ok')::boolean and :'un'::jsonb ->> 'name' is not null, :'un';
select public.fan_unsubscribe(gen_random_uuid()) as un2 \gset
insert into results select 'A wrong link says so', not (:'un2'::jsonb ->> 'ok')::boolean, null;
do $$ begin perform public.fan_broadcast_send('Hi', 'Hello'); exception when others then insert into caught values ('anonsend', sqlerrm); end $$;
insert into results select 'Visitors can''t send to the list', exists (select 1 from caught where k = 'anonsend'), null;
reset role;

-- Sending: active people only, once a day
select set_config('request.headers', '{}', true);
select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) as active_n from public.fans where unsubscribed_at is null \gset
select public.fan_broadcast_send('My new video', 'It is up: https://youtube.com/watch?v=1') as sent \gset
insert into results select 'Her email goes to everyone still on the list', (:'sent'::jsonb ->> 'sent_to')::int = :active_n, :'sent';
do $$ begin perform public.fan_broadcast_send('Again', 'Again'); exception when others then insert into caught values ('twice', sqlerrm); end $$;
insert into results select 'Only one email a day', (select msg like 'LIMIT:fan_broadcast:%' from caught where k = 'twice'), null;
reset role;
insert into results select 'The one who left gets nothing', not exists (select 1 from public.outbox where kind = 'fan_broadcast' and to_email = 'b@fan.test'), null;
insert into results select 'Each email carries its leave link token', (select bool_and(payload ->> 'token' is not null) from public.outbox where kind = 'fan_broadcast'), null;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
