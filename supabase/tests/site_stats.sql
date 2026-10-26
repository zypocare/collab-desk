-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/site_stats.sql
-- The website's visitor counts (migration 167): anyone's page adds to daily totals, only admins read them. Rolls back.
\set ON_ERROR_STOP 1
begin;
create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
create temp table caught (k text primary key, msg text) on commit drop;
grant all on caught to authenticated, anon;
delete from public.site_stats;

set local role anon;
select public.site_hit('visit', '/', 'linkedin.com', '');
select public.site_hit('view', '/pricing', 'linkedin.com', '');
select public.site_hit('click', '/pricing', 'linkedin.com', 'join · creator');
select public.site_hit('visit', '/pricing', 'Google', '');
select public.site_hit('visit', '/<script>', 'x y', 'ignored');
select public.site_hit('hack', '/', '', '');
do $$ begin perform count(*) from public.site_stats; exception when others then insert into caught values ('read', sqlerrm); end $$;
reset role;
insert into results select 'A visitor''s page adds a visit and a view', (select sum(n) = 3 from public.site_stats where kind = 'visit') and (select sum(n) = 4 from public.site_stats where kind = 'view'), null;
insert into results select 'Join clicks are counted by button', (select n = 1 from public.site_stats where kind = 'click' and label = 'join · creator'), null;
insert into results select 'Sources and paths are cleaned, unknown kinds ignored', exists (select 1 from public.site_stats where source = 'google') and not exists (select 1 from public.site_stats where path like '%<%' or kind not in ('visit', 'view', 'click')), (select string_agg(kind || ' ' || path || ' ' || source, ' | ') from public.site_stats);
insert into results select 'Visitors can''t read the counts', exists (select 1 from caught where k = 'read'), null;

-- Admins see the totals.
insert into public.app_admins (email) values ('stats@admin.test') on conflict do nothing;
select set_config('request.jwt.claims', json_build_object('email', 'stats@admin.test', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_site_stats(7) as s \gset
reset role;
insert into results select 'The Dashboard gets visits, join clicks, top pages and sources', (:'s'::jsonb ->> 'visits')::int = 3 and (:'s'::jsonb ->> 'clicks')::int = 1
  and :'s'::jsonb -> 'sources' @> '[{"source": "linkedin.com"}]' and jsonb_array_length(:'s'::jsonb -> 'pages') >= 2, :'s';
select set_config('request.jwt.claims', json_build_object('email', 'nobody@x.test', 'sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.admin_site_stats(7); exception when others then insert into caught values ('admin', sqlerrm); end $$;
reset role;
insert into results select 'Only admins see the website numbers', exists (select 1 from caught where k = 'admin'), null;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
