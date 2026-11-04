-- Marketplace growth (free, while both sides grow):
--   1. Founding brands: the first 100 brand teams get Brand Pro free for 6 months (separate from the
--      founding *price* on yearly plans, which is billing_settings.founding_on/founding_left).
--   2. Who viewed your profile: every brand opening a creator's full profile is counted for the creator
--      (brand_profile_views only kept free-plan views, for the daily limit).
--   3. Reviews both ways: brands review a creator from the app after a collab wraps (into brand_reviews,
--      as the emailed review link does). Creators already rate brands privately on each collab (brand_private:
--      paid on time, clear brief, would work again); other creators now see the average of those, and only once
--      three different creators have rated the same company. Review averages feed Explore's score.
--   4. Marketplace numbers for the admin: when paid features (Spotlight, Creator Pro) are worth switching on.

-- 1. Founding brands -------------------------------------------------------------------------------------------
alter table public.billing_settings add column if not exists launch_free_on boolean not null default true;
alter table public.billing_settings add column if not exists launch_free_cap integer not null default 100 check (launch_free_cap >= 0);
alter table public.billing_settings add column if not exists launch_free_months integer not null default 6 check (launch_free_months between 1 and 24);
alter table public.billing_subscriptions add column if not exists launch_free boolean not null default false;

-- Gives one brand team its founding Brand Pro, while places are left. Returns true when it did.
create or replace function private.grant_founding_brand(p_owner uuid, p_email text default '')
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_set public.billing_settings;
  v_used integer;
begin
  if p_owner is null then return false; end if;
  select * into v_set from public.billing_settings where id = 1;
  if v_set.id is null or not v_set.launch_free_on then return false; end if;
  if not exists (select 1 from public.billing_plans p where p.code = 'brand_pro' and p.active) then return false; end if;
  -- One at a time, so the 100th place goes to one team only.
  perform pg_advisory_xact_lock(hashtext('launch_free_brand'));
  if exists (select 1 from public.billing_subscriptions s where s.subject_kind = 'workspace' and s.subject = p_owner::text and s.launch_free) then return false; end if;
  select count(*) into v_used from public.billing_subscriptions s where s.subject_kind = 'workspace' and s.launch_free;
  if v_used >= v_set.launch_free_cap then return false; end if;
  insert into public.billing_subscriptions (subject_kind, subject, plan, period, status, starts_at, ends_at, source, email, note, launch_free)
  values ('workspace', p_owner::text, 'brand_pro', 'comp', 'active', now(), now() + make_interval(months => v_set.launch_free_months), 'admin',
          coalesce(p_email, ''), 'Founding brand: Brand Pro free while Miracle launches', true);
  return true;
end;
$$;
revoke execute on function private.grant_founding_brand(uuid, text) from public, anon, authenticated;

-- New brand teams: the founding place first (while there are places), then the usual trial (skipped when
-- the team already has a plan).
create or replace function private.trial_on_brand_signup()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := (select u.email from auth.users u where u.id = new.owner);
begin
  perform private.grant_founding_brand(new.owner, v_email);
  perform private.start_trial('workspace', new.owner::text, 'brand_pro', v_email);
  return new;
end;
$$;

-- Brand teams already on Miracle get theirs too, oldest first.
do $$
declare r record;
begin
  for r in select p.owner, u.email from public.brand_profiles p join auth.users u on u.id = p.owner order by p.created_at loop
    perform private.grant_founding_brand(r.owner, r.email);
  end loop;
end $$;

-- Places left, for the sign-up page and the website (anyone may ask).
create or replace function public.founding_brands()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'on', s.launch_free_on and s.launch_free_cap > (select count(*) from public.billing_subscriptions b where b.subject_kind = 'workspace' and b.launch_free),
    'left', greatest(0, s.launch_free_cap - (select count(*) from public.billing_subscriptions b where b.subject_kind = 'workspace' and b.launch_free)),
    'cap', s.launch_free_cap, 'months', s.launch_free_months)
  from public.billing_settings s where s.id = 1;
