-- Core schema: creator settings, brands, collabs, deliverables, activity log, email outbox.
-- Security model:
--   * The creator is whoever signs in with creator_settings.creator_email. is_creator() checks it on every request.
--   * Creator-only tables are protected by row level security (RLS).
--   * Brands never read tables directly. They go through security-definer functions (see 0002) that
--     return only their own brand's requests and only brand-safe fields.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.collab_stage as enum ('request', 'negotiating', 'confirmed', 'creating', 'live', 'wrapped', 'declined');
create type public.collab_type  as enum ('paid', 'barter', 'hybrid');
create type public.pay_status   as enum ('na', 'pending', 'advance', 'invoiced', 'paid');

-- ---------------------------------------------------------------------------
-- Creator settings (exactly one row)
-- ---------------------------------------------------------------------------
create table public.creator_settings (
  id              smallint primary key default 1 check (id = 1),
  creator_email   text not null default 'creator@example.com',
  app_name        text not null default 'Collab Desk',
  site_url        text not null default 'http://localhost:5173',
  display_name    text not null default 'Your Name',
  handle          text not null default 'yourhandle',
  niche           text not null default 'Fashion, beauty & travel',
  city            text not null default '',
  followers       text not null default '',
  engagement      text not null default '',
  reply_time      text not null default '2 days',
  accepting       boolean not null default true,
  show_rates      boolean not null default true,
  monthly_goal    integer not null default 150000 check (monthly_goal >= 0),
  rates           jsonb not null default '{"Reel":25000,"Story":6000,"Static post":12000,"Carousel":16000,"YouTube Short":20000,"UGC video":15000}',
  code_prefix     text not null default 'CD' check (code_prefix ~ '^[A-Z]{1,4}$'),
  competitor_window_days integer not null default 14,
  updated_at      timestamptz not null default now()
);
insert into public.creator_settings default values;

create or replace function public.is_creator()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.creator_settings s
    where lower(s.creator_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------
create table public.brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  instagram   text not null default '',
  website     text not null default '',
  category    text not null default 'Other',
  created_at  timestamptz not null default now()
);

-- Creator-only notes about a brand (brands must never see these).
create table public.brand_private (
  brand_id     uuid primary key references public.brands(id) on delete cascade,
  notes        text not null default '',
  competitors  text[] not null default '{}'
);

