-- Brand module, Reports and Phase 4 (deeper discovery):
--   1. Reports: everything across the brand's collabs for a period, for the charts and the Excel file.
--   2. Discover with audience: each reachable creator with the audience they share, their "from" rate and
--      what they did with this brand. The app works out the fit score and similar creators from this.
--   3. Private ratings: the brand rates a creator (on time, quality, results). Creators never see them.
--   4. Open briefs: a campaign can take applications; creators apply with their own rate, the brand
--      shortlists and sends each one a request at that rate.

-- 3. Private ratings --------------------------------------------------------------------------------------
create table if not exists public.brand_creator_ratings (
  owner uuid not null references auth.users (id) on delete cascade,
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  on_time smallint not null check (on_time between 1 and 5),
  quality smallint not null check (quality between 1 and 5),
  results smallint not null check (results between 1 and 5),
  note text not null default '' check (char_length(note) <= 500),
  rated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (owner, creator_id)
);
alter table public.brand_creator_ratings enable row level security;
-- The brand's team reads its own ratings; creators have no policy, so they never see them.
drop policy if exists "brand team reads its ratings" on public.brand_creator_ratings;
create policy "brand team reads its ratings" on public.brand_creator_ratings for select to authenticated
  using (owner = (select public.brand_owner()) and not (select public.is_creator()));

