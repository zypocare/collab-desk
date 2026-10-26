-- Growth Autopilot: one invitation every 2 minutes in sending hours (10 AM to 6 PM India), still up to the daily
-- number. Creators already queued lose their old 20-minute slots and go out at the new pace.
select cron.unschedule('growth-send') where exists (select 1 from cron.job where jobname = 'growth-send');
select cron.schedule('growth-send', '*/2 * * * *', $$select private.growth_send_due()$$);
update public.growth_leads set send_after = now() where status = 'approved' and send_after > now();
