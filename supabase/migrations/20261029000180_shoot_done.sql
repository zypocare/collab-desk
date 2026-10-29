-- After the shoot comes the edit: she marks the shoot done (collabs.shot_at), so a shoot day that has passed stops
-- showing as late on Today, and the next thing is editing and sending the draft.
alter table public.collabs add column if not exists shot_at timestamptz;

-- Marking a barter received: an experience (a stay, a meal) is "done", not "received"; and on a collab that has
-- already gone live or wrapped (marked late), the brand isn't emailed and no draft date is set.
create or replace function public.mark_product_received(p_collab uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
  s public.creator_settings;
  v_making boolean;
begin
  if not public.is_creator() then
    raise exception 'Not allowed.';
  end if;
  select * into c from public.collabs where id = p_collab;
  perform private.must_own(c.creator_id);
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = c.creator_id;
  v_making := c.stage in ('confirmed', 'creating');

  update public.collabs set
    product_received_at = now(),
    product_date = current_date,
    draft_date = case when v_making then coalesce(draft_date, current_date + s.draft_days_after_product) else draft_date end
  where id = c.id;

  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (c.id, auth.uid(), 'product', case when c.barter_kind = 'experience' then 'Experience done' else 'Product received' end, true);

  if v_making and c.notify_brand and c.contact_email <> '' then
    insert into public.outbox (creator_id, kind, to_email, payload) values (c.creator_id, 'product_received', c.contact_email, jsonb_build_object(
      'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'product', c.product,
      'draft_date', coalesce(c.draft_date, current_date + s.draft_days_after_product)));
  end if;
end;
$$;