$$;
revoke execute on function public.founding_brands() from public;
grant execute on function public.founding_brands() to anon, authenticated;

-- This brand team's founding place, if it has one (for the banner on Today).
create or replace function public.my_founding()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('until', s.ends_at)
  from public.billing_subscriptions s
  where s.subject_kind = 'workspace' and s.subject = public.brand_owner()::text and s.launch_free and private.sub_live(s)
  order by s.ends_at desc limit 1;
$$;
revoke execute on function public.my_founding() from public, anon;
grant execute on function public.my_founding() to authenticated;

-- 2. Who viewed your profile -----------------------------------------------------------------------------------
create table if not exists public.creator_profile_views (
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  viewer uuid not null,
  day date not null default ((now() at time zone 'Asia/Kolkata')::date),
  at timestamptz not null default now(),
  primary key (creator_id, viewer, day)
);
create index if not exists creator_profile_views_day_idx on public.creator_profile_views (creator_id, day desc);
alter table public.creator_profile_views enable row level security;
revoke all on public.creator_profile_views from anon, authenticated;

-- The same profile check as before, now also counting the view for the creator (any brand, any plan).
create or replace function public.brand_profile_open(p_creator integer)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid := public.brand_owner();
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_cap integer;
  v_used integer;
  v_price integer;
begin
  if v_owner is not null and not public.is_creator() then
    insert into public.creator_profile_views (creator_id, viewer, day) values (p_creator, v_owner, v_day) on conflict do nothing;
  end if;
  if v_owner is null or private.plan_exempt() then return jsonb_build_object('ok', true); end if;
  if exists (select 1 from public.brand_unlocks u where u.owner = v_owner and u.creator_id = p_creator) then
    return jsonb_build_object('ok', true, 'unlocked', true);
  end if;
  v_cap := private.plan_limit('workspace', v_owner::text, 'profiles_day');
  if v_cap is null or exists (select 1 from public.collabs c join public.brand_members m on m.brand_id = c.brand_id and m.owner = v_owner where c.creator_id = p_creator) then
    return jsonb_build_object('ok', true);
  end if;
  select count(*) into v_used from public.brand_profile_views where owner = v_owner and day = v_day;
  if exists (select 1 from public.brand_profile_views where owner = v_owner and day = v_day and creator_id = p_creator) then
    return jsonb_build_object('ok', true, 'used', v_used, 'cap', v_cap);
  end if;
  if v_used >= v_cap then
    select price_month into v_price from public.billing_plans where code = 'creator_unlock' and active and price_month > 0;
    return jsonb_build_object('ok', false, 'used', v_used, 'cap', v_cap, 'unlock_price', v_price,
      'can_buy', private.can_buy('workspace', v_owner::text),
      'msg', format('The free plan opens %s full creator profiles a day. More tomorrow, or go Brand Pro for unlimited.', v_cap));
  end if;
  insert into public.brand_profile_views (owner, creator_id, day) values (v_owner, p_creator, v_day) on conflict do nothing;
  return jsonb_build_object('ok', true, 'used', v_used + 1, 'cap', v_cap);
end;
$$;
revoke execute on function public.brand_profile_open(integer) from public, anon;
grant execute on function public.brand_profile_open(integer) to authenticated;

-- For the creator's team: how many brands looked (counts only; who they were is for later).
create or replace function public.my_profile_views()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'week', (select count(distinct v.viewer) from public.creator_profile_views v where v.creator_id = public.current_creator() and v.day > current_date - 7),
    'month', (select count(distinct v.viewer) from public.creator_profile_views v where v.creator_id = public.current_creator() and v.day > current_date - 30),
    'before', (select count(distinct v.viewer) from public.creator_profile_views v where v.creator_id = public.current_creator() and v.day > current_date - 14 and v.day <= current_date - 7))
  where public.is_creator() and public.team_role() is not null;
