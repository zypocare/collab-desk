-- Miracle for many creators, part 5: triggers and internal helpers work for the creator of the row.
-- Settings, numbering, slots and away replies come from that creator; emails queued by a trigger carry
-- the creator they are for. Internal helpers without a creator argument use the page's creator.

-- Internal helpers -----------------------------------------------------------------------------

-- One creator's checks, for triggers that know the creator from the row.
create or replace function private.is_away(p_creator integer)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select s.away_until is not null and s.away_until >= current_date from public.creator_settings s where s.id = p_creator;
$$;
revoke execute on function private.is_away(integer) from public, anon, authenticated;

create or replace function private.week_open(p_creator integer, p_date date)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select p_date is null or (
    date_trunc('week', p_date)::date <> all(s.away_weeks)
    and (select count(*) from public.collabs c
         where c.creator_id = s.id
           and c.stage in ('confirmed', 'creating', 'live')
           and coalesce(c.live_date, c.draft_date, c.preferred_live) >= date_trunc('week', p_date)::date
           and coalesce(c.live_date, c.draft_date, c.preferred_live) < date_trunc('week', p_date)::date + 7) < s.weekly_capacity)
  from public.creator_settings s where s.id = p_creator;
$$;
revoke execute on function private.week_open(integer, date) from public, anon, authenticated;

create or replace function private.barter_slots_used(p_creator integer)
returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::integer
  from public.collabs c
  where c.creator_id = p_creator
    and c.type = 'barter'
    and c.stage in ('confirmed', 'creating', 'live', 'wrapped')
    and date_trunc('month', coalesce(c.live_date, c.preferred_live, c.received_on)) = date_trunc('month', current_date);
$$;
revoke execute on function private.barter_slots_used(integer) from public, anon, authenticated;

create or replace function public.availability()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('start', x.w, 'status',
    case when x.w = any(s.away_weeks) then 'away'
         when x.n >= s.weekly_capacity then 'full'
         when s.weekly_capacity > 1 and x.n = s.weekly_capacity - 1 then 'limited'
         else 'open' end) order by x.w), '[]'::jsonb)
  from public.creator_settings s,
  lateral (
    select g::date as w,
      (select count(*) from public.collabs c
       where c.creator_id = s.id
         and c.stage in ('confirmed', 'creating', 'live')
         and coalesce(c.live_date, c.draft_date, c.preferred_live) >= g::date
         and coalesce(c.live_date, c.draft_date, c.preferred_live) < g::date + 7) as n
    from generate_series(date_trunc('week', current_date), date_trunc('week', current_date) + interval '7 weeks', interval '1 week') g
  ) x
  where s.id = private.page_creator();
$$;

create or replace function public.barter_slots_used()
returns integer
language sql stable security definer
set search_path = public
as $$ select private.barter_slots_used(private.page_creator()); $$;

create or replace function public.is_away()
returns boolean
language sql stable security definer
set search_path = public
as $$ select private.is_away(private.page_creator()); $$;

create or replace function public.week_open(p_date date)
returns boolean
language sql stable security definer
set search_path = public
as $$ select private.week_open(private.page_creator(), p_date); $$;

create or replace function public.rate_value(p_collab uuid)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(nullif(s.rates ->> d.kind, '')::numeric, 0) * d.qty), 0)
  from public.deliverables d, public.creator_settings s
  where d.collab_id = p_collab and s.id = d.creator_id;
$$;

