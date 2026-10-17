-- A small diagnostic log from her devices (for now: turning phone alerts on, and why it failed),
-- so problems on a phone can be seen without having the phone. Creator only; kept 30 days.

create table if not exists public.app_events (
  id         bigint generated always as identity primary key,
  kind       text not null check (char_length(kind) <= 40),
  detail     text not null default '' check (char_length(detail) <= 500),
  device     text not null default '' check (char_length(device) <= 300),
  created_at timestamptz not null default now()
);
alter table public.app_events enable row level security;
drop policy if exists "creator logs events" on public.app_events;
create policy "creator logs events" on public.app_events for insert to authenticated with check (public.is_creator());
drop policy if exists "creator reads events" on public.app_events;
create policy "creator reads events" on public.app_events for select to authenticated using (public.is_creator());
revoke all on public.app_events from anon;
grant select, insert on public.app_events to authenticated;

select cron.unschedule('app-events-cleanup') where exists (select 1 from cron.job where jobname = 'app-events-cleanup');
select cron.schedule('app-events-cleanup', '15 1 * * *', $$delete from public.app_events where created_at < now() - interval '30 days'$$);
