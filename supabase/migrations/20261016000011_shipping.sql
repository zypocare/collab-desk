-- Product shipping for barter and paid + product collabs.
-- Her address is private: a brand sees it only once their collab is confirmed. The brand enters
-- the courier and tracking number; she marks the parcel received, and the draft deadline counts
-- from that day.

alter table public.creator_settings
  add column ship_name text not null default '',
  add column ship_address text not null default '',
  add column ship_phone text not null default '',
  add column draft_days_after_product integer not null default 7 check (draft_days_after_product between 1 and 60);

alter table public.collabs
  add column ship_carrier text not null default '',
  add column ship_tracking text not null default '',
  add column shipped_at timestamptz,
  add column product_received_at timestamptz;

-- Shipping details for one of the signed-in brand's requests.
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
  ok := c.type <> 'paid' and c.stage in ('confirmed', 'creating', 'live');
  return jsonb_build_object(
    'needs_product', c.type <> 'paid',
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
revoke execute on function public.ship_info(text) from anon;

-- The brand says the product is on its way.
create or replace function public.brand_mark_shipped(p_code text, p_carrier text, p_tracking text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
  s public.creator_settings;
  v_carrier text := left(btrim(coalesce(p_carrier, '')), 40);
  v_tracking text := left(btrim(coalesce(p_tracking, '')), 60);
begin
  select * into c from public.collabs where upper(code) = upper(p_code) and brand_id = public.my_brand_id();
  if c.id is null then
    raise exception 'Request not found.';
  end if;
  if c.type = 'paid' or c.stage not in ('confirmed', 'creating', 'live') then
    raise exception 'This request is not ready for shipping yet.';
  end if;
  if c.product_received_at is not null then
    raise exception 'The product has already been received.';
  end if;
  if v_carrier = '' then
    raise exception 'Choose the courier.';
  end if;
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = 1;

  update public.collabs set
    ship_carrier = v_carrier,
    ship_tracking = v_tracking,
    shipped_at = now(),
    product_date = coalesce(product_date, current_date + 3)
  where id = c.id;

  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (c.id, auth.uid(), 'product',
    'Product shipped via ' || v_carrier || case when v_tracking <> '' then ' (' || v_tracking || ')' else '' end, true);

  insert into public.outbox (kind, to_email, payload) values ('product_shipped', s.creator_email, jsonb_build_object(
    'code', c.code, 'brand', b.name, 'product', c.product, 'carrier', v_carrier, 'tracking', v_tracking));
end;
$$;
revoke execute on function public.brand_mark_shipped(text, text, text) from anon;

-- She has the parcel: note it, start the content clock, tell the brand.
create or replace function public.mark_product_received(p_collab uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  if not public.is_creator() then
    raise exception 'Not allowed.';
  end if;
  select * into c from public.collabs where id = p_collab;
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = 1;

  update public.collabs set
    product_received_at = now(),
    product_date = current_date,
    draft_date = coalesce(draft_date, current_date + s.draft_days_after_product)
  where id = c.id;

  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (c.id, auth.uid(), 'product', 'Product received', true);

  if c.notify_brand and c.contact_email <> '' then
    insert into public.outbox (kind, to_email, payload) values ('product_received', c.contact_email, jsonb_build_object(
      'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'product', c.product,
      'draft_date', coalesce(c.draft_date, current_date + s.draft_days_after_product)));
  end if;
end;
$$;
revoke execute on function public.mark_product_received(uuid) from anon;
