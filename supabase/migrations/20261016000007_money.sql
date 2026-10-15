-- Step 3: invoices (GST + TDS), payments, reminders, bank-credit matching.

-- ---------------------------------------------------------------------------
-- Billing details
-- ---------------------------------------------------------------------------
alter table public.creator_settings
  add column legal_name        text not null default '',
  add column pan               text not null default '',
  add column gst_registered    boolean not null default false,
  add column gstin             text not null default '',
  add column gst_rate          numeric(5,2) not null default 18 check (gst_rate between 0 and 28),
  add column sac_code          text not null default '',
  add column state             text not null default '',
  add column address           text not null default '',
  add column upi_id            text not null default '',
  add column bank_details      text not null default '',
  add column invoice_prefix    text not null default 'INV' check (invoice_prefix ~ '^[A-Z0-9]{1,6}$'),
  add column invoice_footer    text not null default 'Thank you for the collaboration!',
  add column reminders_enabled boolean not null default true,
  add column inbox_token       text not null default encode(extensions.gen_random_bytes(18), 'hex');

alter table public.brands
  add column gstin           text not null default '',
  add column billing_address text not null default '',
  add column state           text not null default '',
  add column accounts_email  text not null default '';

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create type public.invoice_status as enum ('draft', 'sent', 'partly_paid', 'paid', 'cancelled');

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  collab_id       uuid not null references public.collabs(id) on delete cascade,
  number          text unique,
  public_token    text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  kind            text not null default 'full' check (kind in ('advance', 'balance', 'full')),
  issue_date      date not null default current_date,
  due_date        date,
  items           jsonb not null default '[]',   -- [{ "description": "...", "qty": 1, "rate": 25000 }]
  subtotal        numeric(12,2) not null default 0,
  tax_mode        text not null default 'none' check (tax_mode in ('none', 'intra', 'inter')),
  gst_rate        numeric(5,2) not null default 0,
  cgst            numeric(12,2) not null default 0,
  sgst            numeric(12,2) not null default 0,
  igst            numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  tds_rate        numeric(5,2) not null default 0 check (tds_rate between 0 and 30),
  tds_amount      numeric(12,2) not null default 0,   -- expected TDS
  payable         numeric(12,2) not null default 0,   -- total minus expected TDS
  amount_received numeric(12,2) not null default 0 check (amount_received >= 0),
  tds_deducted    numeric(12,2) not null default 0 check (tds_deducted >= 0),
  paid_on         date,
  payment_ref     text not null default '',
  tds_certificate boolean not null default false,
  status          public.invoice_status not null default 'draft',
  send_to         text not null default '',
  notes           text not null default '',
  seller          jsonb not null default '{}',   -- creator's details when issued
  bill_to         jsonb not null default '{}',   -- brand's details when issued
  auto_remind     boolean not null default true,
  reminders_sent  integer[] not null default '{}',
  last_reminded_at timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index invoices_collab_idx on public.invoices (collab_id);
create index invoices_open_idx on public.invoices (status, due_date) where status in ('sent', 'partly_paid');

-- Indian financial year label for a date: 2026-10-16 -> '26-27'
create or replace function public.fy_label(d date)
returns text language sql immutable as $$
  select case when extract(month from d) >= 4
    then to_char(d, 'YY') || '-' || to_char(d + interval '1 year', 'YY')
    else to_char(d - interval '1 year', 'YY') || '-' || to_char(d, 'YY') end;
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
       or new.number is distinct from old.number or new.tds_rate is distinct from old.tds_rate then
      raise exception 'This invoice has been issued and cannot be edited. Cancel it and make a new one.';
    end if;
  end if;

  if tg_op = 'INSERT' or old.status = 'draft' then
    for it in select * from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
      sub := sub + greatest(0, coalesce((it ->> 'qty')::numeric, 0)) * greatest(0, coalesce((it ->> 'rate')::numeric, 0));
    end loop;
    new.subtotal := round(sub, 2);
    if new.tax_mode = 'none' then new.gst_rate := 0; end if;
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
      'bank_details', s.bank_details, 'footer', s.invoice_footer, 'gst_registered', s.gst_registered);
    new.bill_to := jsonb_build_object(
      'name', b.name, 'gstin', b.gstin, 'address', b.billing_address, 'state', b.state,
      'contact', c.contact_name, 'email', c.contact_email, 'code', c.code);
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

