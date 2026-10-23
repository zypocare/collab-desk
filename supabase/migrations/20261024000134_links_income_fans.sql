-- Three things Beacons-style creator pages have that Miracle didn't:
-- 1. Links on her page for her followers (YouTube, her shop, a latest video), with a click count.
-- 2. Income from outside Miracle (YouTube/AdSense, affiliate, platform bonuses, UGC), in Money and the
--    tax desk, so her totals and GST limit are complete.
-- 3. A fan email list: followers join from her page, she writes to them, every email has an unsubscribe link.

-- 1. Links ---------------------------------------------------------------------------------------------
create table if not exists public.page_links (
  id uuid primary key default gen_random_uuid(),
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  url text not null check (url ~* '^https?://[^\s]+$' and char_length(url) <= 500),
  position integer not null default 0,
  active boolean not null default true,
  clicks integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists page_links_creator_idx on public.page_links (creator_id, position);
alter table public.page_links enable row level security;
drop trigger if exists "0_fill_creator" on public.page_links;
create trigger "0_fill_creator" before insert on public.page_links for each row execute function private.fill_creator();
drop trigger if exists "0_keep_creator" on public.page_links;
create trigger "0_keep_creator" before update of creator_id on public.page_links for each row execute function private.keep_creator();
drop policy if exists "page team manages links" on public.page_links;
create policy "page team manages links" on public.page_links for all to authenticated
  using (creator_id = (select public.current_creator()) and (select public.team_role()) in ('owner', 'manager', 'assistant'))
  with check (creator_id = (select public.current_creator()) and (select public.team_role()) in ('owner', 'manager', 'assistant'));

-- A tap on a link on her page (anyone, signed in or not).
create or replace function public.link_click(p_id uuid)
returns void
language sql security definer
set search_path = public
as $$
  update public.page_links set clicks = clicks + 1 where id = p_id and active and creator_id = private.page_creator();
$$;
revoke execute on function public.link_click(uuid) from public;
grant execute on function public.link_click(uuid) to anon, authenticated;

-- 2. Other income --------------------------------------------------------------------------------------
create table if not exists public.other_income (
  id uuid primary key default gen_random_uuid(),
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  received_on date not null default current_date,
  -- youtube: AdSense and YouTube payouts · affiliate: Amazon, Myntra, brand affiliate programmes ·
  -- platform: Instagram bonuses, gifts, subscriptions · ugc: content made for a brand's own page ·
  -- services: consulting, workshops, events · other
  source text not null default 'other' check (source in ('youtube', 'affiliate', 'platform', 'ugc', 'services', 'other')),
  payer text not null check (char_length(btrim(payer)) between 1 and 80),
  amount numeric(12, 2) not null check (amount > 0),
  tds numeric(12, 2) not null default 0 check (tds >= 0),
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists other_income_creator_idx on public.other_income (creator_id, received_on);
alter table public.other_income enable row level security;
drop trigger if exists "0_fill_creator" on public.other_income;
create trigger "0_fill_creator" before insert on public.other_income for each row execute function private.fill_creator();
drop trigger if exists "0_keep_creator" on public.other_income;
create trigger "0_keep_creator" before update of creator_id on public.other_income for each row execute function private.keep_creator();
drop policy if exists "money team manages other income" on public.other_income;
create policy "money team manages other income" on public.other_income for all to authenticated
  using (creator_id = (select public.current_creator()) and (select public.team_role()) in ('owner', 'manager', 'accountant'))
  with check (creator_id = (select public.current_creator()) and (select public.team_role()) in ('owner', 'manager', 'accountant'));

-- 3. Fan email list ------------------------------------------------------------------------------------
alter table public.creator_settings add column if not exists fan_list_on boolean not null default false;
alter table public.creator_settings add column if not exists fan_list_pitch text not null default '';
alter table public.creator_settings drop constraint if exists creator_settings_fan_list_pitch_check;
alter table public.creator_settings add constraint creator_settings_fan_list_pitch_check check (char_length(fan_list_pitch) <= 160);

create table if not exists public.fans (
  id uuid primary key default gen_random_uuid(),
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  email text not null check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(email) <= 200),
  name text not null default '' check (char_length(name) <= 60),
  source text not null default 'page' check (char_length(source) <= 40),
  token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  unique (creator_id, email)
);
alter table public.fans enable row level security;
drop trigger if exists "0_keep_creator" on public.fans;
create trigger "0_keep_creator" before update of creator_id on public.fans for each row execute function private.keep_creator();
-- Her team reads and removes; joining goes through fan_join (from her page), never straight in.
drop policy if exists "page team reads fans" on public.fans;
create policy "page team reads fans" on public.fans for select to authenticated
  using (creator_id = (select public.current_creator()) and (select public.team_role()) in ('owner', 'manager', 'assistant'));
drop policy if exists "page team removes fans" on public.fans;
create policy "page team removes fans" on public.fans for delete to authenticated
  using (creator_id = (select public.current_creator()) and (select public.team_role()) in ('owner', 'manager'));

create table if not exists public.fan_broadcasts (
  id uuid primary key default gen_random_uuid(),
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  sent_to integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.fan_broadcasts enable row level security;
drop policy if exists "page team reads broadcasts" on public.fan_broadcasts;
create policy "page team reads broadcasts" on public.fan_broadcasts for select to authenticated
  using (creator_id = (select public.current_creator()) and (select public.team_role()) in ('owner', 'manager', 'assistant'));

-- Joining from her page (anyone). Limits: 20 joins an hour from one address, 300 an hour per creator.
create or replace function public.fan_join(p_email text, p_name text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_creator integer := private.page_creator();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ip text := private.client_ip();
begin
  if v_creator is null or not exists (select 1 from public.creator_settings where id = v_creator and fan_list_on) then
    raise exception 'This page isn''t taking sign-ups right now.';
  end if;
  if v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 200 then
    raise exception 'Enter a valid email, like name@gmail.com.';
  end if;
  if v_ip is not null and (select count(*) from public.safety_events where kind = 'fan_join' and who = v_ip and at > now() - interval '1 hour') >= 20 then
    raise exception 'LIMIT:fan_join:Too many sign-ups from here. Try again in an hour.';
  end if;
  if (select count(*) from public.fans where creator_id = v_creator and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'LIMIT:fan_join:Too many sign-ups just now. Try again in a little while.';
  end if;
  insert into public.safety_events (kind, who) values ('fan_join', coalesce(v_ip, 'unknown'));
  insert into public.fans (creator_id, email, name) values (v_creator, v_email, left(btrim(coalesce(p_name, '')), 60))
  on conflict (creator_id, email) do update set unsubscribed_at = null, name = coalesce(nullif(excluded.name, ''), public.fans.name);
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.fan_join(text, text) from public;
grant execute on function public.fan_join(text, text) to anon, authenticated;

-- The unsubscribe link in every email (anyone with the link). Returns whose list it was.
create or replace function public.fan_unsubscribe(p_token uuid)
returns jsonb
language sql security definer
set search_path = public
as $$
  with f as (
    update public.fans set unsubscribed_at = coalesce(unsubscribed_at, now()) where token = p_token returning creator_id
  )
  select coalesce((select jsonb_build_object('ok', true, 'name', s.display_name) from f join public.creator_settings s on s.id = f.creator_id), jsonb_build_object('ok', false));
$$;
revoke execute on function public.fan_unsubscribe(uuid) from public;
grant execute on function public.fan_unsubscribe(uuid) to anon, authenticated;

-- She writes to her list: one email a day, to at most 200 people (the free email account's daily room).
create or replace function public.fan_broadcast_send(p_subject text, p_body text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_creator integer := public.current_creator();
  v_cap constant integer := 200;
  v_id uuid;
  v_n integer;
begin
  if v_creator is null or coalesce(public.team_role(), '') not in ('owner', 'manager') then
    raise exception 'Only the creator or a manager can write to the list.';
  end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 1 and 120 or char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then
    raise exception 'Add a subject (up to 120 characters) and a message (up to 4,000).';
  end if;
  if exists (select 1 from public.fan_broadcasts where creator_id = v_creator and created_at > now() - interval '20 hours') then
    raise exception 'LIMIT:fan_broadcast:One email to your list a day. Try again tomorrow.';
  end if;
  insert into public.fan_broadcasts (creator_id, subject, body) values (v_creator, btrim(p_subject), btrim(p_body)) returning id into v_id;
  insert into public.outbox (creator_id, kind, to_email, payload)
  select v_creator, 'fan_broadcast', f.email,
    jsonb_build_object('subject', btrim(p_subject), 'body', btrim(p_body), 'name', f.name, 'token', f.token, 'broadcast', v_id)
  from public.fans f
  where f.creator_id = v_creator and f.unsubscribed_at is null
  order by f.created_at
  limit v_cap;
  get diagnostics v_n = row_count;
  update public.fan_broadcasts set sent_to = v_n where id = v_id;
  return jsonb_build_object('ok', true, 'sent_to', v_n, 'cap', v_cap);
end;
$$;
revoke execute on function public.fan_broadcast_send(text, text) from public, anon;
grant execute on function public.fan_broadcast_send(text, text) to authenticated;

-- Her page: the links and whether the sign-up box shows (with her line for it).
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
    'demand_factor', public.demand_factor(),
    'bio', nullif(btrim(s.bio), ''),
    'links', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'url', l.url) order by l.position, l.created_at)
                       from public.page_links l where l.creator_id = s.id and l.active), '[]'::jsonb),
    'fan_list', case when s.fan_list_on then jsonb_build_object('pitch', nullif(btrim(s.fan_list_pitch), '')) else null end
  )
  from public.creator_settings s
  where s.id = private.page_creator();
$$;
grant execute on function public.page_extras() to anon, authenticated;
