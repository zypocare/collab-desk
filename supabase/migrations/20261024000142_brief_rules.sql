-- Open briefs say who can apply: a follower range (from her connected Instagram), niches, languages she
-- creates in, and cities. A creator sees "You qualify" or what she's missing; only those who qualify can apply.

alter table public.brand_campaigns add column if not exists rules jsonb not null default '{}';

-- The rules, tidied: {min_followers, max_followers, niches[], languages[], cities[]} (empty = anyone).
create or replace function private.brief_rules_clean(p jsonb)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'min_followers', nullif(greatest(0, least(coalesce((p ->> 'min_followers')::numeric, 0), 100000000)), 0)::bigint,
    'max_followers', nullif(greatest(0, least(coalesce((p ->> 'max_followers')::numeric, 0), 100000000)), 0)::bigint,
    'niches', nullif((select jsonb_agg(distinct left(btrim(x), 40)) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'niches') = 'array' then p -> 'niches' else '[]' end) x where btrim(x) <> ''), '[]'),
    'languages', nullif((select jsonb_agg(distinct left(btrim(x), 30)) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'languages') = 'array' then p -> 'languages' else '[]' end) x where btrim(x) <> ''), '[]'),
    'cities', nullif((select jsonb_agg(distinct left(btrim(x), 40)) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'cities') = 'array' then p -> 'cities' else '[]' end) x where btrim(x) <> ''), '[]')));
$$;

