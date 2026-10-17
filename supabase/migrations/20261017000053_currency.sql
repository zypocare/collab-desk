-- Foreign brands: quotes and invoices in their currency (USD, EUR, GBP, AED, SGD), export invoices
-- without GST under a LUT. Her own totals stay in rupees: each quote and invoice keeps the rate it
-- was made at, and amounts towards her fee are counted in rupees with that rate.

alter table public.brands
  add column if not exists country text not null default 'India',
  add column if not exists currency text not null default 'INR' check (currency in ('INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'));
alter table public.creator_settings
  add column if not exists lut_arn text not null default '',
  add column if not exists intl_bank_details text not null default '';
alter table public.quotes
  add column if not exists currency text not null default 'INR' check (currency in ('INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD')),
  add column if not exists inr_rate numeric(12,4) not null default 1 check (inr_rate > 0);
alter table public.invoices
  add column if not exists currency text not null default 'INR' check (currency in ('INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD')),
  add column if not exists inr_rate numeric(12,4) not null default 1 check (inr_rate > 0);
alter table public.invoices drop constraint if exists invoices_tax_mode_check;
alter table public.invoices add constraint invoices_tax_mode_check check (tax_mode in ('none', 'intra', 'inter', 'export'));

-- Amounts in emails and history lines: ₹ for rupees, the right sign for the others.
create or replace function public.money_text(p_amount numeric, p_currency text default 'INR')
returns text language sql immutable as $$
  select case coalesce(p_currency, 'INR')
    when 'INR' then '₹' || to_char(round(coalesce(p_amount, 0)), 'FM99,99,99,999')
    when 'USD' then '$' || to_char(round(coalesce(p_amount, 0), 2), 'FM999,999,990.00')
    when 'EUR' then '€' || to_char(round(coalesce(p_amount, 0), 2), 'FM999,999,990.00')
    when 'GBP' then '£' || to_char(round(coalesce(p_amount, 0), 2), 'FM999,999,990.00')
    when 'SGD' then 'S$' || to_char(round(coalesce(p_amount, 0), 2), 'FM999,999,990.00')
    else p_currency || ' ' || to_char(round(coalesce(p_amount, 0), 2), 'FM999,999,990.00') end;
$$;


