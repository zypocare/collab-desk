-- Miracle for many creators, part 3: the studio and brand functions people call when signed in.
-- Studio functions now read and change only the rows of the creator being worked for; a row of
-- another creator is simply "not found". Brand functions use the settings of the collab's creator.

-- AI cache, budget and usage: per creator ----------------------------------------------------
create or replace function public.ai_cache_get(p_key text)
returns jsonb
language sql
stable security definer
set search_path = ''
as $$
  select result from public.ai_cache
  where creator_id = public.current_creator() and key = p_key and created_at > now() - interval '14 days' and public.is_creator();
$$;

create or replace function public.ai_cache_put(p_key text, p_kind text, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_creator() or p_result is null then return; end if;
  insert into public.ai_cache (creator_id, key, kind, result) values (public.current_creator(), left(p_key, 128), left(p_kind, 20), p_result)
  on conflict (creator_id, key) do update set result = excluded.result, created_at = now();
  delete from public.ai_cache where creator_id = public.current_creator() and created_at < now() - interval '14 days';
end $$;

create or replace function public.ai_left()
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select case when public.is_creator() then jsonb_build_object(
    'pct', greatest(0, round(100 - 100.0 * coalesce((select sum(cost) from public.ai_usage where creator_id = public.current_creator() and day = private.ai_day() and kind not like 'gemini%'), 0) / 9000))::integer,
    'gemini_left', greatest(0, 250 - coalesce((select sum(calls) from public.ai_usage where creator_id = public.current_creator() and day = private.ai_day() and kind like 'gemini%'), 0))::integer
  ) end
$$;

create or replace function public.ai_settle(p_kind text, p_delta integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_creator() then return; end if;
  update public.ai_usage set cost = greatest(0, cost + greatest(-2000, least(coalesce(p_delta, 0), 2000)))
  where creator_id = public.current_creator() and day = private.ai_day() and kind = left(coalesce(p_kind, ''), 20);
end;
$$;

create or replace function public.ai_take2(p_kind text, p_cost integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_cap constant integer := 9000;
  v_cost integer := greatest(1, least(coalesce(p_cost, 150), 2000));
  v_me integer := public.current_creator();
begin
  if not public.is_creator() then return jsonb_build_object('ok', false, 'reason', 'not_creator'); end if;
  select coalesce(sum(cost), 0) into v_used from public.ai_usage where creator_id = v_me and day = private.ai_day() and kind not like 'gemini%';
  if v_used + v_cost > v_cap then return jsonb_build_object('ok', false, 'reason', 'budget', 'used', v_used); end if;
  insert into public.ai_usage (creator_id, day, kind, calls, cost) values (v_me, private.ai_day(), left(coalesce(p_kind, ''), 20), 1, v_cost)
  on conflict (creator_id, day, kind) do update set calls = public.ai_usage.calls + 1, cost = public.ai_usage.cost + v_cost;
  return jsonb_build_object('ok', true, 'used', v_used + v_cost);
end;
$$;

create or replace function public.ai_take_gemini(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_me integer := public.current_creator();
begin
  if not public.is_creator() then return jsonb_build_object('ok', false, 'reason', 'not_creator'); end if;
  select coalesce(sum(calls), 0) into v_used from public.ai_usage where creator_id = v_me and day = private.ai_day() and kind like 'gemini%';
  if v_used >= 250 then return jsonb_build_object('ok', false, 'reason', 'budget'); end if;
  insert into public.ai_usage (creator_id, day, kind, calls, cost) values (v_me, private.ai_day(), left('gemini:' || coalesce(p_kind, ''), 20), 1, 0)
  on conflict (creator_id, day, kind) do update set calls = public.ai_usage.calls + 1;
  return jsonb_build_object('ok', true);
end;
$$;

-- Studio actions on one row: the row must belong to the creator being worked for -------------
create or replace function public.answer_question(p_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.brand_questions;
begin
  if not public.is_creator() then raise exception 'Only the creator can answer.'; end if;
  if char_length(btrim(coalesce(p_answer, ''))) < 2 then raise exception 'Type your answer.'; end if;
  update public.brand_questions set answer = left(btrim(p_answer), 4000), answered_at = now(), closed = true
  where id = p_id and creator_id = public.current_creator() returning * into q;
  if q.id is null then raise exception 'Question not found.'; end if;
  insert into public.outbox (creator_id, kind, to_email, payload) values (q.creator_id, 'question_answer', q.email, jsonb_build_object(
    'name', q.name, 'brand', q.brand, 'question', left(q.body, 600), 'answer', q.answer));
end;
$$;

create or replace function public.ask_brief(p_collab uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_creator() then raise exception 'Only the creator can do this.'; end if;
  if not exists (select 1 from public.collabs where id = p_collab and creator_id = public.current_creator()) then return false; end if;
  return private.ask_brief(p_collab);
end;
$$;

create or replace function public.delete_brand(p_brand uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_issued int;
  v_collabs int;
begin
  if coalesce(public.team_role(), '') not in ('owner', 'manager') then
    raise exception 'Only the owner or a manager can delete a brand';
  end if;
  select name into v_name from public.brands where id = p_brand and creator_id = public.current_creator();
  if v_name is null then
    raise exception 'Brand not found';
  end if;
  select count(*) into v_issued
  from public.invoices i join public.collabs c on c.id = i.collab_id
  where c.brand_id = p_brand and i.status not in ('draft', 'cancelled');
  if v_issued > 0 then
    raise exception 'invoices_issued:%', v_issued;
  end if;
  select count(*) into v_collabs from public.collabs where brand_id = p_brand;
  update public.collabs set referred_by = null where referred_by = p_brand and creator_id = public.current_creator();
  delete from public.collabs where brand_id = p_brand;
  delete from public.brands where id = p_brand;
  return jsonb_build_object('name', v_name, 'collabs', v_collabs);
end;
$$;

-- The creator's own settings and bookings (a public page asks for the page's creator).
create or replace function public.demand_factor()
returns numeric
language sql
stable security definer
set search_path = public
as $$
  select case when s.demand_pricing and (
      select count(*) from public.collabs c
      where c.creator_id = s.id
        and c.stage in ('confirmed', 'creating', 'live')
        and coalesce(c.live_date, c.draft_date, c.preferred_live) >= date_trunc('week', current_date)::date
        and coalesce(c.live_date, c.draft_date, c.preferred_live) < date_trunc('week', current_date)::date + 28
    ) >= 0.75 * s.weekly_capacity * 4
    then 1 + s.demand_pct / 100.0 else 1 end
  from public.creator_settings s where s.id = private.page_creator();
$$;

create or replace function public.get_agreement(p_quote uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  q public.quotes;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  select * into q from public.quotes where id = p_quote;
  select * into c from public.collabs where id = q.collab_id;
  if c.id is null or not (public.is_creator_of(c.creator_id) or (public.my_brand_id() is not null and c.brand_id = public.my_brand_id())) then
    return null;
  end if;
  if q.status not in ('accepted', 'sent') then
    return null;
  end if;
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = c.creator_id;

  return jsonb_build_object(
    'quote', to_jsonb(q) - 'accepted_ip',
    'accepted_ip', case when public.is_creator_of(c.creator_id) then q.accepted_ip else null end,
    'code', c.code, 'type', c.type, 'product', c.product, 'product_value', c.product_value,
    'live_date', c.live_date, 'preferred_live', c.preferred_live,
    'brand', jsonb_build_object('name', b.name, 'instagram', b.instagram, 'website', b.website,
      'gstin', b.gstin, 'address', b.billing_address, 'country', b.country),
    'contact', jsonb_build_object('name', c.contact_name, 'email', c.contact_email),
    'creator', jsonb_build_object('name', s.display_name, 'handle', s.handle, 'city', s.city, 'app_name', s.app_name,
      'legal_name', coalesce(nullif(s.legal_name, ''), s.display_name), 'email', s.creator_email, 'pan', s.pan)
  );
end;
$$;

-- Instagram: the creator's own threads and token ---------------------------------------------
create or replace function public.ig_forget_non_collab()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
  v_me integer := public.current_creator();
begin
  if not public.is_creator() then raise exception 'Only the creator can do this.'; end if;
  select count(*) into v_n from public.ig_threads
   where creator_id = v_me and collab_id is null and (collab_flag = '' or (collab_flag = 'no' and username <> ''));
  delete from public.ig_dms d using public.ig_threads t
   where d.creator_id = v_me and t.creator_id = v_me
     and d.igsid = t.igsid and t.collab_id is null and t.collab_flag not in ('likely', 'maybe');
  delete from public.ig_threads where creator_id = v_me and collab_id is null and collab_flag = '';
  update public.ig_threads set username = '', name = '', picture = '', last_text = '', collab_hint = '', unread = 0
   where creator_id = v_me and collab_id is null and collab_flag = 'no';
  return v_n;
end;
$$;

create or replace function public.ig_not_collab(p_igsid text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_creator() then raise exception 'Only the creator can do this.'; end if;
  delete from public.ig_dms where creator_id = public.current_creator() and igsid = p_igsid;
  update public.ig_threads
     set collab_flag = 'no', collab_hint = '', username = '', name = '', picture = '', last_text = '', unread = 0, collab_id = null
   where creator_id = public.current_creator() and igsid = p_igsid;
end;
$$;

create or replace function public.ig_permissions()
returns text
language sql
stable security definer
set search_path = public
as $$
  select case when public.is_creator() then coalesce((select permissions from public.ig_token where id = public.current_creator()), '') else '' end;
$$;

-- Money, products and files ------------------------------------------------------------------
create or replace function public.invoice_claim_reject(p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.invoices;
  c public.collabs;
  s public.creator_settings;
begin
  if not public.is_creator() then raise exception 'Only the creator can do this.'; end if;
  update public.invoices set claim_amount = null, claim_ref = '', claim_on = null, claim_at = null, claim_by = '', auto_remind = true
  where id = p_invoice and creator_id = public.current_creator() returning * into i;
  if i.id is null then raise exception 'Invoice not found.'; end if;
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (i.collab_id, 'payment', format('Payment for %s not received yet. Please check the transfer.', i.number), true);
  select * into c from public.collabs where id = i.collab_id;
  select * into s from public.creator_settings where id = i.creator_id;
  insert into public.outbox (creator_id, kind, to_email, payload)
  select i.creator_id, 'payment_not_received', e, jsonb_build_object('code', c.code, 'number', i.number, 'contact', c.contact_name,
    'link', rtrim(s.site_url, '/') || '/invoice/' || i.public_token)
  from unnest(array[c.contact_email, i.send_to]) e
  where coalesce(btrim(e), '') <> '' group by e;
end;
$$;

create or replace function public.mark_product_received(p_collab uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  if not public.is_creator() then
    raise exception 'Not allowed.';
  end if;
  select * into c from public.collabs where id = p_collab;
  perform private.must_own(c.creator_id);
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = c.creator_id;

  update public.collabs set
    product_received_at = now(),
    product_date = current_date,
    draft_date = coalesce(draft_date, current_date + s.draft_days_after_product)
  where id = c.id;

  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (c.id, auth.uid(), 'product', 'Product received', true);

  if c.notify_brand and c.contact_email <> '' then
    insert into public.outbox (creator_id, kind, to_email, payload) values (c.creator_id, 'product_received', c.contact_email, jsonb_build_object(
      'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'product', c.product,
      'draft_date', coalesce(c.draft_date, current_date + s.draft_days_after_product)));
  end if;
end;
$$;

-- The studio side only for the collab's own creator; anyone else must be its brand.
create or replace function public.mark_thread_read(p_collab uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_side text;
begin
  if public.is_creator_of((select creator_id from public.collabs where id = p_collab)) then v_side := 'creator';
  elsif public.is_my_collab(p_collab) then v_side := 'brand';
  else raise exception 'Not allowed.';
  end if;
  insert into public.collab_reads (collab_id, side, read_at) values (p_collab, v_side, now())
  on conflict (collab_id, side) do update set read_at = excluded.read_at;
end;
$$;

create or replace function public.merge_brands(p_from uuid, p_into uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.brands;
  v_into public.brands;
  v_collabs int;
  v_notes public.brand_private;
begin
  if not public.is_creator() then
    raise exception 'Only the creator can merge brands';
  end if;
  if p_from is null or p_into is null or p_from = p_into then
    raise exception 'Pick two different brands';
  end if;
  select * into v_from from public.brands where id = p_from and creator_id = public.current_creator() for update;
  select * into v_into from public.brands where id = p_into and creator_id = public.current_creator() for update;
  if v_from.id is null or v_into.id is null then
    raise exception 'Brand not found';
  end if;

  update public.collabs set brand_id = p_into where brand_id = p_from;
  get diagnostics v_collabs = row_count;
  update public.collabs set referred_by = p_into where referred_by = p_from and creator_id = public.current_creator();
  update public.retainers set brand_id = p_into where brand_id = p_from;
  update public.desk_chunks set brand_id = p_into where brand_id = p_from;

  -- Brand logins and invites: the people who sign in for the duplicate now see the kept brand.
  update public.profiles set brand_id = p_into where brand_id = p_from;
  insert into public.brand_members (profile_id, brand_id, created_at)
    select profile_id, p_into, created_at from public.brand_members where brand_id = p_from
    on conflict do nothing;
  delete from public.brand_members where brand_id = p_from;
  insert into public.brand_invites (brand_id, email, name, invited_by, created_at)
    select p_into, email, name, invited_by, created_at from public.brand_invites where brand_id = p_from
    on conflict do nothing;
  delete from public.brand_invites where brand_id = p_from;

  -- Barter TDS per year: keep the kept brand's record when both have one.
  insert into public.barter_tds (brand_id, fy, status, reminded_at, updated_at)
    select p_into, fy, status, reminded_at, updated_at from public.barter_tds where brand_id = p_from
    on conflict (brand_id, fy) do nothing;
  delete from public.barter_tds where brand_id = p_from;

  -- Private notes: join them, and keep competitors from both.
  select * into v_notes from public.brand_private where brand_id = p_from;
  if v_notes.brand_id is not null then
    insert into public.brand_private (brand_id, notes, competitors)
      values (p_into, v_notes.notes, v_notes.competitors)
      on conflict (brand_id) do update set
        notes = case when excluded.notes = '' then brand_private.notes
                     when brand_private.notes = '' then excluded.notes
                     else brand_private.notes || E'\n\n' || excluded.notes end,
        competitors = (select coalesce(array_agg(distinct x), '{}') from unnest(brand_private.competitors || excluded.competitors) as x);
  end if;

  -- Fill in what the kept brand is missing from the duplicate.
  update public.brands set
    instagram = case when instagram = '' then v_from.instagram else instagram end,
    website = case when website = '' then v_from.website else website end,
    category = case when category in ('', 'Other') and v_from.category not in ('', 'Other') then v_from.category else category end
  where id = p_into;

  delete from public.brands where id = p_from;
  return jsonb_build_object('from', v_from.name, 'into', v_into.name, 'collabs', v_collabs);
end;
$$;

create or replace function public.remind_194r(p_brand uuid, p_fy text, p_total numeric)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
begin
  if not public.is_creator() then raise exception 'Only the creator can do this.'; end if;
  select * into b from public.brands where id = p_brand and creator_id = public.current_creator();
  select * into c from public.collabs where brand_id = b.id and contact_email <> '' order by created_at desc limit 1;
  if c.id is null then raise exception 'Add this brand''s email on one of its collabs first.'; end if;
  insert into public.outbox (creator_id, kind, to_email, payload)
  values (b.creator_id, 'tds_194r', c.contact_email, jsonb_build_object('brand', b.name, 'contact', c.contact_name, 'fy', p_fy, 'total', p_total, 'code', c.code));
  insert into public.barter_tds (brand_id, fy, status, reminded_at) values (p_brand, p_fy, 'reminded', now())
  on conflict (brand_id, fy) do update set status = case when public.barter_tds.status = 'deducted' then 'deducted' else 'reminded' end, reminded_at = now(), updated_at = now();
  return c.contact_email;
end;
$$;

-- Either the collab's own creator, or its brand.
create or replace function public.report_sales(p_link uuid, p_sales integer, p_revenue numeric, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.collab_links;
  c public.collabs;
  s public.creator_settings;
  v_studio boolean;
begin
  select * into l from public.collab_links where id = p_link;
  select * into c from public.collabs where id = l.collab_id;
  v_studio := public.is_creator_of(c.creator_id);
  if c.id is null or not (v_studio or (public.my_brand_id() is not null and c.brand_id = public.my_brand_id())) then
    raise exception 'Not allowed.';
  end if;
  perform private.act_for(c.creator_id);
  update public.collab_links set sales = greatest(0, coalesce(p_sales, 0)), revenue = greatest(0, coalesce(p_revenue, 0)),
    sales_note = left(coalesce(p_note, ''), 500), sales_by = case when v_studio then 'creator' else 'brand' end, sales_at = now()
  where id = l.id;
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (c.id, 'note', format('Sales from the code: %s orders, ₹%s', coalesce(p_sales, 0), to_char(coalesce(p_revenue, 0), 'FM99,99,99,999')), true);
  if not v_studio then
    select * into s from public.creator_settings where id = c.creator_id;
    insert into public.outbox (creator_id, kind, to_email, payload) values (c.creator_id, 'sales_reported', s.creator_email,
      jsonb_build_object('code', c.code, 'brand', (select name from public.brands where id = c.brand_id), 'sales', p_sales, 'revenue', p_revenue, 'note', p_note));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.request_tds_certificate(p_invoice uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.invoices;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
  v_to text;
  v_q text;
begin
  if not public.is_creator() then raise exception 'Not allowed.'; end if;
  select * into i from public.invoices where id = p_invoice and creator_id = public.current_creator();
  if i.id is null or i.tds_deducted <= 0 then raise exception 'This invoice has no TDS deducted.'; end if;
  if i.tds_certificate then raise exception 'The certificate is already marked as received.'; end if;
  if i.tds_requested_at > now() - interval '3 days' then raise exception 'Already asked in the last 3 days.'; end if;
  select * into c from public.collabs where id = i.collab_id;
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = i.creator_id;
  v_to := coalesce(nullif(btrim(b.accounts_email), ''), nullif(btrim(i.send_to), ''), nullif(btrim(c.contact_email), ''));
  if v_to is null then raise exception 'Add the brand''s accounts email first.'; end if;

  -- The quarter the TDS falls in (April to March year), e.g. "Q2 (July to September) 2026-27".
  v_q := case
    when extract(month from coalesce(i.paid_on, i.issue_date)) between 4 and 6 then 'Q1 (April to June)'
    when extract(month from coalesce(i.paid_on, i.issue_date)) between 7 and 9 then 'Q2 (July to September)'
    when extract(month from coalesce(i.paid_on, i.issue_date)) between 10 and 12 then 'Q3 (October to December)'
    else 'Q4 (January to March)' end || ' ' || public.fy_label(coalesce(i.paid_on, i.issue_date));

  update public.invoices set tds_requested_at = now() where id = i.id;
  insert into public.outbox (creator_id, kind, to_email, payload) values (i.creator_id, 'tds_cert_request', v_to, jsonb_build_object(
    'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'number', i.number, 'tds', i.tds_deducted,
    'quarter', v_q, 'pan', s.pan, 'name', coalesce(nullif(s.legal_name, ''), s.display_name), 'paid_on', i.paid_on));
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (c.id, 'note', format('Asked %s for the TDS certificate (Form 16A) for %s', b.name, i.number), true);
  return jsonb_build_object('ok', true, 'to', v_to);
end;
$$;

-- Wipe one creator's studio: only that creator's rows, and only the logins of that creator's brands.
create or replace function public.reset_studio_data(p_confirm text, p_brand_logins boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_collabs integer;
  n_brands integer;
  n_logins integer := 0;
  v_owner text;
  v_me integer := public.current_creator();
  v_logins uuid[] := '{}';
begin
  if not public.is_owner() then raise exception 'Only the owner can reset the studio.'; end if;
  if p_confirm is distinct from 'RESET' then raise exception 'Type RESET to confirm.'; end if;
  select lower(creator_email) into v_owner from public.creator_settings where id = v_me;

  -- Brand logins to remove, found before their brands go: people who sign in only for this
  -- creator's brands (with one creator, also logins with no brand at all, as before). Never a
  -- creator or anyone on a creator's team.
  if p_brand_logins then
    select coalesce(array_agg(u.id), '{}') into v_logins
    from auth.users u
    where lower(coalesce(u.email, '')) <> v_owner
      and not exists (select 1 from public.creator_settings s where lower(s.creator_email) = lower(coalesce(u.email, '')))
      and not exists (select 1 from public.team_members t where t.email = lower(coalesce(u.email, '')))
      and not exists (select 1 from public.brand_members m join public.brands b on b.id = m.brand_id
                      where m.profile_id = u.id and b.creator_id <> v_me)
      and not exists (select 1 from public.profiles p join public.brands b on b.id = p.brand_id
                      where p.id = u.id and b.creator_id <> v_me)
      and ((select count(*) from public.creator_settings) = 1
        or exists (select 1 from public.brand_members m join public.brands b on b.id = m.brand_id
                   where m.profile_id = u.id and b.creator_id = v_me)
        or exists (select 1 from public.profiles p join public.brands b on b.id = p.brand_id
                   where p.id = u.id and b.creator_id = v_me));
  end if;

  perform set_config('app.quiet', 'on', true);
  delete from public.bank_alerts where creator_id = v_me;
  -- Email action links point at a quote, a draft or a collab of this creator.
  delete from private.action_links a
  where (a.kind = 'quote' and a.ref_id in (select q.id from public.quotes q where q.creator_id = v_me))
     or (a.kind = 'draft' and a.ref_id in (select d.id from public.drafts d where d.creator_id = v_me))
     or (a.kind not in ('quote', 'draft') and a.ref_id in (select c.id from public.collabs c where c.creator_id = v_me));
  select count(*) into n_collabs from public.collabs where creator_id = v_me;
  delete from public.collabs where creator_id = v_me;
  select count(*) into n_brands from public.brands where creator_id = v_me;
  delete from public.brands where creator_id = v_me;
  delete from public.outbox where creator_id = v_me;
  delete from public.inbound_emails where creator_id = v_me;

  if p_brand_logins then
    with gone as (
      delete from auth.users u
      where u.id = any(v_logins)
      returning 1
    ) select count(*) into n_logins from gone;
  end if;
  perform set_config('app.quiet', 'off', true);

  return jsonb_build_object('collabs', n_collabs, 'brands', n_brands, 'logins', n_logins);
end;
$$;

create or replace function public.respond_usage_extension(p_collab uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
  v_ends date;
begin
  if not public.is_creator() then
    raise exception 'Not allowed.';
  end if;
  select * into c from public.collabs where id = p_collab;
  perform private.must_own(c.creator_id);
  if c.usage_ext_status <> 'requested' then
    raise exception 'There is no extension request waiting.';
  end if;
  select * into b from public.brands where id = c.brand_id;
  v_ends := greatest(c.usage_ends, current_date) + c.usage_ext_days;

  if p_approve then
    update public.collabs set
      usage_ext_status = 'approved',
      usage_ends = v_ends,
      usage_notice_at = null,
      fee = fee + c.usage_ext_price,
      pay_status = case when pay_status = 'paid' then 'advance'::public.pay_status else pay_status end,
      paid_on = case when pay_status = 'paid' then null else paid_on end
    where id = c.id;
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'usage', format('Paid usage extended to %s', to_char(v_ends, 'DD Mon YYYY')), true);
  else
    update public.collabs set usage_ext_status = 'declined' where id = c.id;
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'usage', 'Usage extension not available this time', true);
  end if;

  if c.contact_email <> '' then
    insert into public.outbox (creator_id, kind, to_email, payload) values (c.creator_id, 'usage_ext_answer', c.contact_email, jsonb_build_object(
      'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'approved', p_approve,
      'days', c.usage_ext_days, 'price', c.usage_ext_price, 'ends', v_ends));
  end if;
end;
$$;

create or replace function public.send_files(p_collab uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
  n integer;
begin
  if not public.is_creator() then raise exception 'Only the creator can do this.'; end if;
  select * into c from public.collabs where id = p_collab;
  perform private.must_own(c.creator_id);
  if c.contact_email = '' then raise exception 'Add the brand contact''s email first.'; end if;
  select count(*) into n from public.collab_files where collab_id = c.id;
  if n = 0 then raise exception 'Add a file or link first.'; end if;
  select * into b from public.brands where id = c.brand_id;
  insert into public.outbox (creator_id, kind, to_email, payload)
  values (c.creator_id, 'files_ready', c.contact_email, jsonb_build_object('code', c.code, 'brand', b.name, 'contact', c.contact_name, 'count', n));
  update public.collabs set files_sent_at = now() where id = c.id;
  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (c.id, auth.uid(), 'note', format('%s file%s sent to the brand.', n, case when n > 1 then 's' else '' end), true);
  return true;
end;
$$;

create or replace function public.send_pitch(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.pitches;
  s public.creator_settings;
begin
  if not public.is_creator() then raise exception 'Not allowed.'; end if;
  select * into p from public.pitches where id = p_id and creator_id = public.current_creator();
  if p.id is null then raise exception 'Pitch not found.'; end if;
  if coalesce(btrim(p.email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Add the brand''s email first.'; end if;
  if btrim(p.subject) = '' or btrim(p.body) = '' then raise exception 'Write the subject and the message first.'; end if;
  if p.status = 'sent' and p.sent_at > now() - interval '1 day' then raise exception 'Already sent today.'; end if;
  select * into s from public.creator_settings where id = p.creator_id;
  insert into public.outbox (creator_id, kind, to_email, payload) values (p.creator_id, 'pitch', p.email, jsonb_build_object(
    'subject', p.subject, 'body', p.body, 'name', s.display_name, 'contact', p.contact_name, 'brand', p.brand_name));
  update public.pitches set status = 'sent', sent_at = now(), followups = 0, next_follow_on = current_date + 5 where id = p.id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.send_reminders(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  c record;
  inv public.invoices;
  q public.quotes;
  d public.drafts;
  n_pay integer := 0;
  n_quote integer := 0;
  n_draft integer := 0;
  n_skip integer := 0;
begin
  if not public.is_creator() then
    raise exception 'Only the creator can send reminders.';
  end if;
  select * into s from public.creator_settings where id = public.current_creator();

  for c in
    select x.*, b.name as brand_name from public.collabs x join public.brands b on b.id = x.brand_id
    where x.id = any(p_ids) and x.creator_id = s.id and x.stage not in ('paused', 'cancelled')
  loop
    inv := null; q := null; d := null;
    select * into inv from public.invoices
    where collab_id = c.id and status in ('sent', 'partly_paid') order by due_date nulls last limit 1;
    if inv.id is null then
      select * into q from public.quotes where collab_id = c.id and status = 'sent' order by version desc limit 1;
      if q.id is null then
        select * into d from public.drafts where collab_id = c.id and status = 'pending' order by round desc limit 1;
      end if;
    end if;

    if inv.id is not null and coalesce(inv.last_reminded_at, '-infinity') < now() - interval '1 day'
       and (c.contact_email <> '' or coalesce(inv.send_to, '') <> '') then
      insert into public.outbox (creator_id, kind, to_email, payload)
      select s.id, 'payment_reminder', e, jsonb_build_object(
        'code', c.code, 'number', inv.number, 'contact', c.contact_name, 'due', inv.due_date,
        'days_late', coalesce(current_date - inv.due_date, 0),
        'due_amount', greatest(0, inv.payable - inv.amount_received),
        'link', rtrim(s.site_url, '/') || '/invoice/' || inv.public_token)
      from (select distinct btrim(e) as e from unnest(array[c.contact_email, inv.send_to]) e where btrim(coalesce(e, '')) <> '') r;
      update public.invoices set last_reminded_at = now() where id = inv.id;
      insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
      values (c.id, auth.uid(), 'reminder', format('Payment reminder sent for %s', inv.number), true);
      n_pay := n_pay + 1;
    elsif q.id is not null and coalesce(q.nudged_at, '-infinity') < now() - interval '1 day' and c.contact_email <> '' then
      insert into public.outbox (creator_id, kind, to_email, payload) values (s.id, 'quote_nudge', c.contact_email, jsonb_build_object(
        'code', c.code, 'brand', c.brand_name, 'contact', c.contact_name, 'total', q.total));
      update public.quotes set nudged_at = now() where id = q.id;
      insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
      values (c.id, auth.uid(), 'reminder', format('Reminder sent about quote v%s', q.version), true);
      n_quote := n_quote + 1;
    elsif d.id is not null and coalesce(d.nudged_at, '-infinity') < now() - interval '1 day' and c.contact_email <> '' then
      insert into public.outbox (creator_id, kind, to_email, payload) values (s.id, 'draft_nudge', c.contact_email, jsonb_build_object(
        'code', c.code, 'brand', c.brand_name, 'contact', c.contact_name, 'round', d.round));
      update public.drafts set nudged_at = now() where id = d.id;
      insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
      values (c.id, auth.uid(), 'reminder', format('Reminder sent about draft %s', d.round), true);
      n_draft := n_draft + 1;
    else
      n_skip := n_skip + 1;
    end if;
  end loop;

  return jsonb_build_object('payment', n_pay, 'quote', n_quote, 'draft', n_draft, 'skipped', n_skip);
end;
$$;

create or replace function public.send_track_links(p_ids uuid[], p_notify boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  n integer := 0;
  skipped integer := 0;
begin
  if not public.is_creator() then raise exception 'Only the creator can do this.'; end if;
  for c in
    select x.*, b.name as brand_name from public.collabs x join public.brands b on b.id = x.brand_id
    where x.id = any(p_ids) and x.creator_id = public.current_creator() and x.stage <> 'declined'
  loop
    if coalesce(c.contact_email, '') = '' then
      skipped := skipped + 1;
      continue;
    end if;
    update public.collabs set track_sent_at = now(), notify_brand = notify_brand or p_notify where id = c.id;
    insert into public.outbox (creator_id, kind, to_email, payload) values (c.creator_id, 'track_invite', c.contact_email, jsonb_build_object(
      'code', c.code, 'brand', c.brand_name, 'contact', c.contact_name, 'token', c.track_token, 'stage', public.stage_label(c.stage),
      'deliverables', (select string_agg(qty || ' × ' || kind, ', ' order by position) from public.deliverables where collab_id = c.id)));
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'note', 'Tracking link sent to the brand.', true);
    n := n + 1;
  end loop;
  return jsonb_build_object('sent', n, 'no_email', skipped);
end;
$$;

create or replace function public.start_retainer(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_creator() then raise exception 'Not allowed.'; end if;
  -- With no id the private step runs every monthly deal; a studio call runs only its own one.
  perform private.must_own((select r.creator_id from public.retainers r where r.id = p_id));
  return private.run_retainers(p_id);
end;
$$;

-- Team and sign-in ---------------------------------------------------------------------------
create or replace function public.studio_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  t public.team_members;
  v_me integer := public.current_creator();
  -- Every creator this person works for, to switch between.
  v_creators jsonb := coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'handle', s.handle, 'name', s.display_name) order by s.id)
    from public.creator_settings s where s.id in (select public.my_creators())), '[]'::jsonb);
begin
  if public.is_owner() then
    return jsonb_build_object('role', 'creator', 'email', v_email, 'team_role', 'owner',
      'creator_id', v_me, 'creators', v_creators);
  end if;
  select * into t from public.team_members where creator_id = v_me and email = v_email;
  if t.email is not null then
    update public.team_members set last_seen_at = now() where creator_id = v_me and email = v_email;
    return jsonb_build_object('role', 'creator', 'email', v_email, 'team_role', t.role, 'name', t.name,
      'creator_id', v_me, 'creators', v_creators);
  end if;
  return null;
end;
$$;

create or replace function public.studio_transfer(p_email text, p_keep_me boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new text := lower(btrim(coalesce(p_email, '')));
  v_old text;
  v_me integer := public.current_creator();
begin
  if not public.is_owner() then
    raise exception 'Only the owner can change the sign-in email.';
  end if;
  if v_new !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That doesn''t look like an email address.';
  end if;
  select lower(creator_email) into v_old from public.creator_settings where id = v_me;
  if v_new = v_old then
    raise exception 'That is already the sign-in email.';
  end if;

  -- The new owner isn't also a team member.
  delete from public.team_members where creator_id = v_me and email = v_new;
  if p_keep_me then
    insert into public.team_members (creator_id, email, name, role, copy_emails)
    values (v_me, v_old, 'Previous owner', 'manager', true)
    on conflict (creator_id, email) do nothing;
  end if;

  update public.creator_settings set creator_email = v_new where id = v_me;
  return jsonb_build_object('owner', v_new, 'kept', p_keep_me);
end;
$$;

create or replace function public.team_set_copies(p_on boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.team_members set copy_emails = p_on
  where creator_id = public.current_creator() and email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- Brand side: a brand works with the creator its brand belongs to -----------------------------
create or replace function public.brand_invite(p_email text, p_name text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  me public.profiles;
  b public.brands;
  existing uuid;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or public.my_brand_id() is null then raise exception 'Sign in to your brand first.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Type a full email address.'; end if;
  if v_email = lower(me.email) then raise exception 'That''s you.'; end if;
  if (select count(*) from public.brand_invites where brand_id = public.my_brand_id()) >= 20 then raise exception 'That''s a lot of people. Remove someone first.'; end if;
  select * into b from public.brands where id = public.my_brand_id();

  insert into public.brand_invites (brand_id, email, name, invited_by)
  values (b.id, v_email, left(btrim(coalesce(p_name, '')), 80), coalesce(nullif(me.full_name, ''), me.email))
  on conflict (brand_id, email) do update set name = excluded.name;
  -- Already has a login: add them now.
  select id into existing from public.profiles where lower(email) = v_email;
  if existing is not null then
    insert into public.brand_members (profile_id, brand_id) values (existing, b.id) on conflict do nothing;
  end if;

  insert into public.outbox (creator_id, kind, to_email, payload) values (b.creator_id, 'brand_invite', v_email, jsonb_build_object(
    'brand', b.name, 'name', btrim(coalesce(p_name, '')), 'by', coalesce(nullif(me.full_name, ''), me.email)));
end;
$$;

create or replace function public.brand_mark_shipped(p_code text, p_carrier text, p_tracking text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
  s public.creator_settings;
  v_carrier text := left(btrim(coalesce(p_carrier, '')), 40);
  v_tracking text := left(btrim(coalesce(p_tracking, '')), 60);
begin
  select * into c from public.collabs where upper(code) = upper(p_code) and brand_id = public.my_brand_id();
  if c.id is null then
    raise exception 'Request not found.';
  end if;
  if c.type = 'paid' or c.stage not in ('confirmed', 'creating', 'live') then
    raise exception 'This request is not ready for shipping yet.';
  end if;
  if c.product_received_at is not null then
    raise exception 'The product has already been received.';
  end if;
  if v_carrier = '' then
    raise exception 'Choose the courier.';
  end if;
  perform private.act_for(c.creator_id);
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = c.creator_id;

  update public.collabs set
    ship_carrier = v_carrier,
    ship_tracking = v_tracking,
    shipped_at = now(),
    product_date = coalesce(product_date, current_date + 3)
  where id = c.id;

  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (c.id, auth.uid(), 'product',
    'Product shipped via ' || v_carrier || case when v_tracking <> '' then ' (' || v_tracking || ')' else '' end, true);

  insert into public.outbox (creator_id, kind, to_email, payload) values (c.creator_id, 'product_shipped', s.creator_email, jsonb_build_object(
    'code', c.code, 'brand', b.name, 'product', c.product, 'carrier', v_carrier, 'tracking', v_tracking));
end;
$$;

create or replace function public.my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
  b public.brands;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    return null;
  end if;

  if public.is_creator() then
    return jsonb_build_object('role', 'creator', 'email', v_email, 'creator_id', public.current_creator());
  end if;

  select * into p from public.profiles where id = auth.uid();
  if p.id is null then
    insert into public.profiles (id, email) values (auth.uid(), v_email) returning * into p;
  end if;

  if v_email <> '' then
    insert into public.brand_members (profile_id, brand_id)
    select distinct auth.uid(), c.brand_id from public.collabs c where lower(c.contact_email) = v_email
    on conflict do nothing;
  end if;
  if p.brand_id is not null then
    insert into public.brand_members (profile_id, brand_id) values (auth.uid(), p.brand_id) on conflict do nothing;
  else
    update public.profiles set brand_id = (
      select m.brand_id from public.brand_members m where m.profile_id = auth.uid() order by m.created_at limit 1)
    where id = auth.uid() returning * into p;
  end if;

  select * into b from public.brands where id = p.brand_id;

  return jsonb_build_object(
    'role', 'brand',
    'email', p.email,
    'full_name', p.full_name,
    'phone', p.phone,
    'brand', case when b.id is null then null else jsonb_build_object(
      'id', b.id, 'name', b.name, 'instagram', b.instagram, 'website', b.website, 'category', b.category) end,
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by lower(x.name))
      from public.brand_members m join public.brands x on x.id = m.brand_id
      where m.profile_id = auth.uid()), '[]'::jsonb)
  );
end;
$$;

-- A QR code goes only on a collab of the creator it belongs to.
create or replace function public.qr_attach(p_code text, p_slug text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  q uuid;
begin
  select x.id into q from public.qr_codes x
  where x.slug = lower(btrim(p_slug))
    and x.creator_id = (select c.creator_id from public.collabs c where c.code = p_code and c.brand_id = public.my_brand_id());
  if q is null then return false; end if;
  update public.collabs set qr_id = q
  where code = p_code and brand_id = public.my_brand_id() and qr_id is null
    and created_at > now() - interval '1 day';
  return found;
end $$;

create or replace function public.register_brand(p_name text, p_instagram text, p_website text, p_category text, p_full_name text, p_phone text, p_new boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand uuid;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    raise exception 'The creator account cannot be used as a brand.';
  end if;

  p_name := btrim(coalesce(p_name, ''));
  p_full_name := btrim(coalesce(p_full_name, ''));
  if p_name = '' or char_length(p_name) > 120 then
    raise exception 'Add your brand name.';
  end if;
  if p_full_name = '' then
    raise exception 'Add your name so we know who to reply to.';
  end if;

  select brand_id into v_brand from public.profiles where id = auth.uid();

  if v_brand is null or p_new then
    select count(*) into v_count from public.brand_members where profile_id = auth.uid();
    if v_count >= 25 then
      raise exception 'One login can manage up to 25 brands.';
    end if;
    -- A new brand belongs to the creator whose page it signs up on.
    insert into public.brands (creator_id, name, instagram, website, category)
    values (private.page_creator(), p_name, left(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', ''), 60),
            left(btrim(coalesce(p_website, '')), 200), left(coalesce(nullif(p_category, ''), 'Other'), 40))
    returning id into v_brand;
    insert into public.brand_members (profile_id, brand_id) values (auth.uid(), v_brand) on conflict do nothing;
  else
    update public.brands
    set name = p_name,
        instagram = left(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', ''), 60),
        website = left(btrim(coalesce(p_website, '')), 200),
        category = left(coalesce(nullif(p_category, ''), 'Other'), 40)
    where id = v_brand;
  end if;

  update public.profiles
  set brand_id = v_brand,
      full_name = left(p_full_name, 120),
      phone = left(btrim(coalesce(p_phone, '')), 30)
  where id = auth.uid();

  return public.my_account();
end;
$$;

create or replace function public.request_usage_extension(p_code text, p_days integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
  s public.creator_settings;
  v_price numeric;
begin
  select * into c from public.collabs where upper(code) = upper(p_code) and brand_id = public.my_brand_id();
  if c.id is null or c.usage_ends is null then
    raise exception 'This collaboration has no paid usage to extend.';
  end if;
  if p_days not in (30, 60, 90) then
    raise exception 'Choose 30, 60 or 90 days.';
  end if;
  if c.usage_ext_status = 'requested' then
    raise exception 'You have already asked for an extension. You will hear back soon.';
  end if;
  perform private.act_for(c.creator_id);
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = c.creator_id;
  v_price := public.usage_ext_price(c.id, p_days);

  update public.collabs set usage_ext_status = 'requested', usage_ext_days = p_days, usage_ext_price = v_price where id = c.id;
  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (c.id, auth.uid(), 'usage', format('Asked to extend paid usage by %s days (₹%s)', p_days, to_char(v_price, 'FM99,99,99,999')), true);
  insert into public.outbox (creator_id, kind, to_email, payload) values (c.creator_id, 'usage_ext_requested', s.creator_email, jsonb_build_object(
    'code', c.code, 'brand', b.name, 'days', p_days, 'price', v_price, 'ends', c.usage_ends));
end;
$$;

create or replace function public.respond_draft(p_draft uuid, p_approve boolean, p_feedback text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collabs;
  me public.profiles;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select x.* into c from public.collabs x join public.drafts d on d.collab_id = x.id where d.id = p_draft;
  if c.id is null or public.my_brand_id() is null or c.brand_id <> public.my_brand_id() then
    raise exception 'Draft not found.';
  end if;
  select * into me from public.profiles where id = auth.uid();
  -- The steps that follow work for the collab's creator.
  perform private.act_for(c.creator_id);
  return private.draft_response(p_draft, p_approve, p_feedback, coalesce(nullif(me.full_name, ''), me.email), auth.uid());
end;
$$;

create or replace function public.respond_quote(p_quote uuid, p_accept boolean, p_name text default '', p_note text default '', p_option integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collabs;
  me public.profiles;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select x.* into c from public.collabs x join public.quotes q on q.collab_id = x.id where q.id = p_quote;
  if c.id is null or public.my_brand_id() is null or c.brand_id <> public.my_brand_id() then
    raise exception 'Quote not found.';
  end if;
  select * into me from public.profiles where id = auth.uid();
  -- The steps that follow work for the collab's creator.
  perform private.act_for(c.creator_id);
  if p_accept then perform private.quote_pick(p_quote, p_option); end if;
  return private.quote_response(p_quote, p_accept, coalesce(nullif(btrim(p_name), ''), me.full_name), p_note, me.email, auth.uid());
end;
$$;

-- A referral comes from another brand of the same creator.
create or replace function public.set_referral(p_code text, p_ref text)
returns jsonb
language plpgsql
security definer
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
  select * into r from public.brands where ref_code = lower(btrim(p_ref)) and creator_id = c.creator_id;
  if r.id is null or r.id = c.brand_id then return jsonb_build_object('ok', false); end if;
  update public.collabs set referred_by = r.id where id = c.id;
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (c.id, 'note', format('Referred by %s', r.name), false);
  return jsonb_build_object('ok', true, 'by', r.name);
end;
$$;

create or replace function public.ship_info(p_code text)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  c public.collabs;
  s public.creator_settings;
  ok boolean;
begin
  select * into c from public.collabs where upper(code) = upper(p_code) and brand_id = public.my_brand_id();
  if c.id is null then
    return null;
  end if;
  select * into s from public.creator_settings where id = c.creator_id;
  -- Experiences (a stay, a meal, an event) have nothing to ship: no address for those.
  ok := c.type <> 'paid' and c.barter_kind = 'product' and c.stage in ('confirmed', 'creating', 'live');
  return jsonb_build_object(
    'needs_product', c.type <> 'paid' and c.barter_kind = 'product',
    'experience', c.barter_kind = 'experience',
    'can_ship', ok and c.product_received_at is null,
    'address_ready', s.ship_address <> '',
    'name', case when ok then coalesce(nullif(s.ship_name, ''), s.display_name) end,
    'address', case when ok then s.ship_address end,
    'phone', case when ok then s.ship_phone end,
    'product', c.product,
    'carrier', c.ship_carrier,
    'tracking', c.ship_tracking,
    'shipped_at', c.shipped_at,
    'received_at', c.product_received_at);
end;
$$;

create or replace function public.submit_request(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  me public.profiles;
  b public.brands;
  v_type public.collab_type;
  v_value numeric;
  v_id uuid;
  v_code text;
  d jsonb;
  pos integer := 0;
  recent integer;
  deliv_text text;
  first_name text;
  pk public.packages;
  v_fee numeric;
  v_kind text;
  v_low boolean := false;
  v_lang text := '';
  l text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    raise exception 'The creator account cannot send requests.';
  end if;

  -- The request goes to the creator the brand belongs to (no brand yet: the page's creator).
  select * into me from public.profiles where id = auth.uid();
  select * into b from public.brands where id = me.brand_id;
  select * into s from public.creator_settings where id = coalesce(b.creator_id, private.page_creator());
  first_name := split_part(s.display_name, ' ', 1);
  if not s.accepting then
    raise exception '% is fully booked right now and not taking new requests.', s.display_name;
  end if;

  if me.brand_id is null then
    raise exception 'Add your brand details first.';
  end if;
  perform private.act_for(s.id);

  select count(*) into recent
  from public.collabs
  where brand_id = me.brand_id and source = 'brand_page' and created_at > now() - interval '1 day';
  if recent >= 5 then
    raise exception 'You have sent 5 requests today. Please try again tomorrow.';
  end if;

  begin
    v_type := coalesce(nullif(p ->> 'type', ''), 'paid')::public.collab_type;
  exception when others then
    raise exception 'Choose a type of collaboration.';
  end;

  if jsonb_typeof(p -> 'deliverables') is distinct from 'array' then
    raise exception 'Choose at least one deliverable.';
  end if;
  -- Only content types she has switched on.
  if exists (
    select 1 from jsonb_array_elements(p -> 'deliverables') x
    where coalesce(nullif(x ->> 'qty', '')::integer, 0) > 0 and not (btrim(x ->> 'kind') = any(s.offered_kinds))
  ) then
    raise exception '% isn''t offering some of that content right now. Please choose from the options shown.', first_name;
  end if;
  -- Barter can be a product they send, or an experience (a stay, a meal, an event, a service).
  v_kind := case when p ->> 'barter_kind' = 'experience' then 'experience' else 'product' end;
  if v_type <> 'paid' and btrim(coalesce(p ->> 'product', '')) = '' then
    raise exception '%', case when v_kind = 'experience' then 'Tell us what you are offering (the stay, meal or event).' else 'Tell us which product you will send.' end;
  end if;

  -- One of her packages? Its price is the fee unless the brand offered more.
  if nullif(p ->> 'package_id', '') is not null then
    select * into pk from public.packages where id = (p ->> 'package_id')::uuid and creator_id = s.id and active;
    if pk.id is null then
      raise exception 'That package is no longer available. Please choose the content you need.';
    end if;
    v_type := 'paid';
  end if;
  v_fee := greatest(0, coalesce(nullif(p ->> 'fee', '')::numeric, 0));
  if pk.id is not null then
    v_fee := greatest(v_fee, pk.price);
  end if;

  -- Content language: one or more of the languages she creates in ("Kannada", or "English + Kannada").
  if jsonb_typeof(p -> 'content_language') = 'array' then
    for l in select btrim(x) from jsonb_array_elements_text(p -> 'content_language') x loop
      if l <> '' then
        if not (l = any(s.content_languages)) then
          raise exception '% doesn''t create content in % right now. Please choose from the languages shown.', first_name, l;
        end if;
        v_lang := v_lang || case when v_lang = '' then '' else ' + ' end || l;
      end if;
    end loop;
  end if;

  -- Barter rules.
  v_value := greatest(0, coalesce(nullif(p ->> 'product_value', '')::numeric, 0));
  if v_type = 'barter' and s.barter_mode = 'closed' then
    raise exception '% is taking paid collaborations only right now. Choose Paid, or Paid + product.', first_name;
  end if;
  -- Below her barter minimum: still accepted, reviewed last (the brand was told on the form).
  v_low := v_type = 'barter' and s.barter_min_value > 0 and v_value < s.barter_min_value;

  insert into public.collabs (
    brand_id, source, contact_name, contact_email, contact_phone, type, fee, product, product_value,
    usage, brief, brief_details, preferred_live, note_for_brand, package_name, created_by, barter_kind, content_language)
  values (
    me.brand_id, 'brand_page', me.full_name, me.email, me.phone, v_type,
    case when v_type = 'barter' then 0 else v_fee end,
    case when v_type = 'paid' then '' else left(btrim(p ->> 'product'), 200) end,
    case when v_type = 'paid' then 0 else v_value end,
    left(coalesce(nullif(p ->> 'usage', ''), 'Organic only'), 60),
    left(coalesce(p ->> 'brief', ''), 4000),
    public.clean_brief(p -> 'brief_details'),
    nullif(p ->> 'preferred_live', '')::date,
    case when v_low
      then format('Thanks for reaching out! %s reviews paid collaborations first, and barter offers below ₹%s are reviewed last, so a reply may take longer than %s. Adding a fee gets a faster answer.', first_name, to_char(s.barter_min_value, 'FM99,99,99,999'), s.barter_reply_time)
      when v_type = 'barter'
      then format('Thanks for reaching out! %s reviews paid collaborations first, so barter requests usually get a reply within %s.', first_name, s.barter_reply_time)
      else format('Thanks for reaching out! %s will review your request and reply within %s.', first_name, s.reply_time) end,
    coalesce(pk.name, ''),
    auth.uid(),
    case when v_type = 'paid' then 'product' else v_kind end,
    left(v_lang, 60))
  returning id, code into v_id, v_code;

  for d in select * from jsonb_array_elements(p -> 'deliverables') loop
    if coalesce(nullif(d ->> 'qty', '')::integer, 0) > 0 and btrim(coalesce(d ->> 'kind', '')) <> '' then
      insert into public.deliverables (collab_id, kind, qty, position)
      values (v_id, left(btrim(d ->> 'kind'), 40), least(50, (d ->> 'qty')::integer), pos);
      pos := pos + 1;
    end if;
  end loop;
  if pos = 0 then
    raise exception 'Choose at least one deliverable.';
  end if;

  select string_agg(qty || ' × ' || kind, ', ' order by position) into deliv_text
  from public.deliverables where collab_id = v_id;

  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (v_id, auth.uid(), 'stage', 'Request received', true);

  insert into public.outbox (creator_id, kind, to_email, payload) values
  (s.id, 'request_received_brand', me.email, jsonb_build_object(
     'code', v_code, 'brand', b.name, 'contact', me.full_name, 'deliverables', deliv_text)),
  (s.id, 'request_received_creator', s.creator_email, jsonb_build_object(
     'code', v_code, 'brand', b.name, 'contact', me.full_name, 'email', me.email, 'phone', me.phone,
     'type', v_type, 'fee', (select fee from public.collabs where id = v_id),
     'product', (select product from public.collabs where id = v_id),
     'deliverables', deliv_text, 'package', coalesce(pk.name, ''), 'brief', left(coalesce(p ->> 'brief', ''), 600), 'language', v_lang));

  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;