-- ---------------------------------------------------------------------------
-- Profiles (one per signed-in user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  phone       text not null default '',
  brand_id    uuid references public.brands(id) on delete set null,
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.my_brand_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select brand_id from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Collabs
-- ---------------------------------------------------------------------------
create or replace function public.gen_collab_code()
returns text
language plpgsql volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  prefix text;
  v_code text;
  bytes bytea;
begin
  select code_prefix into prefix from public.creator_settings where id = 1;
  loop
    bytes := gen_random_bytes(6);
    v_code := coalesce(prefix, 'CD') || '-';
    for i in 0..5 loop
      v_code := v_code || substr(alphabet, 1 + (get_byte(bytes, i) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.collabs c where c.code = v_code);
  end loop;
  return v_code;
end;
$$;

create table public.collabs (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,
  brand_id        uuid not null references public.brands(id) on delete restrict,
  source          text not null default 'manual' check (source in ('brand_page', 'manual', 'email')),
  contact_name    text not null default '',
  contact_email   text not null default '',
  contact_phone   text not null default '',
  type            public.collab_type not null default 'paid',
  stage           public.collab_stage not null default 'request',
  fee             numeric(12,2) not null default 0 check (fee >= 0),
  product         text not null default '',
  product_value   numeric(12,2) not null default 0 check (product_value >= 0),
  usage           text not null default 'Organic only',
  brief           text not null default '',
  preferred_live  date,
  received_on     date not null default current_date,
  product_date    date,
  draft_date      date,
  live_date       date,
  pay_status      public.pay_status not null default 'pending',
  pay_received    numeric(12,2) not null default 0 check (pay_received >= 0),
  invoice_no      text not null default '',
  invoiced_on     date,
  pay_due         date,
  paid_on         date,
  follow_date     date,
  follow_note     text not null default '',
  note_for_brand  text not null default '',
  notify_brand    boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index collabs_brand_idx on public.collabs (brand_id);
create index collabs_stage_idx on public.collabs (stage);

create table public.deliverables (
  id         uuid primary key default gen_random_uuid(),
  collab_id  uuid not null references public.collabs(id) on delete cascade,
  kind       text not null check (char_length(kind) between 1 and 40),
  qty        integer not null default 1 check (qty between 1 and 50),
  done       boolean not null default false,
  position   integer not null default 0
);
create index deliverables_collab_idx on public.deliverables (collab_id);

create table public.collab_events (
  id                bigint generated always as identity primary key,
  collab_id         uuid not null references public.collabs(id) on delete cascade,
  at                timestamptz not null default now(),
  actor             uuid references public.profiles(id) on delete set null,
  kind              text not null default 'note',
  text              text not null,
  visible_to_brand  boolean not null default false
);
create index collab_events_collab_idx on public.collab_events (collab_id, at desc);

-- ---------------------------------------------------------------------------
-- Email outbox (rows are sent by the process-outbox edge function)
-- ---------------------------------------------------------------------------
create table public.outbox (
  id          bigint generated always as identity primary key,
  kind        text not null,
  to_email    text not null,
  payload     jsonb not null default '{}',
  status      text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts    integer not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index outbox_pending_idx on public.outbox (status, created_at) where status in ('pending', 'sending');

-- ---------------------------------------------------------------------------
-- Helpers + triggers
-- ---------------------------------------------------------------------------
create or replace function public.stage_label(s public.collab_stage)
returns text language sql immutable as $$
  select case s
    when 'request' then 'Request received'
    when 'negotiating' then 'In discussion'
    when 'confirmed' then 'Terms agreed'
    when 'creating' then 'Content in production'
    when 'live' then 'Live on Instagram'
    when 'wrapped' then 'Wrapped up'
    when 'declined' then 'Not going ahead'
  end;
$$;

create or replace function public.pay_label(s public.pay_status)
returns text language sql immutable as $$
  select case s
    when 'na' then 'Barter'
    when 'pending' then 'Not invoiced'
    when 'advance' then 'Advance received'
    when 'invoiced' then 'Invoice sent'
    when 'paid' then 'Paid in full'
  end;
$$;

create or replace function public.collabs_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.code is null or new.code = '' then
      new.code := public.gen_collab_code();
    end if;
    if new.type = 'barter' then new.pay_status := 'na'; end if;
  else
    new.updated_at := now();
    if new.type = 'barter' then
      new.pay_status := 'na';
    elsif old.type = 'barter' and new.pay_status = 'na' then
      new.pay_status := 'pending';
    end if;
    if new.pay_status = 'invoiced' and new.invoiced_on is null then
      new.invoiced_on := current_date;
    end if;
    if new.pay_status = 'paid' and old.pay_status is distinct from 'paid' then
      new.paid_on := coalesce(new.paid_on, current_date);
      if new.pay_received < new.fee then new.pay_received := new.fee; end if;
    end if;
    if new.stage = 'live' and new.live_date is null then
      new.live_date := current_date;
    end if;
  end if;
  return new;
end;
$$;

create trigger collabs_before_write
  before insert or update on public.collabs
  for each row execute function public.collabs_before_write();

create or replace function public.collabs_after_update()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  b public.brands;
begin
  select * into s from public.creator_settings where id = 1;
  select * into b from public.brands where id = new.brand_id;

  if new.stage is distinct from old.stage then
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (new.id, auth.uid(), 'stage', 'Status: ' || public.stage_label(new.stage), true);

    if new.notify_brand and new.contact_email <> '' and new.stage <> 'request' then
      insert into public.outbox (kind, to_email, payload)
      values ('stage_changed', new.contact_email, jsonb_build_object(
        'code', new.code, 'brand', b.name, 'contact', new.contact_name,
        'stage', new.stage, 'stage_label', public.stage_label(new.stage),
        'note', new.note_for_brand, 'live_date', new.live_date));
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

create trigger collabs_after_update
  after update on public.collabs
  for each row execute function public.collabs_after_update();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.creator_settings enable row level security;
alter table public.brands           enable row level security;
alter table public.brand_private    enable row level security;
alter table public.profiles         enable row level security;
alter table public.collabs          enable row level security;
alter table public.deliverables     enable row level security;
alter table public.collab_events    enable row level security;
alter table public.outbox           enable row level security;

create policy "creator manages settings" on public.creator_settings
  for all to authenticated using (public.is_creator()) with check (public.is_creator());

create policy "creator manages brands" on public.brands
  for all to authenticated using (public.is_creator()) with check (public.is_creator());

create policy "creator manages brand notes" on public.brand_private
  for all to authenticated using (public.is_creator()) with check (public.is_creator());

create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_creator());

create policy "creator manages collabs" on public.collabs
  for all to authenticated using (public.is_creator()) with check (public.is_creator());

create policy "creator manages deliverables" on public.deliverables
  for all to authenticated using (public.is_creator()) with check (public.is_creator());

create policy "creator manages activity" on public.collab_events
  for all to authenticated using (public.is_creator()) with check (public.is_creator());

create policy "creator reads outbox" on public.outbox
  for select to authenticated using (public.is_creator());

-- Profiles are changed only through functions; nobody updates them directly.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke all on public.outbox from anon;
revoke insert, update, delete on public.outbox from authenticated;

-- Live updates for the creator's studio (RLS still applies to realtime).
alter publication supabase_realtime add table public.collabs, public.deliverables, public.collab_events;
