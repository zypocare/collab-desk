-- Delete a brand from the studio, with its collabs and everything kept for them (messages, quotes,
-- drafts, files, events). Refused while any of its collabs has an invoice that was sent or paid:
-- those stay for GST and tax records (cancel the invoice first). Only the account owner can do it.
create or replace function public.delete_brand(p_brand uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_issued int;
  v_collabs int;
begin
  if not public.is_owner() then
    raise exception 'Only the account owner can delete a brand';
  end if;
  select name into v_name from public.brands where id = p_brand;
  if v_name is null then
    raise exception 'Brand not found';
  end if;
  select count(*) into v_issued
  from public.invoices i join public.collabs c on c.id = i.collab_id
  where c.brand_id = p_brand and i.status not in ('draft', 'cancelled');
  if v_issued > 0 then
    raise exception 'invoices_issued:%', v_issued;
  end if;
  select count(*) into v_collabs from public.collabs where brand_id = p_brand;
  -- Collabs this brand recommended keep their brand; only the link to the recommender goes.
  update public.collabs set referred_by = null where referred_by = p_brand;
  delete from public.collabs where brand_id = p_brand;
  delete from public.brands where id = p_brand;
  return jsonb_build_object('name', v_name, 'collabs', v_collabs);
end;
$$;

revoke all on function public.delete_brand(uuid) from public, anon;
grant execute on function public.delete_brand(uuid) to authenticated;
