-- Her team: people she adds by email (a manager, a partner) sign in with their own email and get
-- the full studio. Only she can add or remove them. They can get copies of her notification emails.

create table public.team_members (
  email       text primary key check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name        text not null default '',
  role        text not null default 'manager' check (role in ('manager')),
  copy_emails boolean not null default true,
  added_at    timestamptz not null default now(),
  last_seen_at timestamptz
);

-- The owner: the one sign-in email in her settings.
create or replace function public.is_owner()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.creator_settings s
    where lower(s.creator_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- "Creator" now means the owner or someone on her team: every studio rule follows from this.
create or replace function public.is_creator()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_owner() or exists (
    select 1 from public.team_members t where t.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.team_members enable row level security;
create policy "team can see the team" on public.team_members for select to authenticated using (public.is_creator());
create policy "owner manages the team" on public.team_members for all to authenticated using (public.is_owner()) with check (public.is_owner());
-- A team member can change their own email copies.
create or replace function public.team_set_copies(p_on boolean)
returns void
language sql security definer
set search_path = public
as $$
  update public.team_members set copy_emails = p_on where email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;
revoke execute on function public.team_set_copies(boolean) from anon;

-- The team can't change who owns the studio.
create or replace function public.creator_settings_guard()
returns trigger
language plpgsql
as $$
begin
  if new.creator_email is distinct from old.creator_email and auth.uid() is not null and not public.is_owner() then
    raise exception 'Only % can change the sign-in email.', old.creator_email;
  end if;
  return new;
end;
$$;
drop trigger if exists creator_settings_guard on public.creator_settings;
create trigger creator_settings_guard
  before update on public.creator_settings
  for each row execute function public.creator_settings_guard();

-- Account: team members are studio users too, and the app knows who is who.
create or replace function public.studio_account()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  t public.team_members;
begin
  if public.is_owner() then
    return jsonb_build_object('role', 'creator', 'email', v_email, 'team_role', 'owner');
  end if;
  select * into t from public.team_members where email = v_email;
  if t.email is not null then
    update public.team_members set last_seen_at = now() where email = v_email;
    return jsonb_build_object('role', 'creator', 'email', v_email, 'team_role', t.role, 'name', t.name);
  end if;
  return null;
end;
$$;
revoke execute on function public.studio_account() from anon;

-- Who else gets copies of her notification emails.
create or replace function public.team_copy_emails()
returns text[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(email), '{}') from public.team_members where copy_emails;
$$;
revoke execute on function public.team_copy_emails() from anon, authenticated;
