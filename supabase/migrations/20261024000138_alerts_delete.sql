-- Alerts: delete one, or clear them all. Each person on her team clears their own list; the alert stays
-- for the others (and is removed for everyone after 90 days, as before).

alter table public.alert_seen add column if not exists cleared_at timestamptz;

create table if not exists public.alert_hidden (
  alert_id bigint not null references public.creator_alerts (id) on delete cascade,
  user_id uuid not null,
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, alert_id)
);
alter table public.alert_hidden enable row level security;
revoke all on public.alert_hidden from anon, authenticated;

-- What this login still has: newest first, without the ones they deleted or cleared.
create or replace function public.alerts_list()
returns setof public.creator_alerts
language sql stable security definer
set search_path = public
as $$
  select a.* from public.creator_alerts a
  where a.creator_id = public.current_creator() and public.team_role() is not null and auth.uid() is not null
    and a.created_at > coalesce((select s.cleared_at from public.alert_seen s where s.creator_id = a.creator_id and s.user_id = auth.uid()), '-infinity'::timestamptz)
    and not exists (select 1 from public.alert_hidden h where h.user_id = auth.uid() and h.alert_id = a.id)
  order by a.created_at desc
  limit 150;
$$;
revoke execute on function public.alerts_list() from public, anon;
grant execute on function public.alerts_list() to authenticated;

create or replace function public.alerts_unread()
returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::integer from public.creator_alerts a
  where a.creator_id = public.current_creator() and public.team_role() is not null
    and a.created_at > coalesce((select greatest(s.seen_at, s.cleared_at) from public.alert_seen s where s.creator_id = a.creator_id and s.user_id = auth.uid()), '-infinity'::timestamptz)
    and not exists (select 1 from public.alert_hidden h where h.user_id = auth.uid() and h.alert_id = a.id);
$$;
revoke execute on function public.alerts_unread() from public, anon;
grant execute on function public.alerts_unread() to authenticated;

-- Delete these from this login's list (only alerts of the studio they're in).
create or replace function public.alerts_hide(p_ids bigint[])
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_creator integer := public.current_creator();
  v_n integer;
begin
  if v_creator is null or auth.uid() is null or public.team_role() is null then raise exception 'Not allowed'; end if;
  insert into public.alert_hidden (alert_id, user_id, creator_id)
  select a.id, auth.uid(), v_creator from public.creator_alerts a
  where a.id = any (coalesce(p_ids, '{}')) and a.creator_id = v_creator
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.alerts_hide(bigint[]) from public, anon;
grant execute on function public.alerts_hide(bigint[]) to authenticated;

-- Clear all: everything up to now leaves this login's list.
create or replace function public.alerts_clear()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_creator integer := public.current_creator();
begin
  if v_creator is null or auth.uid() is null or public.team_role() is null then raise exception 'Not allowed'; end if;
  insert into public.alert_seen (creator_id, user_id, seen_at, cleared_at) values (v_creator, auth.uid(), now(), now())
  on conflict (creator_id, user_id) do update set seen_at = now(), cleared_at = now();
  delete from public.alert_hidden where user_id = auth.uid() and creator_id = v_creator;
end;
$$;
revoke execute on function public.alerts_clear() from public, anon;
grant execute on function public.alerts_clear() to authenticated;