-- Copies go to the team of the creator being worked for (none when that isn't known).
create or replace function public.team_copy_emails()
returns text[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(email), '{}') from public.team_members where copy_emails and creator_id = private.page_creator();
$$;

create or replace function public.usage_ext_price(p_collab uuid, p_days integer)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select round(greatest(c.fee, coalesce((
           select sum(coalesce((s.rates ->> d.kind)::numeric, 0) * d.qty) from public.deliverables d where d.collab_id = c.id), 0))
         * s.usage_ext_pct / 100.0 * p_days / 30.0 / 500) * 500
  from public.collabs c, public.creator_settings s
  where c.id = p_collab and s.id = c.creator_id;
$$;

-- Collabs --------------------------------------------------------------------------------------

create or replace function private.autopilot_new_request()
returns trigger
language plpgsql
security definer
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
  select * into s from public.creator_settings where id = new.creator_id;
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
     and c.preferred_live >= current_date + 3 and private.week_open(c.creator_id, c.preferred_live)
     and not exists (
       select 1 from public.collabs x join public.brands bx on bx.id = x.brand_id
       where x.creator_id = c.creator_id
         and x.id <> c.id and bx.id <> b.id and coalesce(b.category, '') <> '' and bx.category = b.category
         and x.stage in ('confirmed', 'creating', 'live')
         and abs(coalesce(x.live_date, x.preferred_live, x.draft_date) - c.preferred_live) <= s.competitor_window_days) then
    select * into last from public.quotes where creator_id = c.creator_id and status in ('sent', 'accepted') order by sent_at desc nulls last limit 1;
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
  if s.autopilot_packages and c.package_name <> '' and c.fee > 0 and private.week_open(c.creator_id, c.preferred_live) then
    select * into last from public.quotes where creator_id = c.creator_id and status in ('sent', 'accepted') order by sent_at desc nulls last limit 1;
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
      when s.barter_monthly_cap > 0 and private.barter_slots_used(c.creator_id) >= s.barter_monthly_cap then 'barter slots full this month'
      when c.product_value * 0.4 < v_rate * 0.5 then 'product covers under half your rate'
      end;
    if v_fee > 0 and v_why is not null then
      update public.collabs set counter_fee = v_fee, counter_status = 'sent' where id = c.id;
      insert into public.outbox (creator_id, kind, to_email, payload)
      values (c.creator_id, 'barter_counter', c.contact_email, jsonb_build_object(
        'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'fee', v_fee, 'product', c.product,
        'deliverables', v_deliv, 'reply_time', s.barter_reply_time));
      insert into public.collab_events (collab_id, kind, text, visible_to_brand)
      values (c.id, 'note', format('Auto-pilot: barter %s. Offered Paid + product at ₹%s.', v_why, to_char(v_fee, 'FM99,99,99,999')), false);
    end if;
  end if;
  return null;
end;
$$;

create or replace function private.away_on_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prev text := current_setting('app.creator', true);
  v_text text;
begin
  if private.is_away(new.creator_id) then
    -- away_text() speaks for the creator being worked for: make that this collab's creator for the call
    perform set_config('app.creator', new.creator_id::text, true);
    v_text := private.away_text();
    perform set_config('app.creator', coalesce(prev, ''), true);
    update public.collabs set note_for_brand = v_text where id = new.id;
  end if;
  return null;
end;
$$;

create or replace function private.collabs_auto_dates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select autopilot_dates from public.creator_settings where id = new.creator_id), false) then return new; end if;
  if new.stage = 'confirmed' and old.stage is distinct from 'confirmed' and new.live_date is null
     and new.preferred_live is not null and new.preferred_live > current_date then
    new.live_date := new.preferred_live;
  end if;
  if new.live_date is not null and new.draft_date is null and new.stage in ('confirmed', 'creating') then
    new.draft_date := greatest(current_date + 1, new.live_date - 4);
  end if;
  return new;
end;
$$;

create or replace function private.collabs_demand_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price numeric;
  f numeric;
  prev text := current_setting('app.creator', true);
begin
  -- demand_factor() looks at the creator being worked for: make that this collab's creator for the call
  perform set_config('app.creator', new.creator_id::text, true);
  f := public.demand_factor();
  perform set_config('app.creator', coalesce(prev, ''), true);
  if f > 1 and new.package_name <> '' then
    select price into v_price from public.packages where creator_id = new.creator_id and name = new.package_name and active order by position limit 1;
    if v_price is not null then new.fee := greatest(new.fee, ceil(v_price * f / 500) * 500); end if;
  end if;
  return new;
