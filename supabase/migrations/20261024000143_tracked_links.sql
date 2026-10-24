-- Tracked links for every collab, without anyone setting them up: when a brief has a product link (and a
-- promo code), the collab gets its short link (name.miracleapp.live/go/xxxx) by itself; the brand can also add
-- one on the request. Clicks are counted by day, so the brand sees this week's taps, and the 7-day results
-- report carries the clicks and orders.

create table if not exists public.collab_link_days (
  link_id uuid not null references public.collab_links (id) on delete cascade,
  day date not null,
  clicks integer not null default 0,
  primary key (link_id, day)
);
alter table public.collab_link_days enable row level security;
revoke all on public.collab_link_days from anon, authenticated;

-- Opening the short link: count the tap (in total and for today) and send the visitor on.
create or replace function public.link_go(p_slug text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  l public.collab_links;
begin
  update public.collab_links set clicks = clicks + 1
  where slug = lower(btrim(p_slug)) and target <> ''
  returning * into l;
  if l.id is null then return null; end if;
  insert into public.collab_link_days (link_id, day, clicks) values (l.id, (now() at time zone 'Asia/Kolkata')::date, 1)
  on conflict (link_id, day) do update set clicks = public.collab_link_days.clicks + 1;
  return l.target;
end;
$$;
revoke execute on function public.link_go(text) from public;
grant execute on function public.link_go(text) to anon, authenticated;

-- A brief with a product link gives its collab a tracked link (once; the creator can still change it).
create or replace function private.collab_link_from_brief()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_link text := btrim(coalesce(new.brief_details ->> 'link', ''));
begin
  if v_link !~* '^https?://[^\s]+\.[^\s]+$' then return new; end if;
  if exists (select 1 from public.collab_links where collab_id = new.id) then return new; end if;
  insert into public.collab_links (collab_id, creator_id, target, promo_code)
  values (new.id, new.creator_id, left(v_link, 500), left(btrim(coalesce(new.brief_details ->> 'promo', '')), 40))
  on conflict do nothing;
  return new;
end;
$$;
revoke execute on function private.collab_link_from_brief() from public, anon, authenticated;
drop trigger if exists collab_link_from_brief on public.collabs;
create trigger collab_link_from_brief after insert or update of brief_details on public.collabs
  for each row execute function private.collab_link_from_brief();

-- The brand's view of its collab's link: code, clicks (in all, this week, by day for two weeks) and sales.
create or replace function public.brand_link(p_code text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('id', l.id, 'slug', l.slug, 'promo_code', l.promo_code, 'has_target', l.target <> '', 'target', l.target,
    'clicks', l.clicks, 'sales', l.sales, 'revenue', l.revenue, 'sales_by', l.sales_by, 'sales_at', l.sales_at,
    'short', rtrim(coalesce(s.site_url, ''), '/') || '/go/' || l.slug,
    'week', (select coalesce(sum(d.clicks), 0) from public.collab_link_days d where d.link_id = l.id and d.day > (now() at time zone 'Asia/Kolkata')::date - 7),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', g::date, 'clicks', coalesce(d.clicks, 0)) order by g), '[]')
             from generate_series((now() at time zone 'Asia/Kolkata')::date - 13, (now() at time zone 'Asia/Kolkata')::date, interval '1 day') g
             left join public.collab_link_days d on d.link_id = l.id and d.day = g::date))
  from public.collab_links l join public.collabs c on c.id = l.collab_id join public.creator_settings s on s.id = c.creator_id
  where c.code = upper(btrim(p_code)) and public.my_brand_id() is not null and c.brand_id = public.my_brand_id();
$$;
revoke execute on function public.brand_link(text) from public, anon;
grant execute on function public.brand_link(text) to authenticated;

-- The brand adds (or fills in) the link and code on a request: where the link should go, and the code.
-- A target the creator already set is kept.
create or replace function public.brand_link_set(p_code text, p_target text, p_promo text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  v_target text := btrim(coalesce(p_target, ''));
  v_promo text := left(btrim(coalesce(p_promo, '')), 40);
begin
  select * into c from public.collabs where code = upper(btrim(p_code));
  if c.id is null or public.my_brand_id() is null or c.brand_id <> public.my_brand_id() then raise exception 'Not found.'; end if;
  if v_target <> '' and v_target !~* '^https?://[^\s]+\.[^\s]+$' then raise exception 'Use a full link, starting with https://'; end if;
  if v_target = '' and v_promo = '' then raise exception 'Add the link or the code.'; end if;
  insert into public.collab_links (collab_id, creator_id, target, promo_code) values (c.id, c.creator_id, left(v_target, 500), v_promo)
  on conflict (collab_id) do update set
    target = case when public.collab_links.target = '' then excluded.target else public.collab_links.target end,
    promo_code = case when public.collab_links.promo_code = '' then excluded.promo_code else public.collab_links.promo_code end;
  insert into public.collab_events (creator_id, collab_id, kind, text, visible_to_brand)
  values (c.creator_id, c.id, 'note', 'The brand added the product link' || case when v_promo <> '' then ' and code ' || v_promo else '' end || '. Use the tracked link so clicks count.', true);
  return public.brand_link(p_code);
end;
$$;
revoke execute on function public.brand_link_set(text, text, text) from public, anon;
grant execute on function public.brand_link_set(text, text, text) to authenticated;