create or replace function public.invoices_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  it jsonb;
  sub numeric := 0;
  s public.creator_settings;
  c public.collabs;
  b public.brands;
  prefix text;
  seq integer;
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    -- Issued invoices are legal documents: only payment fields may change.
    if new.items is distinct from old.items or new.tax_mode is distinct from old.tax_mode
       or new.gst_rate is distinct from old.gst_rate or new.issue_date is distinct from old.issue_date
       or new.number is distinct from old.number or new.tds_rate is distinct from old.tds_rate
       or new.currency is distinct from old.currency then
      raise exception 'This invoice has been issued and cannot be edited. Cancel it and make a new one.';
    end if;
  end if;

  if tg_op = 'INSERT' or old.status = 'draft' then
    for it in select * from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
      sub := sub + greatest(0, coalesce((it ->> 'qty')::numeric, 0)) * greatest(0, coalesce((it ->> 'rate')::numeric, 0));
    end loop;
    new.subtotal := round(sub, 2);
    if new.tax_mode in ('none', 'export') then new.gst_rate := 0; end if;
    if new.currency <> 'INR' then new.tds_rate := 0; end if;
    new.cgst := case when new.tax_mode = 'intra' then round(new.subtotal * new.gst_rate / 200, 2) else 0 end;
    new.sgst := new.cgst;
    new.igst := case when new.tax_mode = 'inter' then round(new.subtotal * new.gst_rate / 100, 2) else 0 end;
    new.total := new.subtotal + new.cgst + new.sgst + new.igst;
    -- TDS is worked out on the amount before GST.
    new.tds_amount := round(new.subtotal * new.tds_rate / 100, 0);
    new.payable := new.total - new.tds_amount;
  end if;

  -- Issuing: give it the next number for the financial year and freeze both parties' details.
  if new.status <> 'draft' and new.status <> 'cancelled' and new.number is null then
    perform pg_advisory_xact_lock(hashtext('invoice_number'));
    select * into s from public.creator_settings where id = 1;
    select * into c from public.collabs where id = new.collab_id;
    select * into b from public.brands where id = c.brand_id;
    prefix := s.invoice_prefix || '/' || public.fy_label(new.issue_date) || '/';
    select coalesce(max(substring(number from length(prefix) + 1)::integer), 0) + 1 into seq
    from public.invoices where number like prefix || '%';
    new.number := prefix || lpad(seq::text, 3, '0');
    new.sent_at := coalesce(new.sent_at, now());
    new.seller := jsonb_build_object(
      'name', coalesce(nullif(s.legal_name, ''), s.display_name), 'display_name', s.display_name, 'handle', s.handle,
      'pan', s.pan, 'gstin', case when s.gst_registered then s.gstin else '' end, 'sac', s.sac_code,
      'address', s.address, 'state', s.state, 'email', s.creator_email, 'upi_id', s.upi_id,
      'bank_details', s.bank_details, 'footer', s.invoice_footer, 'gst_registered', s.gst_registered,
      'lut_arn', s.lut_arn, 'intl_bank', s.intl_bank_details);
    new.bill_to := jsonb_build_object(
      'name', b.name, 'gstin', b.gstin, 'address', b.billing_address, 'state', b.state,
      'contact', c.contact_name, 'email', c.contact_email, 'code', c.code, 'country', b.country);
  end if;

  -- Payment status follows the money.
  if new.status in ('sent', 'partly_paid', 'paid') and (new.amount_received > 0 or new.tds_deducted > 0) then
    if new.amount_received + new.tds_deducted >= new.total - 1 or new.amount_received >= new.payable - 1 then
      new.status := 'paid';
      new.paid_on := coalesce(new.paid_on, current_date);
    else
      new.status := 'partly_paid';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.sync_collab_payment(p_collab uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  issued integer;
  open_count integer;
  received numeric;
  next_due date;
  last_paid date;
  first_issue date;
  last_number text;
  c public.collabs;
  new_status public.pay_status;
begin
  select count(*), count(*) filter (where status in ('sent', 'partly_paid')),
         -- Money towards her fee (GST is collected for the government, so it doesn't count).
         coalesce(sum((case when status = 'paid' then subtotal else least(subtotal, amount_received + tds_deducted) end) * inr_rate), 0),
         min(due_date) filter (where status in ('sent', 'partly_paid')),
         max(paid_on), min(issue_date)
  into issued, open_count, received, next_due, last_paid, first_issue
  from public.invoices where collab_id = p_collab and status not in ('draft', 'cancelled');
  if issued = 0 then return; end if;

  select number into last_number from public.invoices
  where collab_id = p_collab and status not in ('draft', 'cancelled') order by sent_at desc nulls last limit 1;
  select * into c from public.collabs where id = p_collab;

  new_status := case
    when open_count > 0 then 'invoiced'
    when received >= c.fee - 1 then 'paid'
    else 'advance' end;

  perform set_config('app.quiet', 'on', true);
  update public.collabs set
    pay_received = received,
    invoice_no = coalesce(last_number, ''),
    invoiced_on = first_issue,
    pay_due = next_due,
    pay_status = new_status,
    paid_on = case when new_status = 'paid' then coalesce(last_paid, current_date) else null end,
    stage = case when new_status = 'paid' and stage = 'live' then 'wrapped'::public.collab_stage else stage end
  where id = p_collab;
  perform set_config('app.quiet', 'off', true);
end;
$$;

create or replace function public.invoices_after_write()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  link text;
  s public.creator_settings;
  issued boolean := new.status not in ('draft', 'cancelled') and (tg_op = 'INSERT' or old.status in ('draft'));
  newly_paid boolean := new.status in ('paid', 'partly_paid')
    and (tg_op = 'INSERT' or new.amount_received + new.tds_deducted > old.amount_received + old.tds_deducted);
begin
  select * into c from public.collabs where id = new.collab_id;
  select * into s from public.creator_settings where id = 1;
  link := rtrim(s.site_url, '/') || '/invoice/' || new.public_token;

  if issued then
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'invoice', format('Invoice %s sent: %s', new.number, public.money_text(new.total, new.currency)), true);
    insert into public.outbox (kind, to_email, payload)
    select 'invoice_sent', e, jsonb_build_object('code', c.code, 'number', new.number, 'total', new.total, 'payable', new.payable,
      'due', new.due_date, 'link', link, 'contact', c.contact_name, 'brand', new.bill_to ->> 'name', 'currency', new.currency)
    from unnest(array[c.contact_email, new.send_to]) e
    where coalesce(btrim(e), '') <> '' group by e;
  end if;

  if newly_paid then
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'payment', format('Payment received for %s: %s', new.number,
      public.money_text(new.amount_received - coalesce(case when tg_op = 'UPDATE' then old.amount_received end, 0), new.currency)), true);
    if new.status = 'paid' and c.contact_email <> '' then
      insert into public.outbox (kind, to_email, payload)
      values ('payment_thanks', c.contact_email, jsonb_build_object('code', c.code, 'number', new.number, 'contact', c.contact_name, 'link', link));
    end if;
  end if;

  if new.status = 'cancelled' and tg_op = 'UPDATE' and old.status <> 'cancelled' and new.number is not null then
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'invoice', format('Invoice %s cancelled', new.number), true);
  end if;

  perform public.sync_collab_payment(new.collab_id);
  return null;
