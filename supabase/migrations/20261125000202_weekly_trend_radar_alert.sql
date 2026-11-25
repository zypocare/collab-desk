-- Weekly Trend Radar proactive push nudge: Mondays at 10:00 AM IST (04:30 UTC).

select cron.unschedule('weekly-trend-radar')
  where exists (select 1 from cron.job where jobname = 'weekly-trend-radar');

select cron.schedule(
  'weekly-trend-radar',
  '30 4 * * 1',
  $$select private.call_function('creator-benchmarks')$$
);