$$;
revoke execute on function public.my_profile_views() from public, anon;
grant execute on function public.my_profile_views() to authenticated;

-- 3. Reviews both ways ----------------------------------------------------------------------------------------
-- A brand reviews the creator from the app once the collab has wrapped (the same review the email asks for).
create or replace function public.review_from_brand(p_code text, p_rating integer, p_body text default '')
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_c public.collabs;
  v_name text;
begin
  select * into v_c from public.collabs where code = btrim(p_code);
  if v_c.id is null or not public.is_my_collab(v_c.id) then raise exception 'That collab isn''t yours to review.'; end if;
  if v_c.stage <> 'wrapped' then raise exception 'You can review once the collab is done.'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Pick 1 to 5 stars.'; end if;
  if exists (select 1 from public.brand_reviews r where r.collab_id = v_c.id) then raise exception 'This collab already has a review.'; end if;
  select coalesce(nullif(btrim(p.full_name), ''), b.name) into v_name
  from public.brands b left join public.profiles p on p.id = auth.uid() where b.id = v_c.brand_id;
  insert into public.brand_reviews (collab_id, creator_id, rating, body, name, shown)
  values (v_c.id, v_c.creator_id, p_rating, left(btrim(coalesce(p_body, '')), 300), left(coalesce(v_name, 'A brand'), 80), p_rating >= 4);
end;
$$;
revoke execute on function public.review_from_brand(text, integer, text) from public, anon;
grant execute on function public.review_from_brand(text, integer, text) to authenticated;

