-- Promo codes and trackable links per collab (clicks counted through her own short link; sales
-- reported by the brand or by her), and referrals: brands she worked with can recommend her with
-- their own link, and the requests that come through it say who referred them.

create table if not exists public.collab_links (
  id          uuid primary key default gen_random_uuid(),
  collab_id   uuid not null references public.collabs(id) on delete cascade,
  slug        text not null unique default lower(encode(extensions.gen_random_bytes(4), 'hex')),
  target      text not null default '' check (target = '' or target ~* '^https?://'),
  promo_code  text not null default '',
  clicks      integer not null default 0,
  sales       integer check (sales is null or sales >= 0),
  revenue     numeric(12,2) check (revenue is null or revenue >= 0),
  sales_note  text not null default '',
  sales_by    text not null default '' check (sales_by in ('', 'creator', 'brand')),
  sales_at    timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists collab_links_one_idx on public.collab_links (collab_id);
alter table public.collab_links enable row level security;
drop policy if exists "creator manages links" on public.collab_links;
create policy "creator manages links" on public.collab_links for all to authenticated
  using (public.is_creator()) with check (public.is_creator());

-- Opening her short link: count the click and send the visitor on to the brand's page.
create or replace function public.link_go(p_slug text)
returns text
language sql security definer
set search_path = public
as $$
  update public.collab_links set clicks = clicks + 1
  where slug = lower(btrim(p_slug)) and target <> ''
  returning target;
$$;
grant execute on function public.link_go(text) to anon, authenticated;

-- The brand sees its collab's code and clicks, and can report sales from the code.
create or replace function public.brand_link(p_code text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('id', l.id, 'slug', l.slug, 'promo_code', l.promo_code, 'has_target', l.target <> '',
    'clicks', l.clicks, 'sales', l.sales, 'revenue', l.revenue, 'sales_by', l.sales_by, 'sales_at', l.sales_at)
  from public.collab_links l join public.collabs c on c.id = l.collab_id
  where c.code = upper(btrim(p_code)) and public.my_brand_id() is not null and c.brand_id = public.my_brand_id();
$$;
grant execute on function public.brand_link(text) to authenticated;

create or replace function public.report_sales(p_link uuid, p_sales integer, p_revenue numeric, p_note text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  l public.collab_links;
  c public.collabs;
  s public.creator_settings;
begin
  select * into l from public.collab_links where id = p_link;
  select * into c from public.collabs where id = l.collab_id;
  if c.id is null or not (public.is_creator() or (public.my_brand_id() is not null and c.brand_id = public.my_brand_id())) then
    raise exception 'Not allowed.';
  end if;
  update public.collab_links set sales = greatest(0, coalesce(p_sales, 0)), revenue = greatest(0, coalesce(p_revenue, 0)),
    sales_note = left(coalesce(p_note, ''), 500), sales_by = case when public.is_creator() then 'creator' else 'brand' end, sales_at = now()
  where id = l.id;
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (c.id, 'note', format('Sales from the code: %s orders, ₹%s', coalesce(p_sales, 0), to_char(coalesce(p_revenue, 0), 'FM99,99,99,999')), true);
  if not public.is_creator() then
    select * into s from public.creator_settings where id = 1;
    insert into public.outbox (kind, to_email, payload) values ('sales_reported', s.creator_email,
      jsonb_build_object('code', c.code, 'brand', (select name from public.brands where id = c.brand_id), 'sales', p_sales, 'revenue', p_revenue, 'note', p_note));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.report_sales(uuid, integer, numeric, text) to authenticated;

-- Referrals
alter table public.brands add column if not exists ref_code text;
update public.brands set ref_code = lower(encode(extensions.gen_random_bytes(3), 'hex')) where ref_code is null;
alter table public.brands alter column ref_code set default lower(encode(extensions.gen_random_bytes(3), 'hex'));
create unique index if not exists brands_ref_code_idx on public.brands (ref_code);
-- A plain id (no foreign key): a second link between collabs and brands would make the existing
-- 'brand:brands(...)' lookups ambiguous.
alter table public.collabs add column if not exists referred_by uuid;

create or replace function public.my_ref_code()
returns text
language sql stable security definer
set search_path = public
as $$
  select ref_code from public.brands where id = public.my_brand_id();
$$;
grant execute on function public.my_ref_code() to authenticated;

-- After a brand sends a request that came from another brand's link: remember who referred them.
create or replace function public.set_referral(p_code text, p_ref text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  r public.brands;
begin
  select * into c from public.collabs where code = upper(btrim(p_code));
  if c.id is null or public.my_brand_id() is null or c.brand_id <> public.my_brand_id() or c.referred_by is not null then
    return jsonb_build_object('ok', false);
  end if;
  select * into r from public.brands where ref_code = lower(btrim(p_ref));
  if r.id is null or r.id = c.brand_id then return jsonb_build_object('ok', false); end if;
  update public.collabs set referred_by = r.id where id = c.id;
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (c.id, 'note', format('Referred by %s', r.name), false);
  return jsonb_build_object('ok', true, 'by', r.name);
end;
$$;
grant execute on function public.set_referral(text, text) to authenticated;
