-- Six features:
--  A. Away mode: automatic replies to new requests and brand messages while she's away.
--  B. Barter tax (Section 194R): per-brand, per-year status she can track.
--  C. "Book again": a thank-you with a returning-brand offer a week after a collab wraps.
--  D. Prices that follow demand: package prices go up by her % when her coming weeks are nearly full.
--  E. Three-option quotes: the brand picks one of up to three options.
--  F. Photos, PDFs and voice notes in the brand chat.

alter table public.creator_settings
  add column if not exists away_until date,
  add column if not exists away_note text not null default '',
  add column if not exists away_contact text not null default '',
  add column if not exists rebook_offer boolean not null default true,
  add column if not exists rebook_pct integer not null default 10 check (rebook_pct between 0 and 30),
  add column if not exists rebook_days integer not null default 30 check (rebook_days between 7 and 90),
  add column if not exists demand_pricing boolean not null default false,
  add column if not exists demand_pct integer not null default 15 check (demand_pct between 5 and 50);

alter table public.collabs
  add column if not exists wrapped_at timestamptz,
  add column if not exists rebook_sent_at timestamptz,
  add column if not exists loyalty_pct integer not null default 0 check (loyalty_pct between 0 and 30);

alter table public.quotes add column if not exists options jsonb check (options is null or jsonb_typeof(options) = 'array');

alter table public.collab_messages
  add column if not exists attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array'),
  add column if not exists auto boolean not null default false;

-- ---------------------------------------------------------------- A. Away mode
create or replace function public.is_away()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select s.away_until is not null and s.away_until >= current_date from public.creator_settings s where s.id = 1;
$$;
grant execute on function public.is_away() to anon, authenticated;

create or replace function private.away_text()
returns text
language sql stable security definer
set search_path = public
as $$
  select format('Thanks for your message! %s is away until %s and will reply when back.%s%s',
    split_part(s.display_name, ' ', 1), to_char(s.away_until, 'FMDD Mon'),
    case when btrim(s.away_note) <> '' then ' ' || btrim(s.away_note) else '' end,
    case when btrim(s.away_contact) <> '' then ' For anything urgent: ' || btrim(s.away_contact) || '.' else '' end)
  from public.creator_settings s where s.id = 1;
$$;

-- A new request while she's away: the brand's page shows the away note.
create or replace function private.away_on_request()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if public.is_away() then
    update public.collabs set note_for_brand = private.away_text() where id = new.id;
  end if;
  return null;
end;
$$;
drop trigger if exists collabs_away_reply on public.collabs;
create trigger collabs_away_reply after insert on public.collabs
  for each row when (new.source = 'brand_page') execute function private.away_on_request();

-- A brand message while she's away: one automatic reply per chat per away spell.
create or replace function private.away_on_message()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
begin
  if new.sender <> 'brand' or not public.is_away() then return null; end if;
  select * into s from public.creator_settings where id = 1;
  if exists (select 1 from public.collab_messages m where m.collab_id = new.collab_id and m.auto
             and m.created_at > now() - make_interval(days => greatest(1, s.away_until - current_date + 30))) then
    return null;
  end if;
  insert into public.collab_messages (collab_id, sender, author, body, auto)
  values (new.collab_id, 'creator', null, private.away_text(), true);
  return null;
end;
$$;
drop trigger if exists collab_messages_away on public.collab_messages;
create trigger collab_messages_away after insert on public.collab_messages
  for each row when (new.sender = 'brand') execute function private.away_on_message();

-- ---------------------------------------------------------------- B. Barter tax (194R)
create table if not exists public.barter_tds (
  brand_id    uuid not null references public.brands(id) on delete cascade,
  fy          text not null check (fy ~ '^\d{4}-\d{2}$'),
  status      text not null default '' check (status in ('', 'reminded', 'deducted')),
  reminded_at timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (brand_id, fy)
);
alter table public.barter_tds enable row level security;
drop policy if exists "creator manages barter tds" on public.barter_tds;
create policy "creator manages barter tds" on public.barter_tds for all to authenticated
  using (public.is_creator()) with check (public.is_creator());

