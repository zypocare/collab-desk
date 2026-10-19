-- Phone reminders about money still to come in, at times she picks (9 AM, 1 PM, 5 PM and 9 PM to
-- start). The job runs on the hour and sends only at her times, and only when something is pending.

alter table public.creator_settings add column if not exists pay_alerts boolean not null default true;
alter table public.creator_settings add column if not exists pay_alert_hours smallint[] not null default '{9,13,17,21}';
alter table public.creator_settings drop constraint if exists creator_settings_pay_alert_hours_check;
alter table public.creator_settings add constraint creator_settings_pay_alert_hours_check
  check (cardinality(pay_alert_hours) <= 6 and pay_alert_hours <@ array[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]::smallint[]);

-- Every hour on the hour (India time is UTC + 5:30, so :30 in UTC).
select cron.unschedule('payment-alerts') where exists (select 1 from cron.job where jobname = 'payment-alerts');
select cron.schedule('payment-alerts', '30 * * * *', $$select private.call_function('payment-alerts')$$);
