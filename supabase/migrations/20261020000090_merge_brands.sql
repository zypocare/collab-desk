-- Merge one brand into another: for a brand added twice by mistake (a typo, a wrong handle).
-- Everything that belonged to the duplicate moves to the brand being kept, in one step, then the
-- duplicate is deleted. Nothing is lost: collabs, monthly deals, referrals, notes, brand logins,
-- invites, barter TDS records and the desk's search index all follow.
create or replace function public.merge_brands(p_from uuid, p_into uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.brands;
  v_into public.brands;
  v_collabs int;
  v_notes public.brand_private;
begin
  if not public.is_creator() then
    raise exception 'Only the creator can merge brands';
  end if;
  if p_from is null or p_into is null or p_from = p_into then
    raise exception 'Pick two different brands';
  end if;
  select * into v_from from public.brands where id = p_from for update;
  select * into v_into from public.brands where id = p_into for update;
  if v_from.id is null or v_into.id is null then
    raise exception 'Brand not found';
  end if;

  update public.collabs set brand_id = p_into where brand_id = p_from;
  get diagnostics v_collabs = row_count;
  update public.collabs set referred_by = p_into where referred_by = p_from;
  update public.retainers set brand_id = p_into where brand_id = p_from;
  update public.desk_chunks set brand_id = p_into where brand_id = p_from;

  -- Brand logins and invites: the people who sign in for the duplicate now see the kept brand.
  update public.profiles set brand_id = p_into where brand_id = p_from;
  insert into public.brand_members (profile_id, brand_id, created_at)
    select profile_id, p_into, created_at from public.brand_members where brand_id = p_from
    on conflict do nothing;
  delete from public.brand_members where brand_id = p_from;
  insert into public.brand_invites (brand_id, email, name, invited_by, created_at)
    select p_into, email, name, invited_by, created_at from public.brand_invites where brand_id = p_from
    on conflict do nothing;
  delete from public.brand_invites where brand_id = p_from;

  -- Barter TDS per year: keep the kept brand's record when both have one.
  insert into public.barter_tds (brand_id, fy, status, reminded_at, updated_at)
    select p_into, fy, status, reminded_at, updated_at from public.barter_tds where brand_id = p_from
    on conflict (brand_id, fy) do nothing;
  delete from public.barter_tds where brand_id = p_from;

  -- Private notes: join them, and keep competitors from both.
  select * into v_notes from public.brand_private where brand_id = p_from;
  if v_notes.brand_id is not null then
    insert into public.brand_private (brand_id, notes, competitors)
      values (p_into, v_notes.notes, v_notes.competitors)
      on conflict (brand_id) do update set
        notes = case when excluded.notes = '' then brand_private.notes
                     when brand_private.notes = '' then excluded.notes
                     else brand_private.notes || E'\n\n' || excluded.notes end,
        competitors = (select coalesce(array_agg(distinct x), '{}') from unnest(brand_private.competitors || excluded.competitors) as x);
  end if;

  -- Fill in what the kept brand is missing from the duplicate.
  update public.brands set
    instagram = case when instagram = '' then v_from.instagram else instagram end,
    website = case when website = '' then v_from.website else website end,
    category = case when category in ('', 'Other') and v_from.category not in ('', 'Other') then v_from.category else category end
  where id = p_into;

  delete from public.brands where id = p_from;
  return jsonb_build_object('from', v_from.name, 'into', v_into.name, 'collabs', v_collabs);
end;
$$;

revoke all on function public.merge_brands(uuid, uuid) from public, anon;
grant execute on function public.merge_brands(uuid, uuid) to authenticated;