end;
$$;

create or replace function public.collabs_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.brands;
  quiet boolean := coalesce(current_setting('app.quiet', true), '') = 'on';
begin
  select * into b from public.brands where id = new.brand_id;

  if new.stage is distinct from old.stage then
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (new.id, auth.uid(), 'stage', 'Status: ' || public.stage_label(new.stage), true);

    if not quiet and new.notify_brand and new.contact_email <> '' and new.stage <> 'request' then
      insert into public.outbox (creator_id, kind, to_email, payload)
      values (new.creator_id, 'stage_changed', new.contact_email, jsonb_build_object(
        'code', new.code, 'brand', b.name, 'contact', new.contact_name,
        'stage', new.stage, 'stage_label', public.stage_label(new.stage),
        'note', case when new.stage in ('paused', 'cancelled') then new.lifecycle_reason else new.note_for_brand end, 'live_date', new.live_date));
    end if;
  end if;

  if new.pay_status is distinct from old.pay_status then
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (new.id, auth.uid(), 'payment', 'Payment: ' || public.pay_label(new.pay_status), new.pay_status in ('invoiced', 'paid'));
  end if;

  if new.note_for_brand is distinct from old.note_for_brand and new.note_for_brand <> '' then
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (new.id, auth.uid(), 'update', new.note_for_brand, true);
  end if;

  if new.follow_date is null and old.follow_date is not null and old.follow_note <> '' then
    insert into public.collab_events (collab_id, actor, kind, text)
    values (new.id, auth.uid(), 'follow', 'Follow-up done: ' || old.follow_note);
  end if;
  return null;
end;
$$;

create or replace function public.collabs_ask_brief()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage = 'confirmed' and old.stage is distinct from 'confirmed' and new.brief_asked_at is null
     and (select autopilot_brief from public.creator_settings where id = new.creator_id) then
    if private.ask_brief(new.id) then
      insert into public.collab_events (collab_id, kind, text, visible_to_brand)
      values (new.id, 'note', 'Auto-pilot: brief was missing details, asked the brand.', false);
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.collabs_ask_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.brands;
begin
  if new.stage = 'wrapped' and old.stage is distinct from 'wrapped' and new.contact_email <> ''
     and (select autopilot_review from public.creator_settings where id = new.creator_id)
     and not exists (select 1 from public.brand_reviews where collab_id = new.id)
     and not exists (select 1 from public.outbox where kind = 'review_request' and payload ->> 'code' = new.code) then
    select * into b from public.brands where id = new.brand_id;
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (new.creator_id, 'review_request', new.contact_email, jsonb_build_object('code', new.code, 'brand', b.name, 'contact', new.contact_name));
  end if;
  return null;
end;
$$;

create or replace function public.collabs_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prev text := current_setting('app.creator', true);
begin
  if tg_op = 'INSERT' then
    if new.code is null or new.code = '' then
      -- gen_collab_code() uses the prefix of the creator being worked for: make that this collab's creator
      perform set_config('app.creator', new.creator_id::text, true);
      new.code := public.gen_collab_code();
      perform set_config('app.creator', coalesce(prev, ''), true);
    end if;
    if new.type = 'barter' then new.pay_status := 'na'; end if;
  else
    new.updated_at := now();
    if new.type = 'barter' then
      new.pay_status := 'na';
    elsif old.type = 'barter' and new.pay_status = 'na' then
      new.pay_status := 'pending';
    end if;
    if new.pay_status = 'invoiced' and new.invoiced_on is null then
      new.invoiced_on := current_date;
    end if;
    if new.pay_status = 'paid' and old.pay_status is distinct from 'paid' then
      new.paid_on := coalesce(new.paid_on, current_date);
      if new.pay_received < new.fee then new.pay_received := new.fee; end if;
    end if;
    if new.stage = 'live' and new.live_date is null then
      new.live_date := current_date;
    end if;
  end if;
  return new;
