-- The growth check-up runs by itself: every morning the growth-checkup function makes a new one for each
-- creator whose last is two weeks old, and tells her (phone alert and email). The Today page shows a card
-- until she has opened it.

alter table public.growth_checkups add column if not exists auto boolean not null default false;
alter table public.growth_checkups add column if not exists seen_at timestamptz;

-- 9 am in India.
select cron.unschedule('growth-checkup') where exists (select 1 from cron.job where jobname = 'growth-checkup');
select cron.schedule('growth-checkup', '30 3 * * *', $$select private.call_function('growth-checkup')$$);
