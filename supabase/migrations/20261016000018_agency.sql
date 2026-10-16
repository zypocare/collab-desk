-- Agency logins: one login can manage several brands. profiles.brand_id stays the brand the
-- login is currently working as (every brand function already uses it); brand_members lists
-- all the brands it may switch to.

create table public.brand_members (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  brand_id   uuid not null references public.brands(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, brand_id)
);
alter table public.brand_members enable row level security;  -- reached only through the functions below
create policy "creator reads brand members" on public.brand_members for select to authenticated using (public.is_creator());

insert into public.brand_members (profile_id, brand_id)
select id, brand_id from public.profiles where brand_id is not null
on conflict do nothing;

-- Who am I? Brands also get the list of brands they can switch between. A login is linked to every
-- brand whose collabs name its (verified) email as the contact.
create or replace function public.my_account()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  p public.profiles;
  b public.brands;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    return null;
  end if;

  if public.is_creator() then
    return jsonb_build_object('role', 'creator', 'email', v_email);
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
$$;

-- Create or update the signed-in brand; p_new adds another brand to this login (agencies).
drop function if exists public.register_brand(text, text, text, text, text, text);
create or replace function public.register_brand(
  p_name text, p_instagram text, p_website text, p_category text, p_full_name text, p_phone text, p_new boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_brand uuid;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    raise exception 'The creator account cannot be used as a brand.';
  end if;

  p_name := btrim(coalesce(p_name, ''));
  p_full_name := btrim(coalesce(p_full_name, ''));
  if p_name = '' or char_length(p_name) > 120 then
    raise exception 'Add your brand name.';
  end if;
  if p_full_name = '' then
    raise exception 'Add your name so we know who to reply to.';
  end if;

  select brand_id into v_brand from public.profiles where id = auth.uid();

  if v_brand is null or p_new then
    select count(*) into v_count from public.brand_members where profile_id = auth.uid();
    if v_count >= 25 then
      raise exception 'One login can manage up to 25 brands.';
    end if;
    insert into public.brands (name, instagram, website, category)
    values (p_name, left(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', ''), 60),
            left(btrim(coalesce(p_website, '')), 200), left(coalesce(nullif(p_category, ''), 'Other'), 40))
    returning id into v_brand;
    insert into public.brand_members (profile_id, brand_id) values (auth.uid(), v_brand) on conflict do nothing;
  else
    update public.brands
    set name = p_name,
        instagram = left(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', ''), 60),
        website = left(btrim(coalesce(p_website, '')), 200),
        category = left(coalesce(nullif(p_category, ''), 'Other'), 40)
    where id = v_brand;
  end if;

  update public.profiles
  set brand_id = v_brand,
      full_name = left(p_full_name, 120),
      phone = left(btrim(coalesce(p_phone, '')), 30)
  where id = auth.uid();

  return public.my_account();
end;
$$;
revoke execute on function public.register_brand(text, text, text, text, text, text, boolean) from anon;

-- Work as another of this login's brands.
create or replace function public.switch_brand(p_brand uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.brand_members where profile_id = auth.uid() and brand_id = p_brand) then
    raise exception 'You do not manage that brand.';
  end if;
  update public.profiles set brand_id = p_brand where id = auth.uid();
  return public.my_account();
end;
$$;
revoke execute on function public.switch_brand(uuid) from anon;
