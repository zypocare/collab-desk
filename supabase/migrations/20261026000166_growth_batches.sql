-- Growth Autopilot: Claude searches through the Message Batches API (no time limit, half price). The search is
-- handed over and kept on its run; every 5 minutes, while one is pending, growth-finder?collect=1 picks up what
-- Claude found. Runs that were stopped by the old time limit (never handed over) are closed off.
alter table public.growth_runs add column if not exists batch_id text;
alter table public.growth_runs add column if not exists request jsonb;
update public.growth_runs set finished_at = now(), error = 'stopped: the search took longer than the server allows'
where finished_at is null and batch_id is null and at < now() - interval '10 minutes';

select cron.unschedule('growth-collect') where exists (select 1 from cron.job where jobname = 'growth-collect');
select cron.schedule('growth-collect', '*/5 * * * *', $$select private.call_function('growth-finder?collect=1')
  where exists (select 1 from public.growth_runs where batch_id is not null and finished_at is null)$$);

-- The panel's runs leave out the search request itself (large, and not for showing).
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
    'runs', coalesce((select jsonb_agg(to_jsonb(r) - 'request' order by r.at desc) from (select * from public.growth_runs order by at desc limit 10) r), '[]'::jsonb),
    'month_cost', (select coalesce(sum(cost_usd), 0) from public.growth_runs where at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'));
end;
$$;

