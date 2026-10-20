-- Extend the existing brand APIs and automation without exposing internal assignments.


create or replace function public.my_requests()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t.obj order by t.created_at desc), '[]'::jsonb)
  from (
    select c.created_at, jsonb_build_object(
      'id', c.id, 'code', c.code, 'stage', c.stage, 'stage_label', public.stage_label(c.stage),
      'lifecycle_reason', c.lifecycle_reason, 'resume_on', c.resume_on,
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
        select coalesce(jsonb_agg(jsonb_build_object('kind', d.kind, 'qty', d.qty, 'done', d.done, 'items', (select coalesce(jsonb_agg(jsonb_build_object('position', x.position, 'status', x.status, 'due_date', x.due_date) order by x.position), '[]'::jsonb) from public.deliverable_items x where x.deliverable_id = d.id)) order by d.position), '[]'::jsonb)
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

create or replace function public.public_track(p_token text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id, 'code', c.code, 'stage', c.stage, 'stage_label', public.stage_label(c.stage),
      'lifecycle_reason', c.lifecycle_reason, 'resume_on', c.resume_on,
    'type', c.type, 'fee', c.fee, 'product', c.product, 'product_value', c.product_value, 'usage', c.usage,
    'brief', '', 'preferred_live', c.preferred_live, 'received_on', c.received_on,
    'draft_date', c.draft_date, 'live_date', c.live_date, 'live_time', c.live_time,
    'pay_status', c.pay_status, 'invoice_no', c.invoice_no, 'pay_due', c.pay_due, 'paid_on', c.paid_on,
    'note_for_brand', c.note_for_brand, 'contact_name', c.contact_name, 'contact_email', c.contact_email,
    'created_at', c.created_at, 'product_date', c.product_date, 'shipped_at', c.shipped_at,
    'product_received_at', c.product_received_at, 'usage_ends', c.usage_ends, 'files_sent_at', c.files_sent_at,
    'brand', b.name,
    'deliverables', (select coalesce(jsonb_agg(jsonb_build_object('kind', d.kind, 'qty', d.qty, 'done', d.done, 'items', (select coalesce(jsonb_agg(jsonb_build_object('position', x.position, 'status', x.status, 'due_date', x.due_date) order by x.position), '[]'::jsonb) from public.deliverable_items x where x.deliverable_id = d.id)) order by d.position), '[]'::jsonb)
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
  select * into s from public.creator_settings where id = 1;

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

  insert into public.outbox (kind, to_email, payload)
  values ('draft_reviewed', s.creator_email, jsonb_build_object(
    'code', c.code, 'brand', b.name, 'round', d.round, 'approved', p_approve, 'feedback', btrim(coalesce(p_feedback, '')),
    'name', p_by));

  return jsonb_build_object('ok', true);
end;
$$;

CREATE OR REPLACE FUNCTION public.action_info(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    when c.stage in ('paused', 'cancelled') then 'closed'
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
      'exclusivity_days', q.exclusivity_days, 'valid_until', q.valid_until, 'notes', q.notes, 'options', q.options) end,
    'draft', case when a.kind = 'draft' then jsonb_build_object(
      'round', d.round, 'link', d.link, 'caption', d.caption, 'note', d.note, 'file_path', case when d.preview_path is not null and d.released_at is null then d.preview_path else d.file_path end, 'file_type', case when d.preview_path is not null and d.released_at is null then d.preview_type else d.file_type end,
      'comments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.at_seconds, 'body', x.body, 'name', x.name) order by x.at_seconds nulls last, x.id)
                            from public.draft_comments x where x.draft_id = d.id), '[]'::jsonb)) end,
    'counter', case when a.kind = 'counter' then jsonb_build_object(
      'fee', c.counter_fee, 'product', c.product, 'reply_time', s.barter_reply_time,
      'deliverables', (select string_agg(qty || ' × ' || kind, ', ' order by position) from public.deliverables where collab_id = c.id)) end);
end;
$function$;

create or replace function public.collabs_after_update()
returns trigger
language plpgsql security definer
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
      insert into public.outbox (kind, to_email, payload)
      values ('stage_changed', new.contact_email, jsonb_build_object(
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

create or replace function public.send_reminders(p_ids uuid[])
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  c record;
  inv public.invoices;
  q public.quotes;
  d public.drafts;
  n_pay integer := 0;
  n_quote integer := 0;
  n_draft integer := 0;
  n_skip integer := 0;
begin
  if not public.is_creator() then
    raise exception 'Only the creator can send reminders.';
  end if;
  select * into s from public.creator_settings where id = 1;

  for c in
    select x.*, b.name as brand_name from public.collabs x join public.brands b on b.id = x.brand_id
    where x.id = any(p_ids) and x.stage not in ('paused', 'cancelled')
  loop
    inv := null; q := null; d := null;
    select * into inv from public.invoices
    where collab_id = c.id and status in ('sent', 'partly_paid') order by due_date nulls last limit 1;
    if inv.id is null then
      select * into q from public.quotes where collab_id = c.id and status = 'sent' order by version desc limit 1;
      if q.id is null then
        select * into d from public.drafts where collab_id = c.id and status = 'pending' order by round desc limit 1;
      end if;
    end if;

    if inv.id is not null and coalesce(inv.last_reminded_at, '-infinity') < now() - interval '1 day'
       and (c.contact_email <> '' or coalesce(inv.send_to, '') <> '') then
      insert into public.outbox (kind, to_email, payload)
      select 'payment_reminder', e, jsonb_build_object(
        'code', c.code, 'number', inv.number, 'contact', c.contact_name, 'due', inv.due_date,
        'days_late', coalesce(current_date - inv.due_date, 0),
        'due_amount', greatest(0, inv.payable - inv.amount_received),
        'link', rtrim(s.site_url, '/') || '/invoice/' || inv.public_token)
      from (select distinct btrim(e) as e from unnest(array[c.contact_email, inv.send_to]) e where btrim(coalesce(e, '')) <> '') r;
      update public.invoices set last_reminded_at = now() where id = inv.id;
      insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
      values (c.id, auth.uid(), 'reminder', format('Payment reminder sent for %s', inv.number), true);
      n_pay := n_pay + 1;
    elsif q.id is not null and coalesce(q.nudged_at, '-infinity') < now() - interval '1 day' and c.contact_email <> '' then
      insert into public.outbox (kind, to_email, payload) values ('quote_nudge', c.contact_email, jsonb_build_object(
        'code', c.code, 'brand', c.brand_name, 'contact', c.contact_name, 'total', q.total));
      update public.quotes set nudged_at = now() where id = q.id;
      insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
      values (c.id, auth.uid(), 'reminder', format('Reminder sent about quote v%s', q.version), true);
      n_quote := n_quote + 1;
    elsif d.id is not null and coalesce(d.nudged_at, '-infinity') < now() - interval '1 day' and c.contact_email <> '' then
      insert into public.outbox (kind, to_email, payload) values ('draft_nudge', c.contact_email, jsonb_build_object(
        'code', c.code, 'brand', c.brand_name, 'contact', c.contact_name, 'round', d.round));
      update public.drafts set nudged_at = now() where id = d.id;
      insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
      values (c.id, auth.uid(), 'reminder', format('Reminder sent about draft %s', d.round), true);
      n_draft := n_draft + 1;
    else
      n_skip := n_skip + 1;
    end if;
  end loop;

  return jsonb_build_object('payment', n_pay, 'quote', n_quote, 'draft', n_draft, 'skipped', n_skip);
end;
$$;

create or replace function private.auto_track_links()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  c record;
  n integer := 0;
begin
  select * into s from public.creator_settings where id = 1;
  if not coalesce(s.autopilot_track, false) then return 0; end if;
  for c in
    select x.*, b.name as brand_name from public.collabs x join public.brands b on b.id = x.brand_id
    where x.source <> 'brand_page' and x.track_sent_at is null and x.stage not in ('declined', 'paused', 'cancelled')
      and coalesce(btrim(x.contact_email), '') <> '' and x.created_at > s.autopilot_track_since
      and x.created_at < now() - interval '5 minutes'
  loop
    update public.collabs set track_sent_at = now(), notify_brand = true where id = c.id;
    insert into public.outbox (kind, to_email, payload) values ('track_invite', c.contact_email, jsonb_build_object(
      'code', c.code, 'brand', c.brand_name, 'contact', c.contact_name, 'token', c.track_token, 'stage', public.stage_label(c.stage),
      'deliverables', (select string_agg(qty || ' × ' || kind, ', ' order by position) from public.deliverables where collab_id = c.id)));
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    values (c.id, 'note', 'Auto-pilot: sent the brand their tracking link.', true);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Preserve tracked production when a revised quote is accepted.
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

-- Invoice 1000 must not be truncated to 100 by lpad.
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
