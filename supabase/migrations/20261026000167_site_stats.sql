-- The website's own visitor counts (www.miracleapp.live), for the admin Dashboard: visits, page views, where
-- visitors came from, and clicks on the Join and sign-in buttons. No cookies and nothing about the person: a
-- small script on each page adds one to a daily total.

create table if not exists public.site_stats (
  day date not null default (now() at time zone 'Asia/Kolkata')::date,
  -- visit: the first page of a visit (it counts as a view too); view: any page; click: a Join or sign-in button.
  kind text not null check (kind in ('visit', 'view', 'click')),
  path text not null default '/',
  -- utm_source, or the site the visitor came from ('direct' when neither).
  source text not null default 'direct',
  -- For a click: which button ("join · creator", "join · brand", "sign in").
  label text not null default '',
  n integer not null default 0,
  primary key (day, kind, path, source, label)
);
alter table public.site_stats enable row level security;
revoke all on public.site_stats from anon, authenticated;

create or replace function public.site_hit(p_kind text, p_path text, p_source text default '', p_label text default '')
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_path text := left(regexp_replace(coalesce(p_path, '/'), '[^A-Za-z0-9/_.-]', '', 'g'), 120);
  v_source text := coalesce(nullif(lower(left(regexp_replace(btrim(coalesce(p_source, '')), '[^a-zA-Z0-9._-]', '', 'g'), 40)), ''), 'direct');
  v_label text := case when p_kind = 'click' then left(regexp_replace(btrim(coalesce(p_label, '')), '[^a-zA-Z ·-]', '', 'g'), 40) else '' end;
begin
  if p_kind not in ('visit', 'view', 'click') then return; end if;
  if v_path !~ '^/' then v_path := '/' || v_path; end if;
  insert into public.site_stats (kind, path, source, label, n) values (p_kind, v_path, v_source, v_label, 1)
  on conflict (day, kind, path, source, label) do update set n = public.site_stats.n + 1;
  if p_kind = 'visit' then
    insert into public.site_stats (kind, path, source, label, n) values ('view', v_path, v_source, '', 1)
    on conflict (day, kind, path, source, label) do update set n = public.site_stats.n + 1;
  end if;
end;
$$;
revoke execute on function public.site_hit(text, text, text, text) from public;
grant execute on function public.site_hit(text, text, text, text) to anon, authenticated;

-- The Dashboard's Website card: totals for the period (and the one before), each day, top pages, sources and buttons,
-- and the sign-ups in the same period to compare with.
create or replace function public.admin_site_stats(p_days integer)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_from date := case when coalesce(p_days, 0) > 0 then v_today - (p_days - 1) else date '2000-01-01' end;
  v_prev date := case when coalesce(p_days, 0) > 0 then v_from - p_days else null end;
begin
  perform private.admin_check();
  return jsonb_build_object(
    'visits', (select coalesce(sum(n), 0) from public.site_stats where kind = 'visit' and day >= v_from),
    'views', (select coalesce(sum(n), 0) from public.site_stats where kind = 'view' and day >= v_from),
    'clicks', (select coalesce(sum(n), 0) from public.site_stats where kind = 'click' and label like 'join%' and day >= v_from),
    'visits_prev', case when v_prev is null then null else (select coalesce(sum(n), 0) from public.site_stats where kind = 'visit' and day >= v_prev and day < v_from) end,
    'today', (select coalesce(sum(n), 0) from public.site_stats where kind = 'visit' and day = v_today),
    'signups', (select count(*) from public.creator_settings where created_at >= v_from::timestamp at time zone 'Asia/Kolkata')
             + (select count(*) from public.brand_profiles where created_at >= v_from::timestamp at time zone 'Asia/Kolkata'),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'visits', v, 'clicks', c) order by day) from (
        select day, sum(n) filter (where kind = 'visit') as v, sum(n) filter (where kind = 'click' and label like 'join%') as c
        from public.site_stats where day >= greatest(v_from, v_today - 59) group by day) x), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'n', n) order by n desc) from (
        select path, sum(n) as n from public.site_stats where kind = 'view' and day >= v_from group by path order by 2 desc limit 8) x), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'n', n) order by n desc) from (
        select source, sum(n) as n from public.site_stats where kind = 'visit' and day >= v_from group by source order by 2 desc limit 8) x), '[]'::jsonb),
    'buttons', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'n', n) order by n desc) from (
        select label, sum(n) as n from public.site_stats where kind = 'click' and day >= v_from group by label order by 2 desc limit 6) x), '[]'::jsonb));
end;
$$;
revoke execute on function public.admin_site_stats(integer) from public, anon;
grant execute on function public.admin_site_stats(integer) to authenticated;

-- Old counts go after about a year.
select cron.unschedule('site-stats-cleanup') where exists (select 1 from cron.job where jobname = 'site-stats-cleanup');
select cron.schedule('site-stats-cleanup', '45 3 * * 0', $$delete from public.site_stats where day < current_date - 400$$);