end;
$$;

create or replace function public.public_invoice(p_token text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'number', i.number, 'kind', i.kind, 'issue_date', i.issue_date, 'due_date', i.due_date, 'items', i.items,
    'subtotal', i.subtotal, 'tax_mode', i.tax_mode, 'gst_rate', i.gst_rate, 'cgst', i.cgst, 'sgst', i.sgst, 'igst', i.igst,
    'total', i.total, 'currency', i.currency, 'tds_rate', i.tds_rate, 'tds_amount', i.tds_amount, 'payable', i.payable,
    'amount_received', i.amount_received, 'tds_deducted', i.tds_deducted, 'paid_on', i.paid_on,
    'status', i.status, 'notes', i.notes, 'claim_amount', i.claim_amount, 'claim_ref', i.claim_ref, 'claim_on', i.claim_on, 'claim_at', i.claim_at, 'seller', i.seller, 'bill_to', i.bill_to, 'token', i.public_token)
  from public.invoices i
  where i.public_token = p_token and i.status <> 'draft' and length(p_token) >= 24;
$$;

create or replace function private.quote_response(p_quote uuid, p_accept boolean, p_name text, p_note text, p_email text, p_actor uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  q public.quotes;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
  v_ip text;
begin
  select * into q from public.quotes where id = p_quote;
  select * into c from public.collabs where id = q.collab_id;
  if c.id is null then
    raise exception 'Quote not found.';
  end if;
  if q.status <> 'sent' then
    raise exception 'This quote is no longer open.';
  end if;
  if q.valid_until is not null and q.valid_until < current_date then
    raise exception 'This quote has expired. Ask for a new one.';
  end if;

  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = 1;
  v_ip := nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '');

  if p_accept then
    if btrim(coalesce(p_name, '')) = '' then
      raise exception 'Type your full name to accept.';
    end if;
    update public.quotes
    set status = 'accepted', responded_at = now(), accepted_name = left(btrim(p_name), 120),
        accepted_email = p_email, accepted_ip = v_ip, response_note = left(coalesce(p_note, ''), 2000)
    where id = q.id;

    perform set_config('app.quiet', 'on', true);
    update public.collabs
    set fee = case when type = 'barter' then fee else round(q.total * coalesce(q.inr_rate, 1)) end,
        usage = q.usage,
        stage = case when stage in ('request', 'negotiating') then 'confirmed'::public.collab_stage else stage end
    where id = c.id;
    perform set_config('app.quiet', 'off', true);

    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, p_actor, 'quote', format('Quote v%s accepted by %s. Agreement confirmed.', q.version, btrim(p_name)), true);

    insert into public.outbox (kind, to_email, payload) values
    ('quote_accepted', s.creator_email, jsonb_build_object('code', c.code, 'brand', b.name, 'name', btrim(p_name), 'total', q.total, 'currency', q.currency, 'note', p_note)),
    ('agreement_confirmed', p_email, jsonb_build_object('code', c.code, 'brand', b.name, 'contact', btrim(p_name), 'total', q.total, 'currency', q.currency, 'quote_id', q.id));
  else
    if btrim(coalesce(p_note, '')) = '' then
      raise exception 'Tell us what you would like changed.';
    end if;
    update public.quotes set status = 'changes', responded_at = now(), response_note = left(btrim(p_note), 2000) where id = q.id;
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, p_actor, 'quote', format('Brand asked for changes to quote v%s', q.version), true);
    insert into public.outbox (kind, to_email, payload)
    values ('quote_changes', s.creator_email, jsonb_build_object('code', c.code, 'brand', b.name, 'name', btrim(coalesce(p_name, '')), 'note', btrim(p_note)));
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.quotes_after_write()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    select * into c from public.collabs where id = new.collab_id;
    select * into b from public.brands where id = c.brand_id;

    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'quote', format('Quote v%s sent: ₹%s', new.version, to_char(new.total, 'FM99,99,99,999')), true);

    if c.contact_email <> '' then
      insert into public.outbox (kind, to_email, payload)
      values ('quote_sent', c.contact_email, jsonb_build_object(
        'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'total', new.total, 'currency', new.currency, 'version', new.version));
    end if;

    if c.stage = 'request' then
      perform set_config('app.quiet', 'on', true);
      update public.collabs set stage = 'negotiating' where id = c.id;
      perform set_config('app.quiet', 'off', true);
    end if;
  end if;
  return null;
end;
$$;

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
        select coalesce(jsonb_agg(jsonb_build_object('number', i.number, 'kind', i.kind, 'total', i.total, 'currency', i.currency, 'payable', i.payable,
          'status', i.status, 'issue_date', i.issue_date, 'due_date', i.due_date, 'token', i.public_token, 'claimed', i.claim_at is not null) order by i.issue_date desc), '[]'::jsonb)
        from public.invoices i where i.collab_id = c.id and i.status <> 'draft')
    ) as obj
    from public.collabs c
    where public.my_brand_id() is not null and c.brand_id = public.my_brand_id()
  ) t;
