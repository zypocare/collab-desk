-- My requests (brand side) with what the campaign page needs: shipping and product dates, usage end,
-- shared files, the results report and results so far.
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
      'live_time', c.live_time, 'product_date', c.product_date, 'shipped_at', c.shipped_at,
      'product_received_at', c.product_received_at, 'usage_ends', c.usage_ends, 'files_sent_at', c.files_sent_at,
      'files', (
        select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'label', f.label, 'url', f.url, 'file_path', f.file_path,
          'file_type', f.file_type, 'size', f.size_bytes) order by f.created_at), '[]'::jsonb)
        from public.collab_files f where f.collab_id = c.id and c.files_sent_at is not null),
      'report_token', (select r.public_token from public.brand_reports r where r.collab_id = c.id and r.status = 'sent' order by r.created_at desc limit 1),
      'results', (
        select jsonb_build_object('views', sum(m.views), 'reach', sum(m.reach),
          'interactions', sum(coalesce(m.interactions, coalesce(m.likes, 0) + coalesce(m.comments, 0))), 'posts', count(*))
        from public.collab_posts p join public.ig_media m on m.id = p.media_id where p.collab_id = c.id),
      'deliverables', (
        select coalesce(jsonb_agg(jsonb_build_object('kind', d.kind, 'qty', d.qty, 'done', d.done) order by d.position), '[]'::jsonb)
        from public.deliverables d where d.collab_id = c.id),
      'events', (
        select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'text', e.text) order by e.at desc), '[]'::jsonb)
        from public.collab_events e where e.collab_id = c.id and e.visible_to_brand),
      'quotes', (
        select coalesce(jsonb_agg((to_jsonb(q) - 'accepted_ip') order by q.version desc), '[]'::jsonb)
        from public.quotes q where q.collab_id = c.id and q.status in ('sent', 'accepted', 'changes')),
      'drafts', (
        select coalesce(jsonb_agg(to_jsonb(dr) order by dr.round desc), '[]'::jsonb)
        from public.drafts dr where dr.collab_id = c.id),
      'invoices', (
        select coalesce(jsonb_agg(jsonb_build_object('number', i.number, 'kind', i.kind, 'total', i.total, 'payable', i.payable,
          'status', i.status, 'issue_date', i.issue_date, 'due_date', i.due_date, 'token', i.public_token) order by i.issue_date desc), '[]'::jsonb)
        from public.invoices i where i.collab_id = c.id and i.status <> 'draft')
    ) as obj
    from public.collabs c
    where public.my_brand_id() is not null and c.brand_id = public.my_brand_id()
  ) t;
$$;
