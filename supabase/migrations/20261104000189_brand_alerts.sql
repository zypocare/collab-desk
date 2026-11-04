-- Alerts for brands, like the creator's: every phone alert a brand login gets (a quote, a draft to approve,
-- a message, an invoice, an application...) is also kept in the app for 90 days, behind the bell on Today,
-- even when no phone is set up or that kind of phone alert is switched off. Each login has its own list.

create table if not exists public.brand_alerts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default '',
  title text not null,
  body text not null default '',
  url text not null default '',
  tag text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists brand_alerts_user_idx on public.brand_alerts (user_id, created_at desc);
alter table public.brand_alerts enable row level security; -- read through the functions below
revoke all on public.brand_alerts from anon, authenticated;

create table if not exists public.brand_alert_seen (
  user_id uuid primary key references auth.users (id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.brand_alert_seen enable row level security;
revoke all on public.brand_alert_seen from anon, authenticated;

-- The brand login an email goes to (no phone needed, unlike brand_push_target). Server only.
create or replace function public.brand_alert_user(p_email text)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select u.id from auth.users u
  where lower(u.email) = lower(btrim(p_email))
    and exists (select 1 from public.brand_members m where m.profile_id = u.id)
    and not exists (select 1 from public.creator_settings s where lower(s.creator_email) = lower(u.email))
  limit 1;
$$;
revoke execute on function public.brand_alert_user(text) from public, anon, authenticated;
grant execute on function public.brand_alert_user(text) to service_role;

create or replace function public.brand_alerts_list()
returns setof public.brand_alerts
language sql stable security definer
set search_path = public
as $$
  select a.* from public.brand_alerts a
  where a.user_id = auth.uid() and a.created_at > now() - interval '90 days'
  order by a.created_at desc
  limit 150;
$$;

create or replace function public.brand_alerts_unread()
returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::integer from public.brand_alerts a
  where a.user_id = auth.uid() and a.created_at > now() - interval '90 days'
    and a.created_at > coalesce((select s.seen_at from public.brand_alert_seen s where s.user_id = auth.uid()), '-infinity'::timestamptz);
$$;

-- Opened Alerts: everything so far is seen. Returns when they'd last looked, to mark what's new.
create or replace function public.brand_alerts_seen()
returns timestamptz
language plpgsql security definer
set search_path = public
as $$
declare
  v_before timestamptz;
begin
  if auth.uid() is null then
    return null;
  end if;
  select seen_at into v_before from public.brand_alert_seen where user_id = auth.uid();
  insert into public.brand_alert_seen (user_id, seen_at) values (auth.uid(), now())
  on conflict (user_id) do update set seen_at = now();
  return v_before;
end;
$$;

create or replace function public.brand_alerts_hide(p_ids bigint[])
returns void
language sql security definer
set search_path = public
as $$
  delete from public.brand_alerts where user_id = auth.uid() and id = any (coalesce(p_ids, '{}'));
$$;

create or replace function public.brand_alerts_clear()
returns void
language sql security definer
set search_path = public
as $$
  delete from public.brand_alerts where user_id = auth.uid();
$$;

revoke execute on function public.brand_alerts_list(), public.brand_alerts_unread(), public.brand_alerts_seen(),
  public.brand_alerts_hide(bigint[]), public.brand_alerts_clear() from public, anon;
grant execute on function public.brand_alerts_list(), public.brand_alerts_unread(), public.brand_alerts_seen(),
  public.brand_alerts_hide(bigint[]), public.brand_alerts_clear() to authenticated;