$$;

create or replace function public.public_track(p_token text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id, 'code', c.code, 'stage', c.stage, 'stage_label', public.stage_label(c.stage),
    'type', c.type, 'fee', c.fee, 'product', c.product, 'product_value', c.product_value, 'usage', c.usage,
    'brief', '', 'preferred_live', c.preferred_live, 'received_on', c.received_on,
    'draft_date', c.draft_date, 'live_date', c.live_date, 'live_time', c.live_time,
    'pay_status', c.pay_status, 'invoice_no', c.invoice_no, 'pay_due', c.pay_due, 'paid_on', c.paid_on,
    'note_for_brand', c.note_for_brand, 'contact_name', c.contact_name, 'contact_email', c.contact_email,
    'created_at', c.created_at, 'product_date', c.product_date, 'shipped_at', c.shipped_at,
    'product_received_at', c.product_received_at, 'usage_ends', c.usage_ends, 'files_sent_at', c.files_sent_at,
    'brand', b.name,
    'deliverables', (select coalesce(jsonb_agg(jsonb_build_object('kind', d.kind, 'qty', d.qty, 'done', d.done) order by d.position), '[]'::jsonb)
                     from public.deliverables d where d.collab_id = c.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'text', e.text) order by e.at desc), '[]'::jsonb)
               from (select * from public.collab_events e where e.collab_id = c.id and e.visible_to_brand order by e.at desc limit 12) e),
    'quotes', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'status', q.status, 'total', q.total, 'currency', q.currency, 'responded_at', q.responded_at,
                 'version', q.version, 'items', q.items, 'usage', q.usage, 'advance_pct', q.advance_pct, 'pay_days', q.pay_days,
                 'revision_rounds', q.revision_rounds, 'exclusivity_days', q.exclusivity_days, 'accepted_name', q.accepted_name) order by q.version desc), '[]'::jsonb)
               from public.quotes q where q.collab_id = c.id and q.status in ('sent', 'accepted', 'changes')),
    'drafts', (select coalesce(jsonb_agg(jsonb_build_object('id', dr.id, 'round', dr.round, 'status', dr.status, 'submitted_at', dr.submitted_at,
                 'responded_at', dr.responded_at) order by dr.round desc), '[]'::jsonb)
               from public.drafts dr where dr.collab_id = c.id),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object('number', i.number, 'kind', i.kind, 'total', i.total, 'currency', i.currency, 'payable', i.payable,
                 'status', i.status, 'issue_date', i.issue_date, 'due_date', i.due_date, 'token', i.public_token, 'claimed', i.claim_at is not null)
                 order by i.issue_date desc), '[]'::jsonb)
                 from public.invoices i where i.collab_id = c.id and i.status not in ('draft', 'cancelled')),
    'files', '[]'::jsonb,
    'report_token', (select r.public_token from public.brand_reports r where r.collab_id = c.id and r.status = 'sent' order by r.created_at desc limit 1),
    'results', (select jsonb_build_object('views', sum(m.views), 'reach', sum(m.reach),
                  'interactions', sum(coalesce(m.interactions, coalesce(m.likes, 0) + coalesce(m.comments, 0))), 'posts', count(*))
                from public.collab_posts p join public.ig_media m on m.id = p.media_id where p.collab_id = c.id))
  from public.collabs c join public.brands b on b.id = c.brand_id
  where c.track_token = p_token and length(p_token) >= 24 and c.stage <> 'declined';
