-- The signed agreement PDF needs the creator's legal name and email, and the brand's legal details.
create or replace function public.get_agreement(p_quote uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  q public.quotes;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  select * into q from public.quotes where id = p_quote;
  select * into c from public.collabs where id = q.collab_id;
  if c.id is null or not (public.is_creator() or (public.my_brand_id() is not null and c.brand_id = public.my_brand_id())) then
    return null;
  end if;
  if q.status not in ('accepted', 'sent') then
    return null;
  end if;
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = 1;

  return jsonb_build_object(
    'quote', to_jsonb(q) - 'accepted_ip',
    'accepted_ip', case when public.is_creator() then q.accepted_ip else null end,
    'code', c.code, 'type', c.type, 'product', c.product, 'product_value', c.product_value,
    'live_date', c.live_date, 'preferred_live', c.preferred_live,
    'brand', jsonb_build_object('name', b.name, 'instagram', b.instagram, 'website', b.website,
      'gstin', b.gstin, 'address', b.billing_address, 'country', b.country),
    'contact', jsonb_build_object('name', c.contact_name, 'email', c.contact_email),
    'creator', jsonb_build_object('name', s.display_name, 'handle', s.handle, 'city', s.city, 'app_name', s.app_name,
      'legal_name', coalesce(nullif(s.legal_name, ''), s.display_name), 'email', s.creator_email, 'pan', s.pan)
  );
end;
$$;
