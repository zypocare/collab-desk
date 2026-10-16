-- "I've paid": the brand reports a payment on the invoice (amount, UTR / reference, date). Reminders
-- pause, she gets an alert, and confirms it in one tap (or says it hasn't arrived).
alter table public.invoices
  add column claim_amount numeric(12,2),
  add column claim_ref    text not null default '',
  add column claim_on     date,
  add column claim_at     timestamptz,
  add column claim_by     text not null default '';

create or replace function public.public_invoice(p_token text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'number', i.number, 'kind', i.kind, 'issue_date', i.issue_date, 'due_date', i.due_date, 'items', i.items,
    'subtotal', i.subtotal, 'tax_mode', i.tax_mode, 'gst_rate', i.gst_rate, 'cgst', i.cgst, 'sgst', i.sgst, 'igst', i.igst,
    'total', i.total, 'tds_rate', i.tds_rate, 'tds_amount', i.tds_amount, 'payable', i.payable,
    'amount_received', i.amount_received, 'tds_deducted', i.tds_deducted, 'paid_on', i.paid_on,
    'status', i.status, 'notes', i.notes, 'claim_amount', i.claim_amount, 'claim_ref', i.claim_ref, 'claim_on', i.claim_on, 'claim_at', i.claim_at, 'seller', i.seller, 'bill_to', i.bill_to, 'token', i.public_token)
  from public.invoices i
  where i.public_token = p_token and i.status <> 'draft' and length(p_token) >= 24;
$$;
grant execute on function public.public_invoice(text) to anon, authenticated;

create or replace function public.invoice_claim_paid(p_token text, p_amount numeric, p_ref text, p_on date, p_name text default '')
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  i public.invoices;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  select * into i from public.invoices where public_token = p_token and length(p_token) >= 24 for update;
  if i.id is null then raise exception 'Invoice not found.'; end if;
  if i.status not in ('sent', 'partly_paid') then raise exception 'This invoice is not waiting for payment.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter the amount you paid.'; end if;
  if btrim(coalesce(p_ref, '')) = '' then raise exception 'Enter the UTR or transaction reference.'; end if;
  update public.invoices set claim_amount = p_amount, claim_ref = left(btrim(p_ref), 60), claim_on = coalesce(p_on, current_date),
    claim_at = now(), claim_by = left(btrim(coalesce(p_name, '')), 80), auto_remind = false
  where id = i.id;
  select * into c from public.collabs where id = i.collab_id;
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = 1;
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (c.id, 'payment', format('Brand reported paying ₹%s for %s (ref %s). Waiting for confirmation.', to_char(p_amount, 'FM99,99,99,999'), i.number, btrim(p_ref)), true);
  insert into public.outbox (kind, to_email, payload) values ('payment_claimed', s.creator_email, jsonb_build_object(
    'code', c.code, 'brand', b.name, 'number', i.number, 'amount', p_amount, 'ref', btrim(p_ref), 'on', coalesce(p_on, current_date)));
end;
$$;
grant execute on function public.invoice_claim_paid(text, numeric, text, date, text) to anon, authenticated;

-- She says it hasn't arrived: the claim is cleared and reminders resume.
create or replace function public.invoice_claim_reject(p_invoice uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  i public.invoices;
begin
  if not public.is_creator() then raise exception 'Only the creator can do this.'; end if;
  update public.invoices set claim_amount = null, claim_ref = '', claim_on = null, claim_at = null, claim_by = '', auto_remind = true
  where id = p_invoice returning * into i;
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (i.collab_id, 'payment', format('Payment for %s not received yet. Please check the transfer.', i.number), true);
end;
$$;
revoke execute on function public.invoice_claim_reject(uuid) from anon;
