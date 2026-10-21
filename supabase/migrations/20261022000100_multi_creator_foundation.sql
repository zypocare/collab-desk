-- Miracle for many creators, part 1: every row knows which creator it belongs to.
--
-- creator_settings now holds one row per creator (Niveditha stays id 1). Every table of a creator's
-- data gets a creator_id; new rows fill it in themselves from the collab, brand, draft or invoice
-- they belong to, else from the person signed in. "Who am I working for" is current_creator(): the
-- creator the signed-in person owns or is on the team of (one they picked, if several), or the
-- creator a server function set for the work it is doing (app.creator). Every studio access rule
-- now also asks that the row belongs to that creator.

-- 1. One settings row per creator ---------------------------------------------------------------
alter table public.creator_settings drop constraint if exists creator_settings_id_check;
alter table public.creator_settings alter column id drop default;
alter table public.creator_settings alter column id type integer;
create sequence if not exists public.creator_settings_id_seq as integer owned by public.creator_settings.id;
select setval('public.creator_settings_id_seq', greatest(coalesce((select max(id) from public.creator_settings), 1), 1));
alter table public.creator_settings alter column id set default nextval('public.creator_settings_id_seq');
alter table public.creator_settings add column if not exists status text not null default 'active'
  check (status in ('pending', 'active', 'paused'));
alter table public.creator_settings add column if not exists created_at timestamptz not null default now();
create unique index if not exists creator_settings_email_idx on public.creator_settings (lower(creator_email));
create unique index if not exists creator_settings_handle_idx on public.creator_settings (lower(handle));

-- The creator a person last chose to work for (owners and team members of several creators).
alter table public.profiles add column if not exists active_creator integer references public.creator_settings (id) on delete set null;

-- 2. Who is signed in, and which creator they are working for ----------------------------------
create or replace function public.jwt_email()
returns text
language sql stable
set search_path = ''
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')); $$;

-- team_members becomes per creator (the same person can be on several teams).
alter table public.team_members add column if not exists creator_id integer references public.creator_settings (id) on delete cascade;
alter table public.team_members disable trigger user;
update public.team_members set creator_id = (select min(id) from public.creator_settings) where creator_id is null;
alter table public.team_members enable trigger user;
alter table public.team_members alter column creator_id set not null;
alter table public.team_members drop constraint if exists team_members_pkey;
alter table public.team_members add primary key (creator_id, email);
create index if not exists team_members_email_idx on public.team_members (email);

-- Every creator the signed-in person works for: the ones they own, then the teams they are on.
create or replace function public.my_creators()
returns setof integer
language sql stable security definer
set search_path = public
as $$
  select s.id from public.creator_settings s
  where public.jwt_email() <> '' and lower(s.creator_email) = public.jwt_email()
  union
  select t.creator_id from public.team_members t
  where public.jwt_email() <> '' and t.email = public.jwt_email();
$$;

-- The creator this request works for. A server function doing work for a creator (a brand's
-- action, a timed job) sets app.creator first; otherwise it is the signed-in person's creator.
create or replace function public.current_creator()
returns integer
language plpgsql stable security definer
set search_path = public
as $$
declare
  v text := nullif(current_setting('app.creator', true), '');
  a integer;
begin
  if v is not null then
    return v::integer;
  end if;
  if public.jwt_email() = '' then
    return null;
  end if;
  select p.active_creator into a from public.profiles p where p.id = auth.uid();
  if a is not null and exists (select 1 from public.my_creators() m where m = a) then
    return a;
  end if;
  return (select min(m) from public.my_creators() m);
end;
$$;

-- Server functions call this before doing work for a creator (it lasts until the transaction ends).
create or replace function private.act_for(p_creator integer)
returns void
language sql
set search_path = ''
as $$ select set_config('app.creator', coalesce(p_creator::text, ''), true); $$;
revoke execute on function private.act_for(integer) from public, anon, authenticated;

create or replace function public.is_owner()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.creator_settings s
    where s.id = public.current_creator() and public.jwt_email() <> '' and lower(s.creator_email) = public.jwt_email()
  );
