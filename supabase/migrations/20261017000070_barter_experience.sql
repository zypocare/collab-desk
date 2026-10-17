-- Barter, done right:
-- * It can be a product (sent to her) or an experience (a stay, a meal at a pub or restaurant, an
--   event, a service): no shipping for experiences.
-- * Offers below her barter minimum are no longer refused: they're accepted and reviewed last, and
--   the brand is told so (on the form, and in the automatic reply).

alter table public.collabs
  add column if not exists barter_kind text not null default 'product' check (barter_kind in ('product', 'experience'));

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
  v_value numeric;
  v_id uuid;
  v_code text;
  d jsonb;
  pos integer := 0;
  recent integer;
  deliv_text text;
  first_name text;
  pk public.packages;
  v_fee numeric;
  v_kind text;
  v_low boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    raise exception 'The creator account cannot send requests.';
  end if;

  select * into s from public.creator_settings where id = 1;
  first_name := split_part(s.display_name, ' ', 1);
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
  -- Only content types she has switched on.
  if exists (
    select 1 from jsonb_array_elements(p -> 'deliverables') x
    where coalesce(nullif(x ->> 'qty', '')::integer, 0) > 0 and not (btrim(x ->> 'kind') = any(s.offered_kinds))
  ) then
    raise exception '% isn''t offering some of that content right now. Please choose from the options shown.', first_name;
  end if;
  -- Barter can be a product they send, or an experience (a stay, a meal, an event, a service).
  v_kind := case when p ->> 'barter_kind' = 'experience' then 'experience' else 'product' end;
  if v_type <> 'paid' and btrim(coalesce(p ->> 'product', '')) = '' then
    raise exception '%', case when v_kind = 'experience' then 'Tell us what you are offering (the stay, meal or event).' else 'Tell us which product you will send.' end;
  end if;

  -- One of her packages? Its price is the fee unless the brand offered more.
  if nullif(p ->> 'package_id', '') is not null then
    select * into pk from public.packages where id = (p ->> 'package_id')::uuid and active;
    if pk.id is null then
      raise exception 'That package is no longer available. Please choose the content you need.';
    end if;
    v_type := 'paid';
  end if;
  v_fee := greatest(0, coalesce(nullif(p ->> 'fee', '')::numeric, 0));
  if pk.id is not null then
    v_fee := greatest(v_fee, pk.price);
  end if;

  -- Barter rules.
  v_value := greatest(0, coalesce(nullif(p ->> 'product_value', '')::numeric, 0));
  if v_type = 'barter' and s.barter_mode = 'closed' then
    raise exception '% is taking paid collaborations only right now. Choose Paid, or Paid + product.', first_name;
  end if;
  -- Below her barter minimum: still accepted, reviewed last (the brand was told on the form).
  v_low := v_type = 'barter' and s.barter_min_value > 0 and v_value < s.barter_min_value;

  insert into public.collabs (
    brand_id, source, contact_name, contact_email, contact_phone, type, fee, product, product_value,
    usage, brief, brief_details, preferred_live, note_for_brand, package_name, created_by, barter_kind)
  values (
    me.brand_id, 'brand_page', me.full_name, me.email, me.phone, v_type,
    case when v_type = 'barter' then 0 else v_fee end,
    case when v_type = 'paid' then '' else left(btrim(p ->> 'product'), 200) end,
    case when v_type = 'paid' then 0 else v_value end,
    left(coalesce(nullif(p ->> 'usage', ''), 'Organic only'), 60),
    left(coalesce(p ->> 'brief', ''), 4000),
    public.clean_brief(p -> 'brief_details'),
    nullif(p ->> 'preferred_live', '')::date,
    case when v_low
      then format('Thanks for reaching out! %s reviews paid collaborations first, and barter offers below ₹%s are reviewed last, so a reply may take longer than %s. Adding a fee gets a faster answer.', first_name, to_char(s.barter_min_value, 'FM99,99,99,999'), s.barter_reply_time)
      when v_type = 'barter'
      then format('Thanks for reaching out! %s reviews paid collaborations first, so barter requests usually get a reply within %s.', first_name, s.barter_reply_time)
      else format('Thanks for reaching out! %s will review your request and reply within %s.', first_name, s.reply_time) end,
    coalesce(pk.name, ''),
    auth.uid(),
    case when v_type = 'paid' then 'product' else v_kind end)
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
     'deliverables', deliv_text, 'package', coalesce(pk.name, ''), 'brief', left(coalesce(p ->> 'brief', ''), 600)));

  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;

-- Brands get her shipping address only for product barters.
create or replace function public.ship_info(p_code text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  c public.collabs;
  s public.creator_settings;
  ok boolean;
begin
  select * into c from public.collabs where upper(code) = upper(p_code) and brand_id = public.my_brand_id();
  if c.id is null then
    return null;
  end if;
  select * into s from public.creator_settings where id = 1;
  -- Experiences (a stay, a meal, an event) have nothing to ship: no address for those.
  ok := c.type <> 'paid' and c.barter_kind = 'product' and c.stage in ('confirmed', 'creating', 'live');
  return jsonb_build_object(
    'needs_product', c.type <> 'paid' and c.barter_kind = 'product',
    'experience', c.barter_kind = 'experience',
    'can_ship', ok and c.product_received_at is null,
    'address_ready', s.ship_address <> '',
    'name', case when ok then coalesce(nullif(s.ship_name, ''), s.display_name) end,
    'address', case when ok then s.ship_address end,
    'phone', case when ok then s.ship_phone end,
    'product', c.product,
    'carrier', c.ship_carrier,
    'tracking', c.ship_tracking,
    'shipped_at', c.shipped_at,
    'received_at', c.product_received_at);
end;
$$;
