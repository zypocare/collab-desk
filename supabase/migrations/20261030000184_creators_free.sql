-- Free for creators (30 Oct 2026): the free creator plan gets what Creator Pro had (every autopilot, unlimited
-- collabs, offer checks and pitches, automatic reminders, bank matching, demand letters, the insights page,
-- the fan list, results reports, one teammate and Pro's daily AI). Only the "Sent with Miracle" line stays.
-- Creator Pro isn't deleted: it's switched off for new buyers ("Offered to new buyers" in admin → Plans),
-- and everything that sells it follows that switch, so it can come back from admin alone:
-- * trials start only for a plan that's on sale,
-- * "trial ending" / "plan ended" notices go only for plans on sale,
-- * when a plan lapses, only the switches the plan now in effect doesn't include are turned off,
-- * the website's pricing page reads the plans on sale (public_plans) and shows Creator Pro only when it's on.
-- Brands, Brand Pro and Agency are unchanged.

-- 1. The catalogue (data only: admin → Plans can change any of it later) ------------------------------------
update public.billing_plans set
  limits = '{"seats": 2, "ai_day": 9000}'::jsonb,
  features = '{autopilots,bank_match,demand_letters,fan_list,insights_page,reminders,results_reports}',
  tagline = 'Everything for your collabs, free: unlimited collabs, every autopilot and payment reminders',
  updated_at = now()
where code = 'creator_free';
update public.billing_plans set active = false, updated_at = now() where code = 'creator_pro';

-- 2. Trials only for a plan that's on sale -------------------------------------------------------------------
create or replace function private.start_trial(p_kind text, p_subject text, p_plan text, p_email text)
returns void
language sql security definer
set search_path = public
as $$
  insert into public.billing_subscriptions (subject_kind, subject, plan, period, status, ends_at, source, email)
  select p_kind, p_subject, p_plan, 'trial', 'active', now() + make_interval(days => s.trial_days), 'trial', coalesce(p_email, '')
  from public.billing_settings s
  where s.id = 1 and s.trial_days > 0
    and exists (select 1 from public.billing_plans p where p.code = p_plan and p.active)
    and not exists (select 1 from public.billing_subscriptions x where x.subject_kind = p_kind and x.subject = p_subject);
$$;
revoke execute on function private.start_trial(text, text, text, text) from public, anon, authenticated;

-- 3. The daily job: notices only for plans on sale; switch off only what the plan now in effect lacks -------
create or replace function private.billing_daily()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  s record;
  n integer := 0;
  v_auto boolean;
begin
  -- Trials ending in 3 days and tomorrow, and plans that won't renew (only plans still on sale: there's
  -- nothing to keep otherwise).
  for s in
    select b.*, case when b.ends_at < now() + interval '26 hours' then 'ending_1' else 'ending_3' end as notice
    from public.billing_subscriptions b join public.billing_plans p on p.code = b.plan and p.active
    where b.status in ('active', 'cancelled') and (b.period = 'trial' or b.cancel_at_end)
      and b.ends_at between now() and now() + interval '3 days 2 hours'
  loop
    continue when exists (select 1 from public.billing_notices x where x.subscription_id = s.id and x.kind = s.notice and x.period_end = s.ends_at);
    insert into public.billing_notices (subscription_id, kind, period_end) values (s.id, s.notice, s.ends_at);
    insert into public.outbox (creator_id, kind, to_email, payload)
    select null, 'plan_ending', s.email, jsonb_build_object('app', true, 'plan', p.name, 'trial', s.period = 'trial', 'ends_at', s.ends_at,
      'side', case s.subject_kind when 'creator' then 'creator' else 'brand' end)
    from public.billing_plans p where p.code = s.plan and s.email <> '';
    n := n + 1;
  end loop;
  -- Plans that ended in the last 3 days, where nothing else covers the account now.
  for s in
    select b.* from public.billing_subscriptions b
    where b.ends_at between now() - interval '3 days' - make_interval(days => (select grace_days from public.billing_settings where id = 1)) and now()
      and not private.sub_live(b) and b.status <> 'pending'
  loop
    continue when exists (select 1 from public.billing_notices x where x.subscription_id = s.id and x.kind = 'ended' and x.period_end = s.ends_at);
    continue when s.subject_kind <> 'agency' and private.plan_code(s.subject_kind, s.subject) not in ('creator_free', 'brand_free');
    insert into public.billing_notices (subscription_id, kind, period_end) values (s.id, 'ended', s.ends_at);
    update public.billing_subscriptions set status = 'ended', updated_at = now() where id = s.id and status <> 'ended';
    -- Only what the free plan doesn't include goes off (with creators free, nothing does).
    if s.subject_kind = 'creator' then
      v_auto := private.plan_has('creator', s.subject, 'autopilots');
      update public.creator_settings set
        autopilot_packages = autopilot_packages and v_auto, autopilot_counter = autopilot_counter and v_auto,
        autopilot_nudge = autopilot_nudge and v_auto, autopilot_review = autopilot_review and v_auto,
        autopilot_brief = autopilot_brief and v_auto, autopilot_invoice = autopilot_invoice and v_auto,
        autopilot_dates = autopilot_dates and v_auto, autopilot_track = autopilot_track and v_auto,
        pitch_auto = pitch_auto and v_auto, demand_pricing = demand_pricing and v_auto,
        instant_booking = instant_booking and v_auto, rebook_offer = rebook_offer and v_auto,
        reminders_enabled = reminders_enabled and private.plan_has('creator', s.subject, 'reminders'),
        pay_alerts = pay_alerts and private.plan_has('creator', s.subject, 'bank_match'),
        show_insights = show_insights and private.plan_has('creator', s.subject, 'insights_page'),
        insights_stories = insights_stories and private.plan_has('creator', s.subject, 'insights_page'),
        fan_list_on = fan_list_on and private.plan_has('creator', s.subject, 'fan_list')
      where id = s.subject::integer;
    elsif s.subject_kind = 'workspace' then
      if not private.plan_has('workspace', s.subject, 'brand_autopilots') then
        update public.brand_autopilots set shortlist = 'off', followup = 'off', draftcheck = 'off', negotiate = 'off', rebook = 'off', watch = 'off' where owner = s.subject::uuid;
      end if;
      if not private.plan_has('workspace', s.subject, 'open_briefs') then
        update public.brand_campaigns set open = false where owner = s.subject::uuid and open;
      end if;
      if not private.plan_has('workspace', s.subject, 'turnaround') then
        update public.brand_tat_settings set escalate = false where owner = s.subject::uuid;
      end if;
    end if;
    -- "Your plan ended" only for a plan still on sale (they can pick it again).
    insert into public.outbox (creator_id, kind, to_email, payload)
    select null, 'plan_ended', s.email, jsonb_build_object('app', true, 'plan', p.name, 'trial', s.period = 'trial',
      'side', case s.subject_kind when 'creator' then 'creator' else 'brand' end)
    from public.billing_plans p where p.code = s.plan and p.active and s.email <> '';
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function private.billing_daily() from public, anon, authenticated;