create or replace function public.creator_rate(p_creator integer, p_on_time integer, p_quality integer, p_results integer, p_note text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_creator() then
    raise exception 'Sign in with your brand email first.';
  end if;
  if not exists (select 1 from private.my_collabs() k where k.creator_id = p_creator) then
    raise exception 'Rate creators after working with them.';
  end if;
  if least(p_on_time, p_quality, p_results) < 1 or greatest(p_on_time, p_quality, p_results) > 5 then
    raise exception 'Pick 1 to 5 stars for each.';
  end if;
  insert into public.brand_creator_ratings (owner, creator_id, on_time, quality, results, note)
  values (public.brand_owner(), p_creator, p_on_time, p_quality, p_results, left(btrim(coalesce(p_note, '')), 500))
  on conflict (owner, creator_id) do update set on_time = excluded.on_time, quality = excluded.quality, results = excluded.results,
    note = excluded.note, rated_by = auth.uid(), updated_at = now();
  return (select jsonb_build_object('on_time', on_time, 'quality', quality, 'results', results, 'note', note, 'updated_at', updated_at)
          from public.brand_creator_ratings where owner = public.brand_owner() and creator_id = p_creator);
end;
$$;
revoke execute on function public.creator_rate(integer, integer, integer, integer, text) from public, anon;
grant execute on function public.creator_rate(integer, integer, integer, integer, text) to authenticated;

-- 2. Discover with audience ------------------------------------------------------------------------------
-- A creator's audience as shares: women, each age band, the top cities. Instagram gives counts.
create or replace function private.audience(d jsonb)
returns jsonb
language sql immutable
as $$
  with g as (select coalesce(sum(value::numeric), 0) as t, coalesce(sum(value::numeric) filter (where key = 'F'), 0) as f
             from jsonb_each_text(coalesce(d -> 'gender', '{}'))),
       a as (select coalesce(sum(value::numeric), 0) as t from jsonb_each_text(coalesce(d -> 'age', '{}'))),
       c as (select coalesce(sum(value::numeric), 0) as t from jsonb_each_text(coalesce(d -> 'city', '{}')))
  select case when (select t from g) = 0 and (select t from a) = 0 and (select t from c) = 0 then null else jsonb_build_object(
    'women', case when (select t from g) > 0 then round((select f from g) * 100 / (select t from g)) end,
    'age', (select coalesce(jsonb_object_agg(key, round(value::numeric * 100 / nullif((select t from a), 0))), '{}'::jsonb)
            from jsonb_each_text(coalesce(d -> 'age', '{}'))),
    'cities', (select coalesce(jsonb_agg(jsonb_build_object('name', split_part(x.key, ',', 1), 'pct', round(x.value::numeric * 100 / nullif((select t from c), 0)))
                 order by x.value::numeric desc), '[]'::jsonb)
               from (select key, value from jsonb_each_text(coalesce(d -> 'city', '{}')) order by value::numeric desc limit 5) x))
  end;
$$;
revoke execute on function private.audience(jsonb) from public, anon, authenticated;

create or replace function public.discover_audience()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with mine as (select * from private.my_collabs())
  select coalesce(jsonb_agg(private.creator_card(s.id) || jsonb_build_object(
      'listed', s.listed,
      'audience', case when a.connected then private.audience(a.demographics) end,
      'rates', case when s.show_rates then s.rates end,
      'with_me', jsonb_build_object(
        'collabs', (select count(*) from mine where mine.creator_id = s.id),
        'wrapped', (select count(*) from mine where mine.creator_id = s.id and mine.stage = 'wrapped'),
        'fees', (select coalesce(sum(mine.fee), 0) from mine where mine.creator_id = s.id and mine.stage in ('live', 'wrapped')),
        'views', (select coalesce(sum(m.views), 0) from mine join public.collab_posts p on p.collab_id = mine.id
                  join public.ig_media m on m.id = p.media_id where mine.creator_id = s.id)),
      'rating', (select jsonb_build_object('on_time', r.on_time, 'quality', r.quality, 'results', r.results, 'note', r.note, 'updated_at', r.updated_at)
                 from public.brand_creator_ratings r where r.owner = public.brand_owner() and r.creator_id = s.id))
    order by lower(s.display_name)), '[]'::jsonb)
  from public.creator_settings s left join public.ig_account a on a.id = s.id
  where auth.uid() is not null and not public.is_creator() and s.status = 'active' and s.slug_chosen
    and (s.listed or exists (select 1 from mine where mine.creator_id = s.id));
$$;
revoke execute on function public.discover_audience() from public, anon;
grant execute on function public.discover_audience() to authenticated;

-- 4. Open briefs ------------------------------------------------------------------------------------------
alter table public.brand_campaigns add column if not exists open boolean not null default false;
alter table public.brand_campaigns add column if not exists open_until date;
alter table public.brand_campaigns add column if not exists budget_min numeric(12, 2) not null default 0;
alter table public.brand_campaigns add column if not exists budget_max numeric(12, 2) not null default 0;

create table if not exists public.campaign_applications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.brand_campaigns (id) on delete cascade,
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  rate numeric(12, 2) not null default 0 check (rate >= 0),
  note text not null default '' check (char_length(note) <= 400),
  status text not null default 'new' check (status in ('new', 'shortlist', 'no', 'sent')),
  collab_id uuid references public.collabs (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (campaign_id, creator_id)
);
create index if not exists campaign_applications_creator_idx on public.campaign_applications (creator_id);
alter table public.campaign_applications enable row level security;
drop policy if exists "brand reads applications to its campaigns" on public.campaign_applications;
create policy "brand reads applications to its campaigns" on public.campaign_applications for select to authenticated
  using (exists (select 1 from public.brand_campaigns c where c.id = campaign_id and c.owner = (select public.brand_owner())));
drop policy if exists "creator reads own applications" on public.campaign_applications;
create policy "creator reads own applications" on public.campaign_applications for select to authenticated
  using ((select public.is_creator()) and creator_id = (select public.current_creator()));

-- Open or close a campaign for applications.
create or replace function public.campaign_open(p_id uuid, p_open boolean, p_until date default null, p_min numeric default 0, p_max numeric default 0)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c public.brand_campaigns;
begin
  select * into c from public.brand_campaigns where id = p_id and owner = public.brand_owner();
  if c.id is null or public.is_creator() then
    raise exception 'Campaign not found.';
  end if;
  if p_open then
    if c.brand_from is null then
      raise exception 'Add your company details first.';
    end if;
    if jsonb_array_length(coalesce(c.brief -> 'deliverables', '[]'::jsonb)) = 0 then
      raise exception 'Add what you want made (a Reel, Stories...) before opening the brief.';
    end if;
    if p_until is null or p_until < (now() at time zone 'Asia/Kolkata')::date or p_until > (now() at time zone 'Asia/Kolkata')::date + 60 then
      raise exception 'Pick a closing date within the next 60 days.';
    end if;
    if coalesce(p_max, 0) < coalesce(p_min, 0) then
      raise exception 'The top of the budget is below the bottom.';
    end if;
  end if;
  update public.brand_campaigns set open = p_open, open_until = case when p_open then p_until else open_until end,
    budget_min = case when p_open then greatest(0, coalesce(p_min, 0)) else budget_min end,
    budget_max = case when p_open then greatest(0, coalesce(p_max, 0)) else budget_max end
  where id = c.id;
  return public.campaign_board(c.id);
end;
$$;
revoke execute on function public.campaign_open(uuid, boolean, date, numeric, numeric) from public, anon;
grant execute on function public.campaign_open(uuid, boolean, date, numeric, numeric) to authenticated;

-- What a creator sees: open briefs, newest first, with their own application if they made one.
create or replace function public.open_briefs()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'brand', b.name, 'category', b.category, 'instagram', b.instagram,
      'verified', exists (select 1 from public.brand_ig g where g.owner = c.owner),
      'brief', c.brief - 'package_id', 'budget_min', c.budget_min, 'budget_max', c.budget_max, 'open_until', c.open_until,
      'applied', (select count(*) from public.campaign_applications a where a.campaign_id = c.id),
      'mine', (select jsonb_build_object('id', a.id, 'rate', a.rate, 'note', a.note, 'status', case when a.status = 'no' then 'new' else a.status end)
               from public.campaign_applications a where a.campaign_id = c.id and a.creator_id = public.current_creator()))
    order by c.open_until, c.created_at desc), '[]'::jsonb)
  from public.brand_campaigns c join public.brands b on b.id = c.brand_from
  where public.is_creator() and c.open and c.open_until >= (now() at time zone 'Asia/Kolkata')::date
    and exists (select 1 from public.creator_settings s where s.id = public.current_creator() and s.status = 'active');
