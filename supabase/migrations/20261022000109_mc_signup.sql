-- Miracle for many creators, part 10: creators sign up, and the people who run Miracle approve them.
-- A creator claims name.miracleapp.live, signs in with an email code and sends a short request; it
-- waits as "pending" until an admin approves it (or declines it). Only approved creators get a studio.

-- 1. Who runs Miracle -----------------------------------------------------------------------------
create table if not exists public.app_admins (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  added_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
insert into public.app_admins (email) values ('jtndra1988@gmail.com') on conflict do nothing;

create or replace function public.is_app_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$ select public.jwt_email() <> '' and exists (select 1 from public.app_admins a where a.email = public.jwt_email()); $$;

-- 2. Requests -------------------------------------------------------------------------------------
alter table public.creator_settings drop constraint if exists creator_settings_status_check;
alter table public.creator_settings add constraint creator_settings_status_check check (status in ('pending', 'active', 'paused', 'declined'));
alter table public.creator_settings add column if not exists request_note text not null default '';
alter table public.creator_settings add column if not exists requested_at timestamptz;
alter table public.creator_settings add column if not exists approved_at timestamptz;

-- Only approved creators have a studio (owners and their teams); a request waiting for approval doesn't.
create or replace function public.my_creators()
returns setof integer
language sql stable security definer
set search_path = public
as $$
  select s.id from public.creator_settings s
  where public.jwt_email() <> '' and lower(s.creator_email) = public.jwt_email() and s.status in ('active', 'paused')
  union
  select t.creator_id from public.team_members t join public.creator_settings s on s.id = t.creator_id
  where public.jwt_email() <> '' and t.email = public.jwt_email() and s.status in ('active', 'paused');
$$;

-- The signed-in person's own request, while it waits (or after it was declined).
create or replace function public.my_creator_request()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('id', s.id, 'slug', s.slug, 'status', s.status, 'name', s.display_name, 'handle', s.handle,
    'niche', s.niche, 'city', s.city, 'note', s.request_note, 'requested_at', s.requested_at)
  from public.creator_settings s
  where public.jwt_email() <> '' and lower(s.creator_email) = public.jwt_email() and s.status in ('pending', 'declined');
$$;
revoke execute on function public.my_creator_request() from anon;

-- Ask to join: claims the name and waits for approval. Sending it again (say after a decline) updates it.
create or replace function public.request_creator_account(p_slug text, p_name text, p_handle text, p_niche text, p_city text, p_note text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := public.jwt_email();
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_handle text := regexp_replace(lower(btrim(coalesce(p_handle, ''))), '^@+', '');
  v_mine public.creator_settings;
  v_prefix text;
  v_id integer;
  v_admin text;
begin
  if v_email = '' then
    raise exception 'Sign in with your email first.';
  end if;
  select * into v_mine from public.creator_settings s where lower(s.creator_email) = v_email;
  if v_mine.id is not null and v_mine.status in ('active', 'paused') then
    raise exception 'You already have a studio at %.miracleapp.live.', v_mine.slug;
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'Add your name as brands should see it.';
  end if;
  if v_handle !~ '^[a-z0-9._]{1,30}$' then
    raise exception 'Add your Instagram handle (letters, numbers, dots and underscores).';
  end if;
  if exists (select 1 from public.creator_settings s where lower(s.handle) = v_handle and s.id is distinct from v_mine.id) then
    raise exception '@% already has a Miracle page. If it''s yours, sign in with the email you used for it.', v_handle;
  end if;
  if v_slug is distinct from v_mine.slug and not public.slug_free(v_slug) then
    raise exception '%.miracleapp.live is taken or can''t be used. Try another name.', v_slug;
  end if;
  -- Collab codes start with the initials of her name (two letters).
  v_prefix := upper(left(regexp_replace(initcap(v_name), '[^A-Z]', '', 'g') || 'MC', 2));

  if v_mine.id is null then
    insert into public.creator_settings (creator_email, slug, display_name, handle, niche, city, request_note, status, requested_at, site_url, app_name, code_prefix)
    values (v_email, v_slug, v_name, v_handle, btrim(coalesce(p_niche, '')), btrim(coalesce(p_city, '')), left(btrim(coalesce(p_note, '')), 600),
      'pending', now(), 'https://' || v_slug || '.miracleapp.live', 'Miracle', v_prefix)
    returning id into v_id;
  else
    update public.creator_settings set slug = v_slug, display_name = v_name, handle = v_handle, niche = btrim(coalesce(p_niche, '')),
      city = btrim(coalesce(p_city, '')), request_note = left(btrim(coalesce(p_note, '')), 600), status = 'pending', requested_at = now(),
      site_url = 'https://' || v_slug || '.miracleapp.live', code_prefix = v_prefix
    where id = v_mine.id
    returning id into v_id;
  end if;

  -- Tell the people who run Miracle.
  for v_admin in select a.email from public.app_admins a loop
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (v_id, 'creator_request', v_admin, jsonb_build_object('slug', v_slug, 'name', v_name, 'handle', v_handle,
      'niche', btrim(coalesce(p_niche, '')), 'city', btrim(coalesce(p_city, '')), 'note', left(btrim(coalesce(p_note, '')), 600), 'email', v_email));
  end loop;
  return public.my_creator_request();
end;
$$;
revoke execute on function public.request_creator_account(text, text, text, text, text, text) from anon;

-- 3. The approval queue ---------------------------------------------------------------------------
create or replace function public.admin_creators()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Only Miracle admins can see this.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.display_name, 'handle', s.handle, 'niche', s.niche,
      'city', s.city, 'email', s.creator_email, 'note', s.request_note, 'status', s.status, 'requested_at', s.requested_at,
      'approved_at', s.approved_at, 'created_at', s.created_at,
      'collabs', (select count(*) from public.collabs c where c.creator_id = s.id))
      order by (s.status = 'pending') desc, s.requested_at desc nulls last, s.id)
    from public.creator_settings s), '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_creators() from anon;