-- 4. The plans on sale, for the website's pricing page (no sign-in) -----------------------------------------
create or replace function public.public_plans()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plans', coalesce((select jsonb_agg(jsonb_build_object('code', p.code, 'side', p.side, 'name', p.name, 'tagline', p.tagline,
      'price_month', p.price_month, 'price_year', p.price_year, 'founding_year', p.founding_year, 'limits', p.limits, 'features', to_jsonb(p.features))
      order by p.sort) from public.billing_plans p where p.active), '[]'::jsonb),
    'founding', (select jsonb_build_object('on', s.founding_on and s.founding_left > 0, 'left', s.founding_left) from public.billing_settings s where s.id = 1),
    'trial_days', (select s.trial_days from public.billing_settings s where s.id = 1));
$$;
revoke execute on function public.public_plans() from public;
grant execute on function public.public_plans() to anon, authenticated;

-- 5. The growth autopilot's invitation still promised a year of Creator Pro: say what's true now (only if it
--    was never edited; admin → Growth can change it).
update public.growth_settings set offer = 'Miracle is free for creators: every feature, and no commission on any deal.'
where offer = 'Founding creators get Creator Pro free for a year.';
alter table public.growth_settings alter column offer set default 'Miracle is free for creators: every feature, and no commission on any deal.';

-- 6. Invite rewards are a month of Creator Pro: while it isn't on sale there's nothing to give, so no month and
--    no "you earned a month" email (the person still shows as joined on her invite card).
create or replace function private.referral_reward(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  f public.referrals;
  v_until timestamptz;
  v_email text;
begin
  if not exists (select 1 from public.billing_plans p where p.code = 'creator_pro' and p.active) then return; end if;
  select * into f from public.referrals where id = p_id and rewarded_at is null and skipped = '' for update;
  if f.id is null then return; end if;
  if (select count(*) from public.referrals x where x.referrer = f.referrer and x.rewarded_at > now() - interval '365 days') >= 6 then
    update public.referrals set skipped = 'cap' where id = f.id;
    return;
  end if;
  select greatest(now(), coalesce(max(s.ends_at), now())) + interval '30 days' into v_until
  from public.billing_subscriptions s join public.billing_plans p on p.code = s.plan
  where s.subject_kind = 'creator' and s.subject = f.referrer::text and p.rank >= 2 and private.sub_live(s);
  select coalesce(creator_email, '') into v_email from public.creator_settings where id = f.referrer;
  insert into public.billing_subscriptions (subject_kind, subject, plan, period, status, ends_at, source, email, note)
  values ('creator', f.referrer::text, 'creator_pro', 'comp', 'active', v_until, 'admin', v_email,
    left('Invite reward: ' || coalesce(nullif(f.name, ''), f.email) || ' joined as a ' || f.kind, 300));
  update public.referrals set rewarded_at = now() where id = f.id;
  insert into public.outbox (creator_id, kind, to_email, payload)
  values (f.referrer, 'invite_reward', v_email, jsonb_build_object('who', nullif(f.name, ''), 'as', f.kind, 'until', v_until));
end;
$$;
revoke execute on function private.referral_reward(uuid) from public, anon, authenticated;
