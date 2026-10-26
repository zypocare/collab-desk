-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/growth_autopilot.sql
-- Growth Autopilot (migration 163): approve mode holds emails, sending one at a time up to the daily number,
-- the follow-up, unsubscribing, joined sign-ups, auto-approval of new creators, and admin-only access. Rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
create temp table caught (k text primary key, msg text) on commit drop;
grant all on caught to authenticated, anon;
select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
update public.growth_settings set "on" = true, mode = 'approve', daily = 3, follow_up_days = 4, auto_approve = true where id = 1;

-- ================================================================== 1. Approve mode: nothing goes out by itself
insert into public.growth_leads (name, handle, email, source_url, niche, city, subject, body, status, send_after)
select 'Creator ' || g, 'growthc' || g, 'growthc' || g || '@creator.test', 'https://example.org/kit', 'Food', 'Pune', 'hello ' || g, 'Hi there, body ' || g, 'ready', now() - interval '1 minute'
from generate_series(1, 5) g;
select private.growth_send_due(true) as n0 \gset
insert into results select 'Approve mode: waiting creators are never emailed', :n0 = 0 and not exists (select 1 from public.outbox where kind = 'growth_invite'), null;

-- Approved: one at a time, up to the daily number.
update public.growth_leads set status = 'approved' where handle like 'growthc%';
select private.growth_send_due(true) + private.growth_send_due(true) + private.growth_send_due(true) + private.growth_send_due(true) as n1 \gset
insert into results select 'Approved: one email per run, and no more than the daily 3', :n1 = 3 and (select count(*) = 3 from public.outbox where kind = 'growth_invite'), :'n1';
insert into results select 'The email carries the link, an unsubscribe and the sender',
  (select payload ->> 'link' like 'https://app.miracleapp.live/signup?as=creator&g=%' and payload ->> 'unsubscribe' like 'https://app.miracleapp.live/unsubscribe?g=%'
     and payload ->> 'sender_name' = 'Team Miracle' and payload ->> 'reply_to' = 'support@miracleapp.live' from public.outbox where kind = 'growth_invite' limit 1), null;
insert into results select 'Outside 10 AM to 6 PM the job waits', case when extract(hour from now() at time zone 'Asia/Kolkata') between 10 and 17 then true else private.growth_send_due() = 0 end, null;

-- ================================================================== 2. Follow-up, unsubscribe, joined
update public.growth_leads set sent_at = now() - interval '5 days', follow_after = now() - interval '1 hour', followed_at = null where status = 'sent';
update public.growth_leads set status = 'skipped' where status = 'approved';
select token as t1 from public.growth_leads where status = 'sent' order by email limit 1 \gset
select token as t2 from public.growth_leads where status = 'sent' order by email offset 1 limit 1 \gset
-- One unsubscribes (signed out), one opens the link.
set local role anon;
select public.growth_unsubscribe(:'t1') as u1 \gset
select public.growth_seen(:'t2');
reset role;
insert into results select 'Unsubscribing works signed out and goes on the never-email list',
  (:'u1'::jsonb ->> 'ok')::boolean and exists (select 1 from public.growth_suppress s join public.growth_leads l on s.email = lower(l.email) where l.token = :'t1'), :'u1';
select private.growth_send_due(true) as f1 \gset
insert into results select 'One follow-up, only to who didn''t click or unsubscribe',
  (select count(*) = 1 from public.growth_leads where status = 'followed') and (select status = 'unsubscribed' from public.growth_leads where token = :'t1')
  and (select status = 'sent' and clicked_at is not null from public.growth_leads where token = :'t2')
  and (select payload ->> 'subject' like 'Re: %' and (payload ->> 'follow')::boolean from public.outbox where kind = 'growth_invite' order by id desc limit 1), null;

