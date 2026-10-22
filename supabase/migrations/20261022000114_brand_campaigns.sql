-- Brand side, phase 1: pools and campaigns.
-- A brand login keeps pools (saved groups of creators, with private notes and tags) and sends one
-- campaign brief to many creators at once. Each creator still gets an ordinary request of their own
-- (their own collab, through submit_request), so nothing changes for creators and none of them can see
-- who else was asked or what others charge. Pools and campaigns belong to the login and only it
-- sees them. Brands can only add creators who are listed in Discover or whom they already work with;
-- anyone else is invited by their Instagram handle and joins the pool once they are on Miracle.

-- 1. Who a brand may reach -------------------------------------------------------------------------------
create or replace function private.brand_can_reach(p_creator integer)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.creator_settings s
    where s.id = p_creator and s.status = 'active' and (
      s.listed or exists (
        select 1 from public.brand_members m join public.brands b on b.id = m.brand_id
        where m.profile_id = auth.uid() and b.creator_id = s.id)));
$$;
revoke execute on function private.brand_can_reach(integer) from public, anon, authenticated;

-- An Instagram handle as typed ("@Name.Here " -> "name.here"), or '' when it isn't one.
create or replace function private.clean_handle(p text)
returns text
language sql immutable
set search_path = ''
as $$
  select case when x ~ '^[a-z0-9._]{1,30}$' then x else '' end
  from (select lower(regexp_replace(btrim(coalesce(p, '')), '^@+', '')) as x) t;
$$;
revoke execute on function private.clean_handle(text) from public, anon, authenticated;

-- The creator a handle belongs to, once they are on Miracle.
create or replace function private.creator_by_handle(p_handle text)
returns integer
language sql stable security definer
set search_path = public
as $$
  select s.id from public.creator_settings s
  where p_handle <> '' and lower(regexp_replace(s.handle, '^@+', '')) = p_handle and s.status = 'active'
  order by s.id limit 1;
$$;
revoke execute on function private.creator_by_handle(text) from public, anon, authenticated;

-- What a brand sees about a creator: public page facts (now with what they make and their usual views).
create or replace function private.creator_card(p_id integer)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.display_name, 'niche', s.niche, 'city', s.city,
    'handle', s.handle, 'accepting', s.accepting, 'kinds', to_jsonb(s.offered_kinds), 'languages', to_jsonb(s.content_languages),
    'photo', case when a.connected then nullif(a.profile_picture_url, '') end,
    'followers', case when a.connected then a.followers end,
    'engagement', case when a.connected then a.engagement_rate end,
    'avg_views', case when a.connected then a.avg_views end)
  from public.creator_settings s left join public.ig_account a on a.id = s.id
  where s.id = p_id;
$$;
revoke execute on function private.creator_card(integer) from public, anon, authenticated;

-- 2. Pools -----------------------------------------------------------------------------------------------
create table if not exists public.brand_pools (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create index if not exists brand_pools_owner_idx on public.brand_pools (owner);

create table if not exists public.brand_pool_members (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.brand_pools (id) on delete cascade,
  creator_id integer references public.creator_settings (id) on delete cascade,
  handle text not null default '',
  note text not null default '' check (char_length(note) <= 300),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  check (creator_id is not null or handle <> '')
);
create unique index if not exists brand_pool_members_creator_uq on public.brand_pool_members (pool_id, creator_id) where creator_id is not null;
create unique index if not exists brand_pool_members_handle_uq on public.brand_pool_members (pool_id, handle) where creator_id is null;
create index if not exists brand_pool_members_creator_idx on public.brand_pool_members (creator_id);

alter table public.brand_pools enable row level security;
alter table public.brand_pool_members enable row level security;
drop policy if exists "brand reads own pools" on public.brand_pools;
create policy "brand reads own pools" on public.brand_pools for select to authenticated using (owner = (select auth.uid()));
drop policy if exists "brand reads own pool members" on public.brand_pool_members;
create policy "brand reads own pool members" on public.brand_pool_members for select to authenticated
  using (exists (select 1 from public.brand_pools p where p.id = pool_id and p.owner = (select auth.uid())));

-- Every pool of this login, with its creators (and invited handles, resolved once they join).
create or replace function public.pools_list()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'created_at', p.created_at,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'handle', m.handle, 'note', m.note, 'tags', to_jsonb(m.tags),
          'joined', m.creator_id is null and r.cid is not null,
          'creator', case when coalesce(m.creator_id, r.cid) is not null then private.creator_card(coalesce(m.creator_id, r.cid)) end)
        order by m.created_at)
      from public.brand_pool_members m
      left join lateral (select private.creator_by_handle(m.handle) as cid where m.creator_id is null) r on true
      where m.pool_id = p.id), '[]'::jsonb))
    order by p.created_at), '[]'::jsonb)
  from public.brand_pools p
  where p.owner = auth.uid();
