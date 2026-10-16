-- Files for the brand: raw footage, final edits, photos. Uploaded (up to 50 MB) or as Drive links.
-- The brand gets one link (no sign-in) to a download page; she sees when each file was downloaded.

create table public.collab_files (
  id            uuid primary key default gen_random_uuid(),
  collab_id     uuid not null references public.collabs(id) on delete cascade,
  label         text not null check (char_length(btrim(label)) between 1 and 120),
  url           text not null default '',
  file_path     text,
  file_type     text not null default '',
  size_bytes    bigint not null default 0,
  created_at    timestamptz not null default now(),
  downloaded_at timestamptz,
  check (url <> '' or file_path is not null)
);
create index collab_files_collab_idx on public.collab_files (collab_id, created_at);
alter table public.collab_files enable row level security;
create policy "creator manages files" on public.collab_files
  for all to authenticated using (public.is_creator()) with check (public.is_creator());
create policy "brand sees own files" on public.collab_files
  for select to authenticated using (public.is_my_collab(collab_id));

alter table public.collabs add column files_sent_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit)
values ('deliveries', 'deliveries', false, 52428800)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

create or replace function public.is_delivery_file(p_name text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.collab_files f where f.file_path = p_name);
$$;
grant execute on function public.is_delivery_file(text) to anon, authenticated;

create policy "creator manages delivery files" on storage.objects
  for all to authenticated
  using (bucket_id = 'deliveries' and public.is_creator())
  with check (bucket_id = 'deliveries' and public.is_creator());
create policy "delivery files open through their collab" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'deliveries' and public.is_delivery_file(name));

-- "Send to brand": one email with the download page link.
create or replace function public.send_files(p_collab uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
  n integer;
begin
  if not public.is_creator() then raise exception 'Only the creator can do this.'; end if;
  select * into c from public.collabs where id = p_collab;
  if c.contact_email = '' then raise exception 'Add the brand contact''s email first.'; end if;
  select count(*) into n from public.collab_files where collab_id = c.id;
  if n = 0 then raise exception 'Add a file or link first.'; end if;
  select * into b from public.brands where id = c.brand_id;
  insert into public.outbox (kind, to_email, payload)
  values ('files_ready', c.contact_email, jsonb_build_object('code', c.code, 'brand', b.name, 'contact', c.contact_name, 'count', n));
  update public.collabs set files_sent_at = now() where id = c.id;
  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (c.id, auth.uid(), 'note', format('%s file%s sent to the brand.', n, case when n > 1 then 's' else '' end), true);
  return true;
end;
$$;
revoke execute on function public.send_files(uuid) from anon;

-- The download page link.
alter table private.action_links drop constraint if exists action_links_kind_check;
alter table private.action_links add constraint action_links_kind_check check (kind in ('quote', 'draft', 'review', 'counter', 'brief', 'files'));

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
  elsif new.kind in ('review_request', 'barter_counter', 'brief_request', 'files_ready') then
    v_kind := case new.kind when 'review_request' then 'review' when 'barter_counter' then 'counter' when 'brief_request' then 'brief' else 'files' end;
    select c.id into v_ref from public.collabs c where c.code = new.payload ->> 'code';
  end if;
  if v_ref is not null then
    insert into private.action_links (token, kind, ref_id, email, expires_at)
    values (v_token, v_kind, v_ref, new.to_email, now() + case when v_kind in ('review', 'files') then interval '90 days' else interval '30 days' end);
    new.payload := new.payload || jsonb_build_object('action', v_token);
  end if;
  return new;
end;
$$;
drop trigger if exists outbox_add_action on public.outbox;
create trigger outbox_add_action
  before insert on public.outbox
  for each row when (new.kind in ('quote_sent', 'quote_nudge', 'draft_ready', 'draft_nudge', 'review_request', 'barter_counter', 'brief_request', 'files_ready'))
  execute function private.outbox_add_action();

create or replace function public.files_info(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  a private.action_links;
  c public.collabs;
begin
  select * into a from private.action_links where token = p_token and kind = 'files';
  if a.token is null then return jsonb_build_object('state', 'missing'); end if;
  if a.expires_at < now() then return jsonb_build_object('state', 'expired'); end if;
  select * into c from public.collabs where id = a.ref_id;
  return jsonb_build_object('state', 'open', 'code', c.code,
    'brand', (select name from public.brands where id = c.brand_id),
    'creator', (select display_name from public.creator_settings where id = 1),
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'label', f.label, 'url', f.url, 'file_path', f.file_path,
      'file_type', f.file_type, 'size', f.size_bytes) order by f.created_at) from public.collab_files f where f.collab_id = c.id), '[]'::jsonb));
end;
$$;
grant execute on function public.files_info(text) to anon, authenticated;

create or replace function public.file_downloaded(p_token text, p_file uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  a private.action_links;
  f public.collab_files;
begin
  select * into a from private.action_links where token = p_token and kind = 'files';
  if a.token is null then return; end if;
  update public.collab_files set downloaded_at = coalesce(downloaded_at, now())
  where id = p_file and collab_id = a.ref_id and downloaded_at is null
  returning * into f;
  if f.id is not null then
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    values (f.collab_id, 'note', format('Brand downloaded “%s”.', f.label), false);
  end if;
end;
$$;
grant execute on function public.file_downloaded(text, uuid) to anon, authenticated;
