-- Agencies manage several brands: a link to a request of one of their other brands should open it
-- (the app switches brand) instead of saying "not found". Returns that brand, only if this login
-- manages it.
create or replace function public.request_brand(p_code text)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select c.brand_id
  from public.collabs c
  join public.brand_members m on m.brand_id = c.brand_id and m.profile_id = auth.uid()
  where upper(c.code) = upper(btrim(p_code))
  limit 1
$$;
revoke execute on function public.request_brand(text) from public, anon;
grant execute on function public.request_brand(text) to authenticated;