$$;

create or replace function public.pool_save(p_id uuid, p_name text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null or public.is_creator() then
    raise exception 'Sign in with your brand email first.';
  end if;
  if v_name = '' or char_length(v_name) > 80 then
    raise exception 'Give the pool a name (up to 80 letters).';
  end if;
  if p_id is null then
    if (select count(*) from public.brand_pools where owner = auth.uid()) >= 50 then
      raise exception 'That''s 50 pools. Delete one you no longer use first.';
    end if;
    insert into public.brand_pools (owner, name) values (auth.uid(), v_name) returning id into p_id;
  else
    update public.brand_pools set name = v_name where id = p_id and owner = auth.uid();
    if not found then raise exception 'Pool not found.'; end if;
  end if;
  return jsonb_build_object('id', p_id, 'pools', public.pools_list());
end;
$$;

create or replace function public.pool_delete(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  delete from public.brand_pools where id = p_id and owner = auth.uid();
  return public.pools_list();
end;
$$;

-- Add creators (who are listed, or already work with this login) and invited handles to a pool.
create or replace function public.pool_add(p_pool uuid, p_creators integer[] default '{}', p_handles text[] default '{}')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_id integer;
  v_h text;
  v_skipped integer := 0;
begin
  if not exists (select 1 from public.brand_pools where id = p_pool and owner = auth.uid()) then
    raise exception 'Pool not found.';
  end if;
  if (select count(*) from public.brand_pool_members where pool_id = p_pool) + coalesce(cardinality(p_creators), 0) + coalesce(cardinality(p_handles), 0) > 200 then
    raise exception 'A pool holds up to 200 creators.';
  end if;
  foreach v_id in array coalesce(p_creators, '{}') loop
    if private.brand_can_reach(v_id) then
      insert into public.brand_pool_members (pool_id, creator_id) values (p_pool, v_id) on conflict do nothing;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;
  foreach v_h in array coalesce(p_handles, '{}') loop
    v_h := private.clean_handle(v_h);
    if v_h = '' then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    -- Already on Miracle and reachable: add the creator itself.
    v_id := private.creator_by_handle(v_h);
    if v_id is not null and private.brand_can_reach(v_id) then
      insert into public.brand_pool_members (pool_id, creator_id) values (p_pool, v_id) on conflict do nothing;
    else
      insert into public.brand_pool_members (pool_id, handle) values (p_pool, v_h) on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('skipped', v_skipped, 'pools', public.pools_list());
end;
$$;

create or replace function public.pool_member_update(p_member uuid, p_note text, p_tags text[])
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  update public.brand_pool_members m set
    note = left(btrim(coalesce(p_note, '')), 300),
    tags = (select coalesce(array_agg(distinct left(lower(btrim(t)), 30)), '{}') from unnest(coalesce(p_tags, '{}')) t where btrim(t) <> '')
  from public.brand_pools p
  where m.id = p_member and p.id = m.pool_id and p.owner = auth.uid();
  if not found then raise exception 'Not found.'; end if;
  return public.pools_list();
end;
$$;

create or replace function public.pool_remove(p_member uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  delete from public.brand_pool_members m using public.brand_pools p
  where m.id = p_member and p.id = m.pool_id and p.owner = auth.uid();
  return public.pools_list();
end;
$$;

-- 3. Campaigns ---------------------------------------------------------------------------------------------
create table if not exists public.brand_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  pool_id uuid references public.brand_pools (id) on delete set null,
  -- The company the requests are sent as (copied for each creator that has none yet).
  brand_from uuid references public.brands (id) on delete set null,
  -- What submit_request takes: type, deliverables, fee (per creator; 0 = ask for a quote), product,
  -- product_value, barter_kind, content_language, preferred_live, usage, brief, brief_details.
  brief jsonb not null default '{}',
  budget_total numeric(12, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists brand_campaigns_owner_idx on public.brand_campaigns (owner);

create table if not exists public.campaign_creators (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.brand_campaigns (id) on delete cascade,
  creator_id integer references public.creator_settings (id) on delete cascade,
  handle text not null default '',
  collab_id uuid references public.collabs (id) on delete set null,
  status text not null default 'sent' check (status in ('sent', 'invited', 'failed')),
  note text not null default '',
  created_at timestamptz not null default now(),
  check (creator_id is not null or handle <> '')
);
create unique index if not exists campaign_creators_creator_uq on public.campaign_creators (campaign_id, creator_id) where creator_id is not null;
create unique index if not exists campaign_creators_handle_uq on public.campaign_creators (campaign_id, handle) where creator_id is null;
create index if not exists campaign_creators_collab_idx on public.campaign_creators (collab_id);

alter table public.brand_campaigns enable row level security;
alter table public.campaign_creators enable row level security;
drop policy if exists "brand reads own campaigns" on public.brand_campaigns;
create policy "brand reads own campaigns" on public.brand_campaigns for select to authenticated using (owner = (select auth.uid()));
drop policy if exists "brand reads own campaign creators" on public.campaign_creators;
create policy "brand reads own campaign creators" on public.campaign_creators for select to authenticated
  using (exists (select 1 from public.brand_campaigns c where c.id = campaign_id and c.owner = (select auth.uid())));

-- Create or update a campaign that hasn't been sent: { id?, name, pool_id, brief, budget_total }.
create or replace function public.campaign_save(p jsonb)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_pool uuid := nullif(p ->> 'pool_id', '')::uuid;
  v_from uuid;
begin
  if auth.uid() is null or public.is_creator() then
    raise exception 'Sign in with your brand email first.';
  end if;
  if v_name = '' or char_length(v_name) > 80 then
    raise exception 'Give the campaign a name (up to 80 letters).';
  end if;
  if v_pool is not null and not exists (select 1 from public.brand_pools where id = v_pool and owner = auth.uid()) then
    v_pool := null;
  end if;
  -- Sent as the company in use (else the first this login has).
  v_from := coalesce(public.my_brand_id(),
    (select m.brand_id from public.brand_members m where m.profile_id = auth.uid() order by m.created_at limit 1));
  if v_from is null then
    raise exception 'Add your company details first.';
  end if;
  if v_id is null then
    if (select count(*) from public.brand_campaigns where owner = auth.uid() and created_at > now() - interval '1 day') >= 20 then
      raise exception 'That''s 20 campaigns today. Please try again tomorrow.';
    end if;
    insert into public.brand_campaigns (owner, name, pool_id, brand_from, brief, budget_total)
    values (auth.uid(), v_name, v_pool, v_from, coalesce(p -> 'brief', '{}'), greatest(0, coalesce(nullif(p ->> 'budget_total', '')::numeric, 0)))
    returning id into v_id;
  else
    update public.brand_campaigns set name = v_name, pool_id = v_pool,
      brief = coalesce(p -> 'brief', brief), budget_total = greatest(0, coalesce(nullif(p ->> 'budget_total', '')::numeric, budget_total))
    where id = v_id and owner = auth.uid();
    if not found then raise exception 'Campaign not found.'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.campaign_delete(p_id uuid)
returns void
language sql security definer
set search_path = public
as $$
  delete from public.brand_campaigns where id = p_id and owner = auth.uid();
$$;

-- Send the campaign to these creators (and invite these handles). Each creator gets their own request,
-- as this login's company for them (copied from the campaign's company the first time), with only the
-- content and languages they offer. One creator failing never stops the others.
create or replace function public.send_campaign(p_campaign uuid, p_creators integer[] default '{}', p_handles text[] default '{}')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c public.brand_campaigns;
  f public.brands;
  s public.creator_settings;
  v_id integer;
  v_h text;
  v_brand uuid;
  v_p jsonb;
  v_res jsonb;
  v_sent integer;
begin
  select * into c from public.brand_campaigns where id = p_campaign and owner = auth.uid();
  if c.id is null then
    raise exception 'Campaign not found.';
  end if;
  if public.is_creator() then
    raise exception 'The creator account cannot send requests.';
  end if;
  select * into f from public.brands b where b.id = c.brand_from
    and exists (select 1 from public.brand_members m where m.brand_id = b.id and m.profile_id = auth.uid());
  if f.id is null then
    raise exception 'Add your company details first.';
  end if;
  select count(*) into v_sent from public.campaign_creators x join public.brand_campaigns y on y.id = x.campaign_id
  where y.owner = auth.uid() and x.status = 'sent' and x.created_at > now() - interval '1 day';
  if v_sent + coalesce(cardinality(p_creators), 0) > 40 then
    raise exception 'Campaigns can reach up to 40 creators a day. Send to fewer, or try again tomorrow.';
  end if;

  foreach v_id in array coalesce(p_creators, '{}') loop
    if exists (select 1 from public.campaign_creators where campaign_id = c.id and creator_id = v_id and status = 'sent') then
      continue;
    end if;
    begin
      if not private.brand_can_reach(v_id) then
        raise exception 'This creator isn''t listed for brands.';
      end if;
      select * into s from public.creator_settings where id = v_id;
      perform private.act_for(v_id);
      -- This login's company for this creator, else a copy of the campaign's company.
      select m.brand_id into v_brand from public.brand_members m join public.brands b on b.id = m.brand_id
      where m.profile_id = auth.uid() and b.creator_id = v_id
      order by (lower(b.name) = lower(f.name)) desc, m.created_at limit 1;
      if v_brand is null then
        insert into public.brands (creator_id, name, instagram, website, category, gstin, billing_address, state, accounts_email, country, currency)
        values (v_id, f.name, f.instagram, f.website, f.category, f.gstin, f.billing_address, f.state, f.accounts_email, f.country, f.currency)
        returning id into v_brand;
        insert into public.brand_members (profile_id, brand_id) values (auth.uid(), v_brand) on conflict do nothing;
      end if;
      update public.profiles set brand_id = v_brand where id = auth.uid();
      -- Only what this creator makes, in the languages they create in.
      v_p := c.brief - 'package_id' || jsonb_build_object(
        'deliverables', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(coalesce(c.brief -> 'deliverables', '[]'::jsonb)) x
                         where btrim(x ->> 'kind') = any(s.offered_kinds) and coalesce(nullif(x ->> 'qty', '')::integer, 0) > 0),
        'content_language', (select coalesce(jsonb_agg(l), '[]'::jsonb) from jsonb_array_elements_text(
                               case when jsonb_typeof(c.brief -> 'content_language') = 'array' then c.brief -> 'content_language' else '[]'::jsonb end) l
                             where l = any(s.content_languages)));
      if jsonb_array_length(v_p -> 'deliverables') = 0 then
        raise exception '% doesn''t make the content in this brief.', split_part(s.display_name, ' ', 1);
      end if;
      v_res := public.submit_request(v_p);
      insert into public.campaign_creators (campaign_id, creator_id, collab_id, status, note)
      values (c.id, v_id, (v_res ->> 'id')::uuid, 'sent', '')
      on conflict (campaign_id, creator_id) where creator_id is not null
      do update set collab_id = excluded.collab_id, status = 'sent', note = '', created_at = now();
    exception when others then
      insert into public.campaign_creators (campaign_id, creator_id, status, note)
      values (c.id, v_id, 'failed', left(sqlerrm, 200))
      on conflict (campaign_id, creator_id) where creator_id is not null
      do update set status = 'failed', note = left(sqlerrm, 200);
    end;
  end loop;
  perform private.act_for(null);

  foreach v_h in array coalesce(p_handles, '{}') loop
    v_h := private.clean_handle(v_h);
    continue when v_h = '';
    insert into public.campaign_creators (campaign_id, handle, status) values (c.id, v_h, 'invited')
    on conflict (campaign_id, handle) where creator_id is null do nothing;
  end loop;

  update public.brand_campaigns set status = 'sent', sent_at = coalesce(sent_at, now()) where id = c.id;
  return public.campaign_board(c.id);
end;
$$;

-- The latest quote of a collab that the brand still has to answer, or has answered.
create or replace function private.latest_quote(p_collab uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('id', q.id, 'total', q.total, 'currency', q.currency, 'status', q.status, 'items', q.items, 'version', q.version)
  from public.quotes q where q.collab_id = p_collab and q.status in ('sent', 'accepted', 'changes')
  order by q.version desc limit 1;
$$;
revoke execute on function private.latest_quote(uuid) from public, anon, authenticated;

-- One campaign: its brief, and one row per creator with where their request stands.
create or replace function public.campaign_board(p_campaign uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'campaign', jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'pool_id', c.pool_id, 'brief', c.brief,
      'budget_total', c.budget_total, 'created_at', c.created_at, 'sent_at', c.sent_at,
      'company', (select b.name from public.brands b where b.id = c.brand_from)),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', x.id, 'handle', x.handle, 'status', x.status, 'note', x.note,
          'joined', x.creator_id is null and r.cid is not null,
          'creator', case when coalesce(x.creator_id, r.cid) is not null then private.creator_card(coalesce(x.creator_id, r.cid)) end,
          'code', k.code, 'stage', k.stage, 'stage_label', case when k.id is not null then public.stage_label(k.stage) end,
          'fee', k.fee, 'live_date', k.live_date, 'draft_date', k.draft_date, 'pay_status', k.pay_status,
          'quote', case when k.id is not null then private.latest_quote(k.id) end,
          'draft_pending', exists (select 1 from public.drafts d where d.collab_id = k.id and d.status = 'pending'))
        order by x.created_at)
      from public.campaign_creators x
      left join lateral (select private.creator_by_handle(x.handle) as cid where x.creator_id is null) r on true
      left join public.collabs k on k.id = x.collab_id
      where x.campaign_id = c.id), '[]'::jsonb))
  from public.brand_campaigns c
  where c.id = p_campaign and c.owner = auth.uid();
