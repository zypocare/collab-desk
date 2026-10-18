-- Release 3: Ask your desk can search everything she and the brands wrote, by meaning.
-- Each message, linked Instagram DM, brand email, brief and brand note becomes a "chunk"; the app
-- fills in each chunk's meaning fingerprint (an embedding from Cloudflare's free bge-m3 model) and
-- search finds the closest ones. Her personal Instagram DMs are never indexed: only chats linked to
-- a collab. Plus a small cache so the same AI question isn't paid for twice.

create extension if not exists vector with schema extensions;

create table if not exists public.desk_chunks (
  id bigint generated always as identity primary key,
  source text not null check (source in ('message', 'ig', 'email', 'brief', 'note')),
  source_id text not null,
  collab_id uuid references public.collabs (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  body text not null,
  at timestamptz not null default now(),
  embedding extensions.vector(1024),
  unique (source, source_id)
);
create index if not exists desk_chunks_embedding_idx on public.desk_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists desk_chunks_todo_idx on public.desk_chunks (id) where embedding is null;
create index if not exists desk_chunks_collab_idx on public.desk_chunks (collab_id);
create index if not exists desk_chunks_brand_idx on public.desk_chunks (brand_id);
alter table public.desk_chunks enable row level security;
drop policy if exists "creator manages desk chunks" on public.desk_chunks;
create policy "creator manages desk chunks" on public.desk_chunks for all to authenticated
  using ((select public.is_creator())) with check ((select public.is_creator()));

-- Add or refresh one chunk (empty text removes it). A changed text needs a new fingerprint.
create or replace function private.desk_put(p_source text, p_id text, p_collab uuid, p_brand uuid, p_body text, p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(btrim(p_body), '') = '' then
    delete from public.desk_chunks where source = p_source and source_id = p_id;
    return;
  end if;
  insert into public.desk_chunks (source, source_id, collab_id, brand_id, body, at)
  values (p_source, p_id, p_collab, coalesce(p_brand, (select brand_id from public.collabs where id = p_collab)), left(btrim(p_body), 2000), coalesce(p_at, now()))
  on conflict (source, source_id) do update
    set body = excluded.body, collab_id = excluded.collab_id, brand_id = excluded.brand_id, at = excluded.at,
        embedding = case when public.desk_chunks.body = excluded.body then public.desk_chunks.embedding end;
end $$;

-- What a collab's brief chunk says: the brief, the brief form's answers and her follow-up note.
create or replace function private.desk_brief_text(c public.collabs)
returns text language sql stable set search_path = '' as $$
  select concat_ws(E'\n',
    nullif(btrim(coalesce(c.brief, '')), ''),
    (select string_agg(initcap(replace(key, '_', ' ')) || ': ' || value, E'\n')
       from jsonb_each_text(case when jsonb_typeof(c.brief_details) = 'object' then c.brief_details else '{}'::jsonb end) where btrim(value) <> ''),
    case when btrim(coalesce(c.follow_note, '')) <> '' then 'Her note: ' || c.follow_note end,
    (select 'Script: ' || left(string_agg(value, ' '), 800)
       from jsonb_each_text(case when jsonb_typeof(c.script) = 'object' then c.script else '{}'::jsonb end) where btrim(value) <> ''));
$$;

create or replace function private.desk_on_message() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.desk_chunks where source = 'message' and source_id = old.id::text;
    return old;
  end if;
  if not coalesce(new.auto, false) then
    perform private.desk_put('message', new.id::text, new.collab_id, null, (case when new.sender = 'creator' then 'She wrote: ' else 'Brand wrote: ' end) || coalesce(new.body, ''), new.created_at);
  end if;
  return new;
end $$;
drop trigger if exists desk_index on public.collab_messages;
create trigger desk_index after insert or update of body or delete on public.collab_messages
  for each row execute function private.desk_on_message();

create or replace function private.desk_on_collab() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.desk_put('brief', new.id::text, new.id, new.brand_id, private.desk_brief_text(new), new.received_on::timestamptz);
  return new;
end $$;
drop trigger if exists desk_index on public.collabs;
create trigger desk_index after insert or update of brief, brief_details, follow_note, script on public.collabs
  for each row execute function private.desk_on_collab();

create or replace function private.desk_on_email() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.collab_id is null then
    delete from public.desk_chunks where source = 'email' and source_id = new.msg_id;
  else
    perform private.desk_put('email', new.msg_id, new.collab_id, null, 'Email from ' || coalesce(new.sender, 'the brand') || ': ' || coalesce(new.subject, ''), new.created_at);
  end if;
  return new;
end $$;
drop trigger if exists desk_index on public.inbound_emails;
create trigger desk_index after insert or update of collab_id, subject on public.inbound_emails
  for each row execute function private.desk_on_email();

create or replace function private.desk_on_note() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.desk_put('note', new.brand_id::text, null, new.brand_id, 'Her notes on this brand: ' || coalesce(new.notes, ''), now());
  return new;
end $$;
drop trigger if exists desk_index on public.brand_private;
create trigger desk_index after insert or update of notes on public.brand_private
  for each row execute function private.desk_on_note();

-- Instagram: only chats linked to a collab.
create or replace function private.desk_on_dm() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c uuid;
begin
  select collab_id into c from public.ig_threads where igsid = new.igsid;
  if c is not null then
    perform private.desk_put('ig', new.mid, c, null, (case when new.from_me then 'She wrote on Instagram: ' else 'Brand wrote on Instagram: ' end) || coalesce(new.text, ''), new.created_at);
  end if;
  return new;
end $$;
drop trigger if exists desk_index on public.ig_dms;
create trigger desk_index after insert or update of text on public.ig_dms
  for each row execute function private.desk_on_dm();

create or replace function private.desk_on_thread() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d record;
begin
  delete from public.desk_chunks where source = 'ig' and source_id in (select mid from public.ig_dms where igsid = new.igsid);
  if new.collab_id is not null then
    for d in select * from public.ig_dms where igsid = new.igsid loop
      perform private.desk_put('ig', d.mid, new.collab_id, null, (case when d.from_me then 'She wrote on Instagram: ' else 'Brand wrote on Instagram: ' end) || coalesce(d.text, ''), d.created_at);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists desk_index on public.ig_threads;
create trigger desk_index after update of collab_id on public.ig_threads
  for each row when (old.collab_id is distinct from new.collab_id) execute function private.desk_on_thread();

-- Everything already there.
do $$
declare
  r record;
  c public.collabs;
begin
  for r in select * from public.collab_messages where not coalesce(auto, false) loop
    perform private.desk_put('message', r.id::text, r.collab_id, null, (case when r.sender = 'creator' then 'She wrote: ' else 'Brand wrote: ' end) || coalesce(r.body, ''), r.created_at);
  end loop;
  for c in select * from public.collabs loop
    perform private.desk_put('brief', c.id::text, c.id, c.brand_id, private.desk_brief_text(c), c.received_on::timestamptz);
  end loop;
  for r in select * from public.inbound_emails where collab_id is not null loop
    perform private.desk_put('email', r.msg_id, r.collab_id, null, 'Email from ' || coalesce(r.sender, 'the brand') || ': ' || coalesce(r.subject, ''), r.created_at);
  end loop;
  for r in select * from public.brand_private loop
    perform private.desk_put('note', r.brand_id::text, null, r.brand_id, 'Her notes on this brand: ' || coalesce(r.notes, ''), now());
  end loop;
  for r in select d.*, t.collab_id from public.ig_dms d join public.ig_threads t on t.igsid = d.igsid where t.collab_id is not null loop
    perform private.desk_put('ig', r.mid, r.collab_id, null, (case when r.from_me then 'She wrote on Instagram: ' else 'Brand wrote on Instagram: ' end) || coalesce(r.text, ''), r.created_at);
  end loop;
end $$;

-- The app saves fingerprints in batches: [{"id": 1, "v": [0.1, ...]}, ...].
create or replace function public.desk_embed_save(p_rows jsonb)
returns integer language plpgsql set search_path = '' as $$
declare
  r jsonb;
  n integer := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    update public.desk_chunks set embedding = (r ->> 'v')::extensions.vector where id = (r ->> 'id')::bigint;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.desk_embed_save(jsonb) from public, anon;
grant execute on function public.desk_embed_save(jsonb) to authenticated, service_role;

-- The closest chunks to a question's fingerprint (her own data only, through the access rules).
create or replace function public.desk_search(p_query text, p_k integer default 8)
returns table (id bigint, source text, code text, brand text, body text, at timestamptz, score double precision)
language sql stable set search_path = '' as $$
  select d.id, d.source, c.code, b.name, d.body, d.at, 1 - (d.embedding operator(extensions.<=>) p_query::extensions.vector) as score
  from public.desk_chunks d
  left join public.collabs c on c.id = d.collab_id
  left join public.brands b on b.id = coalesce(d.brand_id, c.brand_id)
  where d.embedding is not null
  order by d.embedding operator(extensions.<=>) p_query::extensions.vector
  limit least(greatest(coalesce(p_k, 8), 1), 20);
$$;
revoke execute on function public.desk_search(text, integer) from public, anon;
grant execute on function public.desk_search(text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------- AI answer cache
create table if not exists public.ai_cache (
  key text primary key,
  kind text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.ai_cache enable row level security;

create or replace function public.ai_cache_get(p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select result from public.ai_cache
  where key = p_key and created_at > now() - interval '14 days' and public.is_creator();
$$;
create or replace function public.ai_cache_put(p_key text, p_kind text, p_result jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_creator() or p_result is null then return; end if;
  insert into public.ai_cache (key, kind, result) values (left(p_key, 128), left(p_kind, 20), p_result)
  on conflict (key) do update set result = excluded.result, created_at = now();
  delete from public.ai_cache where created_at < now() - interval '14 days';
end $$;
revoke execute on function public.ai_cache_get(text), public.ai_cache_put(text, text, jsonb) from public, anon;
grant execute on function public.ai_cache_get(text), public.ai_cache_put(text, text, jsonb) to authenticated, service_role;
