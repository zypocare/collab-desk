-- Sales tracking, the rate benchmark and agency mode v1.
--  1. Brands import their orders (Shopify, WooCommerce or any CSV); orders with a creator's code count as
--     her sales, giving cost per sale and return on spend. Tracking only: no money moves through Miracle.
--  2. What creators like her charge, from accepted quotes across Miracle (anonymous, at least 5 creators).
--  3. Agencies and managers who work for several creators: switch between them, see the roster, and keep
--     a commission ledger.

-- 1. Sales ----------------------------------------------------------------------------------------------
create table if not exists public.brand_orders (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  order_ref text not null check (char_length(order_ref) between 1 and 80),
  ordered_on date,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  code text not null default '',
  collab_id uuid references public.collabs (id) on delete set null,
  source text not null default 'csv' check (source in ('shopify', 'woocommerce', 'csv')),
  created_at timestamptz not null default now()
);
create unique index if not exists brand_orders_ref_uq on public.brand_orders (owner, order_ref);
create index if not exists brand_orders_collab_idx on public.brand_orders (collab_id);
alter table public.brand_orders enable row level security;
drop policy if exists "brand reads own orders" on public.brand_orders;
create policy "brand reads own orders" on public.brand_orders for select to authenticated using (owner = (select public.brand_owner()));
grant select on public.brand_orders to authenticated;

-- Rows: [{"ref": "#1001", "date": "2026-10-20", "amount": 1299, "code": "NIVY10"}]. Matched to this brand's
-- collabs by promo code; each matched collab's link gets its order count and sales.
create or replace function public.brand_orders_import(p_rows jsonb, p_source text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid := public.brand_owner();
  r jsonb;
  v_code text;
  v_collab uuid;
  n integer := 0;
  m integer := 0;
  v_unmatched text[] := '{}';
begin
  if v_owner is null or public.is_creator() then raise exception 'Only a brand can import orders'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 20000 then raise exception 'Up to 20,000 orders at a time'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    continue when btrim(coalesce(r ->> 'ref', '')) = '';
    v_code := upper(btrim(coalesce(r ->> 'code', '')));
    v_collab := null;
    if v_code <> '' then
      select l.collab_id into v_collab
      from public.collab_links l join public.collabs c on c.id = l.collab_id
      join public.brand_members bm on bm.brand_id = c.brand_id
      where bm.profile_id in (select private.team_logins(v_owner)) and upper(btrim(l.promo_code)) = v_code
      order by c.created_at desc limit 1;
      if v_collab is null and not v_code = any (v_unmatched) and cardinality(v_unmatched) < 20 then v_unmatched := v_unmatched || v_code; end if;
    end if;
    insert into public.brand_orders (owner, order_ref, ordered_on, amount, code, collab_id, source)
    values (v_owner, left(btrim(r ->> 'ref'), 80),
      case when coalesce(r ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}' then left(r ->> 'date', 10)::date end,
      greatest(0, coalesce(nullif(regexp_replace(coalesce(r ->> 'amount', ''), '[^0-9.]', '', 'g'), '')::numeric, 0)),
      left(v_code, 60), v_collab, case when p_source in ('shopify', 'woocommerce') then p_source else 'csv' end)
    on conflict (owner, order_ref) do update set amount = excluded.amount, code = excluded.code, collab_id = excluded.collab_id, ordered_on = excluded.ordered_on;
    n := n + 1;
    if v_collab is not null then m := m + 1; end if;
  end loop;
  -- Each code's totals, from every order imported so far.
  update public.collab_links l set sales = t.orders, revenue = t.revenue, sales_by = 'brand', sales_at = now(),
    sales_note = 'Imported from ' || case p_source when 'shopify' then 'Shopify' when 'woocommerce' then 'WooCommerce' else 'a CSV' end
  from (select o.collab_id, count(*)::integer as orders, sum(o.amount) as revenue from public.brand_orders o
        where o.owner = v_owner and o.collab_id is not null group by o.collab_id) t
  where l.collab_id = t.collab_id;
  return jsonb_build_object('imported', n, 'matched', m, 'unmatched_codes', to_jsonb(v_unmatched));
end;
$$;
revoke execute on function public.brand_orders_import(jsonb, text) from public, anon;
grant execute on function public.brand_orders_import(jsonb, text) to authenticated;

-- The brand's creators by sales: code, clicks, orders, sales and what they cost.
create or replace function public.brand_sales()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'collab', c.code, 'creator', s.display_name, 'creator_id', s.id, 'brand', b.name, 'code', l.promo_code, 'clicks', l.clicks,
      'orders', coalesce(l.sales, 0), 'revenue', coalesce(l.revenue, 0), 'fee', coalesce(c.fee, 0), 'stage', c.stage)
    order by coalesce(l.revenue, 0) desc), '[]'::jsonb)
  from public.collab_links l
  join public.collabs c on c.id = l.collab_id
  join public.brands b on b.id = c.brand_id
  join public.creator_settings s on s.id = c.creator_id
  where public.brand_owner() is not null and not public.is_creator()
    and exists (select 1 from public.brand_members bm where bm.brand_id = c.brand_id and bm.profile_id in (select private.team_logins(public.brand_owner())));
