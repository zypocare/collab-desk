-- Miracle Creator Growth OS Suite (₹0 zero-API features):
-- 1. No-login Off-Platform Draft Approval & Smart Contract Links (/c-approve/[token])
-- 2. Private Brand CRM & Payment Memory (strictly creator-only)
-- 3. Multi-Platform (Reels / YouTube Shorts / Raw UGC) Viral Upsell Tracker
-- 4. Bio Link Budget Gate Settings

-- 1. Creator Off-Platform Approval & Contract Links ------------------------------------------------------
create table if not exists public.creator_approval_links (
  token          text primary key,
  creator_id     integer not null references public.creator_settings(id) on delete cascade,
  creator_name   text not null default '',
  kind           text not null default 'contract' check (kind in ('contract', 'draft')),
  brand_name     text not null,
  title          text not null,
  fee_text       text not null default '',
  terms_summary  text not null default '',
  draft_url      text not null default '',
  status         text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested')),
  signer_name    text,
  signer_note    text,
  responded_at   timestamptz,
  created_at     timestamptz not null default now()
);
alter table public.creator_approval_links enable row level security;

create or replace function public.creator_link_create(
  p_kind text,
  p_brand text,
  p_title text,
  p_fee text,
  p_terms text,
  p_draft_url text default '',
  p_creator_name text default ''
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_tok text := encode(gen_random_bytes(9), 'hex');
  rec public.creator_approval_links;
begin
  if auth.uid() is null or not public.is_creator() then
    raise exception 'Sign in with your creator account first.';
  end if;
  insert into public.creator_approval_links (token, creator_id, creator_name, kind, brand_name, title, fee_text, terms_summary, draft_url)
  values (
    v_tok,
    public.current_creator(),
    left(btrim(coalesce(p_creator_name, '')), 120),
    case when p_kind = 'draft' then 'draft' else 'contract' end,
    left(btrim(coalesce(p_brand, 'Brand')), 120),
    left(btrim(coalesce(p_title, 'Collab Approval')), 160),
    left(btrim(coalesce(p_fee, '')), 80),
    left(btrim(coalesce(p_terms, '')), 800),
    left(btrim(coalesce(p_draft_url, '')), 500)
  )
  returning * into rec;
  return to_jsonb(rec);
end;
$$;
revoke execute on function public.creator_link_create(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.creator_link_create(text, text, text, text, text, text, text) to authenticated;

create or replace function public.creator_link_list()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  from public.creator_approval_links a
  where auth.uid() is not null and public.is_creator() and a.creator_id = public.current_creator();
$$;
revoke execute on function public.creator_link_list() from public, anon;
grant execute on function public.creator_link_list() to authenticated;

-- Public read/respond by token (for WhatsApp / off-platform brand managers)
create or replace function public.creator_link_get(p_token text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select to_jsonb(a) - 'creator_id'
  from public.creator_approval_links a
  where a.token = p_token;
$$;
grant execute on function public.creator_link_get(text) to anon, authenticated;

create or replace function public.creator_link_respond(
  p_token text,
  p_status text,
  p_name text,
  p_note text default ''
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  rec public.creator_approval_links;
  v_st text := case when p_status = 'approved' then 'approved' else 'changes_requested' end;
  v_nm text := left(btrim(coalesce(p_name, '')), 120);
begin
  if v_nm = '' then
    raise exception 'Enter your name to confirm.';
  end if;
  update public.creator_approval_links
  set status = v_st,
      signer_name = v_nm,
      signer_note = left(btrim(coalesce(p_note, '')), 600),
      responded_at = now()
  where token = p_token
  returning * into rec;
  if not found then
    raise exception 'Link not found.';
  end if;
  return to_jsonb(rec) - 'creator_id';
end;
$$;
grant execute on function public.creator_link_respond(text, text, text, text) to anon, authenticated;

-- 2. Private Brand CRM & Payment Memory (Creator-Only) ---------------------------------------------------
create table if not exists public.creator_brand_memory (
  creator_id     integer not null references public.creator_settings(id) on delete cascade,
  brand_name     text not null,
  last_quoted    numeric(12,2) not null default 0,
  last_settled   numeric(12,2) not null default 0,
  avg_pay_days   integer not null default 7,
  revision_count integer not null default 1,
  private_notes  text not null default '',
  updated_at     timestamptz not null default now(),
  primary key (creator_id, brand_name)
);
alter table public.creator_brand_memory enable row level security;

create or replace function public.brand_memory_list()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(m) order by m.updated_at desc), '[]'::jsonb)
  from public.creator_brand_memory m
  where auth.uid() is not null and public.is_creator() and m.creator_id = public.current_creator();
$$;
revoke execute on function public.brand_memory_list() from public, anon;
grant execute on function public.brand_memory_list() to authenticated;

create or replace function public.brand_memory_save(
  p_brand text,
  p_quoted numeric,
  p_settled numeric,
  p_pay_days integer,
  p_revisions integer,
  p_notes text
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_brand text := left(btrim(coalesce(p_brand, '')), 120);
  rec public.creator_brand_memory;
begin
  if auth.uid() is null or not public.is_creator() then
    raise exception 'Creator account required.';
  end if;
  if v_brand = '' then
    raise exception 'Enter the brand name.';
  end if;
  insert into public.creator_brand_memory (creator_id, brand_name, last_quoted, last_settled, avg_pay_days, revision_count, private_notes, updated_at)
  values (
    public.current_creator(),
    v_brand,
    greatest(0, coalesce(p_quoted, 0)),
    greatest(0, coalesce(p_settled, 0)),
    greatest(0, coalesce(p_pay_days, 7)),
    greatest(0, coalesce(p_revisions, 1)),
    left(btrim(coalesce(p_notes, '')), 800),
    now()
  )
  on conflict (creator_id, brand_name) do update set
    last_quoted = excluded.last_quoted,
    last_settled = excluded.last_settled,
    avg_pay_days = excluded.avg_pay_days,
    revision_count = excluded.revision_count,
    private_notes = excluded.private_notes,
    updated_at = now()
  returning * into rec;
  return to_jsonb(rec);
end;
$$;
revoke execute on function public.brand_memory_save(text, numeric, numeric, integer, integer, text) from public, anon;
grant execute on function public.brand_memory_save(text, numeric, numeric, integer, integer, text) to authenticated;

-- 3. Multi-Platform & Viral Upsell Tracker (Reels / YouTube Shorts / Raw UGC) ----------------------------
create table if not exists public.creator_post_tracker (
  id              uuid primary key default gen_random_uuid(),
  creator_id      integer not null references public.creator_settings(id) on delete cascade,
  brand_name      text not null,
  platform        text not null default 'instagram' check (platform in ('instagram', 'youtube_shorts', 'ugc_raw')),
  post_url        text not null,
  views_48h       integer not null default 0,
  views_7d        integer not null default 0,
  views_30d       integer not null default 0,
  viral_threshold integer not null default 50000,
  status          text not null default 'tracking' check (status in ('tracking', 'viral_ready', 'pitched')),
  created_at      timestamptz not null default now()
);
alter table public.creator_post_tracker enable row level security;

create or replace function public.creator_post_list()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb)
  from public.creator_post_tracker p
  where auth.uid() is not null and public.is_creator() and p.creator_id = public.current_creator();
$$;
revoke execute on function public.creator_post_list() from public, anon;
grant execute on function public.creator_post_list() to authenticated;

create or replace function public.creator_post_upsert(
  p_brand text,
  p_platform text,
  p_url text,
  p_views_48h integer default 0,
  p_views_7d integer default 0,
  p_views_30d integer default 0,
  p_threshold integer default 50000
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_plat text := case when p_platform in ('instagram', 'youtube_shorts', 'ugc_raw') then p_platform else 'instagram' end;
  v_max integer := greatest(coalesce(p_views_48h, 0), coalesce(p_views_7d, 0), coalesce(p_views_30d, 0));
  v_thr integer := greatest(1000, coalesce(p_threshold, 50000));
  v_st text := case when v_max >= v_thr then 'viral_ready' else 'tracking' end;
  rec public.creator_post_tracker;
begin
  if auth.uid() is null or not public.is_creator() then
    raise exception 'Creator account required.';
  end if;
  insert into public.creator_post_tracker (creator_id, brand_name, platform, post_url, views_48h, views_7d, views_30d, viral_threshold, status)
  values (
    public.current_creator(),
    left(btrim(coalesce(p_brand, 'Brand')), 120),
    v_plat,
    left(btrim(coalesce(p_url, '')), 500),
    greatest(0, coalesce(p_views_48h, 0)),
    greatest(0, coalesce(p_views_7d, 0)),
    greatest(0, coalesce(p_views_30d, 0)),
    v_thr,
    v_st
  )
  returning * into rec;
  return to_jsonb(rec);
end;
$$;
revoke execute on function public.creator_post_upsert(text, text, text, integer, integer, integer, integer) from public, anon;
grant execute on function public.creator_post_upsert(text, text, text, integer, integer, integer, integer) to authenticated;

create or replace function public.creator_post_status(p_id uuid, p_status text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  rec public.creator_post_tracker;
begin
  if auth.uid() is null or not public.is_creator() then
    raise exception 'Creator account required.';
  end if;
  update public.creator_post_tracker
  set status = case when p_status in ('tracking', 'viral_ready', 'pitched') then p_status else 'tracking' end
  where id = p_id and creator_id = public.current_creator()
  returning * into rec;
  return to_jsonb(rec);
end;
$$;
revoke execute on function public.creator_post_status(uuid, text) from public, anon;
grant execute on function public.creator_post_status(uuid, text) to authenticated;

-- 4. Bio Link Budget Gate Settings -----------------------------------------------------------------------
create table if not exists public.creator_budget_gate (
  creator_id      integer primary key references public.creator_settings(id) on delete cascade,
  min_reel_budget numeric(12,2) not null default 5000,
  accept_barter   boolean not null default false,
  auto_sort_low   boolean not null default true,
  note_for_brands text not null default '',
  updated_at      timestamptz not null default now()
);
alter table public.creator_budget_gate enable row level security;

create or replace function public.creator_gate_get()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select to_jsonb(g)
  from public.creator_budget_gate g
  where auth.uid() is not null and public.is_creator() and g.creator_id = public.current_creator();
$$;
revoke execute on function public.creator_gate_get() from public, anon;
grant execute on function public.creator_gate_get() to authenticated;

create or replace function public.creator_gate_save(
  p_min numeric,
  p_barter boolean,
  p_auto_sort boolean,
  p_note text default ''
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  rec public.creator_budget_gate;
begin
  if auth.uid() is null or not public.is_creator() then
    raise exception 'Creator account required.';
  end if;
  insert into public.creator_budget_gate (creator_id, min_reel_budget, accept_barter, auto_sort_low, note_for_brands, updated_at)
  values (
    public.current_creator(),
    greatest(0, coalesce(p_min, 0)),
    coalesce(p_barter, false),
    coalesce(p_auto_sort, true),
    left(btrim(coalesce(p_note, '')), 400),
    now()
  )
  on conflict (creator_id) do update set
    min_reel_budget = excluded.min_reel_budget,
    accept_barter = excluded.accept_barter,
    auto_sort_low = excluded.auto_sort_low,
    note_for_brands = excluded.note_for_brands,
    updated_at = now()
  returning * into rec;
  return to_jsonb(rec);
end;
$$;
revoke execute on function public.creator_gate_save(numeric, boolean, boolean, text) from public, anon;
grant execute on function public.creator_gate_save(numeric, boolean, boolean, text) to authenticated;
