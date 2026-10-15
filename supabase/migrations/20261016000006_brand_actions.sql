-- Brand actions for step 2: accept or question a quote, review drafts, read the agreement.
-- Same rule as before: every function checks the row belongs to the signed-in brand.

create or replace function public.respond_quote(p_quote uuid, p_accept boolean, p_name text default '', p_note text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  q public.quotes;
  c public.collabs;
  b public.brands;
  me public.profiles;
  s public.creator_settings;
  v_ip text;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;

  select * into q from public.quotes where id = p_quote;
  select * into c from public.collabs where id = q.collab_id;
  if c.id is null or public.my_brand_id() is null or c.brand_id <> public.my_brand_id() then
    raise exception 'Quote not found.';
  end if;
  if q.status <> 'sent' then
    raise exception 'This quote is no longer open.';
  end if;
  if q.valid_until is not null and q.valid_until < current_date then
    raise exception 'This quote has expired. Ask for a new one.';
  end if;

  select * into me from public.profiles where id = auth.uid();
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = 1;
  v_ip := nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '');

  if p_accept then
    if btrim(coalesce(p_name, '')) = '' then
      raise exception 'Type your full name to accept.';
    end if;
    update public.quotes
    set status = 'accepted', responded_at = now(), accepted_name = left(btrim(p_name), 120),
        accepted_email = me.email, accepted_ip = v_ip, response_note = left(coalesce(p_note, ''), 2000)
    where id = q.id;

    perform set_config('app.quiet', 'on', true);
    update public.collabs
    set fee = case when type = 'barter' then fee else q.total end,
        usage = q.usage,
        stage = case when stage in ('request', 'negotiating') then 'confirmed'::public.collab_stage else stage end
    where id = c.id;
    perform set_config('app.quiet', 'off', true);

    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'quote', format('Quote v%s accepted by %s. Agreement confirmed.', q.version, btrim(p_name)), true);

    insert into public.outbox (kind, to_email, payload) values
    ('quote_accepted', s.creator_email, jsonb_build_object('code', c.code, 'brand', b.name, 'name', btrim(p_name), 'total', q.total, 'note', p_note)),
    ('agreement_confirmed', me.email, jsonb_build_object('code', c.code, 'brand', b.name, 'contact', btrim(p_name), 'total', q.total, 'quote_id', q.id));
  else
    if btrim(coalesce(p_note, '')) = '' then
      raise exception 'Tell us what you would like changed.';
    end if;
    update public.quotes set status = 'changes', responded_at = now(), response_note = left(btrim(p_note), 2000) where id = q.id;
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'quote', format('Brand asked for changes to quote v%s', q.version), true);
    insert into public.outbox (kind, to_email, payload)
    values ('quote_changes', s.creator_email, jsonb_build_object('code', c.code, 'brand', b.name, 'name', me.full_name, 'note', btrim(p_note)));
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.respond_draft(p_draft uuid, p_approve boolean, p_feedback text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  d public.drafts;
  c public.collabs;
  b public.brands;
  me public.profiles;
  s public.creator_settings;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;

  select * into d from public.drafts where id = p_draft;
  select * into c from public.collabs where id = d.collab_id;
  if c.id is null or public.my_brand_id() is null or c.brand_id <> public.my_brand_id() then
    raise exception 'Draft not found.';
  end if;
  if d.status <> 'pending' then
    raise exception 'This draft has already been reviewed.';
  end if;
  if not p_approve and btrim(coalesce(p_feedback, '')) = '' then
    raise exception 'Tell us what you would like changed.';
  end if;

  select * into me from public.profiles where id = auth.uid();
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = 1;

  update public.drafts
  set status = case when p_approve then 'approved'::public.draft_status else 'changes'::public.draft_status end,
      feedback = left(btrim(coalesce(p_feedback, '')), 4000),
      responded_at = now(),
      responded_by = coalesce(nullif(me.full_name, ''), me.email)
  where id = d.id;

  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (c.id, auth.uid(), 'draft',
          case when p_approve then format('Draft round %s approved', d.round) else format('Changes requested on draft round %s', d.round) end,
          true);

  insert into public.outbox (kind, to_email, payload)
  values ('draft_reviewed', s.creator_email, jsonb_build_object(
    'code', c.code, 'brand', b.name, 'round', d.round, 'approved', p_approve, 'feedback', btrim(coalesce(p_feedback, '')),
    'name', coalesce(nullif(me.full_name, ''), me.email)));

  return jsonb_build_object('ok', true);
end;
$$;

-- The agreement (an accepted quote) for the creator or the brand it belongs to.
create or replace function public.get_agreement(p_quote uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  q public.quotes;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  select * into q from public.quotes where id = p_quote;
  select * into c from public.collabs where id = q.collab_id;
  if c.id is null or not (public.is_creator() or (public.my_brand_id() is not null and c.brand_id = public.my_brand_id())) then
    return null;
  end if;
  if q.status not in ('accepted', 'sent') then
    return null;
  end if;
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = 1;

  return jsonb_build_object(
    'quote', to_jsonb(q) - 'accepted_ip',
    'accepted_ip', case when public.is_creator() then q.accepted_ip else null end,
    'code', c.code, 'type', c.type, 'product', c.product, 'product_value', c.product_value,
    'live_date', c.live_date, 'preferred_live', c.preferred_live,
    'brand', jsonb_build_object('name', b.name, 'instagram', b.instagram, 'website', b.website),
    'contact', jsonb_build_object('name', c.contact_name, 'email', c.contact_email),
    'creator', jsonb_build_object('name', s.display_name, 'handle', s.handle, 'city', s.city, 'app_name', s.app_name)
  );
end;
$$;

-- my_requests() now also returns quotes and drafts.
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
        from public.drafts dr where dr.collab_id = c.id)
    ) as obj
    from public.collabs c
    where public.my_brand_id() is not null and c.brand_id = public.my_brand_id()
  ) t;
$$;

revoke execute on function public.respond_quote(uuid, boolean, text, text) from anon;
revoke execute on function public.respond_draft(uuid, boolean, text) from anon;
revoke execute on function public.get_agreement(uuid) from anon;
revoke execute on function public.my_requests() from anon;

-- 9:00 AM India time (03:30 UTC) daily summary for the creator.
select cron.schedule('daily-digest', '30 3 * * *', $$select private.call_function('daily-digest')$$);
