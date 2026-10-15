-- Brand-facing and public functions.
-- Brands cannot read tables directly; every brand action goes through these functions, which only
-- ever touch the signed-in brand's own rows and return brand-safe fields.

-- Public page data (works without signing in).
create or replace function public.public_page()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'app_name', s.app_name,
    'display_name', s.display_name,
    'handle', s.handle,
    'niche', s.niche,
    'city', s.city,
    'followers', s.followers,
    'engagement', s.engagement,
    'reply_time', s.reply_time,
    'accepting', s.accepting,
    'rates', case when s.show_rates then s.rates else null end,
    'worked_with', coalesce((
      select jsonb_agg(w.name order by w.name)
      from (
        select distinct b.name
        from public.collabs c join public.brands b on b.id = c.brand_id
        where c.stage in ('live', 'wrapped')
        limit 24
      ) w
    ), '[]'::jsonb)
  )
  from public.creator_settings s
  where s.id = 1;
$$;

-- Who am I? Also links a brand user to their brand the first time they sign in, when the creator
-- already added a collab with their (verified) email address.
create or replace function public.my_account()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  p public.profiles;
  b public.brands;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_brand uuid;
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

  if p.brand_id is null and v_email <> '' then
    select c.brand_id into v_brand
    from public.collabs c
    where lower(c.contact_email) = v_email
    order by c.created_at desc
    limit 1;
    if v_brand is not null then
      update public.profiles set brand_id = v_brand where id = auth.uid() returning * into p;
    end if;
  end if;

  select * into b from public.brands where id = p.brand_id;

  return jsonb_build_object(
    'role', 'brand',
    'email', p.email,
    'full_name', p.full_name,
    'phone', p.phone,
    'brand', case when b.id is null then null else jsonb_build_object(
      'id', b.id, 'name', b.name, 'instagram', b.instagram, 'website', b.website, 'category', b.category) end
  );
end;
$$;

