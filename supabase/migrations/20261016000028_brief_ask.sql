-- Missing brief details: when a collab is confirmed and the brief lacks the basics (key message,
-- hashtags, do's or don'ts, who to tag), the brand gets an email with a link to fill in just
-- those, no sign-in. She can also ask by hand. When they answer, she gets an alert.

alter table public.creator_settings add column autopilot_brief boolean not null default true;
alter table public.collabs add column brief_asked_at timestamptz;

-- What a collab's brief is missing (keys of brief_details, plus 'tag' for who to tag).
create or replace function public.brief_missing(p_collab uuid)
returns text[]
language sql stable security definer
set search_path = public
as $$
  select array_remove(array[
    case when coalesce(btrim(c.brief_details ->> 'message'), '') = '' then 'message' end,
    case when jsonb_array_length(coalesce(c.brief_details -> 'hashtags', '[]')) = 0 then 'hashtags' end,
    case when coalesce(btrim(c.brief_details ->> 'dos'), '') = '' and coalesce(btrim(c.brief_details ->> 'donts'), '') = '' then 'dos' end,
    case when coalesce(btrim(b.instagram), '') = '' and jsonb_array_length(coalesce(c.brief_details -> 'mentions', '[]')) = 0 then 'tag' end
  ], null)
  from public.collabs c join public.brands b on b.id = c.brand_id
  where c.id = p_collab;
$$;
revoke execute on function public.brief_missing(uuid) from anon;

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
  insert into public.outbox (kind, to_email, payload) values ('brief_request', c.contact_email, jsonb_build_object(
    'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'missing', to_jsonb(v_missing)));
  update public.collabs set brief_asked_at = now() where id = c.id;
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (c.id, 'note', 'Asked the brand for the missing brief details.', true);
  return true;
end;
$$;

-- By hand, from the collab.
create or replace function public.ask_brief(p_collab uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_creator() then raise exception 'Only the creator can do this.'; end if;
  return private.ask_brief(p_collab);
end;
$$;
revoke execute on function public.ask_brief(uuid) from anon;

-- Auto-pilot: once, when the collab is confirmed.
create or replace function public.collabs_ask_brief()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.stage = 'confirmed' and old.stage is distinct from 'confirmed' and new.brief_asked_at is null
     and (select autopilot_brief from public.creator_settings where id = 1) then
    if private.ask_brief(new.id) then
      insert into public.collab_events (collab_id, kind, text, visible_to_brand)
      values (new.id, 'note', 'Auto-pilot: brief was missing details, asked the brand.', false);
    end if;
  end if;
  return null;
end;
$$;
create trigger collabs_ask_brief
  after update of stage on public.collabs
  for each row execute function public.collabs_ask_brief();

-- The link in the email.
alter table private.action_links drop constraint if exists action_links_kind_check;
alter table private.action_links add constraint action_links_kind_check check (kind in ('quote', 'draft', 'review', 'counter', 'brief'));

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
  elsif new.kind = 'brief_request' then
    v_kind := 'brief';
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
  for each row when (new.kind in ('quote_sent', 'quote_nudge', 'draft_ready', 'draft_nudge', 'review_request', 'barter_counter', 'brief_request'))
  execute function private.outbox_add_action();

-- The brief form behind the link.
create or replace function public.brief_form_info(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  a private.action_links;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  select * into a from private.action_links where token = p_token and kind = 'brief';
  if a.token is null then return jsonb_build_object('state', 'missing'); end if;
  select * into c from public.collabs where id = a.ref_id;
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = 1;
  return jsonb_build_object(
    'state', case when a.used_at is not null then 'used' when a.expires_at < now() then 'expired' else 'open' end,
    'code', c.code, 'brand', b.name, 'category', b.category, 'instagram', b.instagram, 'contact', c.contact_name,
    'creator', s.display_name, 'details', c.brief_details, 'missing', to_jsonb(public.brief_missing(c.id)),
    'deliverables', (select string_agg(qty || ' × ' || kind, ', ' order by position) from public.deliverables where collab_id = c.id));
end;
$$;
grant execute on function public.brief_form_info(text) to anon, authenticated;

create or replace function public.brief_form_submit(p_token text, p_details jsonb, p_instagram text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  a private.action_links;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  select * into a from private.action_links where token = p_token and kind = 'brief' for update;
  if a.token is null then raise exception 'This link is not valid.'; end if;
  if a.used_at is not null then raise exception 'These details were already sent. Reply to the email to add more.'; end if;
  if a.expires_at < now() then raise exception 'This link has expired. Open your request page instead.'; end if;
  select * into c from public.collabs where id = a.ref_id;
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = 1;

  update public.collabs set brief_details = public.clean_brief(coalesce(brief_details, '{}') || coalesce(p_details, '{}')) where id = c.id;
  if btrim(coalesce(p_instagram, '')) <> '' and coalesce(b.instagram, '') = '' then
    update public.brands set instagram = left(regexp_replace(btrim(p_instagram), '^@+', ''), 60) where id = b.id;
  end if;
  update private.action_links set used_at = now() where token = p_token;
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (c.id, 'note', format('%s added the brief details.', coalesce(nullif(c.contact_name, ''), b.name)), true);
  insert into public.outbox (kind, to_email, payload)
  values ('brief_completed', s.creator_email, jsonb_build_object('code', c.code, 'brand', b.name, 'still_missing', to_jsonb(public.brief_missing(c.id))));
  return jsonb_build_object('ok', true, 'code', c.code);
end;
$$;
grant execute on function public.brief_form_submit(text, jsonb, text) to anon, authenticated;
