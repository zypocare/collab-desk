-- Shareable Agency Roster Pitch Decks (Live interactive links + zero-login brand shortlists)
-- Lets talent managers/agencies publish a live interactive pitch link (/deck/[token]) instead of
-- static PDFs, track deck views, and capture brand shortlist inquiries without forcing brand login.

create table if not exists public.roster_decks (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(8), 'hex'),
  owner_id uuid not null default auth.uid(),
  agency_name text not null default '',
  brand_name text not null check (char_length(btrim(brand_name)) between 1 and 120),
  brief_note text not null default '' check (char_length(brief_note) <= 800),
  creators jsonb not null default '[]'::jsonb,
  views integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists roster_decks_owner_idx on public.roster_decks (owner_id, created_at desc);
alter table public.roster_decks enable row level security;

drop policy if exists "owner manages roster decks" on public.roster_decks;
create policy "owner manages roster decks" on public.roster_decks
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create table if not exists public.roster_deck_inquiries (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.roster_decks (id) on delete cascade,
  owner_id uuid not null,
  brand_name text not null check (char_length(btrim(brand_name)) between 1 and 120),
  contact text not null check (char_length(btrim(contact)) between 3 and 140),
  selected_handles text[] not null default '{}',
  message text not null default '' check (char_length(message) <= 800),
  created_at timestamptz not null default now()
);

create index if not exists roster_deck_inquiries_owner_idx on public.roster_deck_inquiries (owner_id, created_at desc);
alter table public.roster_deck_inquiries enable row level security;

drop policy if exists "owner views roster deck inquiries" on public.roster_deck_inquiries;
create policy "owner views roster deck inquiries" on public.roster_deck_inquiries
  for select to authenticated
  using (owner_id = auth.uid());

-- Authenticated RPC: create a live shareable pitch deck
create or replace function public.roster_deck_create(
  p_brand text,
  p_brief text default '',
  p_agency text default '',
  p_creators jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.roster_decks%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in required.';
  end if;
  if char_length(btrim(coalesce(p_brand, ''))) < 1 then
    raise exception 'Enter the brand name.';
  end if;
  if jsonb_typeof(coalesce(p_creators, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_creators, '[]'::jsonb)) = 0 then
    raise exception 'Pick at least one creator for the deck.';
  end if;

  insert into public.roster_decks (owner_id, agency_name, brand_name, brief_note, creators)
  values (v_uid, btrim(coalesce(p_agency, '')), btrim(p_brand), left(btrim(coalesce(p_brief, '')), 800), p_creators)
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'token', v_row.token,
    'brand_name', v_row.brand_name,
    'views', v_row.views,
    'created_at', v_row.created_at
  );
end;
$$;

revoke execute on function public.roster_deck_create(text, text, text, jsonb) from public;
grant execute on function public.roster_deck_create(text, text, text, jsonb) to authenticated;

-- Public zero-login RPC: view a live pitch deck & count the view
create or replace function public.roster_deck_view(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.roster_decks%rowtype;
begin
  update public.roster_decks
  set views = views + 1
  where token = btrim(coalesce(p_token, ''))
  returning * into v_row;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'token', v_row.token,
    'agency_name', v_row.agency_name,
    'brand_name', v_row.brand_name,
    'brief_note', v_row.brief_note,
    'creators', v_row.creators,
    'views', v_row.views,
    'created_at', v_row.created_at
  );
end;
$$;

revoke execute on function public.roster_deck_view(text) from public;
grant execute on function public.roster_deck_view(text) to anon, authenticated;

-- Public zero-login RPC: brand shortlists creators from the live deck
create or replace function public.roster_deck_inquire(
  p_token text,
  p_brand_name text,
  p_contact text,
  p_selected_handles text[] default '{}',
  p_message text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deck public.roster_decks%rowtype;
  v_id uuid;
begin
  select * into v_deck from public.roster_decks where token = btrim(coalesce(p_token, ''));
  if not found then
    raise exception 'Pitch deck not found.';
  end if;
  if char_length(btrim(coalesce(p_brand_name, ''))) < 1 then
    raise exception 'Enter your brand or name.';
  end if;
  if char_length(btrim(coalesce(p_contact, ''))) < 3 then
    raise exception 'Enter your email or WhatsApp number.';
  end if;

  insert into public.roster_deck_inquiries (deck_id, owner_id, brand_name, contact, selected_handles, message)
  values (
    v_deck.id,
    v_deck.owner_id,
    left(btrim(p_brand_name), 120),
    left(btrim(p_contact), 140),
    coalesce(p_selected_handles, '{}'),
    left(btrim(coalesce(p_message, '')), 800)
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'ok', true);
end;
$$;

revoke execute on function public.roster_deck_inquire(text, text, text, text[], text) from public;
grant execute on function public.roster_deck_inquire(text, text, text, text[], text) to anon, authenticated;