$$;

create or replace function public.is_creator()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_owner() or exists (
    select 1 from public.team_members t
    where t.creator_id = public.current_creator() and t.email = public.jwt_email()
  );
$$;

create or replace function public.team_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select case when public.is_owner() then 'owner'
    else (select t.role from public.team_members t where t.creator_id = public.current_creator() and t.email = public.jwt_email()) end;
$$;

-- The signed-in person works for this creator and it is the one they are working for now.
create or replace function public.is_creator_of(p_creator integer)
returns boolean
language sql stable security definer
set search_path = public
as $$ select p_creator is not null and p_creator = public.current_creator() and public.is_creator(); $$;

-- Switch which creator to work for (owners and team members of several creators).
create or replace function public.switch_creator(p_creator integer)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.my_creators() m where m = p_creator) then
    raise exception 'You don''t work for that creator.';
  end if;
  insert into public.profiles (id, email, active_creator) values (auth.uid(), public.jwt_email(), p_creator)
  on conflict (id) do update set active_creator = excluded.active_creator;
end;
$$;
revoke execute on function public.switch_creator(integer) from anon;

-- 3. A creator tag on every table of a creator's data ------------------------------------------
-- New rows take the creator of the collab, brand, draft, deliverable or invoice they belong to;
-- an email in the outbox, the creator of the collab it is about; otherwise the creator the request
-- works for. While there is only one creator, that one is the fallback.
create or replace function private.fill_creator()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  j jsonb;
  c integer;
begin
  if new.creator_id is not null then
    return new;
  end if;
  j := to_jsonb(new);
  if j ->> 'collab_id' is not null then
    select x.creator_id into c from public.collabs x where x.id = (j ->> 'collab_id')::uuid;
  end if;
  if c is null and j ->> 'brand_id' is not null then
    select x.creator_id into c from public.brands x where x.id = (j ->> 'brand_id')::uuid;
  end if;
  if c is null and j ->> 'draft_id' is not null then
    select x.creator_id into c from public.drafts x where x.id = (j ->> 'draft_id')::uuid;
  end if;
  if c is null and j ->> 'deliverable_id' is not null then
    select x.creator_id into c from public.deliverables x where x.id = (j ->> 'deliverable_id')::uuid;
  end if;
  if c is null and j ->> 'invoice_id' is not null then
    select x.creator_id into c from public.invoices x where x.id = (j ->> 'invoice_id')::uuid;
  end if;
  if c is null and j -> 'payload' ->> 'collab_id' is not null then
    select x.creator_id into c from public.collabs x where x.id::text = j -> 'payload' ->> 'collab_id';
  end if;
  if c is null and j -> 'payload' ->> 'code' is not null then
    select x.creator_id into c from public.collabs x where x.code = j -> 'payload' ->> 'code';
  end if;
  if c is null then
    c := public.current_creator();
  end if;
  if c is null then
    select min(s.id) into c from public.creator_settings s having count(*) = 1;
  end if;
  if c is null then
    raise exception 'Can''t tell which creator this % row belongs to.', tg_table_name;
  end if;
  new.creator_id := c;
  return new;
end;
$$;

-- A row never moves to another creator.
create or replace function private.keep_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.creator_id is distinct from old.creator_id then
    raise exception 'A % row can''t move to another creator.', tg_table_name;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
  first_creator integer := (select min(id) from public.creator_settings);