create trigger invoices_before_write
  before insert or update on public.invoices
  for each row execute function public.invoices_before_write();

-- Keeps the collab's payment summary (shown on the board, Today and Payments) in step with its invoices.
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
         coalesce(sum(case when status = 'paid' then subtotal else least(subtotal, amount_received + tds_deducted) end), 0),
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
    values (c.id, auth.uid(), 'invoice', format('Invoice %s sent: ₹%s', new.number, to_char(new.total, 'FM99,99,99,999')), true);
    insert into public.outbox (kind, to_email, payload)
    select 'invoice_sent', e, jsonb_build_object('code', c.code, 'number', new.number, 'total', new.total, 'payable', new.payable,
      'due', new.due_date, 'link', link, 'contact', c.contact_name, 'brand', new.bill_to ->> 'name')
    from unnest(array[c.contact_email, new.send_to]) e
    where coalesce(btrim(e), '') <> '' group by e;
  end if;

  if newly_paid then
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'payment', format('Payment received for %s: ₹%s', new.number,
      to_char(new.amount_received - coalesce(case when tg_op = 'UPDATE' then old.amount_received end, 0), 'FM99,99,99,999')), true);
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

create trigger invoices_after_write
  after insert or update on public.invoices
  for each row execute function public.invoices_after_write();

-- ---------------------------------------------------------------------------
-- Bank credits read from her bank's alert emails
-- ---------------------------------------------------------------------------
create table public.bank_alerts (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  received_at  timestamptz,
  sender       text not null default '',
  amount       numeric(12,2),
  ref          text not null default '',
  excerpt      text not null default '',
  hash         text not null unique,
  status       text not null default 'unmatched' check (status in ('matched', 'unmatched', 'ignored')),
  invoice_id   uuid references public.invoices(id) on delete set null,
  note         text not null default ''
);

-- ---------------------------------------------------------------------------
-- Brand-facing: billing details and invoices
-- ---------------------------------------------------------------------------
create or replace function public.update_brand_billing(p_gstin text, p_address text, p_state text, p_accounts_email text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_brand uuid := public.my_brand_id();
begin
  if v_brand is null then raise exception 'Add your brand details first.'; end if;
  p_gstin := upper(btrim(coalesce(p_gstin, '')));
  if p_gstin <> '' and p_gstin !~ '^[0-9]{2}[A-Z0-9]{13}$' then
    raise exception 'That GSTIN doesn''t look right. It has 15 letters and numbers, like 27AAACB1234C1Z5.';
  end if;
  update public.brands set gstin = p_gstin, billing_address = left(btrim(coalesce(p_address, '')), 400),
    state = left(btrim(coalesce(p_state, '')), 40), accounts_email = left(lower(btrim(coalesce(p_accounts_email, ''))), 120)
  where id = v_brand;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.my_billing()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('gstin', b.gstin, 'address', b.billing_address, 'state', b.state, 'accounts_email', b.accounts_email)
  from public.brands b where b.id = public.my_brand_id();
$$;

-- Anyone with the invoice link can see that one invoice (like a payment link).
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
    'status', i.status, 'notes', i.notes, 'seller', i.seller, 'bill_to', i.bill_to, 'token', i.public_token)
  from public.invoices i
  where i.public_token = p_token and i.status <> 'draft' and length(p_token) >= 24;
$$;

-- my_requests() now also lists issued invoices.
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

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------
alter table public.invoices enable row level security;
alter table public.bank_alerts enable row level security;
create policy "creator manages invoices" on public.invoices
  for all to authenticated using (public.is_creator()) with check (public.is_creator());
create policy "creator manages bank alerts" on public.bank_alerts
  for all to authenticated using (public.is_creator()) with check (public.is_creator());

revoke execute on function public.update_brand_billing(text, text, text, text) from anon;
revoke execute on function public.my_billing() from anon;
revoke execute on function public.sync_collab_payment(uuid) from public, anon, authenticated;
grant execute on function public.public_invoice(text) to anon, authenticated;

alter publication supabase_realtime add table public.invoices, public.bank_alerts;

-- 10:00 AM India time (04:30 UTC): polite payment reminders to brands.
select cron.schedule('payment-reminders', '30 4 * * *', $$select private.call_function('payment-reminders')$$);
