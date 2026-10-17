-- Brand-side fixes from testing.
-- 1. my_requests(): includes barter_kind (an experience never asks the brand to ship anything) and no
--    longer lists cancelled invoices as if they were due.
-- 2. A cancelled invoice: the brand (and their accounts email) is told, and if no invoice is left the
--    collab's payment status goes back to "not invoiced".
-- 3. "Not received" on a payment the brand reported: they get an email, not just a history line.

create or replace function public.my_requests()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t.obj order by t.created_at desc), '[]'::jsonb)
  from (
    select c.created_at, jsonb_build_object(
      'id', c.id, 'code', c.code, 'stage', c.stage, 'stage_label', public.stage_label(c.stage),
      'type', c.type, 'barter_kind', c.barter_kind, 'fee', c.fee, 'product', c.product, 'product_value', c.product_value,
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
        select coalesce(jsonb_agg(jsonb_build_object('number', i.number, 'kind', i.kind, 'total', i.total, 'currency', i.currency, 'payable', i.payable,
          'status', i.status, 'issue_date', i.issue_date, 'due_date', i.due_date, 'token', i.public_token, 'claimed', i.claim_at is not null) order by i.issue_date desc), '[]'::jsonb)
        from public.invoices i where i.collab_id = c.id and i.status not in ('draft', 'cancelled'))
    ) as obj
    from public.collabs c
    where public.my_brand_id() is not null and c.brand_id = public.my_brand_id()
  ) t;
$$;

-- Runs after the main invoice trigger (triggers fire in name order).
create or replace function public.invoice_cancelled_notice()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
begin
  if not (new.status = 'cancelled' and old.status not in ('draft', 'cancelled') and new.number is not null) then return null; end if;
  select * into c from public.collabs where id = new.collab_id;
  insert into public.outbox (kind, to_email, payload)
  select 'invoice_cancelled', e, jsonb_build_object('code', c.code, 'number', new.number, 'total', new.total,
    'currency', new.currency, 'contact', c.contact_name)
  from unnest(array[c.contact_email, new.send_to]) e
  where coalesce(btrim(e), '') <> '' group by e;
  -- Nothing invoiced any more (and nothing received): back to "not invoiced".
  if not exists (select 1 from public.invoices i where i.collab_id = c.id and i.status not in ('draft', 'cancelled'))
     and c.pay_status in ('invoiced', 'advance') and coalesce(c.pay_received, 0) = 0 then
    update public.collabs set pay_status = 'pending', invoice_no = '', pay_due = null, invoiced_on = null where id = c.id;
  end if;
  return null;
end;
$$;
drop trigger if exists zz_invoice_cancelled_notice on public.invoices;
create trigger zz_invoice_cancelled_notice after update of status on public.invoices
  for each row execute function public.invoice_cancelled_notice();

create or replace function public.invoice_claim_reject(p_invoice uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  i public.invoices;
  c public.collabs;
  s public.creator_settings;
begin
  if not public.is_creator() then raise exception 'Only the creator can do this.'; end if;
  update public.invoices set claim_amount = null, claim_ref = '', claim_on = null, claim_at = null, claim_by = '', auto_remind = true
  where id = p_invoice returning * into i;
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (i.collab_id, 'payment', format('Payment for %s not received yet. Please check the transfer.', i.number), true);
  select * into c from public.collabs where id = i.collab_id;
  select * into s from public.creator_settings where id = 1;
  insert into public.outbox (kind, to_email, payload)
  select 'payment_not_received', e, jsonb_build_object('code', c.code, 'number', i.number, 'contact', c.contact_name,
    'link', rtrim(s.site_url, '/') || '/invoice/' || i.public_token)
  from unnest(array[c.contact_email, i.send_to]) e
  where coalesce(btrim(e), '') <> '' group by e;
end;
$$;
revoke execute on function public.invoice_claim_reject(uuid) from anon;