begin
  foreach t in array array[
    'ai_cache', 'ai_tickets', 'ai_usage', 'app_events', 'bank_alerts', 'barter_tds', 'brand_private',
    'brand_questions', 'brand_reports', 'brand_reviews', 'brands', 'collab_events', 'collab_expenses',
    'collab_files', 'collab_fit', 'collab_links', 'collab_messages', 'collab_posts', 'collab_reads',
    'collabs', 'deliverable_items', 'deliverables', 'desk_chunks', 'draft_comments', 'drafts',
    'fun_nudges_sent', 'ig_dms', 'ig_followers_history', 'ig_media', 'ig_monthly', 'ig_threads',
    'inbound_emails', 'insight_links', 'invoices', 'month_reviews', 'outbox', 'packages', 'pitches',
    'push_subscriptions', 'qr_codes', 'quotes', 'retainers', 'scheduled_posts']
  loop
    execute format('alter table public.%I add column if not exists creator_id integer references public.creator_settings (id) on delete cascade', t);
    -- tagging existing rows is not an edit: the table's own triggers (guards, alerts) stay out of it
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I set creator_id = %s where creator_id is null', t, first_creator);
    execute format('alter table public.%I enable trigger user', t);
    execute format('alter table public.%I alter column creator_id set not null', t);
    execute format('create index if not exists %I on public.%I (creator_id)', t || '_creator_idx', t);
    execute format('drop trigger if exists "0_fill_creator" on public.%I', t);
    execute format('create trigger "0_fill_creator" before insert on public.%I for each row execute function private.fill_creator()', t);
    execute format('drop trigger if exists "0_keep_creator" on public.%I', t);
    execute format('create trigger "0_keep_creator" before update of creator_id on public.%I for each row execute function private.keep_creator()', t);
  end loop;
end;
$$;
-- team members are added by a creator, for that creator.
drop trigger if exists "0_fill_creator" on public.team_members;
create trigger "0_fill_creator" before insert on public.team_members for each row execute function private.fill_creator();

-- Instagram: one connected account and token per creator; the row id is the creator's id.
alter table public.ig_token drop constraint if exists ig_token_id_check;
alter table public.ig_account drop constraint if exists ig_account_id_check;
alter table public.ig_token alter column id drop default;
alter table public.ig_account alter column id drop default;
alter table public.ig_token alter column id type integer;
alter table public.ig_account alter column id type integer;
alter table public.ig_token add constraint ig_token_creator_fk foreign key (id) references public.creator_settings (id) on delete cascade;
alter table public.ig_account add constraint ig_account_creator_fk foreign key (id) references public.creator_settings (id) on delete cascade;
alter table public.ig_token add column if not exists creator_id integer generated always as (id) stored;
alter table public.ig_account add column if not exists creator_id integer generated always as (id) stored;

-- 4. Keys that were unique for the one creator become unique per creator ------------------------
alter table public.invoices drop constraint if exists invoices_number_key;
alter table public.invoices add constraint invoices_number_key unique (creator_id, number);
alter table public.ig_followers_history drop constraint if exists ig_followers_history_pkey;
alter table public.ig_followers_history add primary key (creator_id, day);
alter table public.ig_monthly drop constraint if exists ig_monthly_pkey;
alter table public.ig_monthly add primary key (creator_id, month);
alter table public.month_reviews drop constraint if exists month_reviews_pkey;
alter table public.month_reviews add primary key (creator_id, month);
alter table public.ai_usage drop constraint if exists ai_usage_pkey;
alter table public.ai_usage add primary key (creator_id, day, kind);
alter table public.ai_cache drop constraint if exists ai_cache_pkey;
alter table public.ai_cache add primary key (creator_id, key);
alter table public.fun_nudges_sent drop constraint if exists fun_nudges_sent_norm_key;
alter table public.fun_nudges_sent add constraint fun_nudges_sent_norm_key unique (creator_id, norm);
alter table public.bank_alerts drop constraint if exists bank_alerts_hash_key;
alter table public.bank_alerts add constraint bank_alerts_hash_key unique (creator_id, hash);
alter table public.ig_dms drop constraint if exists ig_dms_igsid_fkey;
alter table public.ig_threads drop constraint if exists ig_threads_pkey;
alter table public.ig_threads add primary key (creator_id, igsid);
alter table public.ig_dms add constraint ig_dms_igsid_fkey foreign key (creator_id, igsid) references public.ig_threads (creator_id, igsid) on delete cascade;
alter table public.inbound_emails drop constraint if exists inbound_emails_pkey;
alter table public.inbound_emails add primary key (creator_id, msg_id);

