-- Monthly deals (retainers / ambassador deals): "4 Reels a month for 6 months". Each month the collab
-- for that month is created on its own, with its go-live date, and the month's invoice either goes
-- out at the start of the month or when the content goes live (the usual auto-pilot invoice).

alter table public.collabs drop constraint if exists collabs_source_check;
alter table public.collabs add constraint collabs_source_check check (source in ('brand_page', 'manual', 'email', 'retainer'));

create table if not exists public.retainers (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,
  title         text not null default '',
  deliverables  jsonb not null default '[]',   -- [{ "kind": "Reel", "qty": 2 }]
  fee           numeric(12,2) not null default 0 check (fee >= 0),   -- a month, in rupees
  starts_on     date not null default date_trunc('month', current_date)::date,  -- first month
  months        integer check (months is null or months between 1 and 36),       -- null: until stopped
  live_day      integer not null default 20 check (live_day between 1 and 28),
  invoice_when  text not null default 'live' check (invoice_when in ('start', 'live')),
  contact_name  text not null default '',
  contact_email text not null default '',
  brief         text not null default '',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.retainers enable row level security;
drop policy if exists "creator manages retainers" on public.retainers;
create policy "creator manages retainers" on public.retainers for all to authenticated
  using (public.is_creator()) with check (public.is_creator());

alter table public.collabs
  add column if not exists retainer_id uuid references public.retainers(id) on delete set null,
  add column if not exists retainer_month date;
create unique index if not exists collabs_retainer_month_idx on public.collabs (retainer_id, retainer_month) where retainer_id is not null;

-- Creates the collab for each active monthly deal's current month (and its invoice, when that's at
-- the start of the month). Safe to run any number of times: one collab per deal per month.
create or replace function private.run_retainers(p_only uuid default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r public.retainers;
  b public.brands;
  s public.creator_settings;
  m date := date_trunc('month', current_date)::date;
  k integer;
  v_id uuid;
  v_live date;
  d jsonb;
  pos integer;
  n integer := 0;
  what text;
begin
  select * into s from public.creator_settings where id = 1;
  for r in select * from public.retainers where active and (p_only is null or id = p_only) loop
    -- Which month of the deal this is (1 = the first).
    k := (extract(year from m) - extract(year from r.starts_on)) * 12 + extract(month from m) - extract(month from r.starts_on) + 1;
    continue when k < 1;
    if r.months is not null and k > r.months then
      update public.retainers set active = false where id = r.id;
      continue;
    end if;
    continue when exists (select 1 from public.collabs where retainer_id = r.id and retainer_month = m);
    select * into b from public.brands where id = r.brand_id;
    v_live := greatest(m + (r.live_day - 1), current_date);

    perform set_config('app.quiet', 'on', true);
    insert into public.collabs (brand_id, stage, type, fee, contact_name, contact_email, source, notify_brand, preferred_live, live_date,
                                brief, retainer_id, retainer_month)
    values (r.brand_id, 'confirmed', 'paid', r.fee, r.contact_name, r.contact_email, 'retainer', false, v_live, v_live,
            r.brief, r.id, m)
    returning id into v_id;
    perform set_config('app.quiet', 'off', true);

    pos := 0;
    for d in select * from jsonb_array_elements(r.deliverables) loop
      insert into public.deliverables (collab_id, kind, qty, position)
      values (v_id, coalesce(d ->> 'kind', 'Reel'), greatest(1, coalesce((d ->> 'qty')::integer, 1)), pos);
      pos := pos + 1;
    end loop;
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    values (v_id, 'note', format('Monthly deal%s with %s: month %s%s.', coalesce(' "' || nullif(r.title, '') || '"', ''), b.name, k, coalesce(' of ' || r.months, '')), false);

    -- The month's invoice now, when the deal says "invoice at the start of each month".
    if r.invoice_when = 'start' and r.fee > 0 and coalesce(b.currency, 'INR') = 'INR' and coalesce(btrim(r.contact_email), '') <> '' then
      what := coalesce((select string_agg((x ->> 'qty') || ' ' || case when (x ->> 'qty')::integer > 1 then case x ->> 'kind' when 'Story' then 'Stories' else (x ->> 'kind') || 's' end else x ->> 'kind' end, ' · ')
                        from jsonb_array_elements(r.deliverables) x), 'Content');
      insert into public.invoices (collab_id, kind, items, tax_mode, gst_rate, tds_rate, issue_date, due_date, send_to, notes, auto_remind, status)
      values (v_id, 'full',
              jsonb_build_array(jsonb_build_object('description', format('%s, %s: %s for %s', coalesce(nullif(r.title, ''), 'Monthly deal'), to_char(m, 'FMMonth YYYY'), what, b.name), 'qty', 1, 'rate', r.fee)),
              case when s.gst_registered then case when coalesce(b.state, '') <> '' and b.state = s.state then 'intra' else 'inter' end else 'none' end,
              s.gst_rate,
              coalesce((select i.tds_rate from public.invoices i join public.collabs x on x.id = i.collab_id
                        where x.brand_id = b.id and i.status not in ('draft', 'cancelled') order by i.created_at desc limit 1), 0),
              current_date, current_date + 15, coalesce(b.accounts_email, ''), '', true,
              (case when s.autopilot_invoice then 'sent' else 'draft' end)::public.invoice_status);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function private.run_retainers(uuid) from public;

-- The app starts a new deal's first month straight away (no waiting for the daily run).
create or replace function public.start_retainer(p_id uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_creator() then raise exception 'Not allowed.'; end if;
  return private.run_retainers(p_id);
end;
$$;
grant execute on function public.start_retainer(uuid) to authenticated;

select cron.unschedule('run-retainers') where exists (select 1 from cron.job where jobname = 'run-retainers');
select cron.schedule('run-retainers', '15 1 * * *', $$select private.run_retainers()$$);