-- Remind a brand (their latest contact) that 194R applies to what they gave her this year.
create or replace function public.remind_194r(p_brand uuid, p_fy text, p_total numeric)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
begin
  if not public.is_creator() then raise exception 'Only the creator can do this.'; end if;
  select * into b from public.brands where id = p_brand;
  select * into c from public.collabs where brand_id = p_brand and contact_email <> '' order by created_at desc limit 1;
  if c.id is null then raise exception 'Add this brand''s email on one of its collabs first.'; end if;
  insert into public.outbox (kind, to_email, payload)
  values ('tds_194r', c.contact_email, jsonb_build_object('brand', b.name, 'contact', c.contact_name, 'fy', p_fy, 'total', p_total, 'code', c.code));
  insert into public.barter_tds (brand_id, fy, status, reminded_at) values (p_brand, p_fy, 'reminded', now())
  on conflict (brand_id, fy) do update set status = case when public.barter_tds.status = 'deducted' then 'deducted' else 'reminded' end, reminded_at = now(), updated_at = now();
  return c.contact_email;
end;
$$;
revoke execute on function public.remind_194r(uuid, text, numeric) from anon;

-- ---------------------------------------------------------------- C. Book again
create or replace function private.collabs_wrapped_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.stage = 'wrapped' and old.stage is distinct from 'wrapped' then new.wrapped_at := now(); end if;
  return new;
end;
$$;
drop trigger if exists collabs_wrapped_at on public.collabs;
create trigger collabs_wrapped_at before update of stage on public.collabs
  for each row execute function private.collabs_wrapped_at();

-- Daily: a week after a wrap, thank the brand and offer to book again (with her returning-brand %).
create or replace function private.rebook_offers()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  r record;
  n integer := 0;
begin
  select * into s from public.creator_settings where id = 1;
  if not s.rebook_offer then return 0; end if;
  for r in
    select c.id, c.code, c.contact_name, c.contact_email, b.name as brand
    from public.collabs c join public.brands b on b.id = c.brand_id
    where c.stage = 'wrapped' and c.rebook_sent_at is null and c.contact_email <> ''
      and c.wrapped_at between now() - interval '21 days' and now() - interval '7 days'
      and not exists (select 1 from public.collabs x where x.brand_id = c.brand_id and x.id <> c.id and x.created_at > c.wrapped_at)
  loop
    insert into public.outbox (kind, to_email, payload) values ('rebook_offer', r.contact_email, jsonb_build_object(
      'code', r.code, 'brand', r.brand, 'contact', r.contact_name, 'pct', s.rebook_pct,
      'until', to_char(current_date + s.rebook_days, 'FMDD Mon YYYY'),
      'link', rtrim(s.site_url, '/') || '/brand/new?again=' || r.code));
    update public.collabs set rebook_sent_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
select cron.unschedule('rebook-offers') where exists (select 1 from cron.job where jobname = 'rebook-offers');
select cron.schedule('rebook-offers', '30 4 * * *', $$select private.rebook_offers()$$);

