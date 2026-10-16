-- One-tap actions from email: quote and draft emails carry a one-time link (valid 30 days) so the
-- brand can accept a quote, approve a draft or ask for changes without signing in.
-- The response logic moves into private functions that both paths (signed in, and link) use.

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
    set fee = case when type = 'barter' then fee else q.total end,
        usage = q.usage,
        stage = case when stage in ('request', 'negotiating') then 'confirmed'::public.collab_stage else stage end
    where id = c.id;
    perform set_config('app.quiet', 'off', true);

    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, p_actor, 'quote', format('Quote v%s accepted by %s. Agreement confirmed.', q.version, btrim(p_name)), true);

    insert into public.outbox (kind, to_email, payload) values
    ('quote_accepted', s.creator_email, jsonb_build_object('code', c.code, 'brand', b.name, 'name', btrim(p_name), 'total', q.total, 'note', p_note)),
    ('agreement_confirmed', p_email, jsonb_build_object('code', c.code, 'brand', b.name, 'contact', btrim(p_name), 'total', q.total, 'quote_id', q.id));
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

-- Signed-in brands: same checks as before, then the shared logic.
create or replace function public.respond_quote(p_quote uuid, p_accept boolean, p_name text default '', p_note text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  me public.profiles;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select x.* into c from public.collabs x join public.quotes q on q.collab_id = x.id where q.id = p_quote;
  if c.id is null or public.my_brand_id() is null or c.brand_id <> public.my_brand_id() then
    raise exception 'Quote not found.';
  end if;
  select * into me from public.profiles where id = auth.uid();
  return private.quote_response(p_quote, p_accept, coalesce(nullif(btrim(p_name), ''), me.full_name), p_note, me.email, auth.uid());
end;
$$;

create or replace function public.respond_draft(p_draft uuid, p_approve boolean, p_feedback text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  me public.profiles;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select x.* into c from public.collabs x join public.drafts d on d.collab_id = x.id where d.id = p_draft;
  if c.id is null or public.my_brand_id() is null or c.brand_id <> public.my_brand_id() then
    raise exception 'Draft not found.';
  end if;
  select * into me from public.profiles where id = auth.uid();
  return private.draft_response(p_draft, p_approve, p_feedback, coalesce(nullif(me.full_name, ''), me.email), auth.uid());
end;
$$;

-- The links.
create table private.action_links (
  token      text primary key,
  kind       text not null check (kind in ('quote', 'draft')),
  ref_id     uuid not null,
  email      text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_at    timestamptz
);

-- When a quote or draft email is queued, make its link and put it in the email.
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
  if new.kind = 'quote_sent' then
    v_kind := 'quote';
    select q.id into v_ref from public.quotes q join public.collabs c on c.id = q.collab_id
    where c.code = new.payload ->> 'code' and q.status = 'sent' order by q.version desc limit 1;
  elsif new.kind = 'draft_ready' then
    v_kind := 'draft';
    select d.id into v_ref from public.drafts d join public.collabs c on c.id = d.collab_id
    where c.code = new.payload ->> 'code' and d.status = 'pending' order by d.round desc limit 1;
  end if;
  if v_ref is not null then
    insert into private.action_links (token, kind, ref_id, email) values (v_token, v_kind, v_ref, new.to_email);
    new.payload := new.payload || jsonb_build_object('action', v_token);
  end if;
  return new;
end;
$$;
create trigger outbox_add_action
  before insert on public.outbox
  for each row when (new.kind in ('quote_sent', 'draft_ready'))
  execute function private.outbox_add_action();

-- What a link is for (anyone holding the link may see this summary).
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
  if a.token is null then
    return jsonb_build_object('state', 'missing');
  end if;
  select * into s from public.creator_settings where id = 1;
  if a.kind = 'quote' then
    select * into q from public.quotes where id = a.ref_id;
    select * into c from public.collabs where id = q.collab_id;
  else
    select * into d from public.drafts where id = a.ref_id;
    select * into c from public.collabs where id = d.collab_id;
  end if;
  select * into b from public.brands where id = c.brand_id;

  v_state := case
    when a.used_at is not null then 'used'
    when a.expires_at < now() then 'expired'
    when a.kind = 'quote' and q.status <> 'sent' then 'closed'
    when a.kind = 'quote' and q.valid_until is not null and q.valid_until < current_date then 'expired'
    when a.kind = 'draft' and d.status <> 'pending' then 'closed'
    else 'open' end;

  return jsonb_build_object(
    'state', v_state, 'kind', a.kind, 'code', c.code, 'brand', b.name, 'contact', c.contact_name,
    'creator', s.display_name,
    'quote', case when a.kind = 'quote' then jsonb_build_object(
      'version', q.version, 'items', q.items, 'usage', q.usage, 'usage_fee', q.usage_fee, 'discount', q.discount,
      'total', q.total, 'advance_pct', q.advance_pct, 'pay_days', q.pay_days, 'revision_rounds', q.revision_rounds,
      'exclusivity_days', q.exclusivity_days, 'valid_until', q.valid_until, 'notes', q.notes) end,
    'draft', case when a.kind = 'draft' then jsonb_build_object(
      'round', d.round, 'link', d.link, 'caption', d.caption, 'note', d.note) end);
end;
$$;
grant execute on function public.action_info(text) to anon, authenticated;

-- Do it: accept / ask for changes (quote), approve / ask for changes (draft). One use per link.
create or replace function public.action_run(p_token text, p_yes boolean, p_name text default '', p_note text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  a private.action_links;
  c public.collabs;
  v_name text;
begin
  select * into a from private.action_links where token = p_token for update;
  if a.token is null then raise exception 'This link is not valid.'; end if;
  if a.used_at is not null then raise exception 'This link has already been used.'; end if;
  if a.expires_at < now() then raise exception 'This link has expired. Open your request page instead.'; end if;

  if a.kind = 'quote' then
    select x.* into c from public.collabs x join public.quotes q on q.collab_id = x.id where q.id = a.ref_id;
    v_name := coalesce(nullif(btrim(p_name), ''), nullif(c.contact_name, ''), a.email);
    perform private.quote_response(a.ref_id, p_yes, v_name, p_note, a.email, null);
  else
    select x.* into c from public.collabs x join public.drafts d on d.collab_id = x.id where d.id = a.ref_id;
    v_name := coalesce(nullif(btrim(p_name), ''), nullif(c.contact_name, ''), a.email);
    perform private.draft_response(a.ref_id, p_yes, p_note, v_name, null);
  end if;
  update private.action_links set used_at = now() where token = p_token;
  return jsonb_build_object('ok', true, 'code', c.code);
end;
$$;
grant execute on function public.action_run(text, boolean, text, text) to anon, authenticated;
