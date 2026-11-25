-- Daily 12:00 PM IST phone notification reminding creators to follow up on collabs in Negotiating stage.
-- India Standard Time is UTC + 5:30, so 12:00 PM IST = 06:30 UTC ('30 6 * * *').

select cron.unschedule('negotiating-alerts') where exists (select 1 from cron.job where jobname = 'negotiating-alerts');
select cron.schedule('negotiating-alerts', '30 6 * * *', $$select private.call_function('negotiating-alerts')$$);
