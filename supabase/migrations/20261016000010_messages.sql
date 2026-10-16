-- Messages: one thread per collab between the creator and the brand.
-- Both sides read the table directly (RLS), so realtime works for both. Each side has a
-- "read up to" time; a new message emails the other side once per unread batch, not per message.

create table public.collab_messages (
  id         uuid primary key default gen_random_uuid(),
  collab_id  uuid not null references public.collabs(id) on delete cascade,
  sender     text not null check (sender in ('creator', 'brand')),
  author     uuid default auth.uid(),
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index collab_messages_collab_idx on public.collab_messages (collab_id, created_at);

create table public.collab_reads (
  collab_id uuid not null references public.collabs(id) on delete cascade,
  side      text not null check (side in ('creator', 'brand')),
  read_at   timestamptz not null default now(),
  primary key (collab_id, side)
);

-- Is this collab one of the signed-in brand's? (One place to change if brand access changes.)
create or replace function public.is_my_collab(p_collab uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.collabs c where c.id = p_collab and c.brand_id = public.my_brand_id());
$$;

alter table public.collab_messages enable row level security;
alter table public.collab_reads enable row level security;

create policy "creator reads messages" on public.collab_messages
  for select to authenticated using (public.is_creator());
create policy "creator sends messages" on public.collab_messages
  for insert to authenticated with check (public.is_creator() and sender = 'creator');
create policy "creator deletes messages" on public.collab_messages
  for delete to authenticated using (public.is_creator());
create policy "brand reads own messages" on public.collab_messages
  for select to authenticated using (public.is_my_collab(collab_id));
create policy "brand sends messages" on public.collab_messages
  for insert to authenticated with check (sender = 'brand' and author = auth.uid() and public.is_my_collab(collab_id));

create policy "creator reads read-marks" on public.collab_reads
  for select to authenticated using (public.is_creator());
create policy "brand reads own read-marks" on public.collab_reads
  for select to authenticated using (public.is_my_collab(collab_id));

-- Mark a thread read up to now, for whichever side is signed in.
create or replace function public.mark_thread_read(p_collab uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_side text;
begin
  if public.is_creator() then v_side := 'creator';
  elsif public.is_my_collab(p_collab) then v_side := 'brand';
  else raise exception 'Not allowed.';
  end if;
  insert into public.collab_reads (collab_id, side, read_at) values (p_collab, v_side, now())
  on conflict (collab_id, side) do update set read_at = excluded.read_at;
end;
$$;
revoke execute on function public.mark_thread_read(uuid) from anon;

-- Unread messages for the signed-in brand, by request code.
create or replace function public.my_unread()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(t.code, t.n), '{}'::jsonb)
  from (
    select c.code, count(*) as n
    from public.collab_messages m
    join public.collabs c on c.id = m.collab_id
    left join public.collab_reads r on r.collab_id = c.id and r.side = 'brand'
    where public.my_brand_id() is not null and c.brand_id = public.my_brand_id()
      and m.sender = 'creator' and (r.read_at is null or m.created_at > r.read_at)
    group by c.code
  ) t;
$$;
revoke execute on function public.my_unread() from anon;

-- Email the other side, once per unread batch.
create or replace function public.message_notify()
returns trigger
language plpgsql security definer
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
  select * into s from public.creator_settings where id = 1;

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
    insert into public.outbox (kind, to_email, payload) values ('message_to_creator', s.creator_email,
      jsonb_build_object('code', c.code, 'brand', b.name, 'contact', c.contact_name, 'body', left(new.body, 600)));
  elsif c.contact_email <> '' then
    insert into public.outbox (kind, to_email, payload) values ('message_to_brand', c.contact_email,
      jsonb_build_object('code', c.code, 'brand', b.name, 'contact', c.contact_name, 'body', left(new.body, 600)));
  end if;
  return new;
end;
$$;

create trigger collab_messages_notify
  after insert on public.collab_messages
  for each row execute function public.message_notify();

alter publication supabase_realtime add table public.collab_messages, public.collab_reads;