-- ================================================================== 3. Sign-up: joined and approved straight away
select email as jemail from public.growth_leads where token = :'t2' \gset
select gen_random_uuid() as j_uid \gset
insert into auth.users (id, email, aud, role) values (:'j_uid', :'jemail', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', :'jemail', 'sub', :'j_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.creator_signup('Creator Two', 'growthc_new', '9876543210', 'Pune', '{Food}', '{English}', '10k–50k', '1–5', 'Email', '') as su \gset
reset role;
insert into results select 'A creator who signs up is approved straight away', (select status = 'active' and approved_at is not null from public.creator_settings where lower(creator_email) = :'jemail'), null;
insert into results select '... gets the "you''re approved" email', exists (select 1 from public.outbox where kind = 'creator_approved' and lower(to_email) = :'jemail'), null;
insert into results select '... and is on Creator Pro', (select private.plan_code('creator', s.id::text) = 'creator_pro' from public.creator_settings s where lower(s.creator_email) = :'jemail'), null;
insert into results select '... gets the founding offer: Creator Pro for a year', exists (select 1 from public.billing_subscriptions b join public.creator_settings s on b.subject = s.id::text where lower(s.creator_email) = :'jemail' and b.note like 'Founding creator%' and b.ends_at > now() + interval '360 days'), null;
insert into results select '... and the lead she came from is marked joined', (select status = 'joined' and joined_at is not null from public.growth_leads where token = :'t2'), null;

-- Auto-approval off: they wait as before.
select set_config('request.jwt.claims', '{}', true);
update public.growth_settings set auto_approve = false where id = 1;
select gen_random_uuid() as k_uid \gset
insert into auth.users (id, email, aud, role) values (:'k_uid', 'manual@creator.test', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'manual@creator.test', 'sub', :'k_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.creator_signup('Manual One', 'growthmanual', '9876543211', 'Pune', '{Food}', '{English}', '10k–50k', '1–5', 'Email', '') as su2 \gset
reset role;
insert into results select 'With auto-approval off, a sign-up waits for an admin', (select status = 'pending' from public.creator_settings where creator_email = 'manual@creator.test'), null;
insert into results select '... and someone not invited gets no founding year', not exists (select 1 from public.billing_subscriptions b join public.creator_settings s on b.subject = s.id::text where s.creator_email = 'manual@creator.test' and b.note like 'Founding creator%'), null;

-- ================================================================== 4. Admin only
select set_config('request.jwt.claims', json_build_object('email', 'manual@creator.test', 'sub', :'k_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.admin_growth(); exception when others then insert into caught values ('panel', sqlerrm); end $$;
do $$ begin perform public.admin_growth_settings('{"on": false}'); exception when others then insert into caught values ('set', sqlerrm); end $$;
do $$ begin perform count(*) from public.growth_leads; exception when others then insert into caught values ('read', sqlerrm); end $$;
reset role;
insert into results select 'Only admins see or change the Growth Autopilot, nobody reads its tables', (select count(*) = 3 from caught where k in ('panel', 'set', 'read')), (select string_agg(k, ',') from caught);
insert into results select 'Anyone can unsubscribe or open the link, nothing more', has_function_privilege('anon', 'public.growth_unsubscribe(text)', 'execute') and not has_function_privilege('anon', 'public.admin_growth()', 'execute'), null;

-- The admin's view and auto mode.
insert into public.growth_leads (name, email, status) values ('Late one', 'late@creator.test', 'ready');
select set_config('request.jwt.claims', '{}', true);
insert into public.app_admins (email) values ('boss@growth.test') on conflict do nothing;
select gen_random_uuid() as a_uid \gset
insert into auth.users (id, email, aud, role) values (:'a_uid', 'boss@growth.test', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'boss@growth.test', 'sub', :'a_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_growth_settings('{"mode": "auto", "daily": 25, "niches": ["Beauty", " Fashion "], "cities": []}') as g1 \gset
reset role;
insert into results select 'Switching to auto queues what was waiting, and the settings save',
  (select status = 'approved' from public.growth_leads where email = 'late@creator.test') and :'g1'::jsonb -> 'settings' ->> 'mode' = 'auto'
  and (:'g1'::jsonb -> 'settings' ->> 'daily')::int = 25 and :'g1'::jsonb -> 'settings' -> 'niches' = '["Beauty", "Fashion"]'::jsonb and :'g1'::jsonb -> 'settings' -> 'cities' = '[]'::jsonb,
  :'g1'::jsonb -> 'settings' ->> 'niches';
insert into results select 'The panel counts what happened', (:'g1'::jsonb -> 'counts' ->> 'joined')::int = 1 and (:'g1'::jsonb -> 'counts' ->> 'unsubscribed')::int = 1 and (:'g1'::jsonb -> 'counts' ->> 'clicked')::int = 1, :'g1'::jsonb ->> 'counts';

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
