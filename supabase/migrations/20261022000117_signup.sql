-- Sign-up from the website, at app.miracleapp.live/signup.
-- Creators send a short profile without choosing a link; once approved they pick name.miracleapp.live.
-- Brands sign up on their own (no creator needed) and go straight in; their company details are kept
-- once and copied to each creator they work with.

-- 1. A creator's link can wait until approval -----------------------------------------------------------------
-- Until then the row holds a placeholder name ("new-…") that never opens as a page.
alter table public.creator_settings add column if not exists slug_chosen boolean not null default true;
alter table public.creator_settings add column if not exists signup jsonb not null default '{}'::jsonb;

create or replace function private.page_creator()
returns integer
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_set text := nullif(current_setting('app.creator', true), '');
  v_slug text := private.header_slug();
begin
  if v_set is not null then
    return v_set::integer;
  end if;
  if v_slug is not null then
    return (select s.id from public.creator_settings s where s.slug = v_slug and s.status = 'active' and s.slug_chosen);
  end if;
  return coalesce(public.current_creator(), (select min(s.id) from public.creator_settings s having count(*) = 1));
end;
$$;
revoke execute on function private.page_creator() from public, anon, authenticated;

-- Placeholder names can't be chosen as a link.
create or replace function public.slug_free(p_slug text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select lower(btrim(coalesce(p_slug, ''))) ~ '^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$'
    and lower(btrim(p_slug)) !~ '^new-'
    and lower(btrim(p_slug)) not in ('www', 'app', 'api', 'admin', 'mail', 'email', 'studio', 'brand', 'brands', 'help', 'support',
                                     'blog', 'status', 'miracle', 'docs', 'login', 'signup', 'static', 'cdn', 'assets', 'test', 'dev', 'staging')
    and not exists (select 1 from public.creator_settings s where s.slug = lower(btrim(p_slug)));
$$;
grant execute on function public.slug_free(text) to anon, authenticated;

-- 2. Creator sign-up ---------------------------------------------------------------------------------------------
create or replace function public.my_creator_request()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('id', s.id, 'slug', case when s.slug_chosen then s.slug end, 'status', s.status, 'name', s.display_name,
    'handle', s.handle, 'niche', s.niche, 'city', s.city, 'note', s.request_note, 'requested_at', s.requested_at,
    'whatsapp', s.whatsapp, 'languages', to_jsonb(coalesce(s.content_languages, '{}'::text[])), 'signup', s.signup)
  from public.creator_settings s
  where public.jwt_email() <> '' and lower(s.creator_email) = public.jwt_email() and s.status in ('pending', 'declined');
$$;
grant execute on function public.my_creator_request() to authenticated;

create or replace function public.creator_signup(p_name text, p_handle text, p_whatsapp text, p_city text, p_niches text[],
  p_languages text[], p_followers text, p_collabs text, p_heard text, p_note text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := public.jwt_email();
  v_name text := btrim(coalesce(p_name, ''));
  v_handle text := regexp_replace(lower(btrim(coalesce(p_handle, ''))), '^@+', '');
  v_niches text[] := (select coalesce(array_agg(btrim(x)), '{}') from (select x from unnest(coalesce(p_niches, '{}')) x where btrim(x) <> '' limit 3) n);
  v_langs text[] := (select coalesce(array_agg(btrim(x)), '{}') from (select x from unnest(coalesce(p_languages, '{}')) x where btrim(x) <> '' limit 12) l);
  v_signup jsonb := jsonb_build_object('followers', left(btrim(coalesce(p_followers, '')), 40), 'collabs', left(btrim(coalesce(p_collabs, '')), 40),
                                       'heard', left(btrim(coalesce(p_heard, '')), 60), 'niches', to_jsonb(v_niches));
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
    raise exception 'You already have a Miracle studio. Sign in to it instead.';
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
  if regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g') !~ '^\d{10,13}$' then
    raise exception 'Add your WhatsApp number so we can reach you.';
  end if;
  if btrim(coalesce(p_city, '')) = '' then
    raise exception 'Add your city.';
  end if;
  if cardinality(v_niches) = 0 then
    raise exception 'Pick what you create (up to 3).';
  end if;
  -- Collab codes start with the initials of the name (two letters).
  v_prefix := upper(left(regexp_replace(initcap(v_name), '[^A-Z]', '', 'g') || 'MC', 2));

  if v_mine.id is null then
    insert into public.creator_settings (creator_email, slug, slug_chosen, display_name, handle, niche, city, whatsapp, content_languages,
      request_note, signup, status, requested_at, site_url, app_name, code_prefix)
    values (v_email, 'new-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10), false, v_name, v_handle,
      array_to_string(v_niches, ', '), btrim(p_city), btrim(p_whatsapp), v_langs, left(btrim(coalesce(p_note, '')), 600), v_signup,
      'pending', now(), 'https://app.miracleapp.live', 'Miracle', v_prefix)
    returning id into v_id;
  else
    update public.creator_settings set display_name = v_name, handle = v_handle, niche = array_to_string(v_niches, ', '),
      city = btrim(p_city), whatsapp = btrim(p_whatsapp), content_languages = v_langs, request_note = left(btrim(coalesce(p_note, '')), 600),
      signup = v_signup, status = 'pending', requested_at = now(), code_prefix = v_prefix
    where id = v_mine.id
    returning id into v_id;
  end if;

  -- Tell the people who run Miracle.
  for v_admin in select a.email from public.app_admins a loop
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (v_id, 'creator_request', v_admin, jsonb_build_object('slug', '', 'name', v_name, 'handle', v_handle,
      'niche', array_to_string(v_niches, ', '), 'city', btrim(p_city), 'note', left(btrim(coalesce(p_note, '')), 600), 'email', v_email,
      'followers', v_signup ->> 'followers', 'collabs', v_signup ->> 'collabs'));
  end loop;
  return public.my_creator_request();
end;
$$;
revoke execute on function public.creator_signup(text, text, text, text, text[], text[], text, text, text, text) from public, anon;
grant execute on function public.creator_signup(text, text, text, text, text[], text[], text, text, text, text) to authenticated;

-- Approved without a link yet: pick one (once). Only the creator, not their team.
create or replace function public.choose_my_link(p_slug text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  s public.creator_settings;
begin
  select * into s from public.creator_settings c where lower(c.creator_email) = public.jwt_email() and c.status = 'active';
  if s.id is null then
    raise exception 'Only an approved creator can pick a link.';
  end if;
  if s.slug_chosen then
    return jsonb_build_object('slug', s.slug);
  end if;
  if not public.slug_free(v_slug) then
    raise exception '%.miracleapp.live is taken or can''t be used. Try another.', v_slug;
  end if;
  update public.creator_settings set slug = v_slug, slug_chosen = true, site_url = 'https://' || v_slug || '.miracleapp.live'
  where id = s.id;
  return jsonb_build_object('slug', v_slug);
end;
$$;
revoke execute on function public.choose_my_link(text) from public, anon;
grant execute on function public.choose_my_link(text) to authenticated;

-- 3. The approval queue knows who still picks a link -------------------------------------------------------------
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
    select jsonb_agg(jsonb_build_object('id', s.id, 'slug', case when s.slug_chosen then s.slug end, 'name', s.display_name, 'handle', s.handle,
      'niche', s.niche, 'city', s.city, 'email', s.creator_email, 'note', s.request_note, 'status', s.status, 'requested_at', s.requested_at,
      'approved_at', s.approved_at, 'created_at', s.created_at, 'whatsapp', s.whatsapp,
      'languages', to_jsonb(coalesce(s.content_languages, '{}'::text[])), 'signup', s.signup,
      'collabs', (select count(*) from public.collabs c where c.creator_id = s.id),
      'brands', (select count(*) from public.brands b where b.creator_id = s.id),
      'paid', (select coalesce(sum(i.total), 0) from public.invoices i where i.creator_id = s.id and i.status = 'paid'),
      'team', (select count(*) from public.team_members t where t.creator_id = s.id),
      'instagram', exists (select 1 from public.ig_token g where g.id = s.id),
      'last_active', greatest(
        (select max(u.last_sign_in_at) from auth.users u where lower(u.email) = lower(s.creator_email)),
        (select max(t.last_seen_at) from public.team_members t where t.creator_id = s.id)))
      order by (s.status = 'pending') desc, s.requested_at desc nulls last, s.id)
    from public.creator_settings s), '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_creators() from anon;

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
    values (s.id, 'creator_approved', s.creator_email, jsonb_build_object('slug', case when s.slug_chosen then s.slug else '' end,
      'name', s.display_name,
      'url', case when s.slug_chosen then 'https://' || s.slug || '.miracleapp.live/studio' else 'https://app.miracleapp.live/signup' end));
  elsif p_status = 'declined' and s.status = 'pending' then
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (s.id, 'creator_declined', s.creator_email, jsonb_build_object('slug', case when s.slug_chosen then s.slug else '' end, 'name', s.display_name));
  end if;
  return public.admin_creators();
end;
$$;
revoke execute on function public.admin_set_creator(integer, text) from anon;

-- 4. Brand sign-up: the company, kept once for this login ---------------------------------------------------------
create table if not exists public.brand_profiles (
  owner uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text not null default 'Other',
  website text not null default '',
  instagram text not null default '',
  role text not null default '',
  city text not null default '',
  goals text[] not null default '{}',
  legal_name text not null default '',
  gstin text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.brand_profiles enable row level security;
drop policy if exists "own brand profile" on public.brand_profiles;
create policy "own brand profile" on public.brand_profiles for select to authenticated using (owner = auth.uid());

create or replace function public.brand_signup(p_name text, p_category text, p_website text, p_instagram text, p_full_name text,
  p_role text, p_phone text, p_city text, p_goals text[], p_legal_name text, p_gstin text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_gstin text := upper(regexp_replace(coalesce(p_gstin, ''), '\s', '', 'g'));
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    raise exception 'This email has a creator studio. Use a different email for your brand.';
  end if;
  if exists (select 1 from public.creator_settings s where lower(s.creator_email) = public.jwt_email() and s.status in ('pending', 'declined')) then
    raise exception 'This email has asked to join as a creator. Use a different email for your brand.';
  end if;
  if btrim(coalesce(p_name, '')) = '' or char_length(btrim(p_name)) > 120 then
    raise exception 'Add your brand name.';
  end if;
  if btrim(coalesce(p_full_name, '')) = '' then
    raise exception 'Add your name so creators know who they''re talking to.';
  end if;
  if v_gstin <> '' and v_gstin !~ '^[0-9]{2}[A-Z0-9]{13}$' then
    raise exception 'That GSTIN doesn''t look right. It has 15 characters, like 29ABCDE1234F1Z5.';
  end if;
  insert into public.brand_profiles (owner, name, category, website, instagram, role, city, goals, legal_name, gstin)
  values (auth.uid(), btrim(p_name), left(coalesce(nullif(btrim(p_category), ''), 'Other'), 40), left(btrim(coalesce(p_website, '')), 200),
    left(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', ''), 60), left(btrim(coalesce(p_role, '')), 60), left(btrim(coalesce(p_city, '')), 60),
    coalesce(p_goals[1:5], '{}'), left(btrim(coalesce(p_legal_name, '')), 160), v_gstin)
  on conflict (owner) do update set name = excluded.name, category = excluded.category, website = excluded.website,
    instagram = excluded.instagram, role = excluded.role, city = excluded.city, goals = excluded.goals,
    legal_name = excluded.legal_name, gstin = excluded.gstin, updated_at = now();
  insert into public.profiles (id, email) values (auth.uid(), public.jwt_email()) on conflict (id) do nothing;
  update public.profiles set full_name = left(btrim(p_full_name), 120), phone = left(btrim(coalesce(p_phone, '')), 30) where id = auth.uid();
  return public.my_account();
end;
$$;
revoke execute on function public.brand_signup(text, text, text, text, text, text, text, text, text[], text, text) from public, anon;
grant execute on function public.brand_signup(text, text, text, text, text, text, text, text, text[], text, text) to authenticated;

-- First request to a creator: make the signed-up company this creator's brand.
create or replace function public.brand_from_profile()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  f public.brand_profiles;
  v_creator integer := private.page_creator();
  v_brand uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    raise exception 'The creator account cannot be used as a brand.';
  end if;
  if v_creator is null then
    raise exception 'Open the creator''s page you want to work with first.';
  end if;
  select * into f from public.brand_profiles where owner = auth.uid();
  if f.owner is null then
    raise exception 'Add your brand details first.';
  end if;
  select b.id into v_brand from public.brands b join public.brand_members m on m.brand_id = b.id and m.profile_id = auth.uid()
  where b.creator_id = v_creator and lower(b.name) = lower(f.name) limit 1;
  if v_brand is null then
    if (select count(*) from public.brand_members where profile_id = auth.uid()) >= 25 then
      raise exception 'One login can manage up to 25 brands.';
    end if;
    insert into public.brands (creator_id, name, instagram, website, category, gstin)
    values (v_creator, f.name, f.instagram, f.website, f.category, f.gstin)
    returning id into v_brand;
    insert into public.brand_members (profile_id, brand_id) values (auth.uid(), v_brand) on conflict do nothing;
  end if;
  update public.profiles set brand_id = v_brand where id = auth.uid();
  return public.my_account();
end;
$$;
revoke execute on function public.brand_from_profile() from public, anon;
grant execute on function public.brand_from_profile() to authenticated;

-- 5. The account says what's next: a creator without a link, a brand's signed-up company ------------------------
create or replace function public.my_account()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  p public.profiles;
  b public.brands;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_page integer := private.page_creator();
  v_brand uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  if public.is_creator() then
    return (select jsonb_build_object('role', 'creator', 'email', v_email, 'creator_id', s.id,
      'slug', case when s.slug_chosen then s.slug end,
      'needs_link', not s.slug_chosen and lower(s.creator_email) = v_email,
      'name', s.display_name, 'handle', s.handle)
      from public.creator_settings s where s.id = public.current_creator());
  end if;

  -- Asked to join as a creator and not approved yet (or declined): they see where their request stands.
  if exists (select 1 from public.creator_settings s where lower(s.creator_email) = v_email and s.status in ('pending', 'declined')) then
    return jsonb_build_object('role', 'pending', 'email', v_email, 'request', public.my_creator_request());
  end if;

  select * into p from public.profiles where id = auth.uid();
  if p.id is null then
    insert into public.profiles (id, email) values (auth.uid(), v_email) returning * into p;
  end if;

  -- Requests sent with this email join their company, on every creator.
  if v_email <> '' then
    insert into public.brand_members (profile_id, brand_id)
    select distinct auth.uid(), c.brand_id from public.collabs c where lower(c.contact_email) = v_email
    on conflict do nothing;
  end if;

  v_brand := public.my_brand_id();
  if v_brand is not null and p.brand_id is distinct from v_brand then
    update public.profiles set brand_id = v_brand where id = auth.uid() returning * into p;
  elsif p.brand_id is null then
    update public.profiles set brand_id = (
      select m.brand_id from public.brand_members m where m.profile_id = auth.uid() order by m.created_at limit 1)
    where id = auth.uid() returning * into p;
  end if;

  select * into b from public.brands where id = v_brand;

  return jsonb_build_object(
    'role', 'brand',
    'email', p.email,
    'full_name', p.full_name,
    'phone', p.phone,
    'brand', case when b.id is null then null else jsonb_build_object(
      'id', b.id, 'name', b.name, 'instagram', b.instagram, 'website', b.website, 'category', b.category) end,
    -- This creator's companies (the company switcher).
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by lower(x.name))
      from public.brand_members m join public.brands x on x.id = m.brand_id
      where m.profile_id = auth.uid() and x.creator_id = v_page), '[]'::jsonb),
    -- Companies this login has with other creators, to reuse on a first request here.
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object('id', y.id, 'name', y.name) order by lower(y.name))
      from (select distinct on (lower(x.name)) x.id, x.name
            from public.brand_members m join public.brands x on x.id = m.brand_id
            where m.profile_id = auth.uid() and x.creator_id is distinct from v_page
            order by lower(x.name), m.created_at desc) y), '[]'::jsonb),
    -- The company given at sign-up (before any creator).
    'profile', (select jsonb_build_object('name', f.name, 'category', f.category, 'website', f.website, 'instagram', f.instagram,
        'role', f.role, 'city', f.city, 'goals', to_jsonb(f.goals), 'legal_name', f.legal_name, 'gstin', f.gstin)
      from public.brand_profiles f where f.owner = auth.uid()),
    -- Every creator this login works with (the creator switcher).
    'creators', coalesce((
      select jsonb_agg(private.creator_card(s.id) || jsonb_build_object(
          'current', s.id = v_page,
          'open', (select count(*) from public.collabs c join public.brand_members m on m.brand_id = c.brand_id and m.profile_id = auth.uid()
                   where c.creator_id = s.id and c.stage not in ('wrapped', 'declined', 'cancelled')),
          'waiting', (select count(*) from public.collabs c join public.brand_members m on m.brand_id = c.brand_id and m.profile_id = auth.uid()
                      where c.creator_id = s.id and (
                        exists (select 1 from public.quotes q where q.collab_id = c.id and q.status = 'sent'
                                and q.version = (select max(q2.version) from public.quotes q2 where q2.collab_id = c.id))
                        or exists (select 1 from public.drafts d where d.collab_id = c.id and d.status = 'pending'))))
        order by lower(s.display_name))
      from public.creator_settings s
      where s.status = 'active' and s.slug_chosen and exists (
        select 1 from public.brand_members m join public.brands x on x.id = m.brand_id
        where m.profile_id = auth.uid() and x.creator_id = s.id)), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.my_account() to authenticated;

-- 6. Discover lists only creators with a link --------------------------------------------------------------------
create or replace function public.discover_creators(p_q text default '', p_niche text default '')
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(private.creator_card(s.id) order by a.followers desc nulls last, lower(s.display_name)), '[]'::jsonb)
  from public.creator_settings s left join public.ig_account a on a.id = s.id and a.connected
  where auth.uid() is not null and s.status = 'active' and s.listed and s.slug_chosen
    and (btrim(coalesce(p_q, '')) = '' or s.display_name ilike '%' || btrim(p_q) || '%' or s.niche ilike '%' || btrim(p_q) || '%'
         or s.city ilike '%' || btrim(p_q) || '%' or s.handle ilike '%' || btrim(p_q) || '%')
    and (btrim(coalesce(p_niche, '')) = '' or s.niche ilike '%' || btrim(p_niche) || '%');
