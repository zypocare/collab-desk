-- JSON aggregation is deliberate: the API's row cap must not truncate nested history or reports.
-- SECURITY INVOKER keeps each nested table's RLS (including money/team permissions) in force.
create or replace function public.studio_collabs_page(p_cursor jsonb default null, p_limit integer default 100, p_collab uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; page_size integer := least(100, greatest(1, coalesce(p_limit, 100)));
begin
  if not public.is_creator() then raise exception 'Only the studio team can read collaborations.'; end if;
  with page as materialized (
    select c.* from public.collabs c
    where (p_collab is null or c.id = p_collab)
      and (p_cursor is null or (c.created_at, c.id) < ((p_cursor->>'created_at')::timestamptz, (p_cursor->>'id')::uuid))
    order by c.created_at desc, c.id desc limit page_size + 1
  ), selected as (select * from page order by created_at desc, id desc limit page_size),
  payload as (
    select c.created_at, c.id, to_jsonb(c) || jsonb_build_object(
      'brand', (select to_jsonb(b) from public.brands b where b.id = c.brand_id),
      'deliverables', (select coalesce(jsonb_agg(to_jsonb(d) || jsonb_build_object('items',
        (select coalesce(jsonb_agg(to_jsonb(x) order by x.position), '[]'::jsonb) from public.deliverable_items x where x.deliverable_id = d.id)) order by d.position, d.id), '[]'::jsonb) from public.deliverables d where d.collab_id = c.id),
      'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.at desc, e.id desc), '[]'::jsonb) from public.collab_events e where e.collab_id = c.id),
      'quotes', (select coalesce(jsonb_agg(to_jsonb(q) order by q.version desc), '[]'::jsonb) from public.quotes q where q.collab_id = c.id),
      'drafts', (select coalesce(jsonb_agg(to_jsonb(d) || jsonb_build_object('comments',
        (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from public.draft_comments x where x.draft_id = d.id)) order by d.round desc), '[]'::jsonb) from public.drafts d where d.collab_id = c.id),
      'expenses', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from public.collab_expenses e where e.collab_id = c.id),
      'files', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from public.collab_files f where f.collab_id = c.id),
      'invoices', (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from public.invoices i where i.collab_id = c.id),
      'posts', (select coalesce(jsonb_agg(jsonb_build_object('matched_by', p.matched_by, 'media', to_jsonb(m))), '[]'::jsonb) from public.collab_posts p join public.ig_media m on m.id = p.media_id where p.collab_id = c.id),
      'reports', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.brand_reports r where r.collab_id = c.id),
      'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'sender', m.sender, 'body', m.body, 'created_at', m.created_at)), '[]'::jsonb) from public.collab_messages m where m.collab_id = c.id),
      'reads', (select coalesce(jsonb_agg(jsonb_build_object('side', r.side, 'read_at', r.read_at)), '[]'::jsonb) from public.collab_reads r where r.collab_id = c.id),
      'links', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) from public.collab_links l where l.collab_id = c.id)
    ) as obj from selected c
  ) select jsonb_build_object(
    'rows', (select coalesce(jsonb_agg(obj order by created_at desc, id desc), '[]'::jsonb) from payload),
    'next', case when (select count(*) from page) > page_size then
      (select jsonb_build_object('created_at', created_at, 'id', id) from selected order by created_at, id limit 1) else null end
  ) into result;
  return result;
end;
$$;
revoke all on function public.studio_collabs_page(jsonb, integer, uuid) from public, anon;
grant execute on function public.studio_collabs_page(jsonb, integer, uuid) to authenticated;
create index collabs_page_idx on public.collabs(created_at desc, id desc);

