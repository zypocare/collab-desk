-- Step 2: quotes & agreements, draft approvals, posting checklist, notification settings.

-- ---------------------------------------------------------------------------
-- Settings for notifications and the calendar feed
-- ---------------------------------------------------------------------------
alter table public.creator_settings
  add column digest_enabled   boolean not null default true,
  add column telegram_chat_id text not null default '',
  add column calendar_token   text not null default encode(extensions.gen_random_bytes(18), 'hex');

-- Posting checklist per collab: {"paid_label": true, "ad_tag": true, "brand_tag": true, "link": false}
alter table public.collabs add column checklist jsonb not null default '{}';

-- ---------------------------------------------------------------------------
-- Quotes (an accepted quote is the agreement)
-- ---------------------------------------------------------------------------
create type public.quote_status as enum ('draft', 'sent', 'accepted', 'changes', 'withdrawn');

create table public.quotes (
  id               uuid primary key default gen_random_uuid(),
  collab_id        uuid not null references public.collabs(id) on delete cascade,
  version          integer not null default 1,
  items            jsonb not null default '[]',      -- [{ "kind": "Reel", "qty": 1, "rate": 25000 }]
  usage            text not null default 'Organic only',
  usage_fee        numeric(12,2) not null default 0 check (usage_fee >= 0),
  discount         numeric(12,2) not null default 0 check (discount >= 0),
  total            numeric(12,2) not null default 0,
  advance_pct      integer not null default 0 check (advance_pct between 0 and 100),
  pay_days         integer not null default 15 check (pay_days between 0 and 180),
  revision_rounds  integer not null default 2 check (revision_rounds between 0 and 10),
  exclusivity_days integer not null default 0 check (exclusivity_days between 0 and 365),
  valid_until      date,
  notes            text not null default '',
  status           public.quote_status not null default 'draft',
  sent_at          timestamptz,
  responded_at     timestamptz,
  response_note    text not null default '',
  accepted_name    text,
  accepted_email   text,
  accepted_ip      text,
  created_at       timestamptz not null default now()
);
create index quotes_collab_idx on public.quotes (collab_id, version desc);

-- Version numbers, totals and "only one open quote" are kept right by the database.
create or replace function public.quotes_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  items_total numeric := 0;
  it jsonb;
begin
  if tg_op = 'UPDATE' and old.status in ('accepted', 'withdrawn') and new.status = old.status then
    raise exception 'This quote is closed. Make a new version instead.';
  end if;

  for it in select * from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
    items_total := items_total + greatest(0, coalesce((it ->> 'qty')::numeric, 0)) * greatest(0, coalesce((it ->> 'rate')::numeric, 0));
  end loop;
  new.total := greatest(0, items_total + new.usage_fee - new.discount);

  if tg_op = 'INSERT' then
    select coalesce(max(version), 0) + 1 into new.version from public.quotes where collab_id = new.collab_id;
  end if;

  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    new.sent_at := now();
    new.responded_at := null;
    new.response_note := '';
    update public.quotes set status = 'withdrawn'
    where collab_id = new.collab_id and id <> new.id and status in ('sent', 'changes', 'draft');
  end if;
  return new;
end;
$$;

create trigger quotes_before_write
  before insert or update on public.quotes
  for each row execute function public.quotes_before_write();

create or replace function public.quotes_after_write()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    select * into c from public.collabs where id = new.collab_id;
    select * into b from public.brands where id = c.brand_id;

    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'quote', format('Quote v%s sent: ₹%s', new.version, to_char(new.total, 'FM99,99,99,999')), true);

    if c.contact_email <> '' then
      insert into public.outbox (kind, to_email, payload)
      values ('quote_sent', c.contact_email, jsonb_build_object(
        'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'total', new.total, 'version', new.version));
    end if;

    if c.stage = 'request' then
      perform set_config('app.quiet', 'on', true);
      update public.collabs set stage = 'negotiating' where id = c.id;
      perform set_config('app.quiet', 'off', true);
    end if;
  end if;
  return null;
end;
$$;

create trigger quotes_after_write
  after insert or update on public.quotes
  for each row execute function public.quotes_after_write();

-- ---------------------------------------------------------------------------
-- Drafts for approval (one row per round)
-- ---------------------------------------------------------------------------
create type public.draft_status as enum ('pending', 'approved', 'changes');

create table public.drafts (
  id            uuid primary key default gen_random_uuid(),
  collab_id     uuid not null references public.collabs(id) on delete cascade,
  round         integer not null default 1,
  link          text not null default '',
  caption       text not null default '',
  note          text not null default '',
  status        public.draft_status not null default 'pending',
  feedback      text not null default '',
  submitted_at  timestamptz not null default now(),
  responded_at  timestamptz,
  responded_by  text
);
create index drafts_collab_idx on public.drafts (collab_id, round desc);

create or replace function public.drafts_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select coalesce(max(round), 0) + 1 into new.round from public.drafts where collab_id = new.collab_id;
  if btrim(new.link) = '' and btrim(new.caption) = '' then
    raise exception 'Add a link to the draft or the caption.';
  end if;
  return new;
end;
$$;

create trigger drafts_before_insert
  before insert on public.drafts
  for each row execute function public.drafts_before_insert();

create or replace function public.drafts_after_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
begin
  select * into c from public.collabs where id = new.collab_id;
  select * into b from public.brands where id = c.brand_id;

  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (c.id, auth.uid(), 'draft', format('Draft round %s shared for approval', new.round), true);

  if c.contact_email <> '' then
    insert into public.outbox (kind, to_email, payload)
    values ('draft_ready', c.contact_email, jsonb_build_object(
      'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'round', new.round, 'note', new.note));
  end if;

  if c.stage in ('confirmed', 'negotiating', 'request') then
    perform set_config('app.quiet', 'on', true);
    update public.collabs set stage = 'creating' where id = c.id;
    perform set_config('app.quiet', 'off', true);
  end if;
  return null;
end;
$$;

create trigger drafts_after_insert
  after insert on public.drafts
  for each row execute function public.drafts_after_insert();

-- ---------------------------------------------------------------------------
-- Stage emails can be silenced for automatic moves (app.quiet = on).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------
alter table public.quotes enable row level security;
alter table public.drafts enable row level security;

create policy "creator manages quotes" on public.quotes
  for all to authenticated using (public.is_creator()) with check (public.is_creator());
create policy "creator manages drafts" on public.drafts
  for all to authenticated using (public.is_creator()) with check (public.is_creator());

alter publication supabase_realtime add table public.quotes, public.drafts;
