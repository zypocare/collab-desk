-- Run after migrations in an isolated local database:
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/workflows.sql
-- Everything, including fixtures and disabled notifications, rolls back.
begin;
delete from private.job_config;
insert into auth.users(id, email) values ('00000000-0000-0000-0000-000000009901', 'workflow-owner@example.test');
update public.creator_settings set creator_email = 'workflow-owner@example.test',
  autopilot_packages = false, autopilot_invoice = false, autopilot_dates = false,
  autopilot_track = false, autopilot_counter = false, autopilot_nudge = false, autopilot_brief = false;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000009901","email":"workflow-owner@example.test","role":"authenticated"}', true);

create temporary table workflow_fixtures as
  select n, gen_random_uuid() as brand_id, gen_random_uuid() as collab_id from generate_series(1, 1005) n;
insert into public.brands(id, name) select brand_id, 'Workflow fixture ' || n from workflow_fixtures;
insert into public.collabs(id, brand_id, code, received_on, created_at, fee, notify_brand)
  select collab_id, brand_id, 'WF-' || n, '2099-05-01', '2099-05-01 00:00:00+00', 100, false from workflow_fixtures;
insert into public.invoices(collab_id, items, issue_date, status, tax_mode)
  select collab_id, '[{"description":"Test work","qty":1,"rate":100}]', '2099-05-01', 'sent', 'none' from workflow_fixtures;
insert into public.collab_events(collab_id, text)
  select (select collab_id from workflow_fixtures where n = 1), 'Nested history ' || n from generate_series(1, 1005) n;

do $$
declare cursor jsonb := null; page jsonb; ids uuid[] := '{}'; expected integer; result jsonb; c uuid;
begin
  select count(*) into expected from public.collabs;
  loop
    page := public.studio_collabs_page(cursor, 37);
    if jsonb_array_length(page->'rows') > 37 then raise exception 'Page size exceeded'; end if;
    ids := ids || array(select (x->>'id')::uuid from jsonb_array_elements(page->'rows') x);
    cursor := page->'next';
    exit when cursor = 'null'::jsonb;
  end loop;
  if cardinality(ids) <> expected or (select count(distinct id) from unnest(ids) id) <> expected then
    raise exception 'Cursor pages omitted or duplicated rows';
  end if;
  select collab_id into c from workflow_fixtures where n = 1;
  result := public.studio_collabs_page(null, 1, c);
  if jsonb_array_length(result->'rows'->0->'events') < 1005 then raise exception 'Nested history truncated'; end if;
  result := public.financial_report(2099);
  if (result->'total'->>'taxable')::numeric <> 100500 or (result->'total'->>'invoices')::integer <> 1005 then
    raise exception 'Report lost records above the API cap: %', result->'total';
  end if;
  if jsonb_array_length(result->'brands') <> 1005 then raise exception 'Brand report truncated'; end if;
  if jsonb_array_length(result->'months') <> 12 then raise exception 'Missing quiet months'; end if;
end;
$$;

-- Currency conversion, partial receipts, GST/TDS and expense-only months are included too.
insert into public.invoices(collab_id, items, currency, inr_rate, issue_date, status, tax_mode, amount_received, paid_on)
  select collab_id, '[{"description":"Export","qty":2,"rate":100}]', 'USD', 80, '2099-07-01', 'sent', 'export', 50, '2099-07-02'
  from workflow_fixtures where n = 1005;
insert into public.invoices(collab_id, items, issue_date, status, tax_mode, gst_rate, tds_rate, amount_received, tds_deducted, paid_on)
  select collab_id, '[{"description":"GST test","qty":1,"rate":100}]', '2099-07-01', 'sent', 'intra', 18, 10, 108, 10, '2099-07-02'
  from workflow_fixtures where n = 1004;
insert into public.collab_expenses(collab_id, label, amount, spent_on)
  select collab_id, 'Expense only month', 25, '2099-09-01' from workflow_fixtures where n = 1003;
do $$
declare report jsonb;
begin
  report := public.financial_report(2099);
  if (report->'total'->>'taxable')::numeric <> 116600 or (report->'total'->>'gst')::numeric <> 18
     or (report->'total'->>'received')::numeric <> 4108 or (report->'total'->>'tds')::numeric <> 10
     or (report->'total'->>'costs')::numeric <> 25 then raise exception 'Currency, payment, tax or costs lost: %', report->'total'; end if;
  if not exists (select 1 from jsonb_array_elements(report->'months') m where m->>'key' = '2099-09' and (m->>'costs')::numeric = 25) then raise exception 'Expense-only month omitted'; end if;
end;
$$;