$$;
revoke execute on function public.open_briefs() from public, anon;
grant execute on function public.open_briefs() to authenticated;

create or replace function public.brief_apply(p_campaign uuid, p_rate numeric, p_note text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_me integer := public.current_creator();
begin
  if not public.is_creator() or v_me is null then
    raise exception 'Only creators can apply to a brief.';
  end if;
  if not exists (select 1 from public.brand_campaigns c where c.id = p_campaign and c.open and c.open_until >= (now() at time zone 'Asia/Kolkata')::date) then
    raise exception 'This brief has closed.';
  end if;
  if coalesce(p_rate, -1) < 0 or p_rate > 10000000 then
    raise exception 'Add your rate (0 for barter).';
  end if;
  if (select count(*) from public.campaign_applications where creator_id = v_me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s 20 applications today. Please try again tomorrow.';
  end if;
  if exists (select 1 from public.campaign_applications where campaign_id = p_campaign and creator_id = v_me and status = 'sent') then
    raise exception 'The brand already sent you a request for this.';
  end if;
  insert into public.campaign_applications (campaign_id, creator_id, rate, note)
  values (p_campaign, v_me, p_rate, left(btrim(coalesce(p_note, '')), 400))
  on conflict (campaign_id, creator_id) do update set rate = excluded.rate, note = excluded.note;
  return public.open_briefs();
end;
$$;
revoke execute on function public.brief_apply(uuid, numeric, text) from public, anon;
grant execute on function public.brief_apply(uuid, numeric, text) to authenticated;

create or replace function public.brief_withdraw(p_campaign uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_creator() then
    raise exception 'Only creators can withdraw an application.';
  end if;
  delete from public.campaign_applications where campaign_id = p_campaign and creator_id = public.current_creator() and status <> 'sent';
  return public.open_briefs();
end;
$$;
revoke execute on function public.brief_withdraw(uuid) from public, anon;
grant execute on function public.brief_withdraw(uuid) to authenticated;

-- The brand's view of applications to one campaign.
create or replace function public.campaign_applications_list(p_campaign uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(private.creator_card(a.creator_id) || jsonb_build_object(
      'application', a.id, 'rate', a.rate, 'note', a.note, 'status', a.status, 'applied_at', a.created_at,
      'audience', (select private.audience(g.demographics) from public.ig_account g where g.id = a.creator_id and g.connected),
      'rates', (select case when s.show_rates then s.rates end from public.creator_settings s where s.id = a.creator_id))
    order by a.created_at), '[]'::jsonb)
  from public.campaign_applications a
  where a.campaign_id = p_campaign and exists (select 1 from public.brand_campaigns c where c.id = p_campaign and c.owner = public.brand_owner());
$$;
revoke execute on function public.campaign_applications_list(uuid) from public, anon;
grant execute on function public.campaign_applications_list(uuid) to authenticated;

create or replace function public.application_set(p_id uuid, p_status text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_status not in ('new', 'shortlist', 'no') then
    raise exception 'Unknown choice.';
  end if;
  update public.campaign_applications a set status = p_status
  where a.id = p_id and a.status <> 'sent'
    and exists (select 1 from public.brand_campaigns c where c.id = a.campaign_id and c.owner = public.brand_owner());
  if not found then
    raise exception 'Application not found.';
  end if;
end;
$$;
revoke execute on function public.application_set(uuid, text) from public, anon;
grant execute on function public.application_set(uuid, text) to authenticated;

-- Send the shortlisted creators their requests: the campaign's brief, at the rate each one asked.
create or replace function public.applications_send(p_campaign uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_brief jsonb;
  r record;
begin
  select brief into v_brief from public.brand_campaigns where id = p_campaign and owner = public.brand_owner();
  if v_brief is null then
    raise exception 'Campaign not found.';
  end if;
  if not exists (select 1 from public.campaign_applications where campaign_id = p_campaign and status = 'shortlist') then
    raise exception 'Shortlist at least one creator first.';
  end if;
  -- One at a time, each with the fee they asked for; the brief itself is put back afterwards.
  for r in select creator_id, rate from public.campaign_applications where campaign_id = p_campaign and status = 'shortlist' loop
    update public.brand_campaigns set brief = v_brief || jsonb_build_object('fee', r.rate) where id = p_campaign;
    perform public.send_campaign(p_campaign, array[r.creator_id]);
  end loop;
  update public.brand_campaigns set brief = v_brief where id = p_campaign;
  update public.campaign_applications a set status = 'sent', collab_id = x.collab_id
  from public.campaign_creators x
  where a.campaign_id = p_campaign and a.status = 'shortlist' and x.campaign_id = a.campaign_id and x.creator_id = a.creator_id and x.status = 'sent';
  return public.campaign_board(p_campaign);
end;
$$;
revoke execute on function public.applications_send(uuid) from public, anon;
grant execute on function public.applications_send(uuid) to authenticated;

-- The board and the list show the open brief and its applications.
create or replace function public.campaign_board(p_campaign uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'campaign', jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'pool_id', c.pool_id, 'brief', c.brief,
      'budget_total', c.budget_total, 'created_at', c.created_at, 'sent_at', c.sent_at,
      'open', c.open, 'open_until', c.open_until, 'budget_min', c.budget_min, 'budget_max', c.budget_max,
      'applications', (select count(*) from public.campaign_applications a where a.campaign_id = c.id),
      'company', (select b.name from public.brands b where b.id = c.brand_from)),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', x.id, 'handle', x.handle, 'status', x.status, 'note', x.note,
          'joined', x.creator_id is null and r.cid is not null,
          'creator', case when coalesce(x.creator_id, r.cid) is not null then private.creator_card(coalesce(x.creator_id, r.cid)) end,
          'code', k.code, 'stage', k.stage, 'stage_label', case when k.id is not null then public.stage_label(k.stage) end,
          'fee', k.fee, 'live_date', k.live_date, 'draft_date', k.draft_date, 'pay_status', k.pay_status,
          'quote', case when k.id is not null then private.latest_quote(k.id) end,
          'draft_pending', exists (select 1 from public.drafts d where d.collab_id = k.id and d.status = 'pending'))
        order by x.created_at)
      from public.campaign_creators x
      left join lateral (select private.creator_by_handle(x.handle) as cid where x.creator_id is null) r on true
      left join public.collabs k on k.id = x.collab_id
      where x.campaign_id = c.id), '[]'::jsonb))
  from public.brand_campaigns c
  where c.id = p_campaign and c.owner = public.brand_owner();