end;
$$;

-- Messages, drafts, quotes, reports -------------------------------------------------------------

create or replace function private.away_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  prev text := current_setting('app.creator', true);
  v_text text;
begin
  if new.sender <> 'brand' or not private.is_away(new.creator_id) then return null; end if;
  select * into s from public.creator_settings where id = new.creator_id;
  if exists (select 1 from public.collab_messages m where m.collab_id = new.collab_id and m.auto
             and m.created_at > now() - make_interval(days => greatest(1, s.away_until - current_date + 30))) then
    return null;
  end if;
  -- away_text() speaks for the creator being worked for: make that this message's creator for the call
  perform set_config('app.creator', new.creator_id::text, true);
  v_text := private.away_text();
  perform set_config('app.creator', coalesce(prev, ''), true);
  insert into public.collab_messages (collab_id, sender, author, body, auto)
  values (new.collab_id, 'creator', null, v_text, true);
  return null;
end;
$$;

create or replace function public.message_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
  s public.creator_settings;
  other text := case when new.sender = 'creator' then 'brand' else 'creator' end;
  last_read timestamptz;
  earlier boolean;
begin
  if coalesce(current_setting('app.quiet', true), 'off') = 'on' then
    return new;
  end if;
  select * into c from public.collabs where id = new.collab_id;
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = new.creator_id;

  -- The sender has obviously read the thread.
  insert into public.collab_reads (collab_id, side, read_at) values (new.collab_id, new.sender, new.created_at)
  on conflict (collab_id, side) do update set read_at = greatest(public.collab_reads.read_at, excluded.read_at);

  select read_at into last_read from public.collab_reads where collab_id = new.collab_id and side = other;
  select exists (
    select 1 from public.collab_messages m
    where m.collab_id = new.collab_id and m.sender = new.sender and m.id <> new.id
      and m.created_at <= new.created_at and (last_read is null or m.created_at > last_read)
  ) into earlier;
  if earlier then
    return new;  -- they already have an email waiting for this batch
  end if;

  if other = 'creator' then
    insert into public.outbox (creator_id, kind, to_email, payload) values (new.creator_id, 'message_to_creator', s.creator_email,
      jsonb_build_object('code', c.code, 'brand', b.name, 'contact', c.contact_name, 'body', left(new.body, 600)));
  elsif c.contact_email <> '' then
    insert into public.outbox (creator_id, kind, to_email, payload) values (new.creator_id, 'message_to_brand', c.contact_email,
      jsonb_build_object('code', c.code, 'brand', b.name, 'contact', c.contact_name, 'body', left(new.body, 600)));
  end if;
  return new;
end;
$$;