-- 5. Studio access rules: the row must belong to the creator being worked for -------------------
do $$
declare
  r record;
  q text;
  c text;
  scope text := '(creator_id = ( SELECT current_creator() AS current_creator))';
begin
  for r in
    select p.tablename, p.policyname, p.qual, p.with_check
    from pg_policies p
    join information_schema.columns col on col.table_schema = p.schemaname and col.table_name = p.tablename and col.column_name = 'creator_id'
    where p.schemaname = 'public'
      and p.tablename not in ('creator_settings', 'profiles')
      and (coalesce(p.qual, '') ~ '(is_creator|is_owner|team_role)\(' or coalesce(p.with_check, '') ~ '(is_creator|is_owner|team_role)\(')
  loop
    q := case when r.qual is null then null else format('%s AND (%s)', scope, r.qual) end;
    c := case when r.with_check is null then null else format('%s AND (%s)', scope, r.with_check) end;
    if q is not null and c is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', r.policyname, r.tablename, q, c);
    elsif q is not null then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, q);
    else
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, c);
    end if;
  end loop;
end;
$$;

-- Settings: each creator's team sees and changes only their own row.
alter policy "team reads settings" on public.creator_settings
  using (id = (select public.current_creator()) and (select public.is_creator()));
alter policy "sellers change settings" on public.creator_settings
  using (id = (select public.current_creator()) and (select public.team_role()) in ('owner', 'manager'))
  with check (id = (select public.current_creator()) and (select public.team_role()) in ('owner', 'manager'));

-- Profiles: a person sees their own; a creator's team sees the brand people on that creator's brands.
alter policy "read own profile" on public.profiles using (
  id = (select auth.uid())
  or ((select public.is_creator()) and exists (
    select 1 from public.brand_members m join public.brands b on b.id = m.brand_id
    where m.profile_id = profiles.id and b.creator_id = (select public.current_creator())))
);

-- Brand logins and invites: a creator's team sees only those for that creator's brands.
alter policy "creator reads brand members" on public.brand_members using (
  (select public.is_creator()) and exists (select 1 from public.brands b where b.id = brand_members.brand_id and b.creator_id = (select public.current_creator()))
);
alter policy "creator reads brand invites" on public.brand_invites using (
  (select public.is_creator()) and exists (select 1 from public.brands b where b.id = brand_invites.brand_id and b.creator_id = (select public.current_creator()))
);

-- 6. Files: each file belongs to the creator of the collab named first in its path -------------
create or replace function public.path_creator(p_name text)
returns integer
language plpgsql stable security definer
set search_path = public
as $$
declare
  c integer;
begin
  select x.creator_id into c from public.collabs x where x.id = ((storage.foldername(p_name))[1])::uuid;
  return c;
exception when others then
  return null;
end;
$$;

alter policy "creator manages chat files" on storage.objects
  using (bucket_id = 'chat' and public.is_creator_of(public.path_creator(name)))
  with check (bucket_id = 'chat' and public.is_creator_of(public.path_creator(name)));
alter policy "creator manages delivery files" on storage.objects
  using (bucket_id = 'deliveries' and public.is_creator_of(public.path_creator(name)))
  with check (bucket_id = 'deliveries' and public.is_creator_of(public.path_creator(name)));
alter policy "creator manages draft files" on storage.objects
  using (bucket_id = 'drafts' and public.is_creator_of(public.path_creator(name)))
  with check (bucket_id = 'drafts' and public.is_creator_of(public.path_creator(name)));
-- Page cards live under the creator's id; creator 1's older card at the top level still works.
alter policy "creator manages cards" on storage.objects
  using (bucket_id = 'cards' and (select public.is_creator())
    and ((storage.foldername(name))[1] = (select public.current_creator())::text or (name = 'page.jpg' and (select public.current_creator()) = 1)))
  with check (bucket_id = 'cards' and (select public.is_creator())
    and ((storage.foldername(name))[1] = (select public.current_creator())::text or (name = 'page.jpg' and (select public.current_creator()) = 1)));

revoke execute on function public.my_creators() from anon;
revoke execute on function public.path_creator(text) from anon;