$$;
revoke execute on function public.discover_creators(text, text) from public, anon;
grant execute on function public.discover_creators(text, text) to authenticated;

-- 7. A campaign from a brand that signed up without a creator yet uses its sign-up company --------------------------
CREATE OR REPLACE FUNCTION public.campaign_save(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_pool uuid := nullif(p ->> 'pool_id', '')::uuid;
  v_from uuid;
begin
  if auth.uid() is null or public.is_creator() then
    raise exception 'Sign in with your brand email first.';
  end if;
  if v_name = '' or char_length(v_name) > 80 then
    raise exception 'Give the campaign a name (up to 80 letters).';
  end if;
  if v_pool is not null and not exists (select 1 from public.brand_pools where id = v_pool and owner = public.brand_owner()) then
    v_pool := null;
  end if;
  -- Sent as the company in use (else the first this login has).
  v_from := coalesce(public.my_brand_id(),
    (select m.brand_id from public.brand_members m where m.profile_id = auth.uid() order by m.created_at limit 1));
  if v_from is null and not exists (select 1 from public.brand_profiles where owner = auth.uid()) then
    raise exception 'Add your company details first.';
  end if;
  if v_id is null then
    if (select count(*) from public.brand_campaigns where owner = public.brand_owner() and created_at > now() - interval '1 day') >= 20 then
      raise exception 'That''s 20 campaigns today. Please try again tomorrow.';
    end if;
    insert into public.brand_campaigns (owner, name, pool_id, brand_from, brief, budget_total)
    values (public.brand_owner(), v_name, v_pool, v_from, coalesce(p -> 'brief', '{}'), greatest(0, coalesce(nullif(p ->> 'budget_total', '')::numeric, 0)))
    returning id into v_id;
  else
    update public.brand_campaigns set name = v_name, pool_id = v_pool,
      brief = coalesce(p -> 'brief', brief), budget_total = greatest(0, coalesce(nullif(p ->> 'budget_total', '')::numeric, budget_total))
    where id = v_id and owner = public.brand_owner();
    if not found then raise exception 'Campaign not found.'; end if;
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_campaign(p_campaign uuid, p_creators integer[] DEFAULT '{}'::integer[], p_handles text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.brand_campaigns;
  f public.brands;
  s public.creator_settings;
  v_id integer;
  v_h text;
  v_brand uuid;
  v_p jsonb;
  v_res jsonb;
  v_sent integer;
begin
  select * into c from public.brand_campaigns where id = p_campaign and owner = public.brand_owner();
  if c.id is null then
    raise exception 'Campaign not found.';
  end if;
  if public.is_creator() then
    raise exception 'The creator account cannot send requests.';
  end if;
  select * into f from public.brands b where b.id = c.brand_from
    and exists (select 1 from public.brand_members m where m.brand_id = b.id and m.profile_id = auth.uid());
  -- Signed up at app.miracleapp.live without a creator yet: the company given at sign-up.
  if f.id is null then
    select gen_random_uuid(), x.name, x.instagram, x.website, x.category, x.gstin
      into f.id, f.name, f.instagram, f.website, f.category, f.gstin
    from public.brand_profiles x where x.owner = auth.uid();
    f.billing_address := '';
    f.state := '';
    f.accounts_email := '';
    f.country := 'India';
    f.currency := 'INR';
  end if;
  if f.id is null then
    raise exception 'Add your company details first.';
  end if;
  select count(*) into v_sent from public.campaign_creators x join public.brand_campaigns y on y.id = x.campaign_id
  where y.owner = public.brand_owner() and x.status = 'sent' and x.created_at > now() - interval '1 day';
  if v_sent + coalesce(cardinality(p_creators), 0) > 40 then
    raise exception 'Campaigns can reach up to 40 creators a day. Send to fewer, or try again tomorrow.';
  end if;

  foreach v_id in array coalesce(p_creators, '{}') loop
    if exists (select 1 from public.campaign_creators where campaign_id = c.id and creator_id = v_id and status = 'sent') then
      continue;
    end if;
    begin
      if not private.brand_can_reach(v_id) then
        raise exception 'This creator isn''t listed for brands.';
      end if;
      select * into s from public.creator_settings where id = v_id;
      perform private.act_for(v_id);
      -- This login's company for this creator, else a copy of the campaign's company.
      select m.brand_id into v_brand from public.brand_members m join public.brands b on b.id = m.brand_id
      where m.profile_id = auth.uid() and b.creator_id = v_id
      order by (lower(b.name) = lower(f.name)) desc, m.created_at limit 1;
      if v_brand is null then
        insert into public.brands (creator_id, name, instagram, website, category, gstin, billing_address, state, accounts_email, country, currency)
        values (v_id, f.name, f.instagram, f.website, f.category, f.gstin, f.billing_address, f.state, f.accounts_email, f.country, f.currency)
        returning id into v_brand;
        insert into public.brand_members (profile_id, brand_id) values (auth.uid(), v_brand) on conflict do nothing;
      end if;
      update public.profiles set brand_id = v_brand where id = auth.uid();
      -- Only what this creator makes, in the languages they create in.
      v_p := c.brief - 'package_id' || jsonb_build_object(
        'deliverables', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(coalesce(c.brief -> 'deliverables', '[]'::jsonb)) x
                         where btrim(x ->> 'kind') = any(s.offered_kinds) and coalesce(nullif(x ->> 'qty', '')::integer, 0) > 0),
        'content_language', (select coalesce(jsonb_agg(l), '[]'::jsonb) from jsonb_array_elements_text(
                               case when jsonb_typeof(c.brief -> 'content_language') = 'array' then c.brief -> 'content_language' else '[]'::jsonb end) l
                             where l = any(s.content_languages)));
      if jsonb_array_length(v_p -> 'deliverables') = 0 then
        raise exception '% doesn''t make the content in this brief.', split_part(s.display_name, ' ', 1);
      end if;
      v_res := public.submit_request(v_p);
      insert into public.campaign_creators (campaign_id, creator_id, collab_id, status, note)
      values (c.id, v_id, (v_res ->> 'id')::uuid, 'sent', '')
      on conflict (campaign_id, creator_id) where creator_id is not null
      do update set collab_id = excluded.collab_id, status = 'sent', note = '', created_at = now();
    exception when others then
      insert into public.campaign_creators (campaign_id, creator_id, status, note)
      values (c.id, v_id, 'failed', left(sqlerrm, 200))
      on conflict (campaign_id, creator_id) where creator_id is not null
      do update set status = 'failed', note = left(sqlerrm, 200);
    end;
  end loop;
  perform private.act_for(null);

  foreach v_h in array coalesce(p_handles, '{}') loop
    v_h := private.clean_handle(v_h);
    continue when v_h = '';
    insert into public.campaign_creators (campaign_id, handle, status) values (c.id, v_h, 'invited')
    on conflict (campaign_id, handle) where creator_id is null do nothing;
  end loop;

  update public.brand_campaigns set status = 'sent', sent_at = coalesce(sent_at, now()) where id = c.id;
  return public.campaign_board(c.id);
end;
$function$;
