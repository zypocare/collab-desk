-- Drafts as files: she uploads the video or photo (up to 50 MB) instead of a Drive link, and the
-- brand comments on exact moments ("0:12 — swap the text") right in the browser.

alter table public.drafts
  add column file_path text,
  add column file_type text not null default '';

-- A draft needs a link, a file or a caption.
create or replace function public.drafts_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select coalesce(max(round), 0) + 1 into new.round from public.drafts where collab_id = new.collab_id;
  if btrim(new.link) = '' and btrim(new.caption) = '' and coalesce(new.file_path, '') = '' then
    raise exception 'Add the draft file, a link to it, or the caption.';
  end if;
  return new;
end;
$$;

-- Private bucket. Files sit under random names; a brand can open one only through its draft.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('drafts', 'drafts', false, 52428800, array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "creator manages draft files" on storage.objects
  for all to authenticated
  using (bucket_id = 'drafts' and public.is_creator())
  with check (bucket_id = 'drafts' and public.is_creator());

-- (Checked through a definer function: visitors can't read the drafts table themselves.)
create or replace function public.is_draft_file(p_name text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.drafts d where d.file_path = p_name);
$$;
grant execute on function public.is_draft_file(text) to anon, authenticated;

create policy "draft files open through their draft" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'drafts' and public.is_draft_file(name));

-- Comments on a draft, optionally pinned to a second of the video.
create table public.draft_comments (
  id         bigint generated always as identity primary key,
  draft_id   uuid not null references public.drafts(id) on delete cascade,
  at_seconds numeric(8,2),
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  author     text not null default 'brand' check (author in ('brand', 'creator')),
  name       text not null default '',
  created_at timestamptz not null default now()
);
create index draft_comments_draft_idx on public.draft_comments (draft_id, at_seconds);
alter table public.draft_comments enable row level security;
create policy "creator reads and writes comments" on public.draft_comments
  for all to authenticated using (public.is_creator()) with check (public.is_creator());
create policy "brand reads comments on own drafts" on public.draft_comments
  for select to authenticated
  using (exists (select 1 from public.drafts d where d.id = draft_id and public.is_my_collab(d.collab_id)));

-- From the one-tap review link: add a comment while the draft is waiting.
create or replace function public.draft_comment_add(p_token text, p_at numeric, p_body text, p_name text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  a private.action_links;
  d public.drafts;
  v_id bigint;
begin
  select * into a from private.action_links where token = p_token and kind = 'draft';
  if a.token is null or a.expires_at < now() then raise exception 'This link is not valid any more.'; end if;
  select * into d from public.drafts where id = a.ref_id;
  if d.status <> 'pending' then raise exception 'This draft has already been answered.'; end if;
  if (select count(*) from public.draft_comments where draft_id = d.id) >= 60 then raise exception 'That is a lot of comments. Send them now, then add more on the next round.'; end if;
  insert into public.draft_comments (draft_id, at_seconds, body, author, name)
  values (d.id, case when p_at is null then null else greatest(0, least(p_at, 36000)) end, left(btrim(p_body), 1000), 'brand', left(btrim(coalesce(p_name, '')), 80))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;
grant execute on function public.draft_comment_add(text, numeric, text, text) to anon, authenticated;

create or replace function public.draft_comment_delete(p_token text, p_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  a private.action_links;
begin
  select * into a from private.action_links where token = p_token and kind = 'draft';
  if a.token is null then raise exception 'This link is not valid.'; end if;
  delete from public.draft_comments c using public.drafts d
  where c.id = p_id and c.draft_id = d.id and d.id = a.ref_id and d.status = 'pending' and c.author = 'brand';
end;
$$;
grant execute on function public.draft_comment_delete(text, bigint) to anon, authenticated;

-- The review link now also returns the file and the comments.
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
      'total', q.total, 'advance_pct', q.advance_pct, 'pay_days', q.pay_days, 'revision_rounds', q.revision_rounds,
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
grant execute on function public.action_info(text) to anon, authenticated;
