-- Alerts kept in the app: every event alert sent to her phones (a new request, a message, an accepted
-- quote, an approved draft, a payment...) is also kept here, so she can find it later in Alerts, even
-- if she missed the notification or turned phone alerts off. The casual ones (water and break nudges,
-- "Send a test") aren't kept. Each person on her team has their own unread count.

create table if not exists public.creator_alerts (
  id bigint generated always as identity primary key,
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  kind text not null default '' check (char_length(kind) <= 40),
  title text not null check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 600),
  url text not null default '' check (char_length(url) <= 500),
  tag text not null default '' check (char_length(tag) <= 80),
  created_at timestamptz not null default now()
);
create index if not exists creator_alerts_creator_idx on public.creator_alerts (creator_id, created_at desc);
alter table public.creator_alerts enable row level security;
-- Her team reads them; only the server (sending the alert) writes them.
drop policy if exists "team reads alerts" on public.creator_alerts;
create policy "team reads alerts" on public.creator_alerts for select to authenticated
  using (creator_id = (select public.current_creator()) and (select public.team_role()) is not null);

-- When each login last opened Alerts, per studio.
create table if not exists public.alert_seen (
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (creator_id, user_id)
);
alter table public.alert_seen enable row level security;

-- How many alerts arrived since this login last opened Alerts.
create or replace function public.alerts_unread()
returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::integer from public.creator_alerts a
  where a.creator_id = public.current_creator() and public.team_role() is not null
    and a.created_at > coalesce((select s.seen_at from public.alert_seen s where s.creator_id = a.creator_id and s.user_id = auth.uid()), '-infinity'::timestamptz);
$$;
revoke execute on function public.alerts_unread() from public, anon;
grant execute on function public.alerts_unread() to authenticated;

-- She opened Alerts: everything up to now is seen (for this login). Returns when she'd last looked.
create or replace function public.alerts_seen()
returns timestamptz
language plpgsql security definer
set search_path = public
as $$
declare
  v_creator integer := public.current_creator();
  v_before timestamptz;
begin
  if v_creator is null or auth.uid() is null or public.team_role() is null then return null; end if;
  select seen_at into v_before from public.alert_seen where creator_id = v_creator and user_id = auth.uid();
  insert into public.alert_seen (creator_id, user_id, seen_at) values (v_creator, auth.uid(), now())
  on conflict (creator_id, user_id) do update set seen_at = now();
  return v_before;
end;
$$;
revoke execute on function public.alerts_seen() from public, anon;
grant execute on function public.alerts_seen() to authenticated;

-- Kept for 90 days.
select cron.unschedule('creator-alerts-cleanup') where exists (select 1 from cron.job where jobname = 'creator-alerts-cleanup');
select cron.schedule('creator-alerts-cleanup', '25 1 * * *', $$delete from public.creator_alerts where created_at < now() - interval '90 days'$$);