-- Has this collab been reviewed (for the brand's request page)?
create or replace function public.review_done(p_code text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.collabs c join public.brand_reviews r on r.collab_id = c.id
                 where c.code = btrim(p_code) and (public.is_my_collab(c.id) or c.creator_id = public.current_creator()));
$$;
revoke execute on function public.review_done(text) from public, anon;
grant execute on function public.review_done(text) to authenticated;

-- How a brand pays (as before), now with what creators say about working with them: an average, shown only
-- once three different creators have rated the same company (matched across creators as before).
create or replace function private.brand_pay_record(p_brand uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with keys as (select unnest(private.brand_keys(p_brand)) as k),
  same as (
    select b.id from public.brands b
    where b.id = p_brand or exists (select 1 from unnest(private.brand_keys(b.id)) bk join keys on keys.k = bk
                                    where bk not like 'b:%')
  ),
  inv as (
    select i.id, i.creator_id, i.issue_date, i.due_date, i.paid_on, i.status,
      exists (select 1 from public.bank_alerts a where a.invoice_id = i.id) as by_bank,
      exists (select 1 from public.payment_demands d where d.invoice_id = i.id and (i.paid_on is null or d.sent_at::date <= i.paid_on)) as demanded
    from public.invoices i join public.collabs c on c.id = i.collab_id
    where c.brand_id in (select id from same) and i.status in ('sent', 'partly_paid', 'paid')
      and i.issue_date >= current_date - 365
  ),
  paid as (select * from inv where status = 'paid' and paid_on is not null),
  late as (select * from inv where status <> 'paid' and coalesce(due_date, issue_date + 30) < current_date),
  rated as (select b.creator_id, n.rate_pay, n.rate_brief, n.rate_again from public.brand_private n join public.brands b on b.id = n.brand_id
            where n.brand_id in (select id from same) and coalesce(n.rate_pay, n.rate_brief, n.rate_again) is not null)
  select jsonb_build_object(
    'invoices', (select count(*) from paid),
    'on_time', (select count(*) from paid where paid_on <= coalesce(due_date, issue_date + 30)),
    'by_bank', (select count(*) from paid where by_bank),
    'after_demand', (select count(*) from paid where demanded),
    'late_now', (select count(*) from late),
    'creators', (select count(distinct creator_id) from inv),
    'avg_days', (select round(avg(d)) from (
        select (paid_on - issue_date) as d from paid
        union all select (current_date - issue_date) from late) x),
    'gstin', (select nullif(upper(btrim(coalesce(b.gstin, ''))), '') from public.brands b where b.id = p_brand),
    'profile_gstin', (select nullif(upper(btrim(coalesce(p.gstin, ''))), '') from public.brand_members m
                      join public.brand_profiles p on p.owner = private.owner_of(m.profile_id) where m.brand_id = p_brand limit 1),
    'instagram', (select g.username from public.brand_members m join public.brand_ig g on g.owner = private.owner_of(m.profile_id)
                  where m.brand_id = p_brand order by g.connected_at limit 1),
    'rating', (select case when count(distinct creator_id) >= 3 then jsonb_build_object(
        'n', count(distinct creator_id),
        'avg', round((coalesce(avg(rate_pay), 0) + coalesce(avg(rate_brief), 0) + coalesce(avg(rate_again), 0))
                     / nullif((avg(rate_pay) is not null)::int + (avg(rate_brief) is not null)::int + (avg(rate_again) is not null)::int, 0), 1),
        'pay', round(avg(rate_pay), 1), 'brief', round(avg(rate_brief), 1), 'again', round(avg(rate_again), 1)) end from rated)
  );
$$;
revoke execute on function private.brand_pay_record(uuid) from public, anon, authenticated;

-- Review averages for Explore (brands only): every review a brand left after a collab, shown or not.
create or replace function public.explore_reviews()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(x.creator_id, jsonb_build_object('avg', x.avg, 'n', x.n)), '{}'::jsonb)
  from (select r.creator_id, round(avg(r.rating), 1) as avg, count(*) as n
        from public.brand_reviews r where r.creator_id is not null group by r.creator_id) x
  where public.brand_owner() is not null and not public.is_creator();
$$;
revoke execute on function public.explore_reviews() from public, anon;
grant execute on function public.explore_reviews() to authenticated;

-- 4. Marketplace numbers for the admin --------------------------------------------------------------------------
create or replace function public.admin_marketplace()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_active_creators integer;
begin
  perform private.admin_check();
  select count(*) into v_active_creators from public.creator_settings s where s.status = 'active';
  return jsonb_build_object(
    -- Brand teams that sent a request or had a collab move in the last 30 days.
    'active_brands', (select count(distinct m.owner) from public.collabs c join public.brand_members m on m.brand_id = c.brand_id
                      where greatest(c.created_at, c.updated_at) > now() - interval '30 days'),
    'brand_teams', (select count(*) from public.brand_profiles),
    'requests_30d', (select count(*) from public.collabs c where c.created_at > now() - interval '30 days'
                     and exists (select 1 from public.brand_members m where m.brand_id = c.brand_id)),
    'listed_creators', (select count(*) from public.creator_settings s where s.status = 'active' and coalesce(s.listed, false)),
    'active_creators', v_active_creators,
    'creators_with_request_pct', (select case when v_active_creators = 0 then 0 else round(100.0 * count(distinct c.creator_id) / v_active_creators) end
                                  from public.collabs c where c.created_at > now() - interval '30 days'
                                    and exists (select 1 from public.brand_members m where m.brand_id = c.brand_id)),
    'profile_views_30d', (select count(*) from public.creator_profile_views v where v.day > current_date - 30),
    'reviews', (select count(*) from public.brand_reviews),
    'brand_ratings', (select count(*) from public.brand_private n where coalesce(n.rate_pay, n.rate_brief, n.rate_again) is not null),
    'founding', public.founding_brands(),
    'targets', jsonb_build_object('active_brands', 50, 'requests_30d', 200, 'listed_creators', 500, 'creators_with_request_pct', 30)
  );
end;
$$;
revoke execute on function public.admin_marketplace() from public, anon;
grant execute on function public.admin_marketplace() to authenticated;
