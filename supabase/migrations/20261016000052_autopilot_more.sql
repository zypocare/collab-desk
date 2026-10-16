-- Less manual work: invoices, dates and the brand's tracking link take care of themselves, and the
-- brand nudges are on. Each is an Auto-pilot switch she can turn off.

alter table public.creator_settings
  add column if not exists autopilot_invoice boolean not null default true,
  add column if not exists autopilot_dates boolean not null default true,
  add column if not exists autopilot_track boolean not null default true,
  -- Only collabs added from now on get the tracking link automatically (no surprise emails for old ones).
  add column if not exists autopilot_track_since timestamptz not null default now();
alter table public.creator_settings alter column autopilot_nudge set default true;
update public.creator_settings set autopilot_nudge = true where id = 1;

-- ---------------------------------------------------------------------------------------------
-- Invoices: the advance when a quote with an advance is accepted, the full or balance amount when
-- the post goes live. Same amounts, dates and tax as the invoice screen. Skipped for barter, without
-- a brand email, or when she already has a draft invoice in progress.
-- ---------------------------------------------------------------------------------------------
create or replace function private.auto_invoice(p_collab uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  s public.creator_settings;
  b public.brands;
  q public.quotes;
  issued numeric := 0;
  fee numeric;
  v_kind text;
  amount numeric;
  due date;
  what text;
  label text;
  tds numeric;
begin
  select * into s from public.creator_settings where id = 1;
  if not coalesce(s.autopilot_invoice, false) then return; end if;
  select * into c from public.collabs where id = p_collab;
  if c.id is null or c.type = 'barter' or coalesce(btrim(c.contact_email), '') = '' then return; end if;
  if exists (select 1 from public.invoices where collab_id = c.id and status = 'draft') then return; end if;
  select * into b from public.brands where id = c.brand_id;
  select * into q from public.quotes where collab_id = c.id and status = 'accepted' order by created_at desc limit 1;
  fee := coalesce(nullif(c.fee, 0), q.total, 0);
  if fee <= 0 then return; end if;
  select coalesce(sum(subtotal), 0) into issued from public.invoices where collab_id = c.id and status not in ('draft', 'cancelled');

  if c.stage in ('live', 'wrapped') then
    if issued >= fee then return; end if;
    v_kind := case when issued > 0 then 'balance' else 'full' end;
    amount := fee - issued;
    due := greatest(coalesce(c.live_date, current_date) + coalesce(q.pay_days, 15), current_date + 7);
  elsif c.stage = 'confirmed' then
    if q.id is null or q.advance_pct <= 0 or q.advance_pct >= 100 or issued > 0 then return; end if;
    v_kind := 'advance';
    amount := round(fee * q.advance_pct / 100);
    due := current_date + 7;
  else
    return;
  end if;

  what := coalesce((select string_agg(d.qty || ' ' || case when d.qty > 1 then case d.kind when 'Story' then 'Stories' else d.kind || 's' end else d.kind end, ' · ' order by d.position)
                    from public.deliverables d where d.collab_id = c.id), 'Content')
          || ' for ' || b.name || ' (' || c.code || ')';
  label := case v_kind when 'advance' then 'Advance (' || q.advance_pct || '%)' when 'balance' then 'Balance' else 'Content collaboration' end;
  -- Same TDS as this brand's last invoice (brands deduct the same rate every time).
  select i.tds_rate into tds from public.invoices i join public.collabs x on x.id = i.collab_id
   where x.brand_id = c.brand_id and i.status not in ('draft', 'cancelled') order by i.created_at desc limit 1;

  insert into public.invoices (collab_id, kind, items, tax_mode, gst_rate, tds_rate, issue_date, due_date, send_to, notes, auto_remind, status)
  values (c.id, v_kind, jsonb_build_array(jsonb_build_object('description', label || ': ' || what, 'qty', 1, 'rate', amount)),
          case when s.gst_registered then case when coalesce(b.state, '') <> '' and b.state = s.state then 'intra' else 'inter' end else 'none' end,
          s.gst_rate, coalesce(tds, 0), current_date, due, coalesce(b.accounts_email, ''), '', true, 'sent');
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (c.id, 'note', 'Auto-pilot: sent the ' || case v_kind when 'advance' then 'advance invoice' when 'balance' then 'balance invoice' else 'invoice' end || '.', false);
end;
$$;
revoke execute on function private.auto_invoice(uuid) from public;

create or replace function private.collabs_auto_invoice()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.stage is distinct from old.stage and new.stage in ('confirmed', 'live') then
    perform private.auto_invoice(new.id);
  end if;
  return null;
end;
$$;
drop trigger if exists collabs_auto_invoice on public.collabs;
create trigger collabs_auto_invoice after update of stage on public.collabs
  for each row execute function private.collabs_auto_invoice();

-- ---------------------------------------------------------------------------------------------
-- Dates: on acceptance the go-live becomes the date the brand asked for; once there is a go-live,
-- the draft is due 4 days before it.
-- ---------------------------------------------------------------------------------------------
create or replace function private.collabs_auto_dates()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not coalesce((select autopilot_dates from public.creator_settings where id = 1), false) then return new; end if;
  if new.stage = 'confirmed' and old.stage is distinct from 'confirmed' and new.live_date is null
     and new.preferred_live is not null and new.preferred_live > current_date then
    new.live_date := new.preferred_live;
  end if;
  if new.live_date is not null and new.draft_date is null and new.stage in ('confirmed', 'creating') then
    new.draft_date := greatest(current_date + 1, new.live_date - 4);
  end if;
  return new;
end;
$$;
drop trigger if exists collabs_auto_dates on public.collabs;
create trigger collabs_auto_dates before update on public.collabs
  for each row execute function private.collabs_auto_dates();

-- ---------------------------------------------------------------------------------------------
-- Tracking link for collabs she adds herself: sent once there's a brand email (checked every
-- 10 minutes, so deliverables are in place by then). Only for collabs added from now on.
-- ---------------------------------------------------------------------------------------------
create or replace function private.auto_track_links()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  c record;
  n integer := 0;
begin
  select * into s from public.creator_settings where id = 1;
  if not coalesce(s.autopilot_track, false) then return 0; end if;
  for c in
    select x.*, b.name as brand_name from public.collabs x join public.brands b on b.id = x.brand_id
    where x.source <> 'brand_page' and x.track_sent_at is null and x.stage <> 'declined'
      and coalesce(btrim(x.contact_email), '') <> '' and x.created_at > s.autopilot_track_since
      and x.created_at < now() - interval '5 minutes'
  loop
    update public.collabs set track_sent_at = now(), notify_brand = true where id = c.id;
    insert into public.outbox (kind, to_email, payload) values ('track_invite', c.contact_email, jsonb_build_object(
      'code', c.code, 'brand', c.brand_name, 'contact', c.contact_name, 'token', c.track_token, 'stage', public.stage_label(c.stage),
      'deliverables', (select string_agg(qty || ' × ' || kind, ', ' order by position) from public.deliverables where collab_id = c.id)));
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    values (c.id, 'note', 'Auto-pilot: sent the brand their tracking link.', true);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function private.auto_track_links() from public;
select cron.unschedule('auto-track-links') where exists (select 1 from cron.job where jobname = 'auto-track-links');
select cron.schedule('auto-track-links', '*/10 * * * *', $$select private.auto_track_links()$$);