$$;

create or replace function public.campaigns_list()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'created_at', c.created_at,
      'sent_at', c.sent_at, 'budget_total', c.budget_total, 'brief', c.brief,
      'creators', (select count(*) from public.campaign_creators x where x.campaign_id = c.id),
      'agreed', (select count(*) from public.campaign_creators x join public.collabs k on k.id = x.collab_id
                 where x.campaign_id = c.id and k.stage in ('confirmed', 'creating', 'live', 'wrapped')),
      'waiting', (select count(*) from public.campaign_creators x join public.collabs k on k.id = x.collab_id
                  where x.campaign_id = c.id and ((private.latest_quote(k.id) ->> 'status') = 'sent'
                    or exists (select 1 from public.drafts d where d.collab_id = k.id and d.status = 'pending'))))
    order by c.created_at desc), '[]'::jsonb)
  from public.brand_campaigns c
  where c.owner = auth.uid();
$$;

-- Accept several quotes at once (or ask for changes on them, with one note). Accepting signs each
-- agreement with the name given. One failing doesn't stop the others; it comes back with why, to be
-- answered on its own page.
create or replace function public.campaign_respond(p_quotes uuid[], p_accept boolean, p_note text default '', p_name text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_q uuid;
  k public.collabs;
  v_done integer := 0;
  v_failed jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if not p_accept and btrim(coalesce(p_note, '')) = '' then
    raise exception 'Say what you''d like changed.';
  end if;
  foreach v_q in array coalesce(p_quotes, '{}') loop
    begin
      select x.* into k from public.collabs x join public.quotes q on q.collab_id = x.id
      where q.id = v_q and exists (select 1 from public.brand_members m where m.brand_id = x.brand_id and m.profile_id = auth.uid());
      if k.id is null then
        raise exception 'Quote not found.';
      end if;
      perform private.act_for(k.creator_id);
      update public.profiles set brand_id = k.brand_id where id = auth.uid();
      perform public.respond_quote(v_q, p_accept, coalesce(p_name, ''), coalesce(p_note, ''), null);
      v_done := v_done + 1;
    exception when others then
      v_failed := v_failed || jsonb_build_object('quote', v_q, 'error', left(sqlerrm, 200));
    end;
  end loop;
  perform private.act_for(null);
  return jsonb_build_object('done', v_done, 'failed', v_failed);
end;
$$;

-- 4. Who may call what --------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['pools_list()', 'pool_save(uuid, text)', 'pool_delete(uuid)', 'pool_add(uuid, integer[], text[])',
    'pool_member_update(uuid, text, text[])', 'pool_remove(uuid)', 'campaign_save(jsonb)', 'campaign_delete(uuid)',
    'send_campaign(uuid, integer[], text[])', 'campaign_board(uuid)', 'campaigns_list()', 'campaign_respond(uuid[], boolean, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
