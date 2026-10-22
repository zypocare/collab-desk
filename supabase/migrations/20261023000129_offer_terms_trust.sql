-- Offer check, payment terms, late-payment steps and trust scores.
--  1. Her usual payment terms (Settings › Invoices & payments) and "don't start until the advance arrives".
--  2. Offer checks: an AI reading of a brand's agreement, kept with the collab.
--  3. Payment demands: the formal letter (step 3) and the MSME complaint or legal notice (step 4).
--  4. How a brand pays, across every creator on Miracle (creators see it on a request).
--  5. How a creator delivers (brands see it in Discover and on her page).

-- 1. Payment terms ---------------------------------------------------------------------------------------
alter table public.creator_settings add column if not exists terms_advance_pct integer not null default 0;
alter table public.creator_settings add column if not exists terms_pay_days integer not null default 15;
alter table public.creator_settings add column if not exists terms_wait_advance boolean not null default false;
-- Her Udyam (MSME) registration number: buyers must then pay within 45 days, with interest after that.
alter table public.creator_settings add column if not exists udyam_no text not null default '';
alter table public.creator_settings drop constraint if exists creator_settings_terms_check;
alter table public.creator_settings add constraint creator_settings_terms_check
  check (terms_advance_pct in (0, 30, 50, 100) and terms_pay_days between 0 and 90 and char_length(udyam_no) <= 40);

alter table public.quotes add column if not exists wait_advance boolean not null default false;