$$;

create or replace function public.campaigns_list()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'created_at', c.created_at,
      'sent_at', c.sent_at, 'budget_total', c.budget_total, 'brief', c.brief,
      'open', c.open and c.open_until >= (now() at time zone 'Asia/Kolkata')::date, 'open_until', c.open_until,
      'applications', (select count(*) from public.campaign_applications a where a.campaign_id = c.id),
      'new_applications', (select count(*) from public.campaign_applications a where a.campaign_id = c.id and a.status = 'new'),
      'creators', (select count(*) from public.campaign_creators x where x.campaign_id = c.id),
      'agreed', (select count(*) from public.campaign_creators x join public.collabs k on k.id = x.collab_id
                 where x.campaign_id = c.id and k.stage in ('confirmed', 'creating', 'live', 'wrapped')),
      'waiting', (select count(*) from public.campaign_creators x join public.collabs k on k.id = x.collab_id
                  where x.campaign_id = c.id and ((private.latest_quote(k.id) ->> 'status') = 'sent'
                    or exists (select 1 from public.drafts d where d.collab_id = k.id and d.status = 'pending'))))
    order by c.created_at desc), '[]'::jsonb)
  from public.brand_campaigns c
  where c.owner = public.brand_owner();
$$;
-- 5. Reports (written last: it reads the tables above) ---------------------------------------------------------------------------------------------
create or replace function public.brand_reports(p_from date, p_to date)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with k as (
    select c.*, s.display_name as creator, s.slug from private.my_collabs() c join public.creator_settings s on s.id = c.creator_id
  ), win as (
    select p_from as d0, p_to as d1, (p_to - p_from) as len, (now() at time zone 'Asia/Kolkata')::date as today
  ), inv as (
    select i.*, k.creator, k.code, coalesce(i.cgst, 0) + coalesce(i.sgst, 0) + coalesce(i.igst, 0) as gst,
      greatest(0, i.payable - coalesce(i.amount_received, 0)) as due_amount
    from k join public.invoices i on i.collab_id = k.id and i.status not in ('draft', 'cancelled')
  ), posts as (
    select k.id as collab_id, k.creator_id, k.creator, k.fee, m.posted_at::date as day, coalesce(m.views, 0) as views, coalesce(m.reach, 0) as reach,
      coalesce(m.likes, 0) + coalesce(m.comments, 0) + coalesce(m.saves, 0) + coalesce(m.shares, 0) as acts
    from k join public.collab_posts p on p.collab_id = k.id join public.ig_media m on m.id = p.media_id
  ), pin as (select posts.* from posts, win where posts.day between win.d0 and win.d1),
  pprev as (select posts.* from posts, win where posts.day between win.d0 - win.len - 1 and win.d0 - 1),
  paid as (select inv.* from inv, win where inv.status = 'paid' and inv.paid_on between win.d0 and win.d1),
  paidprev as (select inv.* from inv, win where inv.status = 'paid' and inv.paid_on between win.d0 - win.len - 1 and win.d0 - 1),
  kin as (select k.* from k, win where k.received_on between win.d0 and win.d1),
  -- Fees of collabs whose posts are in the period: what those views cost.
  fees as (select coalesce(sum(distinct_fee.fee), 0) as fee from (select distinct collab_id, fee from pin) distinct_fee)
  select jsonb_build_object(
    'from', (select d0 from win), 'to', (select d1 from win),
    'kpi', jsonb_build_object(
      'spent', (select coalesce(sum(payable), 0) from paid),
      'spent_prev', (select coalesce(sum(payable), 0) from paidprev),
      'to_pay', (select coalesce(sum(due_amount), 0) from inv where status in ('sent', 'partly_paid') and claim_at is null),
      'creators', (select count(distinct creator_id) from kin),
      'rebooked', (select count(*) from (select creator_id from k group by creator_id having count(*) > 1) r),
      'collabs', (select count(*) from kin),
      'live', (select count(*) from k where stage = 'live'),
      'talks', (select count(*) from k where stage in ('request', 'negotiating')),
      'views', (select coalesce(sum(views), 0) from pin),
      'views_prev', (select coalesce(sum(views), 0) from pprev),
      'acts', (select coalesce(sum(acts), 0) from pin),
      'reach', (select coalesce(sum(reach), 0) from pin),
      'post_fees', (select fee from fees),
      'posts', (select count(*) from pin)),
    'by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
          'paid', (select coalesce(sum(payable), 0) from inv where status = 'paid' and date_trunc('month', paid_on) = m),
          'due', (select coalesce(sum(due_amount), 0) from inv where status in ('sent', 'partly_paid') and date_trunc('month', coalesce(due_date, issue_date)) = m))
        order by m)
      from win, generate_series(date_trunc('month', win.d0), date_trunc('month', win.d1), interval '1 month') m), '[]'::jsonb),
    'by_week', coalesce((
      select jsonb_agg(jsonb_build_object('week', to_char(w, 'YYYY-MM-DD'),
          'views', (select coalesce(sum(views), 0) from pin where date_trunc('week', day) = w),
          'posts', (select count(*) from pin where date_trunc('week', day) = w))
        order by w)
      from win, generate_series(date_trunc('week', win.d0), date_trunc('week', win.d1), interval '1 week') w), '[]'::jsonb),
    'funnel', jsonb_build_object(
      'sent', (select count(*) from kin),
      'agreed', (select count(*) from kin where stage in ('confirmed', 'creating', 'live', 'wrapped')),
      'live', (select count(*) from kin where stage in ('live', 'wrapped')),
      'paid', (select count(*) from kin where pay_status = 'paid')),
    'by_creator', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.creator_id, 'name', x.creator, 'slug', x.slug, 'collabs', x.n, 'spent', x.spent,
          'views', x.views, 'fees', x.fees, 'acts', x.acts, 'rating', x.rating)
        order by x.spent desc, x.views desc)
      from (
        select c.creator_id, max(c.creator) as creator, max(c.slug) as slug, count(*) as n,
          (select coalesce(sum(i.payable), 0) from inv i, win w where i.creator_id = c.creator_id and i.status in ('paid', 'partly_paid', 'sent')
             and coalesce(i.paid_on, i.issue_date) between w.d0 and w.d1) as spent,
          (select coalesce(sum(views), 0) from pin where pin.creator_id = c.creator_id) as views,
          (select coalesce(sum(f.fee), 0) from (select distinct collab_id, fee from pin where pin.creator_id = c.creator_id) f) as fees,
          (select coalesce(sum(acts), 0) from pin where pin.creator_id = c.creator_id) as acts,
          (select round((r.on_time + r.quality + r.results) / 3.0, 1) from public.brand_creator_ratings r
             where r.owner = public.brand_owner() and r.creator_id = c.creator_id) as rating
        from k c group by c.creator_id
      ) x), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'budget', c.budget_total, 'open', c.open,
          'asked', (select count(*) from public.campaign_creators x where x.campaign_id = c.id and x.status = 'sent'),
          'agreed', (select count(*) from public.campaign_creators x join public.collabs kk on kk.id = x.collab_id
                     where x.campaign_id = c.id and kk.stage in ('confirmed', 'creating', 'live', 'wrapped')),
          'spent', (select coalesce(sum(kk.fee), 0) from public.campaign_creators x join public.collabs kk on kk.id = x.collab_id
                    where x.campaign_id = c.id and kk.stage in ('confirmed', 'creating', 'live', 'wrapped')),
          'views', (select coalesce(sum(m.views), 0) from public.campaign_creators x join public.collab_posts p on p.collab_id = x.collab_id
                    join public.ig_media m on m.id = p.media_id where x.campaign_id = c.id),
          'applications', (select count(*) from public.campaign_applications a where a.campaign_id = c.id))
        order by c.created_at desc)
      from public.brand_campaigns c where c.owner = public.brand_owner()), '[]'::jsonb),
    'content', jsonb_build_object(
      'with_rights', (select count(*) from posts join k on k.id = posts.collab_id, win where k.usage_ends >= win.today),
      'ending_soon', (select count(*) from posts join k on k.id = posts.collab_id, win where k.usage_ends between win.today and win.today + 14)),
    'tax', jsonb_build_object(
      'gst', (select coalesce(sum(gst), 0) from inv, win where status in ('paid', 'partly_paid', 'sent') and issue_date between win.d0 and win.d1),
      'tds', (select coalesce(sum(tds_amount), 0) from inv, win where status in ('paid', 'partly_paid', 'sent') and issue_date between win.d0 and win.d1)),
    -- One row per request, for the Excel file.
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('code', k.code, 'creator', k.creator, 'stage', public.stage_label(k.stage), 'type', k.type,
          'fee', k.fee, 'product_value', k.product_value, 'received_on', k.received_on, 'live_date', k.live_date, 'pay_status', k.pay_status,
          'deliverables', (select string_agg(d.qty || ' ' || d.kind, ', ' order by d.position) from public.deliverables d where d.collab_id = k.id),
          'views', (select coalesce(sum(views), 0) from posts where posts.collab_id = k.id))
        order by k.received_on desc)
      from k, win where k.received_on between win.d0 and win.d1), '[]'::jsonb))
  where auth.uid() is not null and not public.is_creator() and p_from <= p_to and p_to - p_from <= 800;
$$;
revoke execute on function public.brand_reports(date, date) from public, anon;
grant execute on function public.brand_reports(date, date) to authenticated;