-- Create or update the signed-in user's brand and contact details.
create or replace function public.register_brand(
  p_name text, p_instagram text, p_website text, p_category text, p_full_name text, p_phone text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_brand uuid;
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

  if v_brand is null then
    insert into public.brands (name, instagram, website, category)
    values (p_name, left(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', ''), 60),
            left(btrim(coalesce(p_website, '')), 200), left(coalesce(nullif(p_category, ''), 'Other'), 40))
    returning id into v_brand;
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

-- Send a collaboration request as the signed-in brand.
create or replace function public.submit_request(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  me public.profiles;
  b public.brands;
  v_type public.collab_type;
  v_id uuid;
  v_code text;
  d jsonb;
  pos integer := 0;
  recent integer;
  deliv_text text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    raise exception 'The creator account cannot send requests.';
  end if;

  select * into s from public.creator_settings where id = 1;
  if not s.accepting then
    raise exception '% is fully booked right now and not taking new requests.', s.display_name;
  end if;

  select * into me from public.profiles where id = auth.uid();
  if me.brand_id is null then
    raise exception 'Add your brand details first.';
  end if;
  select * into b from public.brands where id = me.brand_id;

  select count(*) into recent
  from public.collabs
  where brand_id = me.brand_id and source = 'brand_page' and created_at > now() - interval '1 day';
  if recent >= 5 then
    raise exception 'You have sent 5 requests today. Please try again tomorrow.';
  end if;

  begin
    v_type := coalesce(nullif(p ->> 'type', ''), 'paid')::public.collab_type;
  exception when others then
    raise exception 'Choose a type of collaboration.';
  end;

  if jsonb_typeof(p -> 'deliverables') is distinct from 'array' then
    raise exception 'Choose at least one deliverable.';
  end if;
  if v_type <> 'paid' and btrim(coalesce(p ->> 'product', '')) = '' then
    raise exception 'Tell us which product you will send.';
  end if;

  insert into public.collabs (
    brand_id, source, contact_name, contact_email, contact_phone, type, fee, product, product_value,
    usage, brief, preferred_live, note_for_brand, created_by)
  values (
    me.brand_id, 'brand_page', me.full_name, me.email, me.phone, v_type,
    case when v_type = 'barter' then 0 else greatest(0, coalesce(nullif(p ->> 'fee', '')::numeric, 0)) end,
    case when v_type = 'paid' then '' else left(btrim(p ->> 'product'), 200) end,
    case when v_type = 'paid' then 0 else greatest(0, coalesce(nullif(p ->> 'product_value', '')::numeric, 0)) end,
    left(coalesce(nullif(p ->> 'usage', ''), 'Organic only'), 60),
    left(coalesce(p ->> 'brief', ''), 4000),
    nullif(p ->> 'preferred_live', '')::date,
    format('Thanks for reaching out! %s will review your request and reply within %s.', split_part(s.display_name, ' ', 1), s.reply_time),
    auth.uid())
  returning id, code into v_id, v_code;

  for d in select * from jsonb_array_elements(p -> 'deliverables') loop
    if coalesce(nullif(d ->> 'qty', '')::integer, 0) > 0 and btrim(coalesce(d ->> 'kind', '')) <> '' then
      insert into public.deliverables (collab_id, kind, qty, position)
      values (v_id, left(btrim(d ->> 'kind'), 40), least(50, (d ->> 'qty')::integer), pos);
      pos := pos + 1;
    end if;
  end loop;
  if pos = 0 then
    raise exception 'Choose at least one deliverable.';
  end if;

  select string_agg(qty || ' × ' || kind, ', ' order by position) into deliv_text
  from public.deliverables where collab_id = v_id;

  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (v_id, auth.uid(), 'stage', 'Request received', true);

  insert into public.outbox (kind, to_email, payload) values
  ('request_received_brand', me.email, jsonb_build_object(
     'code', v_code, 'brand', b.name, 'contact', me.full_name, 'deliverables', deliv_text)),
  ('request_received_creator', s.creator_email, jsonb_build_object(
     'code', v_code, 'brand', b.name, 'contact', me.full_name, 'email', me.email, 'phone', me.phone,
     'type', v_type, 'fee', (select fee from public.collabs where id = v_id),
     'product', (select product from public.collabs where id = v_id),
     'deliverables', deliv_text, 'brief', left(coalesce(p ->> 'brief', ''), 600)));

  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;

-- The signed-in brand's requests, with brand-safe fields only.
create or replace function public.my_requests()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t.obj order by t.created_at desc), '[]'::jsonb)
  from (
    select c.created_at, jsonb_build_object(
      'id', c.id, 'code', c.code, 'stage', c.stage, 'stage_label', public.stage_label(c.stage),
      'type', c.type, 'fee', c.fee, 'product', c.product, 'product_value', c.product_value,
      'usage', c.usage, 'brief', c.brief, 'preferred_live', c.preferred_live,
      'received_on', c.received_on, 'draft_date', c.draft_date, 'live_date', c.live_date,
      'pay_status', c.pay_status, 'invoice_no', c.invoice_no, 'pay_due', c.pay_due, 'paid_on', c.paid_on,
      'note_for_brand', c.note_for_brand, 'contact_name', c.contact_name, 'created_at', c.created_at,
      'deliverables', (
        select coalesce(jsonb_agg(jsonb_build_object('kind', d.kind, 'qty', d.qty, 'done', d.done) order by d.position), '[]'::jsonb)
        from public.deliverables d where d.collab_id = c.id),
      'events', (
        select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'text', e.text) order by e.at desc), '[]'::jsonb)
        from public.collab_events e where e.collab_id = c.id and e.visible_to_brand)
    ) as obj
    from public.collabs c
    where public.my_brand_id() is not null and c.brand_id = public.my_brand_id()
  ) t;
$$;

revoke execute on function public.my_account() from anon;
revoke execute on function public.register_brand(text, text, text, text, text, text) from anon;
revoke execute on function public.submit_request(jsonb) from anon;
revoke execute on function public.my_requests() from anon;
grant execute on function public.public_page() to anon, authenticated;
