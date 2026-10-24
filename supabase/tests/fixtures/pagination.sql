-- Run: docker exec -i supabase_db_Influence psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/fixtures/pagination.sql
-- Test data, not a test: the e2e test "list pagination keeps all records available" needs more than one
-- page of collabs (25 a page) for the test creator. The seed has fewer, so this tops creator 1 up to 30
-- with small requests from a "Pagination filler" brand. Safe to run again: it only adds what's missing.
-- Local and CI databases only.
do $$
declare
  v_brand uuid;
  v_have integer;
begin
  select id into v_brand from public.brands where creator_id = 1 and name = 'Pagination filler';
  if v_brand is null then
    insert into public.brands (creator_id, name, category) values (1, 'Pagination filler', 'Other') returning id into v_brand;
  end if;
  select count(*) into v_have from public.collabs where creator_id = 1;
  if v_have < 30 then
    insert into public.collabs (creator_id, brand_id, code, stage, type, fee, notify_brand)
    select 1, v_brand, '', 'request', 'paid', 500, false from generate_series(1, 30 - v_have);
  end if;
end $$;
select count(*) as collabs_for_creator_1 from public.collabs where creator_id = 1;
