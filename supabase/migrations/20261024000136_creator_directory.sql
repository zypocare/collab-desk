-- The public creator directory on the website (www.miracleapp.live/creators): anyone, and search engines,
-- can find creators by niche and city, with their live Instagram numbers, starting price and reviews, and
-- open their page. A creator is in it only if she switches it on (Get found > Creator directory), on top
-- of being listed for brands in Discover. "Verified": her Instagram is connected through Meta's API, so
-- the numbers are real.

alter table public.creator_settings add column if not exists directory_listed boolean not null default false;

-- "Food & drink" → "food-and-drink", "Bengaluru" → "bengaluru".
create or replace function private.slugify(t text)
returns text
language sql immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(replace(btrim(coalesce(t, '')), '&', 'and')), '[^a-z0-9]+', '-', 'g'), '-');
$$;

-- Who is in the directory (active, chose her link, listed for brands and in the directory).
create or replace function private.directory_ids()
returns setof integer
language sql stable security definer
set search_path = public
as $$
  select s.id from public.creator_settings s
  where s.status = 'active' and s.slug_chosen and s.slug is not null and s.listed and s.directory_listed;
$$;
revoke execute on function private.directory_ids() from public, anon, authenticated;

-- One creator as the directory shows her.
create or replace function private.directory_card(p_id integer)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slug', s.slug, 'name', s.display_name, 'handle', nullif(btrim(s.handle), ''), 'niche', s.niche, 'city', s.city,
    'bio', nullif(btrim(s.bio), ''), 'languages', to_jsonb(s.content_languages), 'accepting', s.accepting,
    'verified', coalesce(a.connected, false),
    'photo', case when a.connected then nullif(a.profile_picture_url, '') end,
    'followers', case when a.connected then a.followers end,
    'engagement', case when a.connected then a.engagement_rate end,
    'avg_views', case when a.connected then a.avg_views end,
    'from_price', coalesce(
      (select min(k.price) from public.packages k where k.creator_id = s.id and k.active and k.price > 0),
      case when s.show_rates then (select min(v::numeric) from jsonb_each_text(coalesce(s.rates, '{}'::jsonb)) e(k, v) where v ~ '^[0-9]+(\.[0-9]+)?$' and v::numeric > 0) end),
    'rating', (select round(avg(r.rating)::numeric, 1) from public.brand_reviews r where r.creator_id = s.id and r.shown),
    'reviews', (select count(*) from public.brand_reviews r where r.creator_id = s.id and r.shown),
    'collabs', (select count(*) from public.collabs c where c.creator_id = s.id and c.stage = 'wrapped'))
  from public.creator_settings s left join public.ig_account a on a.id = s.id
  where s.id = p_id;
$$;
revoke execute on function private.directory_card(integer) from public, anon, authenticated;

-- Search: by niche and city (as their slugs), and words (name, niche, city, handle, about). 24 a page,
-- verified first, then the biggest audiences.
create or replace function public.directory_search(p_niche text default '', p_city text default '', p_q text default '', p_page integer default 0)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with hit as (
    select s.id, coalesce(a.connected, false) as verified, coalesce(a.followers, 0) as followers
    from public.creator_settings s left join public.ig_account a on a.id = s.id and a.connected
    where s.id in (select private.directory_ids())
      and (btrim(coalesce(p_niche, '')) = '' or exists (select 1 from unnest(string_to_array(coalesce(s.niche, ''), ',')) n where private.slugify(n) = lower(btrim(p_niche))))
      and (btrim(coalesce(p_city, '')) = '' or private.slugify(s.city) = lower(btrim(p_city)))
      and (btrim(coalesce(p_q, '')) = '' or strpos(lower(concat_ws(' ', s.display_name, s.niche, s.city, s.handle, s.bio)), lower(left(btrim(p_q), 60))) > 0)
  ), page as (
    select * from hit order by verified desc, followers desc, id
    limit 24 offset greatest(0, least(coalesce(p_page, 0), 200)) * 24
  )
  select jsonb_build_object(
    'total', (select count(*) from hit),
    'items', coalesce((select jsonb_agg(private.directory_card(p.id) order by p.verified desc, p.followers desc, p.id) from page p), '[]'::jsonb));
$$;
revoke execute on function public.directory_search(text, text, text, integer) from public;
grant execute on function public.directory_search(text, text, text, integer) to anon, authenticated;

-- The niches and cities that have someone in them (for the filters, the pages and the sitemap).
create or replace function public.directory_facets()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with s as (select * from public.creator_settings where id in (select private.directory_ids())),
  n as (select btrim(x) as label, private.slugify(x) as slug, s.id, private.slugify(s.city) as city from s, unnest(string_to_array(coalesce(s.niche, ''), ',')) x where btrim(x) <> ''),
  c as (select btrim(s.city) as label, private.slugify(s.city) as slug from s where btrim(coalesce(s.city, '')) <> '')
  select jsonb_build_object(
    'total', (select count(*) from s),
    'niches', coalesce((select jsonb_agg(jsonb_build_object('slug', slug, 'label', label, 'n', n) order by n desc, label)
                        from (select slug, min(label) as label, count(distinct id) as n from n group by slug) x), '[]'::jsonb),
    'cities', coalesce((select jsonb_agg(jsonb_build_object('slug', slug, 'label', label, 'n', n) order by n desc, label)
                        from (select slug, min(label) as label, count(*) as n from c group by slug) x), '[]'::jsonb),
    'pairs', coalesce((select jsonb_agg(jsonb_build_object('niche', slug, 'city', city)) from (select distinct slug, city from n where city <> '') x), '[]'::jsonb));
$$;
revoke execute on function public.directory_facets() from public;
grant execute on function public.directory_facets() to anon, authenticated;