do $$
declare c uuid; d uuid; dr uuid; piece uuid; result jsonb; token text;
begin
  select collab_id into c from workflow_fixtures where n = 1;
  update public.collabs set stage = 'creating' where id = c;
  insert into public.deliverables(collab_id, kind, qty) values (c, 'Story', 3) returning id into d;
  if (select count(*) from public.deliverable_items where deliverable_id = d) <> 3 then raise exception 'Missing individual pieces'; end if;
  insert into public.ig_media(id, media_type, product_type, posted_at) values ('workflow-story', 'IMAGE', 'STORY', now());
  insert into public.collab_posts(collab_id, media_id, matched_by) values(c, 'workflow-story', 'manual');
  if (select count(*) from public.deliverable_items where deliverable_id = d and status = 'published') <> 1 then raise exception 'One post must complete only one story'; end if;
  update public.collabs set stage = 'live' where id = c;
  if (select done from public.deliverables where id = d) then raise exception 'Live completed unfinished stories'; end if;
  update public.invoices set amount_received = total, paid_on = '2099-06-01' where collab_id = c;
  if (select stage from public.collabs where id = c) <> 'live' then raise exception 'Payment wrapped unfinished work'; end if;
  update public.deliverables set done = true where id = d;
  if (select done from public.deliverables where id = d) then raise exception 'Legacy done flag bypassed individual progress'; end if;
  begin
    update public.collabs set stage = 'wrapped' where id = c;
    raise exception 'Wrapping incomplete work was allowed';
  exception when raise_exception then
    if sqlerrm <> 'Finish every deliverable before wrapping this collaboration.' then raise; end if;
  end;
  insert into public.drafts(collab_id, link, caption) values (c, 'https://example.test/draft', 'Test draft') returning id into dr;
  select id into piece from public.deliverable_items where deliverable_id = d and position = 3;
  update public.deliverable_items set status = 'in_review', draft_id = dr, assigned_to = 'Editor', due_date = '2099-06-04' where id = piece;
  update public.drafts set status = 'approved' where id = dr;
  if (select status from public.deliverable_items where id = piece) <> 'approved' then raise exception 'Draft approval did not update its piece'; end if;
  insert into public.quotes(collab_id, items, status)
    values(c, '[{"kind":"Story","qty":3,"rate":33.33}]', 'accepted');
  if not exists (select 1 from public.deliverable_items where id = piece and assigned_to = 'Editor' and draft_id = dr) then
    raise exception 'Revised quote discarded tracked work';
  end if;
  update public.deliverable_items set status = 'delivered' where id = piece;
  begin
    update public.deliverables set qty = 2 where id = d;
    raise exception 'Quantity change discarded work';
  exception when raise_exception then
    if sqlerrm <> 'Keep the quantity for work already started. Clear its progress before removing it.' then raise; end if;
  end;
  insert into public.scheduled_posts(collab_id, draft_id, file_path, publish_at) values (c, dr, 'test/video.mp4', now() + interval '1 hour');
  update public.collabs set stage = 'paused', lifecycle_reason = 'Waiting on product', resume_on = current_date + 2 where id = c;
  if (select resume_stage from public.collabs where id = c) <> 'live' then raise exception 'Previous stage not retained'; end if;
  if not exists (select 1 from public.scheduled_posts where collab_id = c and status = 'on_hold') then raise exception 'Posting was not held'; end if;
  update public.scheduled_posts set status = 'publishing' where collab_id = c;
  if not exists (select 1 from public.scheduled_posts where collab_id = c and status = 'on_hold') then raise exception 'Publisher restarted a paused schedule'; end if;
  begin
    update public.deliverable_items set status = 'creating' where id = piece;
    raise exception 'Paused progress changed';
  exception when raise_exception then
    if sqlerrm <> 'Resume this collaboration before updating production progress.' then raise; end if;
  end;
  insert into public.outbox(kind, to_email, payload) values('draft_nudge', 'test@example.test', jsonb_build_object('code', 'WF-1'));
  if not exists (select 1 from public.outbox where payload->>'code' = 'WF-1' and kind = 'draft_nudge' and status = 'skipped') then raise exception 'Paused nudge was queued'; end if;
  select track_token into token from public.collabs where id = c;
  result := public.public_track(token);
  if result->>'stage' <> 'paused' or result->>'lifecycle_reason' <> 'Waiting on product' then raise exception 'Brand lifecycle missing'; end if;
  if result::text like '%assigned_to%' then raise exception 'Internal assignment leaked to brand'; end if;
  update public.collabs set stage = 'live' where id = c;
  if not exists (select 1 from public.scheduled_posts where collab_id = c and status = 'on_hold') then raise exception 'Resume silently restarted old posting schedule'; end if;
  update public.collabs set stage = 'cancelled', lifecycle_reason = 'Campaign ended' where id = c;
  if not exists (select 1 from public.invoices where collab_id = c and status = 'paid') then raise exception 'Cancellation lost invoice/payment'; end if;
  if exists (select 1 from public.scheduled_posts where collab_id = c and status <> 'cancelled') then raise exception 'Cancellation left scheduled work'; end if;
  if (select count(*) from public.deliverable_items where deliverable_id = d) <> 3 then raise exception 'Cancellation lost delivery history'; end if;
  update public.collabs set stage = 'live' where id = c;
  update public.deliverable_items set status = 'delivered' where deliverable_id = d;
  if not (select done from public.deliverables where id = d) then raise exception 'Group not completed after all pieces'; end if;
  update public.collabs set stage = 'wrapped' where id = c;
  result := public.financial_report(2099);
  if (result->'total'->>'received')::numeric <> 4208 then raise exception 'Report lost completed payment'; end if;
end;
$$;

-- Prove table policies still protect the new JSON endpoint and money summaries.
insert into auth.users(id, email) values ('00000000-0000-0000-0000-000000009902', 'workflow-assistant@example.test');
insert into public.team_members(email, role) values ('workflow-assistant@example.test', 'assistant');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000009902","email":"workflow-assistant@example.test","role":"authenticated"}', true);
do $$
declare result jsonb;
begin
  result := public.studio_collabs_page(null, 10);
  if exists (select 1 from jsonb_array_elements(result->'rows') x where jsonb_array_length(x->'invoices') > 0) then raise exception 'Assistant read invoices'; end if;
  begin
    perform public.financial_report(2099);
    raise exception 'Assistant read financial report';
  exception when raise_exception then
    if sqlerrm <> 'Only the money team can read financial reports.' then raise; end if;
  end;
end;
$$;
select set_config('request.jwt.claims', '{"email":"unrelated@example.test","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.studio_collabs_page();
    raise exception 'Unrelated user read studio';
  exception when raise_exception then
    if sqlerrm <> 'Only the studio team can read collaborations.' then raise; end if;
  end;
end;
$$;
reset role;
rollback;
select 'Pagination, reports, deliverables, lifecycle and role isolation passed' as result;