$$;
revoke execute on function public.brand_sales() from public, anon;
grant execute on function public.brand_sales() to authenticated;

-- 2. Rate benchmark ---------------------------------------------------------------------------------------
-- Per content type: the price per piece in accepted quotes from creators of a similar size (and niche,
-- when there are enough), never fewer than 5 creators. Her own quotes are left out.
create or replace function public.rate_benchmark()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with me as (
    select s.id, btrim(lower(split_part(coalesce(s.niche, ''), ',', 1))) as niche, coalesce(a.followers, 0) as f
    from public.creator_settings s left join public.ig_account a on a.id = s.id
    where s.id = public.current_creator() and public.is_creator()
  ),
  band as (select id, niche, case when f = 0 then 0 when f < 10000 then 1 when f < 50000 then 2 when f < 200000 then 3 when f < 1000000 then 4 else 5 end as b from me),
  deals as (
    select q.creator_id, btrim(lower(split_part(coalesce(s.niche, ''), ',', 1))) as niche,
      case when coalesce(a.followers, 0) < 10000 then 1 when a.followers < 50000 then 2 when a.followers < 200000 then 3 when a.followers < 1000000 then 4 else 5 end as b,
      i ->> 'kind' as kind, (i ->> 'rate')::numeric * coalesce(nullif(q.inr_rate, 0), 1) as rate
    from public.quotes q
    join public.creator_settings s on s.id = q.creator_id
    left join public.ig_account a on a.id = q.creator_id
    cross join lateral jsonb_array_elements(q.items) i
    where q.status = 'accepted' and q.responded_at > now() - interval '18 months'
      and coalesce((i ->> 'rate')::numeric, 0) > 0 and q.creator_id <> (select id from me)
  ),
  pick as (
    -- Same size and niche if 5+ creators, else same size.
    select d.kind, d.rate, d.creator_id, (d.niche = band.niche and band.niche <> '') as same_niche
    from deals d, band where d.b = band.b
  ),
  agg as (
    select kind, same_niche, count(distinct creator_id) as creators, count(*) as deals,
      percentile_cont(0.25) within group (order by rate) as p25,
      percentile_cont(0.5) within group (order by rate) as p50,
      percentile_cont(0.75) within group (order by rate) as p75
    from pick group by kind, same_niche
    union all
    select kind, null, count(distinct creator_id), count(*),
      percentile_cont(0.25) within group (order by rate), percentile_cont(0.5) within group (order by rate), percentile_cont(0.75) within group (order by rate)
    from pick group by kind
  )
  select jsonb_build_object(
    'band', (select b from band),
    'niche', (select niche from band),
    'kinds', coalesce((select jsonb_object_agg(kind, x) from (
      select distinct on (kind) kind, jsonb_build_object('p25', round(p25), 'p50', round(p50), 'p75', round(p75), 'creators', creators, 'deals', deals, 'niche', coalesce(same_niche, false)) as x
      from agg where creators >= 5 and (same_niche is null or same_niche)
      order by kind, same_niche nulls last) k), '{}'::jsonb))
  where exists (select 1 from me);
$$;
revoke execute on function public.rate_benchmark() from public, anon;
grant execute on function public.rate_benchmark() to authenticated;

-- 3. Agency mode ------------------------------------------------------------------------------------------
-- The creators this login works for, and switching between them.
create or replace function public.my_studios()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.display_name, 'handle', s.handle, 'slug', s.slug,
      'role', case when lower(s.creator_email) = public.jwt_email() then 'owner' else (select t.role from public.team_members t where t.creator_id = s.id and t.email = public.jwt_email()) end,
      'photo', case when a.connected then nullif(a.profile_picture_url, '') end,
      'current', s.id = public.current_creator()) order by lower(s.display_name)), '[]'::jsonb)
  from public.creator_settings s left join public.ig_account a on a.id = s.id
  where s.id in (select public.my_creators()) and s.status in ('active', 'paused');
$$;
revoke execute on function public.my_studios() from public, anon;
grant execute on function public.my_studios() to authenticated;

create or replace function public.use_creator(p_creator integer)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.my_creators() m where m = p_creator) then raise exception 'You don''t work for this creator'; end if;
  update public.profiles set active_creator = p_creator where id = auth.uid();