-- The brand's returning-brand offer for a past collab (if it's theirs and still valid).
create or replace function public.rebook_offer(p_code text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when c.id is not null and s.rebook_pct > 0 and c.rebook_sent_at is not null
              and c.rebook_sent_at + make_interval(days => s.rebook_days) >= now()
         then jsonb_build_object('pct', s.rebook_pct, 'until', (c.rebook_sent_at + make_interval(days => s.rebook_days))::date) end
  from public.creator_settings s
  left join public.collabs c on upper(c.code) = upper(btrim(p_code)) and c.brand_id = public.my_brand_id()
  where s.id = 1;
$$;
grant execute on function public.rebook_offer(text) to authenticated;

-- After sending a request "again": mark the new request with the returning-brand discount.
create or replace function public.claim_rebook(p_new text, p_old text)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  o jsonb := public.rebook_offer(p_old);
  v integer;
begin
  if o is null then return 0; end if;
  v := (o ->> 'pct')::integer;
  update public.collabs set loyalty_pct = v where upper(code) = upper(p_new) and brand_id = public.my_brand_id() and loyalty_pct = 0;
  if found then
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    select id, 'note', format('Returning brand: %s%% off this collab (from %s).', v, upper(p_old)), true from public.collabs where upper(code) = upper(p_new);
  end if;
  return v;
end;
$$;
grant execute on function public.claim_rebook(text, text) to authenticated;

-- ---------------------------------------------------------------- D. Prices that follow demand
-- Her next 4 weeks at least 75% booked (her weekly capacity): packages cost her % more.
create or replace function public.demand_factor()
returns numeric
language sql stable security definer
set search_path = public
as $$
  select case when s.demand_pricing and (
      select count(*) from public.collabs c
      where c.stage in ('confirmed', 'creating', 'live')
        and coalesce(c.live_date, c.draft_date, c.preferred_live) >= date_trunc('week', current_date)::date
        and coalesce(c.live_date, c.draft_date, c.preferred_live) < date_trunc('week', current_date)::date + 28
    ) >= 0.75 * s.weekly_capacity * 4
    then 1 + s.demand_pct / 100.0 else 1 end
  from public.creator_settings s where s.id = 1;
$$;
grant execute on function public.demand_factor() to anon, authenticated;

create or replace function private.collabs_demand_price()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_price numeric;
  f numeric := public.demand_factor();
begin
  if f > 1 and new.package_name <> '' then
    select price into v_price from public.packages where name = new.package_name and active order by position limit 1;
    if v_price is not null then new.fee := greatest(new.fee, ceil(v_price * f / 500) * 500); end if;
  end if;
  return new;
end;
$$;
drop trigger if exists collabs_demand_price on public.collabs;
create trigger collabs_demand_price before insert on public.collabs
  for each row when (new.source = 'brand_page') execute function private.collabs_demand_price();

-- Her page's extras: languages, instant booking weeks, away, demand pricing.
create or replace function public.page_extras()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'content_languages', to_jsonb(s.content_languages),
    'instant_booking', s.instant_booking,
    'weeks', case when s.instant_booking then public.availability() else null end,
    'away_until', case when public.is_away() then s.away_until end,
    'demand_factor', public.demand_factor())
  from public.creator_settings s where s.id = 1;
$$;
grant execute on function public.page_extras() to anon, authenticated;

-- ---------------------------------------------------------------- E. Three-option quotes
-- The brand picks an option: the quote becomes that option (its content and price), then is accepted.
create or replace function private.quote_pick(p_quote uuid, p_option integer)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  q public.quotes;
  o jsonb;
begin
  if p_option is null then return; end if;
  select * into q from public.quotes where id = p_quote;
  if q.options is null or p_option < 0 or p_option >= jsonb_array_length(q.options) then return; end if;
  o := q.options -> p_option;
  update public.quotes set
    items = coalesce(o -> 'items', items),
    usage = coalesce(o ->> 'usage', usage),
    usage_fee = coalesce((o ->> 'usage_fee')::numeric, 0),
    discount = coalesce((o ->> 'discount')::numeric, 0),
    notes = btrim(concat_ws(E'\n', nullif(notes, ''), format('Option chosen: %s', o ->> 'title')))
  where id = p_quote and status = 'sent';
end;
$$;

drop function if exists public.respond_quote(uuid, boolean, text, text);
create or replace function public.respond_quote(p_quote uuid, p_accept boolean, p_name text default '', p_note text default '', p_option integer default null)
returns jsonb
language plpgsql security definer
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
  if p_accept then perform private.quote_pick(p_quote, p_option); end if;
  return private.quote_response(p_quote, p_accept, coalesce(nullif(btrim(p_name), ''), me.full_name), p_note, me.email, auth.uid());
end;
$$;
grant execute on function public.respond_quote(uuid, boolean, text, text, integer) to authenticated;

-- The one-tap email link, with the chosen option.
create or replace function public.action_pick(p_token text, p_option integer)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  a private.action_links;
begin
  select * into a from private.action_links where token = p_token;
  if a.token is null or a.kind <> 'quote' or a.used_at is not null or a.expires_at < now() then return; end if;
  perform private.quote_pick(a.ref_id, p_option);
end;
$$;
grant execute on function public.action_pick(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------- F. Chat attachments
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat', 'chat', false, 26214400)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "creator manages chat files" on storage.objects;
create policy "creator manages chat files" on storage.objects for all to authenticated
  using (bucket_id = 'chat' and public.is_creator())
  with check (bucket_id = 'chat' and public.is_creator());
drop policy if exists "brand reads own chat files" on storage.objects;
create policy "brand reads own chat files" on storage.objects for select to authenticated
  using (bucket_id = 'chat' and public.is_my_collab(((storage.foldername(name))[1])::uuid));
drop policy if exists "brand adds own chat files" on storage.objects;
create policy "brand adds own chat files" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and public.is_my_collab(((storage.foldername(name))[1])::uuid));