create or replace function public.drafts_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
begin
  select * into c from public.collabs where id = new.collab_id;
  select * into b from public.brands where id = c.brand_id;

  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (c.id, auth.uid(), 'draft', format('Draft round %s shared for approval', new.round), true);

  if c.contact_email <> '' then
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (new.creator_id, 'draft_ready', c.contact_email, jsonb_build_object(
      'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'round', new.round, 'note', new.note));
  end if;

  if c.stage in ('confirmed', 'negotiating', 'request') then
    perform set_config('app.quiet', 'on', true);
    update public.collabs set stage = 'creating' where id = c.id;
    perform set_config('app.quiet', 'off', true);
  end if;
  return null;
end;
$$;

create or replace function public.quote_accepted_sync()
returns trigger
language plpgsql
security definer
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
                     where s.id = new.creator_id and coalesce((x ->> 'qty')::int, 0) > 0 and not (btrim(x ->> 'kind') = any(s.offered_kinds)))
     and not exists (select 1 from public.deliverables d where d.collab_id = new.collab_id and d.done)
     and not exists (select 1 from public.deliverable_items x where x.collab_id = new.collab_id
       and (x.status <> 'planned' or x.draft_id is not null or x.media_id is not null or x.due_date is not null or x.assigned_to <> '')) then
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

create or replace function public.quotes_after_write()
returns trigger
language plpgsql
security definer
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
      insert into public.outbox (creator_id, kind, to_email, payload)
      values (new.creator_id, 'quote_sent', c.contact_email, jsonb_build_object(
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

create or replace function public.brand_reports_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collabs;
  s public.creator_settings;
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status <> 'sent') then
    select * into c from public.collabs where id = new.collab_id;
    select * into s from public.creator_settings where id = new.creator_id;
    update public.brand_reports set sent_at = now() where id = new.id and sent_at is null;
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'report', 'Results report shared', true);
    if c.contact_email <> '' then
      insert into public.outbox (creator_id, kind, to_email, payload)
      values (new.creator_id, 'brand_report', c.contact_email, jsonb_build_object(
        'code', c.code, 'contact', c.contact_name, 'brand', new.data ->> 'brand',
        'views', new.data -> 'totals' ->> 'views', 'reach', new.data -> 'totals' ->> 'reach',
        'link', rtrim(s.site_url, '/') || '/report/' || new.public_token));
    end if;
  end if;
  return null;
end;
$$;

-- Invoices -------------------------------------------------------------------------------------

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
  -- Each creator numbers their own invoices.
  if new.status <> 'draft' and new.status <> 'cancelled' and new.number is null then
    perform pg_advisory_xact_lock(hashtext('invoice_number:' || new.creator_id));
    select * into s from public.creator_settings where id = new.creator_id;
    select * into c from public.collabs where id = new.collab_id;
    select * into b from public.brands where id = c.brand_id;
    prefix := s.invoice_prefix || '/' || public.fy_label(new.issue_date) || '/';
    select coalesce(max(substring(number from length(prefix) + 1)::integer), 0) + 1 into seq
    from public.invoices where creator_id = new.creator_id and number like prefix || '%';
    new.number := prefix || lpad(seq::text, greatest(3, length(seq::text)), '0');
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

create or replace function public.invoices_after_write()
returns trigger
language plpgsql
security definer
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
  select * into s from public.creator_settings where id = new.creator_id;
  link := rtrim(s.site_url, '/') || '/invoice/' || new.public_token;

  if issued then
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'invoice', format('Invoice %s sent: %s', new.number, public.money_text(new.total, new.currency)), true);
    insert into public.outbox (creator_id, kind, to_email, payload)
    select new.creator_id, 'invoice_sent', e, jsonb_build_object('code', c.code, 'number', new.number, 'total', new.total, 'payable', new.payable,
      'due', new.due_date, 'link', link, 'contact', c.contact_name, 'brand', new.bill_to ->> 'name', 'currency', new.currency)
    from unnest(array[c.contact_email, new.send_to]) e
    where coalesce(btrim(e), '') <> '' group by e;
  end if;

  if newly_paid then
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'payment', format('Payment received for %s: %s', new.number,
      public.money_text(new.amount_received - coalesce(case when tg_op = 'UPDATE' then old.amount_received end, 0), new.currency)), true);
    if new.status = 'paid' and c.contact_email <> '' then
      insert into public.outbox (creator_id, kind, to_email, payload)
      values (new.creator_id, 'payment_thanks', c.contact_email, jsonb_build_object('code', c.code, 'number', new.number, 'contact', c.contact_name, 'link', link));
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