-- Approve, decline, pause or bring back a creator. Approving sends the welcome email.
create or replace function public.admin_set_creator(p_id integer, p_status text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
begin
  if not public.is_app_admin() then
    raise exception 'Only Miracle admins can do this.';
  end if;
  if p_status not in ('active', 'paused', 'declined', 'pending') then
    raise exception 'Unknown status %.', p_status;
  end if;
  select * into s from public.creator_settings where id = p_id;
  if s.id is null then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  update public.creator_settings set status = p_status,
    approved_at = case when p_status = 'active' and approved_at is null then now() else approved_at end
  where id = p_id;
  if p_status = 'active' and s.status = 'pending' then
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (s.id, 'creator_approved', s.creator_email, jsonb_build_object('slug', s.slug, 'name', s.display_name, 'url', 'https://' || s.slug || '.miracleapp.live/studio'));
  elsif p_status = 'declined' and s.status = 'pending' then
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (s.id, 'creator_declined', s.creator_email, jsonb_build_object('slug', s.slug, 'name', s.display_name));
  end if;
  return public.admin_creators();
end;
$$;
revoke execute on function public.admin_set_creator(integer, text) from anon;

-- 4. The account a person signs in to now also says when their creator request is waiting ----------
CREATE OR REPLACE FUNCTION public.my_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.profiles;
  b public.brands;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    return null;
  end if;

  if public.is_creator() then
    return jsonb_build_object('role', 'creator', 'email', v_email, 'creator_id', public.current_creator());
  end if;

  -- Asked to join as a creator and not approved yet (or declined): they see where their request stands.
  if exists (select 1 from public.creator_settings s where lower(s.creator_email) = v_email and s.status in ('pending', 'declined')) then
    return jsonb_build_object('role', 'pending', 'email', v_email, 'request', public.my_creator_request());
  end if;

  select * into p from public.profiles where id = auth.uid();
  if p.id is null then
    insert into public.profiles (id, email) values (auth.uid(), v_email) returning * into p;
  end if;

  if v_email <> '' then
    insert into public.brand_members (profile_id, brand_id)
    select distinct auth.uid(), c.brand_id from public.collabs c where lower(c.contact_email) = v_email
    on conflict do nothing;
  end if;
  if p.brand_id is not null then
    insert into public.brand_members (profile_id, brand_id) values (auth.uid(), p.brand_id) on conflict do nothing;
  else
    update public.profiles set brand_id = (
      select m.brand_id from public.brand_members m where m.profile_id = auth.uid() order by m.created_at limit 1)
    where id = auth.uid() returning * into p;
  end if;

  select * into b from public.brands where id = p.brand_id;

  return jsonb_build_object(
    'role', 'brand',
    'email', p.email,
    'full_name', p.full_name,
    'phone', p.phone,
    'brand', case when b.id is null then null else jsonb_build_object(
      'id', b.id, 'name', b.name, 'instagram', b.instagram, 'website', b.website, 'category', b.category) end,
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by lower(x.name))
      from public.brand_members m join public.brands x on x.id = m.brand_id
      where m.profile_id = auth.uid()), '[]'::jsonb)
  );
end;
$function$;
