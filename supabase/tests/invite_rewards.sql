-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/invite_rewards.sql
-- Invite and earn (migration 162): claiming a creator's link at sign-up, the month of Pro when a creator is
-- approved or a brand sends its first request, the yearly cap, and who can see what. Rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
create temp table caught (k text primary key, msg text) on commit drop;
grant all on caught to authenticated, anon;
select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);

-- The creator who invites (on the free plan, so the month is easy to see).
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen, niche)
values ('host@invite.test', 'invitehost', 'invitehost', 'Asha Host', 'IH', 'IH', 'active', true, 'Food') returning id as hid \gset
update public.billing_subscriptions set status = 'ended', ends_at = now() - interval '1 day' where subject_kind = 'creator' and subject = :'hid'::text;

-- ================================================================== 1. A creator joins with her link
select gen_random_uuid() as c_uid \gset
insert into auth.users (id, email, aud, role) values (:'c_uid', 'newcreator@invite.test', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'newcreator@invite.test', 'sub', :'c_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.referral_claim('InviteHost', 'creator', 'Meera Rao') as c1 \gset
select public.referral_claim('nobody-here', 'creator', 'x') as c2 \gset
select public.referral_claim('invitehost', 'creator', 'Meera again') as c3 \gset
reset role;
insert into results select 'A new creator claims the link (any letter case)', (:'c1'::jsonb ->> 'ok')::boolean and :'c1'::jsonb ->> 'by' = 'Asha Host', :'c1';
insert into results select 'An unknown link is turned away', :'c2'::jsonb ->> 'reason' = 'unknown', :'c2';
insert into results select 'Claiming twice keeps one invite', (select count(*) = 1 and min(name) = 'Meera Rao' from public.referrals where email = 'newcreator@invite.test'), null;
insert into results select 'No month before Miracle approves her', not exists (select 1 from public.billing_subscriptions where subject = :'hid'::text and note like 'Invite reward%'), null;

-- Approved: her account goes active.
select set_config('request.jwt.claims', '{}', true);
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen, niche)
values ('newcreator@invite.test', 'meerainv', 'meerainv', 'Meera Rao', 'MR', 'MR', 'active', true, 'Food');
insert into results select 'Once she''s approved, the host gets a month of Creator Pro',
  private.plan_code('creator', :'hid'::text) = 'creator_pro'
  and (select ends_at between now() + interval '29 days' and now() + interval '31 days' from public.billing_subscriptions where subject = :'hid'::text and note like 'Invite reward%'),
  (select note || ' until ' || ends_at from public.billing_subscriptions where subject = :'hid'::text and note like 'Invite reward%');
insert into results select 'The host is told (alert and email)', exists (select 1 from public.outbox where kind = 'invite_reward' and creator_id = :hid and payload ->> 'who' = 'Meera Rao'), null;

-- ================================================================== 2. Self and existing accounts
select set_config('request.jwt.claims', json_build_object('email', 'host@invite.test', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.referral_claim('invitehost', 'creator', 'Me') as s1 \gset
reset role;
insert into results select 'Her own link does nothing for herself', :'s1'::jsonb ->> 'reason' = 'self', :'s1';

-- ================================================================== 3. A brand joins from her invoice
select gen_random_uuid() as b_uid \gset
insert into auth.users (id, email, aud, role) values (:'b_uid', 'buyer@brandinv.test', 'authenticated', 'authenticated');
insert into public.profiles (id, email) values (:'b_uid', 'buyer@brandinv.test') on conflict do nothing;
insert into public.brand_profiles (owner, name) values (:'b_uid', 'Glow Co');
select set_config('request.jwt.claims', json_build_object('email', 'buyer@brandinv.test', 'sub', :'b_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.referral_claim('invitehost', 'brand', 'Glow Co') as b1 \gset
reset role;
insert into results select 'A new brand team claims the link', (:'b1'::jsonb ->> 'ok')::boolean, :'b1';
select ends_at as before_brand from public.billing_subscriptions where subject = :'hid'::text and note like 'Invite reward%' order by ends_at desc limit 1 \gset
insert into public.brands (creator_id, name) values (:hid, 'Glow Co') returning id as gb \gset
insert into public.brand_members (profile_id, brand_id, owner) values (:'b_uid', :'gb', :'b_uid');
select set_config('request.headers', json_build_object('x-creator', 'invitehost')::text, true);
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand) values (:hid, :'gb', '', 'request', 5000, false);
insert into results select 'Its first request earns her another month, after the first one',
  (select count(*) = 2 from public.billing_subscriptions where subject = :'hid'::text and note like 'Invite reward%')
  and (select max(ends_at) from public.billing_subscriptions where subject = :'hid'::text and note like 'Invite reward%') > :'before_brand'::timestamptz + interval '29 days', null;
insert into public.collabs (creator_id, brand_id, code, stage, fee, notify_brand) values (:hid, :'gb', '', 'request', 6000, false);
insert into results select 'A second request earns nothing more', (select count(*) = 2 from public.billing_subscriptions where subject = :'hid'::text and note like 'Invite reward%'), null;

-- A brand that was already on Miracle can't be claimed.
select gen_random_uuid() as o_uid \gset
insert into auth.users (id, email, aud, role) values (:'o_uid', 'old@brandinv.test', 'authenticated', 'authenticated');
insert into public.brand_profiles (owner, name, created_at) values (:'o_uid', 'Old Co', now() - interval '30 days');
select set_config('request.jwt.claims', json_build_object('email', 'old@brandinv.test', 'sub', :'o_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.referral_claim('invitehost', 'brand', 'Old Co') as o1 \gset
reset role;
insert into results select 'A brand already on Miracle can''t be claimed', :'o1'::jsonb ->> 'reason' = 'existing', :'o1';

-- ================================================================== 4. Six months a year at most
select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
insert into public.referrals (referrer, kind, email, name, rewarded_at)
select :hid, 'creator', 'past' || g || '@invite.test', 'Past ' || g, now() - make_interval(days => g * 10) from generate_series(1, 4) g;
insert into public.referrals (referrer, kind, email, name) values (:hid, 'creator', 'seventh@invite.test', 'Seventh');
insert into public.creator_settings (creator_email, handle, slug, display_name, code_prefix, invoice_prefix, status, slug_chosen, niche)
values ('seventh@invite.test', 'seventhinv', 'seventhinv', 'Seventh', 'SV', 'SV', 'active', true, 'Food');
insert into results select 'Past six in a year, a new one is noted but earns no month',
  (select skipped = 'cap' and rewarded_at is null from public.referrals where email = 'seventh@invite.test'), null;

-- ================================================================== 5. Her card, and nobody else's
select set_config('request.jwt.claims', json_build_object('email', 'host@invite.test', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-creator', 'invitehost')::text, true);
set local role authenticated;
select public.my_referrals() as mine \gset
do $$ begin perform count(*) from public.referrals; exception when others then insert into caught values ('read', sqlerrm); end $$;
reset role;
insert into results select 'Her card shows 6 of 6 earned and who joined', (:'mine'::jsonb ->> 'earned_year')::int = 6 and :'mine'::jsonb ->> 'slug' = 'invitehost'
  and jsonb_array_length(:'mine'::jsonb -> 'people') = 7 and :'mine'::jsonb -> 'people' @> '[{"name": "Meera", "kind": "creator"}]', :'mine';
insert into results select 'Nobody reads the invites table directly', exists (select 1 from caught where k = 'read'), null;
insert into results select 'Signed-out visitors can''t claim', not has_function_privilege('anon', 'public.referral_claim(text, text, text)', 'execute'), null;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
