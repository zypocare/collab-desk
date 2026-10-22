-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/brand_inbox.sql
-- Requests and messages across creators, brand alert settings and open-brief alerts (migration 121).
-- Runs in one transaction and rolls back. Each check prints PASS or FAIL.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
select set_config('request.headers', '{}', true);
select lower(creator_email) as cr_email, slug as cr_slug from public.creator_settings where id = 1 \gset
update public.creator_settings set listed = true, brief_alerts = true, offered_kinds = '{Reel,Story}', niche = 'Skincare, Lifestyle', show_rates = true, rates = rates || '{"Reel": 18000}' where id = 1;

-- A brand with a company for creator 1 and a request with a quote and a message.
select gen_random_uuid() as b_uid \gset
insert into auth.users (id, email, aud, role) values (:'b_uid', 'inboxbrand@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'inboxbrand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', :'cr_slug')::text, true);
set local role authenticated;
select public.brand_signup('Dew Labs', 'Skincare', '', '@dewlabs', 'Nia', 'Founder', '', 'Pune', '{}', '', '') is not null as s1 \gset
select public.brand_from_profile() is not null as s2 \gset
reset role;
select set_config('request.headers', '{}', true);
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand)
select 1, b.id, '', 'negotiating', 20000, false from public.brands b join public.brand_members m on m.brand_id = b.id where m.profile_id = :'b_uid' and b.creator_id = 1 limit 1;
select id as col, code as col_code from public.collabs where brand_id in (select brand_id from public.brand_members where profile_id = :'b_uid') limit 1 \gset
insert into public.quotes (collab_id, creator_id, version, status, total, items) values (:'col', 1, 1, 'sent', 25000, '[]');
insert into public.collab_messages (collab_id, creator_id, sender, body) values (:'col', 1, 'creator', 'Sent the quote');

-- 1. One list and one inbox, from Miracle's own address (no creator page open)
select set_config('request.jwt.claims', json_build_object('email', 'inboxbrand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select x as row from jsonb_array_elements(public.brand_requests_all()) x limit 1 \gset
insert into results select 'The list has the request with the creator', (:'row'::jsonb -> 'creator' ->> 'id') = '1', :'row';
insert into results select 'A sent quote waits on the brand', (:'row'::jsonb ->> 'needs') = 'quote', null;
insert into results select 'Unread messages are counted', (:'row'::jsonb ->> 'unread') = '1', null;
insert into results select 'The latest message comes along', (:'row'::jsonb -> 'last' ->> 'body') = 'Sent the quote', null;
insert into results select 'The brand reads the chat without the creator''s page open', (select count(*) = 1 from public.collab_messages where collab_id = :'col'), null;
insert into public.collab_messages (collab_id, sender, body, author) values (:'col', 'brand', 'Looks good', :'b_uid');
select public.mark_thread_read(:'col'::uuid);
reset role;
insert into results select 'and can reply', exists (select 1 from public.collab_messages where collab_id = :'col' and sender = 'brand' and creator_id = 1), null;
insert into results select 'Reading the chat marks it read', exists (select 1 from public.collab_reads where collab_id = :'col' and side = 'brand'), null;
set local role authenticated;

-- 2. Alert settings
insert into results select 'Alerts start with sensible defaults', (public.brand_alerts_get() ->> 'briefs') = 'digest' and (public.brand_alerts_get() ->> 'quiet')::boolean, public.brand_alerts_get()::text;
insert into results select 'Settings save', (public.brand_alerts_set('{"messages": false, "briefs": "each"}') ->> 'messages') = 'false', null;
insert into results select 'A bad choice is refused', false, null;
do $$ begin perform public.brand_alerts_set('{"briefs": "hourly"}'); exception when others then update results set ok = true, detail = sqlerrm where check_name = 'A bad choice is refused'; end $$;
insert into public.brand_push_subscriptions (endpoint, p256dh, auth, device) values ('https://push.test/x', 'k', 'a', 'Android');
insert into results select 'A brand adds this phone', (select count(*) = 1 from public.brand_push_subscriptions), null;
insert into results select 'Only the server finds who to alert', not has_function_privilege('authenticated', 'public.brand_push_target(text)', 'execute'), null;
reset role;
insert into results select 'The server finds the brand and its settings', (public.brand_push_target('inboxbrand@test.dev') -> 'prefs' ->> 'briefs') = 'each', null;

-- 3. Open-brief alerts
select set_config('request.jwt.claims', json_build_object('email', 'inboxbrand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.campaign_save(jsonb_build_object('name', 'Dew launch', 'brief', jsonb_build_object('type', 'paid', 'fee', 0,
  'deliverables', jsonb_build_array(jsonb_build_object('kind', 'Reel', 'qty', 1)))))::text as camp \gset
select public.campaign_open(:'camp'::uuid, true, current_date + 7, 10000, 25000) is not null as opened \gset
reset role;
insert into results select 'A creator who fits hears about the brief', exists (select 1 from public.outbox where kind = 'brief_fit' and creator_id = 1 and payload ->> 'campaign' = 'Dew launch'), null;
insert into results select 'and only once', (select count(*) = 1 from public.brief_alert_log where campaign_id = :'camp'::uuid and creator_id = 1), null;

select set_config('request.jwt.claims', json_build_object('email', :'cr_email', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.brief_apply(:'camp'::uuid, 18000, 'Fits my audience') is not null as applied \gset
reset role;
insert into results select 'The brand on "each" hears about the application', exists (select 1 from public.outbox where kind = 'brief_application' and to_email = 'inboxbrand@test.dev' and (payload ->> 'rate')::numeric = 18000), null;

select set_config('request.jwt.claims', json_build_object('email', 'inboxbrand@test.dev', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.brand_alerts_set('{"briefs": "digest"}') is not null as dg \gset
select x ->> 'application' as app from jsonb_array_elements(public.campaign_applications_list(:'camp'::uuid)) x limit 1 \gset
select public.application_set(:'app'::uuid, 'shortlist') is null as sh \gset
reset role;
insert into results select 'A shortlisted creator is told', exists (select 1 from public.outbox where kind = 'brief_shortlisted' and creator_id = 1 and payload ->> 'campaign' = 'Dew launch'), null;
select private.brief_digest() as digests \gset
insert into results select 'The 6 pm summary goes to brands on "6 pm"', :digests >= 1 and exists (select 1 from public.outbox where kind = 'brief_digest' and to_email = 'inboxbrand@test.dev'), :'digests';

-- A creator who turned brief alerts off hears nothing.
update public.creator_settings set brief_alerts = false where id = 1;
update public.brand_campaigns set open = false where id = :'camp'::uuid;
delete from public.brief_alert_log where campaign_id = :'camp'::uuid;
delete from public.campaign_applications where campaign_id = :'camp'::uuid;
delete from public.outbox where kind = 'brief_fit';
update public.brand_campaigns set open = true where id = :'camp'::uuid;
insert into results select 'Brief alerts can be turned off', not exists (select 1 from public.outbox where kind = 'brief_fit' and creator_id = 1), null;

-- The schedule exists.
insert into results select 'The 6 pm summary is scheduled', exists (select 1 from cron.job where jobname = 'brief-digest'), null;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
