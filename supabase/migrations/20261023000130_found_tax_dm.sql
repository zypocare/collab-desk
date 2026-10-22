-- Get found, the tax desk and comment-to-DM.
--  1. Her "about" line (on her page, in search results and link previews), and page views by source.
--  2. Tax: TDS section on invoices, brand PAN and TAN, and TDS she has seen in her Form 26AS / AIS.
--  3. Comment-to-DM: keyword rules, an ask/auto switch, and the log of replies.

-- 1. Get found ---------------------------------------------------------------------------------------
alter table public.creator_settings add column if not exists bio text not null default '';
alter table public.creator_settings drop constraint if exists creator_settings_bio_check;
alter table public.creator_settings add constraint creator_settings_bio_check check (char_length(bio) <= 400);

create or replace function public.page_extras()
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'content_languages', to_jsonb(s.content_languages),
    'instant_booking', s.instant_booking,
    'weeks', case when s.instant_booking then public.availability() else null end,
    'away_until', case when public.is_away() then s.away_until end,
    'demand_factor', public.demand_factor(),
    'bio', nullif(btrim(s.bio), ''))
  from public.creator_settings s where s.id = private.page_creator();
$$;

-- Views of her page a day, by where they came from (utm_source, or the referring site).
create table if not exists public.page_views (
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  day date not null default (now() at time zone 'Asia/Kolkata')::date,
  source text not null default 'direct',
  views integer not null default 0,
  primary key (creator_id, day, source)
);
alter table public.page_views enable row level security;
drop policy if exists "creator reads page views" on public.page_views;
create policy "creator reads page views" on public.page_views for select to authenticated
  using (creator_id = (select public.current_creator()) and (select public.is_creator()));
grant select on public.page_views to authenticated;

-- Counted by the web server when the page is opened (anyone can open a page).
create or replace function public.page_hit(p_slug text, p_source text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.page_views (creator_id, source, views)
  select s.id, coalesce(nullif(lower(left(regexp_replace(btrim(coalesce(p_source, '')), '[^a-zA-Z0-9._-]', '', 'g'), 40)), ''), 'direct'), 1
  from public.creator_settings s where s.slug = lower(p_slug) and s.status = 'active'
  on conflict (creator_id, day, source) do update set views = public.page_views.views + 1;
$$;
revoke execute on function public.page_hit(text, text) from public;
grant execute on function public.page_hit(text, text) to anon, authenticated;

-- Old counts go after a year.
select cron.unschedule('page-views-cleanup') where exists (select 1 from cron.job where jobname = 'page-views-cleanup');
select cron.schedule('page-views-cleanup', '40 3 * * 0', $$delete from public.page_views where day < current_date - 400$$);

-- 2. Tax ---------------------------------------------------------------------------------------------
alter table public.brands add column if not exists pan text not null default '';
alter table public.brands add column if not exists tan text not null default '';
alter table public.brands drop constraint if exists brands_pan_tan_check;
alter table public.brands add constraint brands_pan_tan_check
  check (pan ~ '^([A-Z]{5}[0-9]{4}[A-Z])?$' and tan ~ '^([A-Z]{4}[0-9]{5}[A-Z])?$') not valid;
-- Which TDS rule the brand deducts under: 194J fees (393(1) Sl. 6(iii) from 1 Apr 2026), 194C contract work.
alter table public.invoices add column if not exists tds_section text not null default '194J';
alter table public.invoices drop constraint if exists invoices_tds_section_check;
alter table public.invoices add constraint invoices_tds_section_check check (tds_section in ('194J', '194C'));
-- She found this TDS in her Form 26AS / AIS (so the credit is hers).
alter table public.invoices add column if not exists tds_seen_at timestamptz;

-- 3. Comment-to-DM -----------------------------------------------------------------------------------
alter table public.creator_settings add column if not exists comment_dm_mode text not null default 'off';
alter table public.creator_settings drop constraint if exists creator_settings_comment_dm_mode_check;
alter table public.creator_settings add constraint creator_settings_comment_dm_mode_check check (comment_dm_mode in ('off', 'ask', 'auto'));

create table if not exists public.dm_rules (
  id uuid primary key default gen_random_uuid(),
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  keyword text not null check (char_length(btrim(keyword)) between 2 and 30),
  reply text not null check (char_length(btrim(reply)) between 1 and 900),
  active boolean not null default true,
  uses integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists dm_rules_keyword_uq on public.dm_rules (creator_id, lower(btrim(keyword)));
create table if not exists public.dm_auto_log (
  id uuid primary key default gen_random_uuid(),
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  comment_id text not null,
  media_id text,
  from_username text not null default '',
  text text not null default '',
  rule_id uuid references public.dm_rules (id) on delete set null,
  reply text not null default '',
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create unique index if not exists dm_auto_log_comment_uq on public.dm_auto_log (creator_id, comment_id);
create index if not exists dm_auto_log_creator_idx on public.dm_auto_log (creator_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['dm_rules', 'dm_auto_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "creator manages %s" on public.%I', t, t);
    execute format('create policy "creator manages %s" on public.%I for all to authenticated
      using (creator_id = (select public.current_creator()) and (select public.team_role()) in (''owner'', ''manager'', ''assistant''))
      with check (creator_id = (select public.current_creator()) and (select public.team_role()) in (''owner'', ''manager'', ''assistant''))', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists "0_fill_creator" on public.%I', t);
    execute format('create trigger "0_fill_creator" before insert on public.%I for each row execute function private.fill_creator()', t);
    execute format('drop trigger if exists "0_keep_creator" on public.%I', t);
    execute format('create trigger "0_keep_creator" before update of creator_id on public.%I for each row execute function private.keep_creator()', t);
  end loop;
end $$;
