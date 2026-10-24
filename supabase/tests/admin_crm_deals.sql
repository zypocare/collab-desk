-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/admin_crm_deals.sql
-- The admin CRM, part 2 (migration 149): Deals lists, collab/brand/campaign records, reading messages
-- (with a reason, logged) and the logged actions. Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
select set_config('request.headers', '{}', true);

select gen_random_uuid() as admin_uid, gen_random_uuid() as x_uid, gen_random_uuid() as b_uid \gset
insert into public.app_admins (email) values ('deals-admin@test.dev') on conflict do nothing;
insert into auth.users (id, email, aud, role) values (:'admin_uid', 'deals-admin@test.dev', 'authenticated', 'authenticated'), (:'b_uid', 'deals-brand@test.dev', 'authenticated', 'authenticated'), (:'x_uid', 'deals-stranger@test.dev', 'authenticated', 'authenticated');

-- A company in creator 1's studio with a login, one collab with a quote, an invoice, a message, a post;
-- a campaign, a retainer, a pitch and an unmatched bank alert.
insert into public.brands (name, creator_id, gstin) values ('Saffron Deals Co', 1, '29ABCDE1234F1Z5') returning id as br \gset
insert into public.brand_members (profile_id, brand_id, owner) values (:'b_uid', :'br', :'b_uid');
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand, contact_email) values (1, :'br', '', 'confirmed', 42000, false, 'deals-brand@test.dev') returning id as col, code as col_code \gset
insert into public.quotes (collab_id, creator_id, version, status, total, items) values (:'col', 1, 1, 'accepted', 42000, '[]');
insert into public.invoices (collab_id, creator_id, issue_date, items, status, tds_rate, tds_section, auto_remind)
values (:'col', 1, current_date, '[{"description":"Reel","qty":1,"rate":42000}]', 'sent', 10, '194J', true) returning id as inv, number as inv_no \gset
insert into public.collab_messages (collab_id, sender, author, body) values (:'col', 'brand', :'b_uid', 'Can you move the live date to Friday?');
insert into public.scheduled_posts (collab_id, creator_id, file_path, publish_at, status) values (:'col', 1, 'x/reel.mp4', now() + interval '3 days', 'scheduled') returning id as post \gset
insert into public.brand_campaigns (owner, name, status, open, budget_total) values (:'b_uid', 'Deals Diwali edit', 'sent', true, 300000) returning id as camp \gset
insert into public.retainers (creator_id, brand_id, title, fee, months, active) values (1, :'br', 'Monthly reels', 30000, 6, true) returning id as ret \gset
insert into public.pitches (creator_id, brand_name, email, status, auto_follow) values (1, 'Deals Pitch Brand', 'hello@pitchbrand.test', 'sent', true) returning id as pit \gset
insert into public.bank_alerts (creator_id, hash, amount, sender, status) values (1, 'deals-test-hash', 999, 'UNKNOWN PAYER', 'unmatched') returning id as alert \gset

-- Nobody but an admin gets in.
select set_config('request.jwt.claims', json_build_object('email', 'deals-stranger@test.dev', 'sub', :'x_uid', 'role', 'authenticated')::text, true);
select set_config('my.col', :'col', true), set_config('my.post', :'post', true), set_config('my.alert', :'alert', true);
set local role authenticated;
do $$ begin perform public.admin_list('collabs'); insert into results values ('A non-admin can''t list collabs', false, 'ran'); exception when others then insert into results values ('A non-admin can''t list collabs', true, null); end $$;
do $$ begin perform public.admin_collab(current_setting('my.col')::uuid); insert into results values ('Nor open a collab', false, 'ran'); exception when others then insert into results values ('Nor open a collab', true, null); end $$;
do $$ begin perform public.admin_collab_messages(current_setting('my.col')::uuid, 'curious'); insert into results values ('Nor read its messages', false, 'ran'); exception when others then insert into results values ('Nor read its messages', true, null); end $$;
do $$ begin perform public.admin_collab_lifecycle(current_setting('my.col')::uuid, 'cancel', 'x'); insert into results values ('Nor cancel it', false, 'ran'); exception when others then insert into results values ('Nor cancel it', true, null); end $$;
reset role;
insert into results select 'Signed out can''t call them', not has_function_privilege('anon', 'public.admin_collab(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.admin_collab_messages(uuid, text)', 'execute') and not has_function_privilege('anon', 'public.admin_campaign_close(uuid, text)', 'execute'), null;

