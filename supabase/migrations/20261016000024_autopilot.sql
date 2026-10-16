-- Auto-pilot: rules she switches on once, which then run by themselves.
--  1. A package booked for a week she has open gets its quote sent at once (package price, her usual terms).
--  2. A barter request that doesn't fit her rules gets a polite paid + product counter by email,
--     which the brand can take with one tap.
--  3. Brands who haven't answered a quote or a draft for N days get one friendly reminder.
--  4. When a collab wraps, the brand is thanked and asked for a review (this already ran; now it's a switch).
-- Everything auto-pilot does is written to the collab's history as "Auto-pilot: ...".

alter table public.creator_settings
  add column autopilot_packages boolean not null default false,
  add column autopilot_counter  boolean not null default false,
  add column autopilot_nudge    boolean not null default false,
  add column autopilot_review   boolean not null default true,
  add column nudge_days         integer not null default 3 check (nudge_days between 2 and 7);

alter table public.quotes add column nudged_at timestamptz;
alter table public.drafts add column nudged_at timestamptz;
alter table public.collabs
  add column counter_fee numeric(12,2),
  add column counter_status text not null default '' check (counter_status in ('', 'sent', 'taken', 'kept'));

-- What the deliverables would cost at her rate card.
create or replace function public.rate_value(p_collab uuid)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(nullif(s.rates ->> d.kind, '')::numeric, 0) * d.qty), 0)
  from public.deliverables d, public.creator_settings s
  where d.collab_id = p_collab and s.id = 1;
$$;
revoke execute on function public.rate_value(uuid) from anon, authenticated;

-- Is the week of this date open (not away, not full)? No date: yes.
create or replace function public.week_open(p_date date)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select p_date is null or (
    date_trunc('week', p_date)::date <> all(s.away_weeks)
    and (select count(*) from public.collabs c
         where c.stage in ('confirmed', 'creating', 'live')
           and coalesce(c.live_date, c.draft_date, c.preferred_live) >= date_trunc('week', p_date)::date
           and coalesce(c.live_date, c.draft_date, c.preferred_live) < date_trunc('week', p_date)::date + 7) < s.weekly_capacity)
  from public.creator_settings s where s.id = 1;
$$;
revoke execute on function public.week_open(date) from anon, authenticated;

-- Runs when a brand's request is saved (at commit, so its deliverables are there).
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
begin
  select * into s from public.creator_settings where id = 1;
  select * into c from public.collabs where id = new.id;
  if c.id is null or c.stage <> 'request' then
    return null;
  end if;
  select * into b from public.brands where id = c.brand_id;
  select string_agg(qty || ' × ' || kind, ', ' order by position) into v_deliv from public.deliverables where collab_id = c.id;

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

create constraint trigger collabs_autopilot
  after insert on public.collabs
  deferrable initially deferred
  for each row when (new.source = 'brand_page')
  execute function private.autopilot_new_request();

-- 3. Daily: one friendly reminder for quotes and drafts waiting too long.
create or replace function private.autopilot_nudges()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  r record;
  n integer := 0;
begin
  select * into s from public.creator_settings where id = 1;
  if not s.autopilot_nudge then
    return 0;
  end if;

  for r in
    select q.id, q.total, q.sent_at, c.id as collab_id, c.code, c.contact_name, c.contact_email, b.name as brand_name
    from public.quotes q join public.collabs c on c.id = q.collab_id join public.brands b on b.id = c.brand_id
    where q.status = 'sent' and q.nudged_at is null and q.sent_at < now() - make_interval(days => s.nudge_days)
      and (q.valid_until is null or q.valid_until >= current_date)
      and c.stage in ('request', 'negotiating') and c.contact_email <> ''
  loop
    insert into public.outbox (kind, to_email, payload) values ('quote_nudge', r.contact_email, jsonb_build_object(
      'code', r.code, 'brand', r.brand_name, 'contact', r.contact_name, 'total', r.total, 'days', s.nudge_days));
    update public.quotes set nudged_at = now() where id = r.id;
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    values (r.collab_id, 'note', format('Auto-pilot: reminded the brand about the quote (%s days, no answer).', s.nudge_days), false);
    n := n + 1;
  end loop;

  for r in
    select d.id, d.round, c.id as collab_id, c.code, c.contact_name, c.contact_email, b.name as brand_name
    from public.drafts d join public.collabs c on c.id = d.collab_id join public.brands b on b.id = c.brand_id
    where d.status = 'pending' and d.nudged_at is null and d.submitted_at < now() - make_interval(days => s.nudge_days)
      and c.contact_email <> ''
  loop
    insert into public.outbox (kind, to_email, payload) values ('draft_nudge', r.contact_email, jsonb_build_object(
      'code', r.code, 'brand', r.brand_name, 'contact', r.contact_name, 'round', r.round, 'days', s.nudge_days));
    update public.drafts set nudged_at = now() where id = r.id;
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    values (r.collab_id, 'note', format('Auto-pilot: reminded the brand about draft %s (%s days, no answer).', r.round, s.nudge_days), false);
    n := n + 1;
  end loop;
  return n;
end;
$$;

select cron.schedule('autopilot-nudges', '30 4 * * *', $$select private.autopilot_nudges()$$);

-- 4. Review request on wrap, now behind her switch.
create or replace function public.collabs_ask_review()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  b public.brands;
begin
  if new.stage = 'wrapped' and old.stage is distinct from 'wrapped' and new.contact_email <> ''
     and (select autopilot_review from public.creator_settings where id = 1)
     and not exists (select 1 from public.brand_reviews where collab_id = new.id)
     and not exists (select 1 from public.outbox where kind = 'review_request' and payload ->> 'code' = new.code) then
    select * into b from public.brands where id = new.brand_id;
    insert into public.outbox (kind, to_email, payload)
    values ('review_request', new.contact_email, jsonb_build_object('code', new.code, 'brand', b.name, 'contact', new.contact_name));
  end if;
  return null;