end;
$$;
revoke execute on function public.use_creator(integer) from public, anon;
grant execute on function public.use_creator(integer) to authenticated;

-- Her commission on each creator's deals (tracking only), and which ones are settled.
create table if not exists public.agency_splits (
  email text not null,
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  pct numeric(5, 2) not null default 15 check (pct between 0 and 50),
  primary key (email, creator_id)
);
create table if not exists public.agency_settled (
  email text not null,
  collab_id uuid not null references public.collabs (id) on delete cascade,
  settled_at timestamptz not null default now(),
  primary key (email, collab_id)
);
alter table public.agency_splits enable row level security;
alter table public.agency_settled enable row level security;
revoke all on public.agency_splits, public.agency_settled from anon, authenticated;

-- Every creator she manages (owner or manager): reach, open deals, money due, posts this week, her split,
-- and the paid deals for the ledger.
create or replace function public.agency_roster()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with mine as (
    select s.* from public.creator_settings s
    where s.id in (select public.my_creators()) and s.status = 'active'
      and (lower(s.creator_email) = public.jwt_email()
        or exists (select 1 from public.team_members t where t.creator_id = s.id and t.email = public.jwt_email() and t.role in ('owner', 'manager')))
  )
  select coalesce(jsonb_agg(private.creator_card(m.id) || jsonb_build_object(
      'slug', m.slug, 'site_url', m.site_url, 'rates', m.rates, 'show_insights', m.show_insights,
      'pct', coalesce((select x.pct from public.agency_splits x where x.email = public.jwt_email() and x.creator_id = m.id), 15),
      'open', (select count(*) from public.collabs c where c.creator_id = m.id and c.stage in ('request', 'negotiating', 'confirmed', 'creating')),
      'requests', (select count(*) from public.collabs c where c.creator_id = m.id and c.stage = 'request'),
      'due', (select coalesce(sum(greatest(0, i.payable - i.amount_received)), 0) from public.invoices i where i.creator_id = m.id and i.status in ('sent', 'partly_paid')),
      'week', (select count(*) from public.collabs c where c.creator_id = m.id and c.live_date between current_date and current_date + 7),
      'deals', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'brand', b.name, 'fee', c.fee, 'paid_on', c.paid_on,
          'settled', exists (select 1 from public.agency_settled z where z.email = public.jwt_email() and z.collab_id = c.id)) order by c.paid_on desc)
        from public.collabs c join public.brands b on b.id = c.brand_id
        where c.creator_id = m.id and c.pay_status = 'paid' and c.paid_on > current_date - 365 and c.type <> 'barter'), '[]'::jsonb))
    order by lower(m.display_name)), '[]'::jsonb)
  from mine m;
$$;
revoke execute on function public.agency_roster() from public, anon;
grant execute on function public.agency_roster() to authenticated;

create or replace function public.agency_set(p_creator integer, p_pct numeric, p_collab uuid, p_settled boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.my_creators() m where m = p_creator) then raise exception 'You don''t work for this creator'; end if;
  if p_pct is not null then
    insert into public.agency_splits (email, creator_id, pct) values (public.jwt_email(), p_creator, greatest(0, least(50, p_pct)))
    on conflict (email, creator_id) do update set pct = excluded.pct;
  end if;
  if p_collab is not null then
    if not exists (select 1 from public.collabs c where c.id = p_collab and c.creator_id = p_creator) then raise exception 'Not this creator''s deal'; end if;
    if p_settled then insert into public.agency_settled (email, collab_id) values (public.jwt_email(), p_collab) on conflict do nothing;
    else delete from public.agency_settled where email = public.jwt_email() and collab_id = p_collab; end if;
  end if;
end;
$$;
revoke execute on function public.agency_set(integer, numeric, uuid, boolean) from public, anon;
grant execute on function public.agency_set(integer, numeric, uuid, boolean) to authenticated;

-- Who a signed-in person works for: on a creator's own address, that creator (when they're on her team);
-- elsewhere, the one they last picked, else their first.
create or replace function public.current_creator()
returns integer
language plpgsql stable security definer
set search_path = public
as $$
declare
  v text := nullif(current_setting('app.creator', true), '');
  a integer;
  h integer;
begin
  if v is not null then
    return v::integer;
  end if;
  if public.jwt_email() = '' then
    return null;
  end if;
  select s.id into h from public.creator_settings s where s.slug = private.header_slug() and s.status in ('active', 'paused');
  if h is not null and exists (select 1 from public.my_creators() m where m = h) then
    return h;
  end if;
  select p.active_creator into a from public.profiles p where p.id = auth.uid();
  if a is not null and exists (select 1 from public.my_creators() m where m = a) then
    return a;
  end if;
  return (select min(m) from public.my_creators() m);
end;
$$;
