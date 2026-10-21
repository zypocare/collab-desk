-- Miracle for many creators, part 5: the background jobs and internal helpers work for every creator.
-- Timed jobs run for each active creator with that creator's own settings; functions about one
-- collab, quote, draft or retainer use the creator that row belongs to. Emails name their creator.

create or replace function private.ask_brief(p_collab uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
  v_missing text[];
begin
  select * into c from public.collabs where id = p_collab;
  if c.id is null or c.contact_email = '' then return false; end if;
  v_missing := public.brief_missing(c.id);
  if coalesce(array_length(v_missing, 1), 0) = 0 then return false; end if;
  select * into b from public.brands where id = c.brand_id;
  insert into public.outbox (creator_id, kind, to_email, payload) values (c.creator_id, 'brief_request', c.contact_email, jsonb_build_object(
    'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'missing', to_jsonb(v_missing)));
  update public.collabs set brief_asked_at = now() where id = c.id;
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (c.id, 'note', 'Asked the brand for the missing brief details.', true);
  return true;
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
  select * into c from public.collabs where id = p_collab;
  -- the settings of the creator this collab belongs to
  select * into s from public.creator_settings where id = c.creator_id;
  if not coalesce(s.autopilot_invoice, false) then return; end if;
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

create or replace function private.auto_track_links()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  c record;
  n integer := 0;
begin
  -- each collab against its own creator's tracking switch
  for c in
    select x.*, b.name as brand_name from public.collabs x join public.brands b on b.id = x.brand_id
    join public.creator_settings s on s.id = x.creator_id
    where s.status = 'active' and s.autopilot_track
      and x.source <> 'brand_page' and x.track_sent_at is null and x.stage not in ('declined', 'paused', 'cancelled')
      and coalesce(btrim(x.contact_email), '') <> '' and x.created_at > s.autopilot_track_since
      and x.created_at < now() - interval '5 minutes'
  loop
    update public.collabs set track_sent_at = now(), notify_brand = true where id = c.id;
    insert into public.outbox (creator_id, kind, to_email, payload) values (c.creator_id, 'track_invite', c.contact_email, jsonb_build_object(
      'code', c.code, 'brand', c.brand_name, 'contact', c.contact_name, 'token', c.track_token, 'stage', public.stage_label(c.stage),
      'deliverables', (select string_agg(qty || ' × ' || kind, ', ' order by position) from public.deliverables where collab_id = c.id)));
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    values (c.id, 'note', 'Auto-pilot: sent the brand their tracking link.', true);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function private.autopilot_nudges()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  -- each quote and draft waits as long as its own creator's nudge_days
  for r in
    select q.id, q.total, q.sent_at, c.id as collab_id, c.creator_id, c.code, c.contact_name, c.contact_email, b.name as brand_name, s.nudge_days
    from public.quotes q join public.collabs c on c.id = q.collab_id join public.brands b on b.id = c.brand_id
    join public.creator_settings s on s.id = c.creator_id
    where s.status = 'active' and s.autopilot_nudge
      and q.status = 'sent' and q.nudged_at is null and q.sent_at < now() - make_interval(days => s.nudge_days)
      and (q.valid_until is null or q.valid_until >= current_date)
      and c.stage in ('request', 'negotiating') and c.contact_email <> ''
  loop
    insert into public.outbox (creator_id, kind, to_email, payload) values (r.creator_id, 'quote_nudge', r.contact_email, jsonb_build_object(
      'code', r.code, 'brand', r.brand_name, 'contact', r.contact_name, 'total', r.total, 'days', r.nudge_days));
    update public.quotes set nudged_at = now() where id = r.id;
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    values (r.collab_id, 'note', format('Auto-pilot: reminded the brand about the quote (%s days, no answer).', r.nudge_days), false);
    n := n + 1;
  end loop;

  for r in
    select d.id, d.round, c.id as collab_id, c.creator_id, c.code, c.contact_name, c.contact_email, b.name as brand_name, s.nudge_days
    from public.drafts d join public.collabs c on c.id = d.collab_id join public.brands b on b.id = c.brand_id
    join public.creator_settings s on s.id = c.creator_id
    where s.status = 'active' and s.autopilot_nudge
      and d.status = 'pending' and d.nudged_at is null and d.submitted_at < now() - make_interval(days => s.nudge_days)
      and c.contact_email <> ''
  loop
    insert into public.outbox (creator_id, kind, to_email, payload) values (r.creator_id, 'draft_nudge', r.contact_email, jsonb_build_object(
      'code', r.code, 'brand', r.brand_name, 'contact', r.contact_name, 'round', r.round, 'days', r.nudge_days));
    update public.drafts set nudged_at = now() where id = r.id;
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    values (r.collab_id, 'note', format('Auto-pilot: reminded the brand about draft %s (%s days, no answer).', r.round, r.nudge_days), false);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- The away reply of the creator the request works for (callers set it with private.act_for first),
-- else the only creator there is.
create or replace function private.away_text()
returns text
language sql stable security definer
set search_path = public
as $$
  select format('Thanks for your message! %s is away until %s and will reply when back.%s%s',
    split_part(s.display_name, ' ', 1), to_char(s.away_until, 'FMDD Mon'),
    case when btrim(s.away_note) <> '' then ' ' || btrim(s.away_note) else '' end,
    case when btrim(s.away_contact) <> '' then ' For anything urgent: ' || btrim(s.away_contact) || '.' else '' end)
  from public.creator_settings s where s.id = private.page_creator();
$$;

create or replace function private.desk_put(p_source text, p_id text, p_collab uuid, p_brand uuid, p_body text, p_at timestamp with time zone)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_c integer := coalesce((select creator_id from public.collabs where id = p_collab), (select creator_id from public.brands where id = p_brand));
begin
  -- source ids (an email's msg_id) can repeat across creators: touch only this creator's chunk
  if coalesce(btrim(p_body), '') = '' then
    delete from public.desk_chunks where source = p_source and source_id = p_id and (v_c is null or creator_id = v_c);
    return;
  end if;
  insert into public.desk_chunks (creator_id, source, source_id, collab_id, brand_id, body, at)
  values (v_c, p_source, p_id, p_collab, coalesce(p_brand, (select brand_id from public.collabs where id = p_collab)), left(btrim(p_body), 2000), coalesce(p_at, now()))
  on conflict (source, source_id) do update
    set body = excluded.body, collab_id = excluded.collab_id, brand_id = excluded.brand_id, at = excluded.at,
        embedding = case when public.desk_chunks.body = excluded.body then public.desk_chunks.embedding end
    where public.desk_chunks.creator_id = excluded.creator_id;
end $$;

create or replace function private.draft_response(p_draft uuid, p_approve boolean, p_feedback text, p_by text, p_actor uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  d public.drafts;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  select * into d from public.drafts where id = p_draft;
  select * into c from public.collabs where id = d.collab_id;
  if c.stage in ('paused', 'cancelled') then raise exception 'This collaboration is on hold. The creator must resume it first.'; end if;
  if c.id is null then
    raise exception 'Draft not found.';
  end if;
  if d.status <> 'pending' then
    raise exception 'This draft has already been reviewed.';
  end if;
  if not p_approve and btrim(coalesce(p_feedback, '')) = '' then
    raise exception 'Tell us what you would like changed.';
  end if;

  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = c.creator_id;

  update public.drafts
  set status = case when p_approve then 'approved'::public.draft_status else 'changes'::public.draft_status end,
      feedback = left(btrim(coalesce(p_feedback, '')), 4000),
      responded_at = now(),
      responded_by = p_by
  where id = d.id;

  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (c.id, p_actor, 'draft',
          case when p_approve then format('Draft round %s approved', d.round) else format('Changes requested on draft round %s', d.round) end,
          true);

  insert into public.outbox (creator_id, kind, to_email, payload)
  values (c.creator_id, 'draft_reviewed', s.creator_email, jsonb_build_object(
    'code', c.code, 'brand', b.name, 'round', d.round, 'approved', p_approve, 'feedback', btrim(coalesce(p_feedback, '')),
    'name', p_by));

  return jsonb_build_object('ok', true);
end;
$$;

-- One month summary per active creator (the sender fills in each creator's own address).
create or replace function private.month_review_alert()
returns void
language sql security definer
set search_path = public
as $$
  insert into public.outbox (creator_id, kind, to_email, payload)
  select s.id, 'month_summary', '', jsonb_build_object(
    'month', to_char((now() at time zone 'Asia/Kolkata') - interval '1 month', 'YYYY-MM'),
    'label', trim(to_char((now() at time zone 'Asia/Kolkata') - interval '1 month', 'Month')))
  from public.creator_settings s where s.status = 'active' order by s.id;
$$;

create or replace function private.pitch_followups()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  p record;
  n integer := 0;
begin
  -- each pitch signed with its own creator's name and link
  for p in select x.*, s.display_name as creator_name, rtrim(s.site_url, '/') as creator_link
           from public.pitches x join public.creator_settings s on s.id = x.creator_id
           where s.status = 'active'
             and x.status = 'sent' and x.auto_follow and x.followups < 2 and x.next_follow_on <= current_date and x.email <> '' loop
    insert into public.outbox (creator_id, kind, to_email, payload) values (p.creator_id, 'pitch_follow', p.email, jsonb_build_object(
      'subject', 'Re: ' || p.subject, 'name', p.creator_name, 'contact', p.contact_name, 'brand', p.brand_name,
      'round', p.followups + 1, 'link', p.creator_link));
    update public.pitches set followups = followups + 1, next_follow_on = current_date + 7 where id = p.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function private.pitch_send_due()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_c integer;
  s public.creator_settings;
  p public.pitches;
  h integer := extract(hour from now() at time zone 'Asia/Kolkata');
  n integer := 0;
begin
  if h < 10 or h >= 18 then return 0; end if;
  -- at most one pitch per creator each run
  for v_c in select id from public.creator_settings where status = 'active' order by id loop
    s := private.settings_of(v_c);
    select * into p from public.pitches
     where creator_id = v_c and status = 'ready' and send_after <= now() and (approved or s.pitch_mode = 'auto')
       and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and btrim(subject) <> '' and btrim(body) <> ''
     order by send_after limit 1;
    continue when p.id is null;
    insert into public.outbox (creator_id, kind, to_email, payload) values (v_c, 'pitch', p.email, jsonb_build_object(
      'subject', p.subject, 'body', p.body, 'name', s.display_name, 'contact', p.contact_name, 'brand', p.brand_name));
    update public.pitches set status = 'sent', sent_at = now(), followups = 0, next_follow_on = current_date + 5 where id = p.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function private.post_alerts()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  c record;
  n integer := 0;
begin
  -- each alert goes to the creator of that collab
  for c in
    select x.id, x.creator_id, x.code, x.live_date, x.live_time, x.brief_details, b.name as brand_name, b.instagram, s.creator_email,
      (select d.caption from public.drafts d where d.collab_id = x.id and d.status = 'approved' order by d.round desc limit 1) as caption,
      (select string_agg(qty || ' × ' || kind, ', ' order by position) from public.deliverables where collab_id = x.id) as deliv
    from public.collabs x join public.brands b on b.id = x.brand_id
    join public.creator_settings s on s.id = x.creator_id
    where s.status = 'active'
      and x.stage in ('confirmed', 'creating') and x.live_time is not null and x.post_alert_at is null
      and x.live_date = (now() at time zone 'Asia/Kolkata')::date
      and (x.live_date + x.live_time) at time zone 'Asia/Kolkata' <= now() + interval '30 minutes'
      and (x.live_date + x.live_time) at time zone 'Asia/Kolkata' > now() - interval '3 hours'
  loop
    insert into public.outbox (creator_id, kind, to_email, payload) values (c.creator_id, 'post_now', c.creator_email, jsonb_build_object(
      'code', c.code, 'brand', c.brand_name, 'instagram', c.instagram, 'time', to_char(c.live_time, 'FMHH12:MI AM'),
      'caption', coalesce(c.caption, ''), 'deliverables', c.deliv,
      'promo', c.brief_details ->> 'promo', 'link', c.brief_details ->> 'link'));
    update public.collabs set post_alert_at = now() where id = c.id;
    n := n + 1;
  end loop;
  return n;
end;
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
  if c.stage in ('paused', 'cancelled') then raise exception 'This collaboration is on hold. The creator must resume it first.'; end if;
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
  select * into s from public.creator_settings where id = c.creator_id;
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

    insert into public.outbox (creator_id, kind, to_email, payload) values
    (c.creator_id, 'quote_accepted', s.creator_email, jsonb_build_object('code', c.code, 'brand', b.name, 'name', btrim(p_name), 'total', q.total, 'currency', q.currency, 'note', p_note)),
    (c.creator_id, 'agreement_confirmed', p_email, jsonb_build_object('code', c.code, 'brand', b.name, 'contact', btrim(p_name), 'total', q.total, 'currency', q.currency, 'quote_id', q.id));
  else
    if btrim(coalesce(p_note, '')) = '' then
      raise exception 'Tell us what you would like changed.';
    end if;
    update public.quotes set status = 'changes', responded_at = now(), response_note = left(btrim(p_note), 2000) where id = q.id;
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, p_actor, 'quote', format('Brand asked for changes to quote v%s', q.version), true);
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (c.creator_id, 'quote_changes', s.creator_email, jsonb_build_object('code', c.code, 'brand', b.name, 'name', btrim(coalesce(p_name, '')), 'note', btrim(p_note)));
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function private.rebook_offers()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  -- each offer on its own creator's terms and link
  for r in
    select c.id, c.creator_id, c.code, c.contact_name, c.contact_email, b.name as brand, s.rebook_pct, s.rebook_days, s.site_url
    from public.collabs c join public.brands b on b.id = c.brand_id
    join public.creator_settings s on s.id = c.creator_id
    where s.status = 'active' and s.rebook_offer
      and c.stage = 'wrapped' and c.rebook_sent_at is null and c.contact_email <> ''
      and c.wrapped_at between now() - interval '21 days' and now() - interval '7 days'
      and not exists (select 1 from public.collabs x where x.brand_id = c.brand_id and x.id <> c.id and x.created_at > c.wrapped_at)
  loop
    insert into public.outbox (creator_id, kind, to_email, payload) values (r.creator_id, 'rebook_offer', r.contact_email, jsonb_build_object(
      'code', r.code, 'brand', r.brand, 'contact', r.contact_name, 'pct', r.rebook_pct,
      'until', to_char(current_date + r.rebook_days, 'FMDD Mon YYYY'),
      'link', rtrim(r.site_url, '/') || '/brand/new?again=' || r.code));
    update public.collabs set rebook_sent_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function private.run_retainers(p_only uuid default null::uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r public.retainers;
  b public.brands;
  s public.creator_settings;
  m date := date_trunc('month', current_date)::date;
  k integer;
  v_id uuid;
  v_live date;
  d jsonb;
  pos integer;
  n integer := 0;
  what text;
begin
  -- The monthly run covers active creators; one named deal runs whatever its creator's status.
  for r in select x.* from public.retainers x join public.creator_settings cs on cs.id = x.creator_id
           where x.active and (x.id = p_only or (p_only is null and cs.status = 'active')) loop
    -- Which month of the deal this is (1 = the first).
    k := (extract(year from m) - extract(year from r.starts_on)) * 12 + extract(month from m) - extract(month from r.starts_on) + 1;
    continue when k < 1;
    if r.months is not null and k > r.months then
      update public.retainers set active = false where id = r.id;
      continue;
    end if;
    continue when exists (select 1 from public.collabs where retainer_id = r.id and retainer_month = m);
    select * into b from public.brands where id = r.brand_id;
    s := private.settings_of(r.creator_id);
    v_live := greatest(m + (r.live_day - 1), current_date);

    perform set_config('app.quiet', 'on', true);
    insert into public.collabs (creator_id, brand_id, stage, type, fee, contact_name, contact_email, source, notify_brand, preferred_live, live_date,
                                brief, retainer_id, retainer_month)
    values (r.creator_id, r.brand_id, 'confirmed', 'paid', r.fee, r.contact_name, r.contact_email, 'retainer', false, v_live, v_live,
            r.brief, r.id, m)
    returning id into v_id;
    perform set_config('app.quiet', 'off', true);

    pos := 0;
    for d in select * from jsonb_array_elements(r.deliverables) loop
      insert into public.deliverables (collab_id, kind, qty, position)
      values (v_id, coalesce(d ->> 'kind', 'Reel'), greatest(1, coalesce((d ->> 'qty')::integer, 1)), pos);
      pos := pos + 1;
    end loop;
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    values (v_id, 'note', format('Monthly deal%s with %s: month %s%s.', coalesce(' "' || nullif(r.title, '') || '"', ''), b.name, k, coalesce(' of ' || r.months, '')), false);

    -- The month's invoice now, when the deal says "invoice at the start of each month".
    if r.invoice_when = 'start' and r.fee > 0 and coalesce(b.currency, 'INR') = 'INR' and coalesce(btrim(r.contact_email), '') <> '' then
      what := coalesce((select string_agg((x ->> 'qty') || ' ' || case when (x ->> 'qty')::integer > 1 then case x ->> 'kind' when 'Story' then 'Stories' else (x ->> 'kind') || 's' end else x ->> 'kind' end, ' · ')
                        from jsonb_array_elements(r.deliverables) x), 'Content');
      insert into public.invoices (collab_id, kind, items, tax_mode, gst_rate, tds_rate, issue_date, due_date, send_to, notes, auto_remind, status)
      values (v_id, 'full',
              jsonb_build_array(jsonb_build_object('description', format('%s, %s: %s for %s', coalesce(nullif(r.title, ''), 'Monthly deal'), to_char(m, 'FMMonth YYYY'), what, b.name), 'qty', 1, 'rate', r.fee)),
              case when s.gst_registered then case when coalesce(b.state, '') <> '' and b.state = s.state then 'intra' else 'inter' end else 'none' end,
              s.gst_rate,
              coalesce((select i.tds_rate from public.invoices i join public.collabs x on x.id = i.collab_id
                        where x.brand_id = b.id and i.status not in ('draft', 'cancelled') order by i.created_at desc limit 1), 0),
              current_date, current_date + 15, coalesce(b.accounts_email, ''), '', true,
              (case when s.autopilot_invoice then 'sent' else 'draft' end)::public.invoice_status);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function private.usage_watch()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  c record;
  n integer := 0;
begin
  for c in
    select x.*, b.name as brand_name from public.collabs x join public.brands b on b.id = x.brand_id
    join public.creator_settings s on s.id = x.creator_id
    where s.status = 'active'
      and x.usage_ends is not null and x.usage_notice_at is null and x.stage in ('live', 'wrapped')
      and x.usage_ends between current_date and current_date + 7 and x.contact_email <> ''
      and x.usage_ext_status <> 'requested'
  loop
    insert into public.outbox (creator_id, kind, to_email, payload) values (c.creator_id, 'usage_ending', c.contact_email, jsonb_build_object(
      'code', c.code, 'brand', c.brand_name, 'contact', c.contact_name, 'usage', c.usage, 'ends', c.usage_ends,
      'price30', public.usage_ext_price(c.id, 30)));
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    values (c.id, 'usage', format('Paid usage ends on %s. Extension offered.', to_char(c.usage_ends, 'DD Mon')), true);
    update public.collabs set usage_notice_at = now() where id = c.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
