-- Phone notifications (Web Push, free): the creator's devices that asked for alerts.
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_id    uuid default auth.uid(),
  device     text not null default '',
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "creator manages own devices" on public.push_subscriptions
  for all to authenticated using (public.is_creator()) with check (public.is_creator());

-- The public half of the push key pair (safe to share; browsers need it to subscribe).
create or replace function public.push_public_key()
returns text
language sql stable security definer
set search_path = public
as $$
  select value from private.job_config where key = 'vapid_public';
$$;
grant execute on function public.push_public_key() to authenticated;
