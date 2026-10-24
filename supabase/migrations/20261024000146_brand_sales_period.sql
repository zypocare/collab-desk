-- Sales for a reporting period. The AI's read of a report divided all-time sales by the period's fees, so
-- return on spend came out wrong for any period but "all time". brand_sales now takes the period: orders
-- count by their order date, and orders with no date (or sales typed in by hand) are counted apart as
-- undated, never inside a period. With no dates it returns the all-time totals as before.

drop function if exists public.brand_sales();
create or replace function public.brand_sales(p_from date default null, p_to date default null)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with mine as (
    select l.collab_id, l.promo_code, l.clicks, l.sales, l.revenue, c.code, c.fee, c.stage, c.creator_id, b.name as brand_name, s.display_name
    from public.collab_links l
    join public.collabs c on c.id = l.collab_id
    join public.brands b on b.id = c.brand_id
    join public.creator_settings s on s.id = c.creator_id
    where public.brand_owner() is not null and not public.is_creator()
      and exists (select 1 from public.brand_members bm where bm.brand_id = c.brand_id and bm.profile_id in (select private.team_logins(public.brand_owner())))
  ),
  dated as (
    select m.collab_id,
      count(o.id) filter (where o.ordered_on between p_from and p_to)::integer as orders,
      coalesce(sum(o.amount) filter (where o.ordered_on between p_from and p_to), 0) as revenue,
      count(o.id) filter (where o.ordered_on is not null)::integer as with_date
    from mine m left join public.brand_orders o on o.collab_id = m.collab_id and o.owner = public.brand_owner()
    group by m.collab_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'collab', m.code, 'creator', m.display_name, 'creator_id', m.creator_id, 'brand', m.brand_name, 'code', m.promo_code, 'clicks', m.clicks,
      'orders', case when p_from is null or p_to is null then coalesce(m.sales, 0) else d.orders end,
      'revenue', case when p_from is null or p_to is null then coalesce(m.revenue, 0) else d.revenue end,
      'undated', case when p_from is null or p_to is null then 0 else greatest(0, coalesce(m.sales, 0) - d.with_date) end,
      'fee', coalesce(m.fee, 0), 'stage', m.stage)
    order by case when p_from is null or p_to is null then coalesce(m.revenue, 0) else d.revenue end desc), '[]'::jsonb)
  from mine m join dated d on d.collab_id = m.collab_id;
$$;
revoke execute on function public.brand_sales(date, date) from public, anon;
grant execute on function public.brand_sales(date, date) to authenticated;
