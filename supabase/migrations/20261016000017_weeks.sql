-- Open weeks: how busy each of the next 8 weeks is (no brand details), plus weeks she is away.

alter table public.creator_settings
  add column weekly_capacity integer not null default 3 check (weekly_capacity between 1 and 20),
  add column away_weeks date[] not null default '{}',
  add column show_availability boolean not null default true;

-- Next 8 weeks (Monday starts): open, limited (one slot left), full, or away.
create or replace function public.availability()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('start', x.w, 'status',
    case when x.w = any(s.away_weeks) then 'away'
         when x.n >= s.weekly_capacity then 'full'
         when s.weekly_capacity > 1 and x.n = s.weekly_capacity - 1 then 'limited'
         else 'open' end) order by x.w), '[]'::jsonb)
  from public.creator_settings s,
  lateral (
    select g::date as w,
      (select count(*) from public.collabs c
       where c.stage in ('confirmed', 'creating', 'live')
         and coalesce(c.live_date, c.draft_date, c.preferred_live) >= g::date
         and coalesce(c.live_date, c.draft_date, c.preferred_live) < g::date + 7) as n
    from generate_series(date_trunc('week', current_date), date_trunc('week', current_date) + interval '7 weeks', interval '1 week') g
  ) x
  where s.id = 1;
$$;

create or replace function public.public_page()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'app_name', s.app_name,
    'display_name', s.display_name,
    'handle', s.handle,
    'niche', s.niche,
    'city', s.city,
    'followers', s.followers,
    'engagement', s.engagement,
    'reply_time', s.reply_time,
    'accepting', s.accepting,
    'rates', case when s.show_rates then s.rates else null end,
    'availability', case when s.show_availability then public.availability() else null end,
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'description', k.description, 'items', k.items,
        'price', k.price, 'badge', k.badge) order by k.position, k.created_at)
      from public.packages k where k.active
    ), '[]'::jsonb),
    'barter', jsonb_build_object(
      'mode', s.barter_mode,
      'min_value', s.barter_min_value,
      'reply_time', s.barter_reply_time,
      'slots_left', case when s.barter_monthly_cap > 0 then greatest(0, s.barter_monthly_cap - public.barter_slots_used()) else null end),
    'worked_with', coalesce((
      select jsonb_agg(w.name order by w.name)
      from (
        select distinct b.name
        from public.collabs c join public.brands b on b.id = c.brand_id
        where c.stage in ('live', 'wrapped')
        limit 24
      ) w
    ), '[]'::jsonb),
    'instagram', case when a.connected then jsonb_build_object(
      'username', a.username, 'followers', a.followers, 'engagement_rate', a.engagement_rate,
      'avg_views', a.avg_views, 'avg_reach', a.avg_reach, 'demographics', a.demographics,
      'profile_picture_url', a.profile_picture_url, 'updated_at', a.last_sync_at) else null end
  )
  from public.creator_settings s, public.ig_account a
  where s.id = 1 and a.id = 1;
$$;
