-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -At < supabase/tests/agency_deal_terms.sql
-- Agency commission per deal (migration 145): changing a creator's rate doesn't rewrite paid deals.
-- Runs in one transaction and rolls back.
\set ON_ERROR_STOP 1
begin;

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant all on results to authenticated, anon;
create temp table caught (k text primary key, msg text) on commit drop;
grant all on caught to authenticated, anon;
select set_config('request.headers', '{}', true);

-- Two paid deals and one still open for creator 1, and a manager who works for her.
insert into public.brands (creator_id, name) values (1, 'Terms Brand') returning id as br \gset
insert into public.collabs (creator_id, brand_id, code, stage, type, fee, pay_status, paid_on, notify_brand)
  values (1, :'br', '', 'wrapped', 'paid', 100000, 'paid', current_date - 40, false) returning id as d1 \gset
insert into public.collabs (creator_id, brand_id, code, stage, type, fee, pay_status, paid_on, notify_brand)
  values (1, :'br', '', 'wrapped', 'paid', 50000, 'paid', current_date - 10, false) returning id as d2 \gset
insert into public.collabs (creator_id, brand_id, code, stage, type, fee, notify_brand)
  values (1, :'br', '', 'creating', 'paid', 80000, false) returning id as d3 \gset
select gen_random_uuid() as m_uid \gset
insert into auth.users (id, email, aud, role) values (:'m_uid', 'terms@test.dev', 'authenticated', 'authenticated');
insert into public.profiles (id, email) values (:'m_uid', 'terms@test.dev') on conflict do nothing;
insert into public.team_members (creator_id, email, role) values (1, 'terms@test.dev', 'manager');
select set_config('request.jwt.claims', json_build_object('email', 'terms@test.dev', 'sub', :'m_uid', 'role', 'authenticated')::text, true);

create temp view deal_pct as
  select (d ->> 'id')::uuid as id, (d ->> 'pct')::numeric as pct, d ->> 'term' as term
  from jsonb_array_elements(public.agency_roster()) c, jsonb_array_elements(c -> 'deals') d where (c ->> 'id')::int = 1;
grant select on deal_pct to authenticated;

set local role authenticated;
insert into results select 'Before any change, paid deals follow the current rate (15%)', (select pct from deal_pct where id = :'d1') = 15 and (select term from deal_pct where id = :'d1') is null, null;
select public.agency_set(1, 20, null, false);
insert into results select 'Raising the rate keeps deals already paid at 15%', (select pct from deal_pct where id = :'d1') = 15 and (select pct from deal_pct where id = :'d2') = 15, (select string_agg(pct::text || '/' || coalesce(term, '-'), ', ') from deal_pct);
insert into results select 'They show as locked', (select term from deal_pct where id = :'d1') = 'rate', null;
insert into results select 'The creator''s rate is now 20%', (select (x ->> 'pct')::numeric = 20 from jsonb_array_elements(public.agency_roster()) x where (x ->> 'id')::int = 1), null;
reset role;

-- The open deal gets paid after the change: it follows the new rate.
update public.collabs set pay_status = 'paid', paid_on = current_date, stage = 'wrapped' where id = :'d3';
set local role authenticated;
insert into results select 'A deal paid after the change uses 20%', (select pct from deal_pct where id = :'d3') = 20 and (select term from deal_pct where id = :'d3') is null, null;
select public.agency_set(1, null, :'d3', true);
insert into results select 'Settling a deal locks its rate', (select term from deal_pct where id = :'d3') = 'rate', null;
select public.agency_set(1, 10, null, false);
insert into results select 'Lowering the rate later changes none of the three', (select pct from deal_pct where id = :'d1') = 15 and (select pct from deal_pct where id = :'d3') = 20, (select string_agg(pct::text, ', ') from deal_pct);
select public.agency_deal_pct(:'d2', 12.5);
insert into results select 'One deal can have its own rate', (select pct from deal_pct where id = :'d2') = 12.5 and (select term from deal_pct where id = :'d2') = 'deal', null;
select public.agency_set(1, 30, null, false);
insert into results select 'A deal''s own rate survives a rate change', (select pct from deal_pct where id = :'d2') = 12.5, null;
reset role;

-- Someone who doesn't manage her can't touch her deals.
select gen_random_uuid() as o_uid \gset
insert into auth.users (id, email, aud, role) values (:'o_uid', 'stranger@test.dev', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('email', 'stranger@test.dev', 'sub', :'o_uid', 'role', 'authenticated')::text, true);
select set_config('my.d1', :'d1', true);
set local role authenticated;
do $$ begin perform public.agency_deal_pct(current_setting('my.d1')::uuid, 5); exception when others then insert into caught values ('stranger', sqlerrm); end $$;
reset role;
insert into results select 'A stranger can''t set a deal''s rate', exists (select 1 from caught where k = 'stranger'), (select msg from caught where k = 'stranger');
select set_config('request.jwt.claims', json_build_object('email', 'terms@test.dev', 'sub', :'m_uid', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.agency_deal_pct(current_setting('my.d1')::uuid, 60); exception when others then insert into caught values ('over', sqlerrm); end $$;
reset role;
insert into results select 'Over 50% is refused', exists (select 1 from caught where k = 'over'), (select msg from caught where k = 'over');
insert into results select 'Nobody reads the terms table directly', not has_table_privilege('authenticated', 'public.agency_deal_terms', 'select'), null;

select case when ok then 'PASS' else 'FAIL' end, check_name, coalesce(detail, '') from results;
rollback;
