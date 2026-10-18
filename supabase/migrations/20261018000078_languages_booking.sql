-- Content languages and instant booking.
-- * She says which languages she creates in (English, Kannada, Hindi…); her page shows them and a brand
--   picks one, or several for mixed-language content. The choice is kept on the collab.
-- * Instant booking (her switch): a package request for an open week, with 3+ days' notice and no
--   competitor that week, is confirmed straight away.

alter table public.creator_settings
  add column if not exists content_languages text[] not null default '{English}',
  add column if not exists instant_booking boolean not null default false;
alter table public.collabs
  add column if not exists content_language text not null default '';

-- Niveditha creates in all three.
update public.creator_settings set content_languages = '{English,Kannada,Hindi}' where id = 1 and content_languages = '{English}';

-- What her page needs on top of public_page(): languages, instant booking and which weeks are open.
create or replace function public.page_extras()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'content_languages', to_jsonb(s.content_languages),
    'instant_booking', s.instant_booking,
    'weeks', case when s.instant_booking then public.availability() else null end)
  from public.creator_settings s where s.id = 1;
$$;
grant execute on function public.page_extras() to anon, authenticated;

create or replace function public.submit_request(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  me public.profiles;
  b public.brands;
  v_type public.collab_type;
  v_value numeric;
  v_id uuid;
  v_code text;
  d jsonb;
  pos integer := 0;
  recent integer;
  deliv_text text;
  first_name text;
  pk public.packages;
  v_fee numeric;
  v_kind text;
  v_low boolean := false;
  v_lang text := '';
  l text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    raise exception 'The creator account cannot send requests.';
  end if;

  select * into s from public.creator_settings where id = 1;
  first_name := split_part(s.display_name, ' ', 1);
  if not s.accepting then
    raise exception '% is fully booked right now and not taking new requests.', s.display_name;
  end if;

  select * into me from public.profiles where id = auth.uid();
  if me.brand_id is null then
    raise exception 'Add your brand details first.';
  end if;
  select * into b from public.brands where id = me.brand_id;

  select count(*) into recent
  from public.collabs
  where brand_id = me.brand_id and source = 'brand_page' and created_at > now() - interval '1 day';
  if recent >= 5 then
    raise exception 'You have sent 5 requests today. Please try again tomorrow.';
  end if;

  begin
    v_type := coalesce(nullif(p ->> 'type', ''), 'paid')::public.collab_type;
  exception when others then
    raise exception 'Choose a type of collaboration.';
  end;

  if jsonb_typeof(p -> 'deliverables') is distinct from 'array' then
    raise exception 'Choose at least one deliverable.';
  end if;
  -- Only content types she has switched on.
  if exists (
    select 1 from jsonb_array_elements(p -> 'deliverables') x
    where coalesce(nullif(x ->> 'qty', '')::integer, 0) > 0 and not (btrim(x ->> 'kind') = any(s.offered_kinds))
  ) then
    raise exception '% isn''t offering some of that content right now. Please choose from the options shown.', first_name;
  end if;
  -- Barter can be a product they send, or an experience (a stay, a meal, an event, a service).
  v_kind := case when p ->> 'barter_kind' = 'experience' then 'experience' else 'product' end;
  if v_type <> 'paid' and btrim(coalesce(p ->> 'product', '')) = '' then
    raise exception '%', case when v_kind = 'experience' then 'Tell us what you are offering (the stay, meal or event).' else 'Tell us which product you will send.' end;
  end if;

  -- One of her packages? Its price is the fee unless the brand offered more.
  if nullif(p ->> 'package_id', '') is not null then
    select * into pk from public.packages where id = (p ->> 'package_id')::uuid and active;
    if pk.id is null then
      raise exception 'That package is no longer available. Please choose the content you need.';
    end if;
    v_type := 'paid';
  end if;
  v_fee := greatest(0, coalesce(nullif(p ->> 'fee', '')::numeric, 0));
  if pk.id is not null then
    v_fee := greatest(v_fee, pk.price);
  end if;

  -- Content language: one or more of the languages she creates in ("Kannada", or "English + Kannada").
  if jsonb_typeof(p -> 'content_language') = 'array' then
    for l in select btrim(x) from jsonb_array_elements_text(p -> 'content_language') x loop
      if l <> '' then
        if not (l = any(s.content_languages)) then
          raise exception '% doesn''t create content in % right now. Please choose from the languages shown.', first_name, l;
        end if;
        v_lang := v_lang || case when v_lang = '' then '' else ' + ' end || l;
      end if;
    end loop;
  end if;

  -- Barter rules.
  v_value := greatest(0, coalesce(nullif(p ->> 'product_value', '')::numeric, 0));
  if v_type = 'barter' and s.barter_mode = 'closed' then
    raise exception '% is taking paid collaborations only right now. Choose Paid, or Paid + product.', first_name;
  end if;
  -- Below her barter minimum: still accepted, reviewed last (the brand was told on the form).
  v_low := v_type = 'barter' and s.barter_min_value > 0 and v_value < s.barter_min_value;

  insert into public.collabs (
    brand_id, source, contact_name, contact_email, contact_phone, type, fee, product, product_value,
    usage, brief, brief_details, preferred_live, note_for_brand, package_name, created_by, barter_kind, content_language)
  values (
    me.brand_id, 'brand_page', me.full_name, me.email, me.phone, v_type,
    case when v_type = 'barter' then 0 else v_fee end,
    case when v_type = 'paid' then '' else left(btrim(p ->> 'product'), 200) end,
    case when v_type = 'paid' then 0 else v_value end,
    left(coalesce(nullif(p ->> 'usage', ''), 'Organic only'), 60),
    left(coalesce(p ->> 'brief', ''), 4000),
    public.clean_brief(p -> 'brief_details'),
    nullif(p ->> 'preferred_live', '')::date,
    case when v_low
      then format('Thanks for reaching out! %s reviews paid collaborations first, and barter offers below ₹%s are reviewed last, so a reply may take longer than %s. Adding a fee gets a faster answer.', first_name, to_char(s.barter_min_value, 'FM99,99,99,999'), s.barter_reply_time)
      when v_type = 'barter'
      then format('Thanks for reaching out! %s reviews paid collaborations first, so barter requests usually get a reply within %s.', first_name, s.barter_reply_time)
      else format('Thanks for reaching out! %s will review your request and reply within %s.', first_name, s.reply_time) end,
    coalesce(pk.name, ''),
    auth.uid(),
    case when v_type = 'paid' then 'product' else v_kind end,
    left(v_lang, 60))
  returning id, code into v_id, v_code;

  for d in select * from jsonb_array_elements(p -> 'deliverables') loop
    if coalesce(nullif(d ->> 'qty', '')::integer, 0) > 0 and btrim(coalesce(d ->> 'kind', '')) <> '' then
      insert into public.deliverables (collab_id, kind, qty, position)
      values (v_id, left(btrim(d ->> 'kind'), 40), least(50, (d ->> 'qty')::integer), pos);
      pos := pos + 1;
    end if;
  end loop;
  if pos = 0 then
    raise exception 'Choose at least one deliverable.';
  end if;

  select string_agg(qty || ' × ' || kind, ', ' order by position) into deliv_text
  from public.deliverables where collab_id = v_id;

  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (v_id, auth.uid(), 'stage', 'Request received', true);

  insert into public.outbox (kind, to_email, payload) values
  ('request_received_brand', me.email, jsonb_build_object(
     'code', v_code, 'brand', b.name, 'contact', me.full_name, 'deliverables', deliv_text)),
  ('request_received_creator', s.creator_email, jsonb_build_object(
     'code', v_code, 'brand', b.name, 'contact', me.full_name, 'email', me.email, 'phone', me.phone,
     'type', v_type, 'fee', (select fee from public.collabs where id = v_id),
     'product', (select product from public.collabs where id = v_id),
     'deliverables', deliv_text, 'package', coalesce(pk.name, ''), 'brief', left(coalesce(p ->> 'brief', ''), 600), 'language', v_lang));

  return jsonb_build_object('id', v_id, 'code', v_code);
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
      'type', c.type, 'barter_kind', c.barter_kind, 'content_language', c.content_language, 'fee', c.fee, 'product', c.product, 'product_value', c.product_value,
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

create or replace function private.autopilot_new_request()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  c public.collabs;
  b public.brands;
  last public.quotes;
  v_rate numeric;
  v_fee numeric;
  v_deliv text;
  v_why text;
  v_quote uuid;
begin
  select * into s from public.creator_settings where id = 1;
  select * into c from public.collabs where id = new.id;
  if c.id is null or c.stage <> 'request' then
    return null;
  end if;
  select * into b from public.brands where id = c.brand_id;
  select string_agg(qty || ' × ' || kind, ', ' order by position) into v_deliv from public.deliverables where collab_id = c.id;

  -- 0. Instant booking: a package for an open week, with enough notice and no competitor that week, is
  --    booked straight away (the quote is sent and accepted in the brand's name; the collab is confirmed
  --    for their date). Both sides get the usual emails.
  if s.instant_booking and c.package_name <> '' and c.fee > 0 and c.preferred_live is not null
     and c.preferred_live >= current_date + 3 and public.week_open(c.preferred_live)
     and not exists (
       select 1 from public.collabs x join public.brands bx on bx.id = x.brand_id
       where x.id <> c.id and bx.id <> b.id and coalesce(b.category, '') <> '' and bx.category = b.category
         and x.stage in ('confirmed', 'creating', 'live')
         and abs(coalesce(x.live_date, x.preferred_live, x.draft_date) - c.preferred_live) <= s.competitor_window_days) then
    select * into last from public.quotes where status in ('sent', 'accepted') order by sent_at desc nulls last limit 1;
    insert into public.quotes (collab_id, items, usage, advance_pct, pay_days, revision_rounds, valid_until, notes, status)
    values (c.id,
      jsonb_build_array(jsonb_build_object('kind', format('%s (%s)', c.package_name, v_deliv), 'qty', 1, 'rate', c.fee)),
      c.usage, coalesce(last.advance_pct, 0), coalesce(last.pay_days, 15), coalesce(last.revision_rounds, 2),
      current_date + 14, 'Booked instantly from your page.', 'sent')
    returning id into v_quote;
    perform private.quote_response(v_quote, true, coalesce(nullif(c.contact_name, ''), b.name), 'Booked instantly', c.contact_email, c.created_by);
    update public.collabs set live_date = c.preferred_live where id = c.id;
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    values (c.id, 'note', format('Booked instantly: %s package, going live %s.', c.package_name, to_char(c.preferred_live, 'DD Mon')), true);
    return null;
  end if;

  -- 1. Package in an open week: send the quote now.
  if s.autopilot_packages and c.package_name <> '' and c.fee > 0 and public.week_open(c.preferred_live) then
    select * into last from public.quotes where status in ('sent', 'accepted') order by sent_at desc nulls last limit 1;
    insert into public.quotes (collab_id, items, usage, advance_pct, pay_days, revision_rounds, valid_until, notes, status)
    values (c.id,
      jsonb_build_array(jsonb_build_object('kind', format('%s (%s)', c.package_name, v_deliv), 'qty', 1, 'rate', c.fee)),
      c.usage, coalesce(last.advance_pct, 0), coalesce(last.pay_days, 15), coalesce(last.revision_rounds, 2),
      current_date + 14, '', 'sent');
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    values (c.id, 'note', format('Auto-pilot: %s package booked for an open week. Quote sent.', c.package_name), false);
    return null;
  end if;

  -- 2. Barter that doesn't fit her rules: offer paid + product at a fair fee.
  if s.autopilot_counter and c.type = 'barter' and c.contact_email <> '' then
    v_rate := public.rate_value(c.id);
    v_fee := ceil(greatest(0, v_rate - c.product_value * 0.4) / 500) * 500;
    v_why := case
      when s.barter_min_value > 0 and c.product_value < s.barter_min_value then 'below your minimum'
      when s.barter_monthly_cap > 0 and public.barter_slots_used() >= s.barter_monthly_cap then 'barter slots full this month'
      when c.product_value * 0.4 < v_rate * 0.5 then 'product covers under half your rate'
      end;
    if v_fee > 0 and v_why is not null then
      update public.collabs set counter_fee = v_fee, counter_status = 'sent' where id = c.id;
      insert into public.outbox (kind, to_email, payload)
      values ('barter_counter', c.contact_email, jsonb_build_object(
        'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'fee', v_fee, 'product', c.product,
        'deliverables', v_deliv, 'reply_time', s.barter_reply_time));
      insert into public.collab_events (collab_id, kind, text, visible_to_brand)
      values (c.id, 'note', format('Auto-pilot: barter %s. Offered Paid + product at ₹%s.', v_why, to_char(v_fee, 'FM99,99,99,999')), false);
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.quote_accepted_sync()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  it jsonb;
  pos integer := 0;
begin
  if not (new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted')) then return null; end if;
  -- Only when every line is a real content type (a package line like "Glow pack (1 × Reel)" isn't).
  if exists (select 1 from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) x where coalesce((x ->> 'qty')::int, 0) > 0)
     and not exists (select 1 from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) x, public.creator_settings s
                     where s.id = 1 and coalesce((x ->> 'qty')::int, 0) > 0 and not (btrim(x ->> 'kind') = any(s.offered_kinds)))
     and not exists (select 1 from public.deliverables d where d.collab_id = new.collab_id and d.done) then
    delete from public.deliverables where collab_id = new.collab_id;
    for it in select * from jsonb_array_elements(new.items) loop
      if coalesce((it ->> 'qty')::int, 0) > 0 and coalesce(btrim(it ->> 'kind'), '') <> '' then
        insert into public.deliverables (collab_id, kind, qty, position)
        values (new.collab_id, left(it ->> 'kind', 40), least(50, (it ->> 'qty')::int), pos);
        pos := pos + 1;
      end if;
    end loop;
  end if;
  update public.collabs set fee = round(new.total * coalesce(nullif(new.inr_rate, 0), 1))
  where id = new.collab_id and type <> 'barter' and new.total > 0;
  return null;
end;
$$;
