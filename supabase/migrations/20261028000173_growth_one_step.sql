-- A Claude search, one small step at a time (growth-finder ?collect=1, every minute):
-- busy_until: the step that's running holds the search, so the next minute's call skips instead of doing the same
--   work again (two at once read or checked the same things and wrote over each other's progress);
-- read_ids: the niches whose result has been read (one per step: reading all six in one call was cut off part-way);
-- next_requests: niches that paused part-way, to carry on in a new batch once every result is read;
-- note: why a niche found nothing, for the search's message if none of them did.
alter table public.growth_runs add column if not exists busy_until timestamptz;
alter table public.growth_runs add column if not exists read_ids text[] not null default '{}';
alter table public.growth_runs add column if not exists next_requests jsonb not null default '{}';
alter table public.growth_runs add column if not exists note text not null default '';

-- The panel's runs leave out the requests and the creators still to check (large, and not for showing).
create or replace function public.admin_growth()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  return jsonb_build_object(
    'settings', (select to_jsonb(g) - 'id' from public.growth_settings g where id = 1),
    'counts', (select jsonb_build_object(
        'found', count(*),
        'waiting', count(*) filter (where status = 'ready'),
        'queued', count(*) filter (where status = 'approved'),
        'sent', count(*) filter (where sent_at is not null),
        'sent_today', count(*) filter (where sent_at >= private.day_start() or followed_at >= private.day_start()),
        'clicked', count(*) filter (where clicked_at is not null),
        'joined', count(*) filter (where joined_at is not null),
        'unsubscribed', count(*) filter (where status = 'unsubscribed'),
        'suppressed', (select count(*) from public.growth_suppress))
      from public.growth_leads),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'sent', s, 'joined', j) order by d) from (
        select (coalesce(sent_at, followed_at) at time zone 'Asia/Kolkata')::date as d, count(*) as s, count(*) filter (where joined_at is not null) as j
        from public.growth_leads where coalesce(sent_at, followed_at) > now() - interval '30 days' group by 1) x), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(to_jsonb(l) - 'token' order by l.created_at desc) from (select * from public.growth_leads order by created_at desc limit 400) l), '[]'::jsonb),
    -- The last searches, and what Claude has cost this month (estimated at list prices).
    'runs', coalesce((select jsonb_agg(to_jsonb(r) - 'request' - 'found' - 'next_requests' order by r.at desc) from (select * from public.growth_runs order by at desc limit 10) r), '[]'::jsonb),
    'month_cost', (select coalesce(sum(cost_usd), 0) from public.growth_runs where at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'));
end;
$$;