-- Server totals cover every financial record, independently of the visible board/list page.
-- The invoice register/quarter packs still use the complete paginated studio snapshot.
create or replace function public.financial_report(p_start integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; date_from date; date_to date;
begin
  if public.team_role() not in ('owner', 'manager', 'accountant') or public.team_role() is null then
    raise exception 'Only the money team can read financial reports.';
  end if;
  if p_start is null or p_start < 2000 or p_start > 2200 then raise exception 'Choose a valid financial year.'; end if;
  date_from := make_date(p_start, 4, 1); date_to := make_date(p_start + 1, 3, 31);
  with issued as materialized (
    select i.*, c.brand_id from public.invoices i join public.collabs c on c.id = i.collab_id
    where i.status not in ('draft', 'cancelled')
  ), entries as (
    select brand_id, issue_date as day, subtotal * inr_rate as taxable,
      (cgst + sgst + igst) * inr_rate as gst, 0::numeric as received, 0::numeric as tds,
      0::numeric as barter, 1 as invoices, 0::numeric as costs, 0 as missing
      from issued where issue_date between date_from and date_to
    union all
    select brand_id, paid_on, 0, 0, amount_received * inr_rate, tds_deducted * inr_rate, 0, 0, 0,
      case when tds_deducted > 0 and not tds_certificate then 1 else 0 end
      from issued where paid_on between date_from and date_to and (amount_received > 0 or tds_deducted > 0)
    union all
    select c.brand_id, c.paid_on, 0, 0, c.pay_received, 0, 0, 0, 0, 0 from public.collabs c
      where c.type <> 'barter' and c.paid_on between date_from and date_to and c.pay_received > 0
        and not exists (select 1 from issued i where i.collab_id = c.id)
    union all
    select c.brand_id, e.spent_on, 0, 0, 0, 0, 0, 0, e.amount, 0
      from public.collab_expenses e join public.collabs c on c.id = e.collab_id where e.spent_on between date_from and date_to
    union all
    select c.brand_id, coalesce((c.product_received_at at time zone 'Asia/Kolkata')::date,
      case when c.barter_kind = 'experience' and c.stage in ('live', 'wrapped') then c.live_date end),
      0, 0, 0, 0, c.product_value, 0, 0, 0 from public.collabs c
      where c.type <> 'paid' and c.product_value > 0 and c.stage <> 'declined'
  ), filtered as (select * from entries where day between date_from and date_to),
  months as (
    select to_char(m.day, 'YYYY-MM') as key, to_char(m.day, 'Mon YY') as label,
      coalesce(sum(e.taxable), 0) as taxable, coalesce(sum(e.gst), 0) as gst,
      coalesce(sum(e.received), 0) as received, coalesce(sum(e.tds), 0) as tds,
      coalesce(sum(e.barter), 0) as barter, coalesce(sum(e.invoices), 0) as invoices, coalesce(sum(e.costs), 0) as costs
    from generate_series(date_from::timestamp, date_to::timestamp, interval '1 month') as m(day)
    left join filtered e on date_trunc('month', e.day::timestamp) = m.day group by m.day
  ), brands as (
    select b.id, b.name, b.gstin, sum(e.taxable) as taxable, sum(e.received) as received,
      sum(e.tds) as tds, sum(e.barter) as barter, sum(e.missing) as "tdsCertsMissing"
    from filtered e join public.brands b on b.id = e.brand_id group by b.id
    having sum(e.taxable) <> 0 or sum(e.received) <> 0 or sum(e.barter) <> 0 or sum(e.tds) <> 0
  ) select jsonb_build_object(
    'months', (select jsonb_agg(to_jsonb(m) order by key) from months m),
    'total', (select jsonb_build_object('taxable', sum(taxable), 'gst', sum(gst), 'received', sum(received),
      'tds', sum(tds), 'barter', sum(barter), 'invoices', sum(invoices), 'costs', sum(costs)) from months),
    'brands', (select coalesce(jsonb_agg(to_jsonb(b) - 'id' order by received + barter desc, name, id), '[]'::jsonb) from brands b)
  ) into result;
  return result;
end;
$$;
revoke all on function public.financial_report(integer) from public, anon;
grant execute on function public.financial_report(integer) to authenticated;
