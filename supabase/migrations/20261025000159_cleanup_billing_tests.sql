-- One-off cleanup after testing paid plans with Razorpay's test keys (the owner asked for it on 25 Oct 2026):
-- 1. Every Razorpay subscription and payment so far was made in test mode (no real money; live keys have
--    not been used yet), so they go. Invoice numbers start again at MIR/26-00001, the test-mode Razorpay
--    plan ids are forgotten (live mode makes its own), and all 100 founding places are open again.
-- 2. The brand login used for the test (jitlovenick@gmail.com) is deleted with its brand team, trial and
--    invites, unless that email is also a creator's or an admin's. As with any closed brand account,
--    requests it sent stay in the creators' own records.
-- Running it again changes nothing.

do $$
declare
  v_email constant text := 'jitlovenick@gmail.com';
  v_uid uuid;
  n_pay integer;
  n_sub integer;
begin
  select count(*) into n_pay from public.billing_payments y join public.billing_subscriptions s on s.id = y.subscription_id where s.source = 'razorpay';
  delete from public.billing_subscriptions where source = 'razorpay';
  get diagnostics n_sub = row_count;
  update public.billing_plans set gateway = '{}'::jsonb, updated_at = now() where gateway <> '{}'::jsonb;
  update public.billing_settings set founding_left = 100, updated_at = now() where id = 1;
  if not exists (select 1 from public.billing_payments) then
    perform setval('public.billing_invoice_seq', 1, false);
  end if;
  raise notice 'billing test data: % subscriptions and % payments removed', n_sub, n_pay;

  select id into v_uid from auth.users where lower(email) = v_email;
  if v_uid is null then
    raise notice 'no login for %', v_email;
  elsif exists (select 1 from public.creator_settings where lower(creator_email) = v_email)
     or exists (select 1 from public.app_admins where lower(email) = v_email) then
    raise notice '% is also a creator or an admin: login kept', v_email;
  else
    delete from public.billing_subscriptions where subject_kind in ('workspace', 'agency') and subject = v_uid::text;
    delete from public.brand_team_members where lower(email) = v_email;
    delete from public.team_members where lower(email) = v_email;
    delete from public.app_limit_overrides where subject_kind in ('workspace', 'agency') and subject = v_uid::text;
    delete from auth.users where id = v_uid;
    raise notice 'deleted the test brand login %', v_email;
  end if;
end $$;