-- Does this creator fit the rules? {ok, misses: [what's missing, in her words]}.
create or replace function private.brief_fit(p_rules jsonb, p_creator integer)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  v_f bigint;
  v_miss text[] := '{}';
  v_lo bigint := (p_rules ->> 'min_followers')::bigint;
  v_hi bigint := (p_rules ->> 'max_followers')::bigint;
  v_fmt text;
begin
  select * into s from public.creator_settings where id = p_creator;
  select case when a.connected then a.followers end into v_f from public.ig_account a where a.id = p_creator;
  if v_lo is not null or v_hi is not null then
    v_fmt := case when v_lo is not null and v_hi is not null then private.short_count(v_lo) || '–' || private.short_count(v_hi)
                  when v_lo is not null then private.short_count(v_lo) || '+' else 'up to ' || private.short_count(v_hi) end;
    if v_f is null then
      v_miss := v_miss || ('For ' || v_fmt || ' followers: connect Instagram so the brand sees yours');
    elsif (v_lo is not null and v_f < v_lo) or (v_hi is not null and v_f > v_hi) then
      v_miss := v_miss || ('For ' || v_fmt || ' followers (you have ' || private.short_count(v_f) || ')');
    end if;
  end if;
  if jsonb_typeof(p_rules -> 'niches') = 'array' and not exists (
      select 1 from jsonb_array_elements_text(p_rules -> 'niches') r, unnest(string_to_array(coalesce(s.niche, ''), ',')) n
      where private.slugify(r) = private.slugify(n)) then
    v_miss := v_miss || ('For ' || (select string_agg(x, ', ') from jsonb_array_elements_text(p_rules -> 'niches') x) || ' creators');
  end if;
  if jsonb_typeof(p_rules -> 'languages') = 'array' and not exists (
      select 1 from jsonb_array_elements_text(p_rules -> 'languages') r, unnest(coalesce(s.content_languages, '{}')) l where lower(r) = lower(l)) then
    v_miss := v_miss || ('For content in ' || (select string_agg(x, ' or ') from jsonb_array_elements_text(p_rules -> 'languages') x));
  end if;
  if jsonb_typeof(p_rules -> 'cities') = 'array' and not exists (
      select 1 from jsonb_array_elements_text(p_rules -> 'cities') r where private.slugify(r) = private.slugify(s.city)) then
    v_miss := v_miss || ('For creators in ' || (select string_agg(x, ' or ') from jsonb_array_elements_text(p_rules -> 'cities') x));
  end if;
  return jsonb_build_object('ok', cardinality(v_miss) = 0, 'misses', to_jsonb(v_miss));
end;
$$;
revoke execute on function private.brief_fit(jsonb, integer) from public, anon, authenticated;

-- 12,000 → "12K", 1,50,000 → "1.5L".
create or replace function private.short_count(n bigint)
returns text
language sql immutable
set search_path = ''
as $$
  select case when n >= 10000000 then trim(trailing '.' from trim(trailing '0' from to_char(n / 10000000.0, 'FM9990.0'))) || 'Cr'
              when n >= 100000 then trim(trailing '.' from trim(trailing '0' from to_char(n / 100000.0, 'FM9990.0'))) || 'L'
              when n >= 1000 then trim(trailing '.' from trim(trailing '0' from to_char(n / 1000.0, 'FM9990.0'))) || 'K'
              else n::text end;
$$;

-- The brand sets who can apply (before or while the brief is open).
create or replace function public.campaign_rules(p_id uuid, p_rules jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v jsonb := private.brief_rules_clean(coalesce(p_rules, '{}'));
begin
  if (v ->> 'min_followers')::bigint > (v ->> 'max_followers')::bigint then
    raise exception 'The most followers is below the fewest.';
  end if;
  update public.brand_campaigns set rules = v where id = p_id and owner = public.brand_owner() and not public.is_creator();
  if not found then raise exception 'Campaign not found.'; end if;
  return v;
end;
$$;
revoke execute on function public.campaign_rules(uuid, jsonb) from public, anon;
grant execute on function public.campaign_rules(uuid, jsonb) to authenticated;

-- What a creator sees: open briefs (the ones she qualifies for first), each with the rules and her fit.
create or replace function public.open_briefs()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x.j order by (x.j -> 'fit' ->> 'ok')::boolean desc, x.until, x.created desc), '[]'::jsonb)
  from (
    select c.open_until as until, c.created_at as created, jsonb_build_object(
      'id', c.id, 'name', c.name, 'brand', b.name, 'category', b.category, 'instagram', b.instagram,
      'verified', exists (select 1 from public.brand_ig g where g.owner = c.owner),
      'brief', c.brief - 'package_id', 'budget_min', c.budget_min, 'budget_max', c.budget_max, 'open_until', c.open_until,
      'rules', c.rules, 'fit', private.brief_fit(c.rules, public.current_creator()),
      'applied', (select count(*) from public.campaign_applications a where a.campaign_id = c.id),
      'mine', (select jsonb_build_object('id', a.id, 'rate', a.rate, 'note', a.note, 'status', case when a.status = 'no' then 'new' else a.status end)
               from public.campaign_applications a where a.campaign_id = c.id and a.creator_id = public.current_creator())) as j
    from public.brand_campaigns c join public.brands b on b.id = c.brand_from
    where public.is_creator() and c.open and c.open_until >= (now() at time zone 'Asia/Kolkata')::date
      and exists (select 1 from public.creator_settings s where s.id = public.current_creator() and s.status = 'active')
  ) x;
$$;
revoke execute on function public.open_briefs() from public, anon;
grant execute on function public.open_briefs() to authenticated;

-- Applying: only creators who fit the brief's rules.
create or replace function public.brief_apply(p_campaign uuid, p_rate numeric, p_note text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_me integer := public.current_creator();
  v_fit jsonb;
begin
  if not public.is_creator() or v_me is null then
    raise exception 'Only creators can apply to a brief.';
  end if;
  if not exists (select 1 from public.brand_campaigns c where c.id = p_campaign and c.open and c.open_until >= (now() at time zone 'Asia/Kolkata')::date) then
    raise exception 'This brief has closed.';
  end if;
  v_fit := private.brief_fit((select rules from public.brand_campaigns where id = p_campaign), v_me);
  if not (v_fit ->> 'ok')::boolean then
    raise exception 'This brief is %.', lower(left(v_fit -> 'misses' ->> 0, 1)) || substr(v_fit -> 'misses' ->> 0, 2);
  end if;
  if coalesce(p_rate, -1) < 0 or p_rate > 10000000 then
    raise exception 'Add your rate (0 for barter).';
  end if;
  if (select count(*) from public.campaign_applications where creator_id = v_me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s 20 applications today. Please try again tomorrow.';
  end if;
  if exists (select 1 from public.campaign_applications where campaign_id = p_campaign and creator_id = v_me and status = 'sent') then
    raise exception 'The brand already sent you a request for this.';
  end if;
  insert into public.campaign_applications (campaign_id, creator_id, rate, note)
  values (p_campaign, v_me, p_rate, left(btrim(coalesce(p_note, '')), 400))
  on conflict (campaign_id, creator_id) do update set rate = excluded.rate, note = excluded.note;
  return public.open_briefs();
end;
$$;
revoke execute on function public.brief_apply(uuid, numeric, text) from public, anon;
grant execute on function public.brief_apply(uuid, numeric, text) to authenticated;

-- The campaign's board shows its rules too.
create or replace function public.campaign_board(p_campaign uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'campaign', jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'pool_id', c.pool_id, 'brief', c.brief,
      'budget_total', c.budget_total, 'created_at', c.created_at, 'sent_at', c.sent_at,
      'open', c.open, 'open_until', c.open_until, 'budget_min', c.budget_min, 'budget_max', c.budget_max, 'rules', c.rules,
      'applications', (select count(*) from public.campaign_applications a where a.campaign_id = c.id),
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
  where c.id = p_campaign and c.owner = public.brand_owner();
$$;
revoke execute on function public.campaign_board(uuid) from public, anon;
grant execute on function public.campaign_board(uuid) to authenticated;