create or replace function public.invoice_cancelled_notice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collabs;
begin
  if not (new.status = 'cancelled' and old.status not in ('draft', 'cancelled') and new.number is not null) then return null; end if;
  select * into c from public.collabs where id = new.collab_id;
  insert into public.outbox (creator_id, kind, to_email, payload)
  select new.creator_id, 'invoice_cancelled', e, jsonb_build_object('code', c.code, 'number', new.number, 'total', new.total,
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

-- Ask Miracle's index: Instagram threads and emails are per creator ---------------------------

create or replace function private.desk_on_dm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c uuid;
begin
  select collab_id into c from public.ig_threads where creator_id = new.creator_id and igsid = new.igsid;
  if c is not null then
    perform private.desk_put('ig', new.mid, c, null, (case when new.from_me then 'She wrote on Instagram: ' else 'Brand wrote on Instagram: ' end) || coalesce(new.text, ''), new.created_at);
  end if;
  return new;
end $$;

create or replace function private.desk_on_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.collab_id is null then
    delete from public.desk_chunks where creator_id = new.creator_id and source = 'email' and source_id = new.msg_id;
  else
    perform private.desk_put('email', new.msg_id, new.collab_id, null, 'Email from ' || coalesce(new.sender, 'the brand') || ': ' || coalesce(new.subject, ''), new.created_at);
  end if;
  return new;
end $$;

create or replace function private.desk_on_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
begin
  delete from public.desk_chunks where creator_id = new.creator_id and source = 'ig'
    and source_id in (select mid from public.ig_dms where creator_id = new.creator_id and igsid = new.igsid);
  if new.collab_id is not null then
    for d in select * from public.ig_dms where creator_id = new.creator_id and igsid = new.igsid loop
      perform private.desk_put('ig', d.mid, new.collab_id, null, (case when d.from_me then 'She wrote on Instagram: ' else 'Brand wrote on Instagram: ' end) || coalesce(d.text, ''), d.created_at);
    end loop;
  end if;
  return new;
end $$;

-- Studio accounts and settings -----------------------------------------------------------------

create or replace function private.session_new_device()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := md5(regexp_replace(coalesce(new.user_agent, ''), '[0-9.]+', '', 'g'));
  seen_any boolean;
  em text;
  s public.creator_settings;
  cid integer;
begin
  select exists (select 1 from private.known_devices where user_id = new.user_id) into seen_any;
  insert into private.known_devices (user_id, agent_key) values (new.user_id, k) on conflict do nothing;
  if not found or not seen_any then return new; end if;
  select email into em from auth.users where id = new.user_id;
  -- The creator this account owns, else the first team it is on.
  select x.id into cid from (
    select cs.id, 0 as o from public.creator_settings cs where lower(cs.creator_email) = lower(em)
    union all
    select t.creator_id, 1 from public.team_members t where t.email = lower(em)
  ) x order by x.o, x.id limit 1;
  select * into s from public.creator_settings where id = cid;
  -- Only studio accounts (her and her team), not brands.
  if cid is not null then
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (cid, 'new_device', em, jsonb_build_object('agent', left(coalesce(new.user_agent, ''), 300), 'ip', coalesce(host(new.ip), ''), 'at', now(), 'link', rtrim(s.site_url, '/') || '/studio/settings?s=account'));
  end if;
  return new;
exception when others then
  return new; -- never block a sign-in
end $$;

create or replace function public.creator_settings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- is_owner() is about the creator being worked for, so this row must be that creator.
  if new.creator_email is distinct from old.creator_email and auth.uid() is not null
     and not (new.id = public.current_creator() and public.is_owner()) then
    raise exception 'Only % can change the sign-in email.', old.creator_email;
  end if;
  return new;
end;
$$;

create or replace function public.team_member_welcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.creator_settings;
begin
  select * into s from public.creator_settings where id = new.creator_id;
  insert into public.outbox (creator_id, kind, to_email, payload)
  values (new.creator_id, 'team_added', new.email, jsonb_build_object('name', coalesce(new.name, ''), 'role', new.role, 'link', rtrim(s.site_url, '/') || '/login'));
  return null;
end;
$$;
