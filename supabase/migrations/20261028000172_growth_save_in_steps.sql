-- A Claude search is saved in small steps (the wide search, one request per niche, brings back about 60 creators,
-- and checking all their pages in one go was cut off by the server's limits, so nothing was saved).
-- found: creators Claude returned that are still to be checked and queued; results_read: the batch's results are
-- in; reading: tries at reading them, so a read that keeps failing ends the search with a reason.
alter table public.growth_runs add column if not exists found jsonb not null default '[]';
alter table public.growth_runs add column if not exists results_read boolean not null default false;
alter table public.growth_runs add column if not exists reading integer not null default 0;

-- One small step a minute while a search is open (waiting for Claude, or checking creators' pages).
select cron.unschedule('growth-collect') where exists (select 1 from cron.job where jobname = 'growth-collect');
select cron.schedule('growth-collect', '* * * * *', $$select private.call_function('growth-finder?collect=1')
  where exists (select 1 from public.growth_runs where batch_id is not null and finished_at is null)$$);

-- The panel's runs leave out the request and the creators still to check (large, and not for showing).
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
    'runs', coalesce((select jsonb_agg(to_jsonb(r) - 'request' - 'found' order by r.at desc) from (select * from public.growth_runs order by at desc limit 10) r), '[]'::jsonb),
    'month_cost', (select coalesce(sum(cost_usd), 0) from public.growth_runs where at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'));
end;
$$;