-- Every Deals list answers, and finds the test records.
select set_config('request.jwt.claims', json_build_object('email', 'deals-admin@test.dev', 'sub', :'admin_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into results select 'Every Deals list loads', (select bool_and((public.admin_list(k) ->> 'total') is not null)
  from unnest(array['brands', 'collabs', 'quotes', 'invoices', 'payments', 'drafts', 'posts', 'campaigns', 'pools', 'retainers', 'pitches']) k), null;
insert into results select 'The brand list finds the company', (public.admin_list('brands', 'saffron deals') -> 'rows' -> 0 ->> 'collabs')::int = 1, null;
insert into results select 'The collab list filters by stage and sorts by fee', (select bool_and(x ->> 'stage' = 'confirmed') from jsonb_array_elements(public.admin_list('collabs', '', '{"stage": "confirmed"}', 'fee', true) -> 'rows') x), null;
insert into results select 'Collabs default to newest first', (public.admin_list('collabs', '', '{}', '', true, 1) -> 'rows' -> 0 ->> 'id') = :'col', null;
insert into results select 'The invoice list shows what''s outstanding', (public.admin_list('invoices', :'inv_no') -> 'rows' -> 0 ->> 'outstanding')::numeric > 0, null;
insert into results select 'Payments list the unmatched alert', (public.admin_list('payments', 'unknown payer', '{"status": "unmatched"}') ->> 'total')::int = 1, null;
insert into results select 'Posts list the scheduled post', (public.admin_list('posts', :'col_code') ->> 'total')::int = 1, null;
insert into results select 'Campaigns list the open brief', (public.admin_list('campaigns', 'deals diwali', '{"open": true}') ->> 'total')::int = 1, null;
insert into results select 'Retainers and pitches list theirs', (public.admin_list('retainers', 'monthly reels') ->> 'total')::int = 1 and (public.admin_list('pitches', 'deals pitch') ->> 'total')::int = 1, null;

-- The collab page: its whole paper trail, message counts but no message text.
select public.admin_collab(:'col') as c \gset
insert into results select 'The collab page has its parties', :'c'::jsonb -> 'brand' ->> 'name' = 'Saffron Deals Co' and (:'c'::jsonb -> 'creator' ->> 'id')::int = 1
  and jsonb_array_length(:'c'::jsonb -> 'logins') = 1, null;
insert into results select 'And its quote, invoice and post', jsonb_array_length(:'c'::jsonb -> 'quotes') = 1 and jsonb_array_length(:'c'::jsonb -> 'invoices') = 1 and jsonb_array_length(:'c'::jsonb -> 'posts') = 1, null;
insert into results select 'Messages are counted, not shown', (:'c'::jsonb -> 'messages' ->> 'n')::int = 1 and :'c'::jsonb::text not like '%move the live date%', null;

-- Reading messages needs a reason, and is logged with it.
do $$ begin perform public.admin_collab_messages(current_setting('my.col')::uuid, ''); insert into results values ('Reading messages needs a reason', false, 'ran'); exception when others then insert into results values ('Reading messages needs a reason', true, null); end $$;
select public.admin_collab_messages(:'col', 'Safety report about this brand') as msgs \gset
insert into results select 'With a reason, the messages come back', :'msgs'::jsonb -> 0 ->> 'body' = 'Can you move the live date to Friday?' and :'msgs'::jsonb -> 0 ->> 'author' = 'deals-brand@test.dev', null;
reset role;
insert into results select 'Reading is in the audit trail', exists (select 1 from public.admin_audit where action = 'read_messages' and kind = 'collab' and record = :'col'
  and reason = 'Safety report about this brand' and admin = 'deals-admin@test.dev'), null;

-- Pause, resume and cancel, each logged; a scheduled post goes on hold with the pause.
set local role authenticated;
do $$ begin perform public.admin_collab_lifecycle(current_setting('my.col')::uuid, 'pause', ''); insert into results values ('Pausing needs a reason', false, 'ran'); exception when others then insert into results values ('Pausing needs a reason', true, null); end $$;
select public.admin_collab_lifecycle(:'col', 'pause', 'Brand under review') ->> 'stage' as st \gset
insert into results select 'Paused', :'st' = 'paused', :'st';
reset role;
insert into results select 'Its post went on hold', (select status from public.scheduled_posts where id = :'post') = 'on_hold', null;
insert into results select 'The reason shows as Miracle''s', (select lifecycle_reason from public.collabs where id = :'col') = 'Miracle: Brand under review', null;
set local role authenticated;
select public.admin_collab_lifecycle(:'col', 'resume', 'Review done') ->> 'stage' as st2 \gset
insert into results select 'Resumed at its stage', :'st2' = 'confirmed', :'st2';
do $$ begin perform public.admin_collab_lifecycle(current_setting('my.col')::uuid, 'resume', 'again'); insert into results values ('Can''t resume what isn''t paused', false, 'ran'); exception when others then insert into results values ('Can''t resume what isn''t paused', true, null); end $$;

-- Invoice reminders and cancelling a post are logged on the collab.
select jsonb_array_length(public.admin_invoice_reminders(:'inv', false, 'Brand asked for time') -> 'invoices') as ir \gset
reset role;
insert into results select 'Reminders off', not (select auto_remind from public.invoices where id = :'inv'), null;
set local role authenticated;
select public.admin_post_cancel(:'post', 'Wrong video') is not null as pc \gset
reset role;
insert into results select 'The post is cancelled', (select status from public.scheduled_posts where id = :'post') = 'cancelled', null;
set local role authenticated;
do $$ begin perform public.admin_post_cancel((select current_setting('my.post'))::uuid, 'again'); insert into results values ('A cancelled post can''t be cancelled again', false, 'ran'); exception when others then insert into results values ('A cancelled post can''t be cancelled again', true, null); end $$;
select public.admin_collab(:'col') as c2 \gset
insert into results select 'The collab log has every action', (select count(*) from jsonb_array_elements(:'c2'::jsonb -> 'audit')) = 5, (select count(*) from jsonb_array_elements(:'c2'::jsonb -> 'audit'))::text;
insert into results select 'They show on its timeline', (select count(*) from jsonb_array_elements(:'c2'::jsonb -> 'timeline') e where e ->> 'kind' = 'admin') >= 5, null;

-- Campaigns, retainers, pitches, bank alerts.
do $$ begin perform public.admin_campaign_close((select id from public.brand_campaigns where name = 'Deals Diwali edit'), ''); insert into results values ('Closing a brief needs a reason', false, 'ran'); exception when others then insert into results values ('Closing a brief needs a reason', true, null); end $$;
select public.admin_campaign_close(:'camp', 'Asking creators to pay') ->> 'open' as op \gset
insert into results select 'The brief is closed', :'op' = 'false', :'op';
insert into results select 'The campaign page has its log', jsonb_array_length(public.admin_campaign(:'camp') -> 'audit') = 1, null;
select public.admin_retainer_set(:'ret', false, 'Brand stopped paying') ->> 'active' as ra \gset
select public.admin_pitch_stop(:'pit', 'Brand asked not to be emailed') ->> 'auto_follow' as pa \gset
select public.admin_bank_alert_ignore(:'alert', 'Personal transfer') ->> 'status' as ba \gset
insert into results select 'Retainer paused, pitch follow-ups off, alert set aside', :'ra' = 'false' and :'pa' = 'false' and :'ba' = 'ignored', null;
do $$ begin perform public.admin_bank_alert_ignore((select current_setting('my.alert'))::uuid, 'again'); insert into results values ('Only unmatched alerts can be set aside', false, 'ran'); exception when others then insert into results values ('Only unmatched alerts can be set aside', true, null); end $$;
reset role;
insert into results select 'They''re logged on the creator', (select count(*) from public.admin_audit where kind = 'creator' and record = '1' and action in ('retainer_off', 'pitch_followups_off', 'bank_alert_ignored')) = 3, null;

-- The brand page masks tax ids; search links invoices to their collab.
set local role authenticated;
select public.admin_brand(:'br') as b \gset
insert into results select 'The brand page masks the GSTIN', :'b'::jsonb ->> 'gstin' = '29AB•••••••1Z5', :'b'::jsonb ->> 'gstin';
insert into results select 'And lists its collab and login', jsonb_array_length(:'b'::jsonb -> 'collabs') = 1 and jsonb_array_length(:'b'::jsonb -> 'logins') = 1, null;
insert into results select 'An invoice found by search knows its collab', (select i ->> 'collab' from jsonb_array_elements(public.admin_search(:'inv_no')) g, jsonb_array_elements(g -> 'items') i where g ->> 'kind' = 'invoice' limit 1) = :'col', null;
insert into results select 'Notes can go on a campaign', jsonb_array_length(public.admin_note_add('campaign', :'camp', 'Watch this workspace') -> 'notes') = 1, null;
insert into results select 'The dashboard feed links to collabs', not exists (select 1 from jsonb_array_elements(public.admin_dashboard(7) -> 'feed') e where e ->> 'kind' = 'collab' and e ->> 'link' <> 'collab'), null;
reset role;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