end;
$$;

-- One-tap links: reminders carry the same accept/approve link; the counter gets its own kind.
alter table private.action_links drop constraint if exists action_links_kind_check;
alter table private.action_links add constraint action_links_kind_check check (kind in ('quote', 'draft', 'review', 'counter'));

create or replace function private.outbox_add_action()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ref uuid;
  v_kind text;
  v_token text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if new.kind in ('quote_sent', 'quote_nudge') then
    v_kind := 'quote';
    select q.id into v_ref from public.quotes q join public.collabs c on c.id = q.collab_id
    where c.code = new.payload ->> 'code' and q.status = 'sent' order by q.version desc limit 1;
  elsif new.kind in ('draft_ready', 'draft_nudge') then
    v_kind := 'draft';
    select d.id into v_ref from public.drafts d join public.collabs c on c.id = d.collab_id
    where c.code = new.payload ->> 'code' and d.status = 'pending' order by d.round desc limit 1;
  elsif new.kind = 'review_request' then
    v_kind := 'review';
    select c.id into v_ref from public.collabs c where c.code = new.payload ->> 'code';
  elsif new.kind = 'barter_counter' then
    v_kind := 'counter';
    select c.id into v_ref from public.collabs c where c.code = new.payload ->> 'code';
  end if;
  if v_ref is not null then
    insert into private.action_links (token, kind, ref_id, email, expires_at)
    values (v_token, v_kind, v_ref, new.to_email, now() + case when v_kind = 'review' then interval '60 days' else interval '30 days' end);
    new.payload := new.payload || jsonb_build_object('action', v_token);
  end if;
  return new;
end;
$$;
drop trigger if exists outbox_add_action on public.outbox;
create trigger outbox_add_action
  before insert on public.outbox
  for each row when (new.kind in ('quote_sent', 'quote_nudge', 'draft_ready', 'draft_nudge', 'review_request', 'barter_counter'))
  execute function private.outbox_add_action();

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
  if a.token is null or a.kind = 'review' then
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
      'total', q.total, 'advance_pct', q.advance_pct, 'pay_days', q.pay_days, 'revision_rounds', q.revision_rounds,
      'exclusivity_days', q.exclusivity_days, 'valid_until', q.valid_until, 'notes', q.notes) end,
    'draft', case when a.kind = 'draft' then jsonb_build_object(
      'round', d.round, 'link', d.link, 'caption', d.caption, 'note', d.note) end,
    'counter', case when a.kind = 'counter' then jsonb_build_object(
      'fee', c.counter_fee, 'product', c.product, 'reply_time', s.barter_reply_time,
      'deliverables', (select string_agg(qty || ' × ' || kind, ', ' order by position) from public.deliverables where collab_id = c.id)) end);
end;
$$;
grant execute on function public.action_info(text) to anon, authenticated;

create or replace function public.action_run(p_token text, p_yes boolean, p_name text default '', p_note text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  a private.action_links;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
  v_name text;
begin
  select * into a from private.action_links where token = p_token for update;
  if a.token is null or a.kind = 'review' then raise exception 'This link is not valid.'; end if;
  if a.used_at is not null then raise exception 'This link has already been used.'; end if;
  if a.expires_at < now() then raise exception 'This link has expired. Open your request page instead.'; end if;

  if a.kind = 'quote' then
    select x.* into c from public.collabs x join public.quotes q on q.collab_id = x.id where q.id = a.ref_id;
    v_name := coalesce(nullif(btrim(p_name), ''), nullif(c.contact_name, ''), a.email);
    perform private.quote_response(a.ref_id, p_yes, v_name, p_note, a.email, null);
  elsif a.kind = 'draft' then
    select x.* into c from public.collabs x join public.drafts d on d.collab_id = x.id where d.id = a.ref_id;
    v_name := coalesce(nullif(btrim(p_name), ''), nullif(c.contact_name, ''), a.email);
    perform private.draft_response(a.ref_id, p_yes, p_note, v_name, null);
  else
    select * into c from public.collabs where id = a.ref_id for update;
    if c.counter_status <> 'sent' or c.stage <> 'request' or c.type <> 'barter' then
      raise exception 'This request has already moved on. Open your request page instead.';
    end if;
    select * into b from public.brands where id = c.brand_id;
    select * into s from public.creator_settings where id = 1;
    if p_yes then
      update public.collabs set type = 'hybrid', fee = c.counter_fee, counter_status = 'taken' where id = c.id;
      insert into public.collab_events (collab_id, kind, text, visible_to_brand)
      values (c.id, 'note', format('Brand switched to Paid + product at ₹%s.', to_char(c.counter_fee, 'FM99,99,99,999')), true);
      insert into public.outbox (kind, to_email, payload)
      values ('counter_taken', s.creator_email, jsonb_build_object('code', c.code, 'brand', b.name, 'fee', c.counter_fee));
    else
      update public.collabs set counter_status = 'kept' where id = c.id;
      insert into public.collab_events (collab_id, kind, text, visible_to_brand)
      values (c.id, 'note', 'Brand kept the request as barter.', true);
    end if;
  end if;
  update private.action_links set used_at = now() where token = p_token;
  return jsonb_build_object('ok', true, 'code', c.code);
end;
$$;
grant execute on function public.action_run(text, boolean, text, text) to anon, authenticated;