$$;

create or replace function public.action_info(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  a private.action_links;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
  q public.quotes;
  d public.drafts;
  v_state text;
begin
  select * into a from private.action_links where token = p_token;
  if a.token is null or a.kind not in ('quote', 'draft', 'counter') then
    return jsonb_build_object('state', 'missing');
  end if;
  select * into s from public.creator_settings where id = 1;
  if a.kind = 'quote' then
    select * into q from public.quotes where id = a.ref_id;
    select * into c from public.collabs where id = q.collab_id;
  elsif a.kind = 'draft' then
    select * into d from public.drafts where id = a.ref_id;
    select * into c from public.collabs where id = d.collab_id;
  else
    select * into c from public.collabs where id = a.ref_id;
  end if;
  select * into b from public.brands where id = c.brand_id;

  v_state := case
    when a.used_at is not null then 'used'
    when a.expires_at < now() then 'expired'
    when a.kind = 'quote' and q.status <> 'sent' then 'closed'
    when a.kind = 'quote' and q.valid_until is not null and q.valid_until < current_date then 'expired'
    when a.kind = 'draft' and d.status <> 'pending' then 'closed'
    when a.kind = 'counter' and (c.counter_status <> 'sent' or c.stage <> 'request' or c.type <> 'barter') then 'closed'
    else 'open' end;

  return jsonb_build_object(
    'state', v_state, 'kind', a.kind, 'code', c.code, 'brand', b.name, 'contact', c.contact_name,
    'creator', s.display_name,
    'quote', case when a.kind = 'quote' then jsonb_build_object(
      'version', q.version, 'items', q.items, 'usage', q.usage, 'usage_fee', q.usage_fee, 'discount', q.discount,
      'total', q.total, 'currency', q.currency, 'advance_pct', q.advance_pct, 'pay_days', q.pay_days, 'revision_rounds', q.revision_rounds,
      'exclusivity_days', q.exclusivity_days, 'valid_until', q.valid_until, 'notes', q.notes) end,
    'draft', case when a.kind = 'draft' then jsonb_build_object(
      'round', d.round, 'link', d.link, 'caption', d.caption, 'note', d.note, 'file_path', d.file_path, 'file_type', d.file_type,
      'comments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.at_seconds, 'body', x.body, 'name', x.name) order by x.at_seconds nulls last, x.id)
                            from public.draft_comments x where x.draft_id = d.id), '[]'::jsonb)) end,
    'counter', case when a.kind = 'counter' then jsonb_build_object(
      'fee', c.counter_fee, 'product', c.product, 'reply_time', s.barter_reply_time,
      'deliverables', (select string_agg(qty || ' × ' || kind, ', ' order by position) from public.deliverables where collab_id = c.id)) end);