-- 2. Offer checks ----------------------------------------------------------------------------------------
create table if not exists public.offer_checks (
  id uuid primary key default gen_random_uuid(),
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  collab_id uuid not null references public.collabs (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- What was read: {"name": "agreement.pdf", "kind": "pdf" | "photo" | "text", "pages": 2}.
  source jsonb not null default '{}',
  -- The reading: score, headline, flags, what's fine, the reply and the terms to ask for.
  result jsonb not null default '{}',
  -- She sent the reply to the brand.
  sent_at timestamptz
);
create index if not exists offer_checks_collab_idx on public.offer_checks (collab_id, created_at desc);
alter table public.offer_checks enable row level security;
drop policy if exists "sellers manage offer checks" on public.offer_checks;
create policy "sellers manage offer checks" on public.offer_checks for all to authenticated
  using (creator_id = (select public.current_creator()) and (select public.team_role()) in ('owner', 'manager'))
  with check (creator_id = (select public.current_creator()) and (select public.team_role()) in ('owner', 'manager'));
grant select, insert, update, delete on public.offer_checks to authenticated;
drop trigger if exists "0_fill_creator" on public.offer_checks;
create trigger "0_fill_creator" before insert on public.offer_checks for each row execute function private.fill_creator();
drop trigger if exists "0_keep_creator" on public.offer_checks;
create trigger "0_keep_creator" before update of creator_id on public.offer_checks for each row execute function private.keep_creator();

-- 3. Payment demands -------------------------------------------------------------------------------------
create table if not exists public.payment_demands (
  id uuid primary key default gen_random_uuid(),
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  -- 3: the formal payment demand; 4: the MSME complaint or the legal notice.
  step integer not null check (step in (3, 4)),
  kind text not null check (kind in ('demand', 'msme', 'legal')),
  final_date date,
  -- How it went out: by email from Miracle, shared on WhatsApp, or downloaded to send herself.
  via text not null default 'email' check (via in ('email', 'whatsapp', 'download')),
  sent_at timestamptz not null default now()
);
create index if not exists payment_demands_invoice_idx on public.payment_demands (invoice_id, sent_at);
alter table public.payment_demands enable row level security;
drop policy if exists "money team manages payment demands" on public.payment_demands;
create policy "money team manages payment demands" on public.payment_demands for all to authenticated
  using (creator_id = (select public.current_creator()) and (select public.team_role()) in ('owner', 'manager', 'accountant'))
  with check (creator_id = (select public.current_creator()) and (select public.team_role()) in ('owner', 'manager', 'accountant'));
grant select, insert, update, delete on public.payment_demands to authenticated;
drop trigger if exists "0_fill_creator" on public.payment_demands;
create trigger "0_fill_creator" before insert on public.payment_demands for each row execute function private.fill_creator();
drop trigger if exists "0_keep_creator" on public.payment_demands;
create trigger "0_keep_creator" before update of creator_id on public.payment_demands for each row execute function private.keep_creator();

-- 4. How a brand pays ------------------------------------------------------------------------------------
-- The same company across creators: its GST number, its team's login, or its website.
create or replace function private.brand_keys(p_brand uuid)
returns text[]
language sql stable security definer
set search_path = public
as $$
  select array_remove(array[
      case when char_length(btrim(coalesce(b.gstin, ''))) = 15 then 'g:' || upper(btrim(b.gstin)) end,
      case when nullif(btrim(coalesce(b.website, '')), '') is not null
        then 'w:' || lower(regexp_replace(regexp_replace(btrim(b.website), '^[a-z]+://', '', 'i'), '^www\.|[/?#].*$', '', 'gi')) end,
      'b:' || b.id::text
    ] || coalesce((select array_agg(distinct 'o:' || private.owner_of(m.profile_id)::text) from public.brand_members m where m.brand_id = b.id), '{}'), null)
  from public.brands b where b.id = p_brand;
$$;
revoke execute on function private.brand_keys(uuid) from public, anon, authenticated;

create or replace function private.brand_pay_record(p_brand uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with keys as (select unnest(private.brand_keys(p_brand)) as k),
  same as (
    select b.id from public.brands b
    where b.id = p_brand or exists (select 1 from unnest(private.brand_keys(b.id)) bk join keys on keys.k = bk
                                    where bk not like 'b:%')
  ),
  inv as (
    select i.id, i.creator_id, i.issue_date, i.due_date, i.paid_on, i.status,
      exists (select 1 from public.bank_alerts a where a.invoice_id = i.id) as by_bank,
      exists (select 1 from public.payment_demands d where d.invoice_id = i.id and (i.paid_on is null or d.sent_at::date <= i.paid_on)) as demanded
    from public.invoices i join public.collabs c on c.id = i.collab_id
    where c.brand_id in (select id from same) and i.status in ('sent', 'partly_paid', 'paid')
      and i.issue_date >= current_date - 365
  ),
  paid as (select * from inv where status = 'paid' and paid_on is not null),
  late as (select * from inv where status <> 'paid' and coalesce(due_date, issue_date + 30) < current_date)
  select jsonb_build_object(
    'invoices', (select count(*) from paid),
    'on_time', (select count(*) from paid where paid_on <= coalesce(due_date, issue_date + 30)),
    'by_bank', (select count(*) from paid where by_bank),
    'after_demand', (select count(*) from paid where demanded),
    'late_now', (select count(*) from late),
    'creators', (select count(distinct creator_id) from inv),
    -- Days from the invoice to the money, counting invoices still unpaid past their date as at least today.
    'avg_days', (select round(avg(d)) from (
        select (paid_on - issue_date) as d from paid
        union all select (current_date - issue_date) from late) x),
    'gstin', (select nullif(upper(btrim(coalesce(b.gstin, ''))), '') from public.brands b where b.id = p_brand),
    'profile_gstin', (select nullif(upper(btrim(coalesce(p.gstin, ''))), '') from public.brand_members m
                      join public.brand_profiles p on p.owner = private.owner_of(m.profile_id) where m.brand_id = p_brand limit 1),
    'instagram', (select g.username from public.brand_members m join public.brand_ig g on g.owner = private.owner_of(m.profile_id)
                  where m.brand_id = p_brand order by g.connected_at limit 1)
  );
$$;
revoke execute on function private.brand_pay_record(uuid) from public, anon, authenticated;

-- Every brand with a request or deal still open for this creator, keyed by brand id.
create or replace function public.brand_trust_all()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(b.id, private.brand_pay_record(b.id)), '{}'::jsonb)
  from public.brands b
  where public.is_creator() and b.creator_id = public.current_creator()
    and exists (select 1 from public.collabs c where c.brand_id = b.id and c.stage not in ('declined'));
$$;
revoke execute on function public.brand_trust_all() from public, anon;
grant execute on function public.brand_trust_all() to authenticated;

-- 5. How a creator delivers ------------------------------------------------------------------------------
create or replace function private.creator_trust(p_id integer)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with done as (
    select c.id, c.created_at, c.live_date, c.source from public.collabs c
    where c.creator_id = p_id and c.stage in ('live', 'wrapped') and c.type <> 'barter'
  ),
  -- Paid in full against an invoice on Miracle.
  verified as (
    select d.id from done d
    where exists (select 1 from public.invoices i where i.collab_id = d.id and i.status = 'paid')
  ),
  -- Posted on or before the agreed day (the post's own time, from Instagram).
  posted as (
    select d.id, d.live_date, min(m.posted_at) as at from done d
    join public.collab_posts p on p.collab_id = d.id join public.ig_media m on m.id = p.media_id
    where d.live_date is not null group by d.id, d.live_date
  ),
  -- How long new requests from brands waited for her first answer (a message, a quote or a move).
  asks as (
    select c.created_at, least(
        (select min(x.created_at) from public.collab_messages x where x.collab_id = c.id and x.sender = 'creator' and not x.auto),
        (select min(q.sent_at) from public.quotes q where q.collab_id = c.id),
        (select min(e.at) from public.collab_events e where e.collab_id = c.id and e.kind = 'stage')) as answered
    from public.collabs c
    where c.creator_id = p_id and c.source <> 'manual' and c.created_at >= now() - interval '180 days'
  )
  select jsonb_build_object(
    'deals', (select count(*) from verified),
    'posted', (select count(*) from posted),
    'on_time', (select count(*) from posted where (at at time zone 'Asia/Kolkata')::date <= live_date),
    'reply_hours', (select case when count(*) >= 3 then round((percentile_cont(0.5) within group (order by extract(epoch from answered - created_at) / 3600))::numeric, 1) end
                    from asks where answered is not null and answered >= created_at)
  );
$$;
revoke execute on function private.creator_trust(integer) from public, anon, authenticated;

-- The creator card (Discover, pools, her page for brands) now carries her record.
create or replace function private.creator_card(p_id integer)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.display_name, 'niche', s.niche, 'city', s.city,
    'handle', s.handle, 'accepting', s.accepting, 'kinds', to_jsonb(s.offered_kinds), 'languages', to_jsonb(s.content_languages),
    'photo', case when a.connected then nullif(a.profile_picture_url, '') end,
    'followers', case when a.connected then a.followers end,
    'engagement', case when a.connected then a.engagement_rate end,
    'avg_views', case when a.connected then a.avg_views end,
    'trust', private.creator_trust(s.id))
  from public.creator_settings s left join public.ig_account a on a.id = s.id
  where s.id = p_id;
$$;
revoke execute on function private.creator_card(integer) from public, anon, authenticated;

-- Step 3 or 4 of getting paid: records it, emails the formal demand to the brand when asked, and notes
-- it on the collab (the brand sees it there too).
create or replace function public.payment_demand_send(p_invoice uuid, p_step integer, p_kind text, p_final date, p_via text, p_to text[], p_letter text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  i public.invoices;
  c public.collabs;
  v_id uuid;
  v_site text;
  v_to text;
begin
  select * into i from public.invoices where id = p_invoice;
  if i.id is null or i.creator_id <> public.current_creator() or public.team_role() not in ('owner', 'manager', 'accountant') then
    raise exception 'Not your invoice';
  end if;
  if i.status not in ('sent', 'partly_paid') then raise exception 'This invoice is already settled'; end if;
  if p_step not in (3, 4) or p_kind not in ('demand', 'msme', 'legal') or p_via not in ('email', 'whatsapp', 'download') then raise exception 'Bad step'; end if;
  select * into c from public.collabs where id = i.collab_id;
  insert into public.payment_demands (creator_id, invoice_id, step, kind, final_date, via)
  values (i.creator_id, i.id, p_step, p_kind, p_final, p_via) returning id into v_id;
  if p_via = 'email' then
    select site_url into v_site from public.creator_settings where id = i.creator_id;
    foreach v_to in array coalesce(p_to, '{}') loop
      if btrim(v_to) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        insert into public.outbox (creator_id, kind, to_email, payload)
        values (i.creator_id, 'payment_demand', btrim(v_to), jsonb_build_object(
          'code', c.code, 'number', i.number, 'contact', c.contact_name, 'due', i.due_date,
          'days_late', greatest(0, current_date - coalesce(i.due_date, current_date)),
          'due_amount', greatest(0, i.payable - i.amount_received), 'final_date', p_final,
          'letter', left(coalesce(p_letter, ''), 4000),
          'link', rtrim(coalesce(v_site, ''), '/') || '/invoice/' || i.public_token));
      end if;
    end loop;
  end if;
  insert into public.collab_events (creator_id, collab_id, kind, text, visible_to_brand)
  values (i.creator_id, i.collab_id, 'reminder',
    case p_kind when 'demand' then 'Formal payment demand sent for ' || i.number || coalesce(', final date ' || to_char(p_final, 'DD Mon YYYY'), '')
      when 'msme' then 'MSME complaint prepared for ' || i.number else 'Legal notice prepared for ' || i.number end,
    p_kind = 'demand');
  return v_id;
end;
$$;
revoke execute on function public.payment_demand_send(uuid, integer, text, date, text, text[], text) from public, anon;
grant execute on function public.payment_demand_send(uuid, integer, text, date, text, text[], text) to authenticated;
