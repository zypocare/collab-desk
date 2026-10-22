-- A brand connects its own Instagram (Settings › Company & Instagram). Creators then see the brand's real
-- handle, photo and followers, marked "Verified on Instagram", on its requests. Only the profile is read
-- (instagram_business_basic); nothing is posted and no messages are read.

-- 1. The connected account, one per brand team ------------------------------------------------------------
create table if not exists public.brand_ig (
  owner uuid primary key references auth.users (id) on delete cascade,
  ig_user_id text not null unique,
  username text not null,
  name text not null default '',
  picture text not null default '',
  followers integer,
  media_count integer,
  connected_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);
alter table public.brand_ig enable row level security;
drop policy if exists "brand team reads its instagram" on public.brand_ig;
create policy "brand team reads its instagram" on public.brand_ig for select to authenticated using (owner = (select public.brand_owner()));

-- The token stays out of reach of every signed-in person (row security on, no policy); only the server
-- functions, which bypass it, read it. The same as the creators' ig_token.
create table if not exists public.brand_ig_token (
  owner uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  expires_at timestamptz
);
alter table public.brand_ig_token enable row level security;
revoke all on public.brand_ig_token from anon, authenticated;

-- 2. Who may connect: a brand login (not a creator), as the team's Admin --------------------------------------
create or replace function public.brand_ig_owner()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select public.brand_owner()
  where auth.uid() is not null and not public.is_creator() and private.team_role() = 'admin';
$$;
revoke execute on function public.brand_ig_owner() from public, anon;
grant execute on function public.brand_ig_owner() to authenticated;

create or replace function public.brand_ig_get()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('username', g.username, 'name', g.name, 'picture', g.picture, 'followers', g.followers,
    'media_count', g.media_count, 'connected_at', g.connected_at, 'synced_at', g.synced_at)
  from public.brand_ig g where g.owner = public.brand_owner() and auth.uid() is not null;
$$;
revoke execute on function public.brand_ig_get() from public, anon;
grant execute on function public.brand_ig_get() to authenticated;

create or replace function public.brand_ig_disconnect()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid := public.brand_ig_owner();
begin
  if v_owner is null then
    raise exception 'Only your team''s Admin can disconnect Instagram.';
  end if;
  delete from public.brand_ig_token where owner = v_owner;
  delete from public.brand_ig where owner = v_owner;
end;
$$;
revoke execute on function public.brand_ig_disconnect() from public, anon;
grant execute on function public.brand_ig_disconnect() to authenticated;

-- 3. What a creator sees: the verified account behind one of their brands -------------------------------------
create or replace function public.brand_verified(p_brand uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('username', g.username, 'name', g.name, 'picture', g.picture, 'followers', g.followers)
  from public.brands b
  join public.brand_members m on m.brand_id = b.id
  join public.brand_ig g on g.owner = private.owner_of(m.profile_id)
  where b.id = p_brand and public.is_creator() and b.creator_id = public.current_creator()
  order by g.connected_at
  limit 1;
$$;
revoke execute on function public.brand_verified(uuid) from public, anon;
grant execute on function public.brand_verified(uuid) to authenticated;