end;
$$;

create or replace function private.auto_invoice(p_collab uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  s public.creator_settings;
  b public.brands;
  q public.quotes;
  issued numeric := 0;
  fee numeric;
  v_kind text;
  amount numeric;
  due date;
  what text;
  label text;
  tds numeric;
begin
  select * into s from public.creator_settings where id = 1;
  if not coalesce(s.autopilot_invoice, false) then return; end if;
  select * into c from public.collabs where id = p_collab;
  if c.id is null or c.type = 'barter' or coalesce(btrim(c.contact_email), '') = '' then return; end if;
  if exists (select 1 from public.invoices where collab_id = c.id and status = 'draft') then return; end if;
  select * into b from public.brands where id = c.brand_id;
  if coalesce(b.currency, 'INR') <> 'INR' then
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    values (c.id, 'note', 'Auto-pilot: ' || b.name || ' pays in ' || b.currency || ', so make this invoice yourself (pick the rate and export details).', false);
    return;
  end if;
  select * into q from public.quotes where collab_id = c.id and status = 'accepted' order by created_at desc limit 1;
  fee := coalesce(nullif(c.fee, 0), q.total, 0);
  if fee <= 0 then return; end if;
  select coalesce(sum(subtotal), 0) into issued from public.invoices where collab_id = c.id and status not in ('draft', 'cancelled');

  if c.stage in ('live', 'wrapped') then
    if issued >= fee then return; end if;
    v_kind := case when issued > 0 then 'balance' else 'full' end;
    amount := fee - issued;
    due := greatest(coalesce(c.live_date, current_date) + coalesce(q.pay_days, 15), current_date + 7);
  elsif c.stage = 'confirmed' then
    if q.id is null or q.advance_pct <= 0 or q.advance_pct >= 100 or issued > 0 then return; end if;
    v_kind := 'advance';
    amount := round(fee * q.advance_pct / 100);
    due := current_date + 7;
  else
    return;
  end if;

  what := coalesce((select string_agg(d.qty || ' ' || case when d.qty > 1 then case d.kind when 'Story' then 'Stories' else d.kind || 's' end else d.kind end, ' · ' order by d.position)
                    from public.deliverables d where d.collab_id = c.id), 'Content')
          || ' for ' || b.name || ' (' || c.code || ')';
  label := case v_kind when 'advance' then 'Advance (' || q.advance_pct || '%)' when 'balance' then 'Balance' else 'Content collaboration' end;
  -- Same TDS as this brand's last invoice (brands deduct the same rate every time).
  select i.tds_rate into tds from public.invoices i join public.collabs x on x.id = i.collab_id
   where x.brand_id = c.brand_id and i.status not in ('draft', 'cancelled') order by i.created_at desc limit 1;

  insert into public.invoices (collab_id, kind, items, tax_mode, gst_rate, tds_rate, issue_date, due_date, send_to, notes, auto_remind, status)
  values (c.id, v_kind, jsonb_build_array(jsonb_build_object('description', label || ': ' || what, 'qty', 1, 'rate', amount)),
          case when s.gst_registered then case when coalesce(b.state, '') <> '' and b.state = s.state then 'intra' else 'inter' end else 'none' end,
          s.gst_rate, coalesce(tds, 0), current_date, due, coalesce(b.accounts_email, ''), '', true, 'sent');
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (c.id, 'note', 'Auto-pilot: sent the ' || case v_kind when 'advance' then 'advance invoice' when 'balance' then 'balance invoice' else 'invoice' end || '.', false);
end;
$$;
