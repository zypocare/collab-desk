-- TDS certificates (Form 16A): ask the brand for the certificate once it is due, so she can claim the
-- TDS when filing. One email per request, to the brand's accounts email (or the contact).

alter table public.invoices
  add column if not exists tds_requested_at timestamptz;

create or replace function public.request_tds_certificate(p_invoice uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  i public.invoices;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
  v_to text;
  v_q text;
begin
  if not public.is_creator() then raise exception 'Not allowed.'; end if;
  select * into i from public.invoices where id = p_invoice;
  if i.id is null or i.tds_deducted <= 0 then raise exception 'This invoice has no TDS deducted.'; end if;
  if i.tds_certificate then raise exception 'The certificate is already marked as received.'; end if;
  if i.tds_requested_at > now() - interval '3 days' then raise exception 'Already asked in the last 3 days.'; end if;
  select * into c from public.collabs where id = i.collab_id;
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = 1;
  v_to := coalesce(nullif(btrim(b.accounts_email), ''), nullif(btrim(i.send_to), ''), nullif(btrim(c.contact_email), ''));
  if v_to is null then raise exception 'Add the brand''s accounts email first.'; end if;

  -- The quarter the TDS falls in (April to March year), e.g. "Q2 (July to September) 2026-27".
  v_q := case
    when extract(month from coalesce(i.paid_on, i.issue_date)) between 4 and 6 then 'Q1 (April to June)'
    when extract(month from coalesce(i.paid_on, i.issue_date)) between 7 and 9 then 'Q2 (July to September)'
    when extract(month from coalesce(i.paid_on, i.issue_date)) between 10 and 12 then 'Q3 (October to December)'
    else 'Q4 (January to March)' end || ' ' || public.fy_label(coalesce(i.paid_on, i.issue_date));

  update public.invoices set tds_requested_at = now() where id = i.id;
  insert into public.outbox (kind, to_email, payload) values ('tds_cert_request', v_to, jsonb_build_object(
    'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'number', i.number, 'tds', i.tds_deducted,
    'quarter', v_q, 'pan', s.pan, 'name', coalesce(nullif(s.legal_name, ''), s.display_name), 'paid_on', i.paid_on));
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (c.id, 'note', format('Asked %s for the TDS certificate (Form 16A) for %s', b.name, i.number), true);
  return jsonb_build_object('ok', true, 'to', v_to);
end;
$$;
revoke execute on function public.request_tds_certificate(uuid) from public, anon;
grant execute on function public.request_tds_certificate(uuid) to authenticated;
