-- Safety: report a brand or creator, block them, and limits that slow down spam from new accounts.
-- Creators report brands (and block them: no more requests or messages); brands report creators (and
-- block them: no messages, and they drop out of Discover and pools). Three reports from different people
-- in 30 days pause an account until an admin looks. New brands (no finished collab, Instagram not
-- connected) have lower daily limits. Admins see it all in the panel's Safety tab.

-- 1. Tables -------------------------------------------------------------------------------------------------------
create table if not exists public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  by_side text not null check (by_side in ('creator', 'brand')),
  by_creator integer references public.creator_settings (id) on delete set null,
  by_login uuid,
  by_email text not null default '',
  by_name text not null default '',
  target_kind text not null check (target_kind in ('brand', 'creator')),
  target_owner uuid,
  target_brand uuid references public.brands (id) on delete set null,
  target_creator integer references public.creator_settings (id) on delete set null,
  target_name text not null default '',
  collab_id uuid references public.collabs (id) on delete set null,
  reason text not null check (reason in ('pay_to_work', 'fake', 'not_paid', 'abuse', 'spam', 'not_posted', 'fake_followers', 'no_approval', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  auto_paused boolean not null default false,
  status text not null default 'open' check (status in ('open', 'done')),
  outcome text not null default '',
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists safety_reports_owner_idx on public.safety_reports (target_owner, created_at desc);
create index if not exists safety_reports_creator_idx on public.safety_reports (target_creator, created_at desc);

create table if not exists public.safety_blocks (
  id uuid primary key default gen_random_uuid(),
  -- Who blocked: the creator (blocking a brand) or a brand company (blocking a creator).
  side text not null check (side in ('creator', 'brand')),
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  owner uuid,
  brand_id uuid references public.brands (id) on delete cascade,
  name text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists safety_blocks_one on public.safety_blocks
  (side, creator_id, coalesce(owner, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- The limits, editable in the admin panel. trusted_v null: the same for everyone.
create table if not exists public.app_limits (
  key text primary key,
  new_v integer not null check (new_v between 0 and 100000),
  trusted_v integer check (trusted_v between 0 and 100000),
  sort integer not null default 0
);
insert into public.app_limits (key, new_v, trusted_v, sort) values
  ('requests_day', 10, 50, 1),
  ('messages_hour', 30, 120, 2),
  ('open_briefs', 1, 5, 3),
  ('questions_day', 2, null, 4),
  ('signups_hour', 5, null, 5),
  ('auto_pause', 3, null, 6)
on conflict (key) do nothing;

-- Emails and UPI IDs of closed accounts: they can't sign up again or be sent in a message.
create table if not exists public.banned (
  kind text not null check (kind in ('email', 'upi')),
  value text not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (kind, value)
);

-- Sign-ups by network, and limits people ran into (for the Safety tab).
create table if not exists public.safety_events (
  id bigint generated always as identity primary key,
  kind text not null check (char_length(kind) <= 40),
  who text not null default '' check (char_length(who) <= 200),
  at timestamptz not null default now()
);
create index if not exists safety_events_idx on public.safety_events (kind, who, at desc);

alter table public.brand_profiles add column if not exists paused_at timestamptz;
alter table public.brand_profiles add column if not exists closed_at timestamptz;

alter table public.safety_reports enable row level security;
alter table public.safety_blocks enable row level security;
alter table public.app_limits enable row level security;
alter table public.banned enable row level security;
alter table public.safety_events enable row level security;
revoke all on public.safety_reports, public.safety_blocks, public.app_limits, public.banned, public.safety_events from anon, authenticated;

-- 2. Helpers --------------------------------------------------------------------------------------------------------
create or replace function private.limit_of(p_key text, p_trusted boolean)
returns integer
language sql stable security definer
set search_path = public
as $$
  select case when p_trusted and l.trusted_v is not null then l.trusted_v else l.new_v end from public.app_limits l where l.key = p_key;
$$;

-- A brand is trusted once it has finished a collab or connected Instagram.
create or replace function private.brand_trusted(p_owner uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.brand_ig g where g.owner = p_owner)
    or exists (select 1 from private.company_collabs(p_owner) c where c.stage = 'wrapped');
$$;

-- The company (owner login) behind a creator's brand row, when it has signed in.
create or replace function private.company_of_brand(p_brand uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select private.owner_of(m.profile_id) from public.brand_members m where m.brand_id = p_brand order by m.created_at limit 1;
$$;

create or replace function private.client_ip()
returns text
language sql stable
set search_path = ''
as $$
  select btrim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'cf-connecting-ip',
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for', ''), ',', 1));
$$;

-- Why a brand login can't act right now (null when it can).
create or replace function private.brand_stop(p_owner uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.banned b where b.kind = 'email' and b.value = public.jwt_email()) then 'This account was closed.'
    when f.closed_at is not null then 'This account was closed.'
    when f.paused_at is not null then 'Your account is paused while we look into a report. Reply to our email if you think this is a mistake.'
    when f.closing_at is not null then 'Your company is being deleted. Bring it back in Settings first.'
  end
  from (select 1) x left join public.brand_profiles f on f.owner = p_owner;
$$;

revoke execute on function private.limit_of(text, boolean) from public, anon, authenticated;
revoke execute on function private.brand_trusted(uuid) from public, anon, authenticated;
revoke execute on function private.company_of_brand(uuid) from public, anon, authenticated;
revoke execute on function private.client_ip() from public, anon, authenticated;
revoke execute on function private.brand_stop(uuid) from public, anon, authenticated;

-- 3. Where limits and blocks apply -------------------------------------------------------------------------------------
-- A brand sending a request.
create or replace function private.safety_new_request()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_stop text;
  v_trusted boolean;
  v_max integer;
  v_new integer;
begin
  if auth.uid() is null or public.is_creator() then
    return new;
  end if;
  v_owner := private.owner_of(auth.uid());
  v_stop := private.brand_stop(v_owner);
  if v_stop is not null then
    raise exception '%', v_stop;
  end if;
  if exists (select 1 from public.safety_blocks b where b.side = 'creator' and b.creator_id = new.creator_id
             and (b.owner = v_owner or b.brand_id = new.brand_id)) then
    raise exception 'This creator isn''t taking requests from you.';
  end if;
  -- New creators a day (writing again to someone you work with doesn't count).
  if not exists (select 1 from private.company_collabs(v_owner) c where c.creator_id = new.creator_id and c.id <> new.id) then
    v_trusted := private.brand_trusted(v_owner);
    v_max := private.limit_of('requests_day', v_trusted);
    select count(*) into v_new from (
      select c.creator_id from private.company_collabs(v_owner) c group by c.creator_id
      having min(c.created_at) >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')) x;
    if v_new >= v_max then
      raise exception '%', case when v_trusted
        then format('LIMIT:requests_day:You''ve written to %s new creators today. You can send more from 12 am.', v_max)
        else format('LIMIT:requests_day:That''s %s new creators today. New brands can write to %s a day; connect Instagram or finish your first collab and it goes up to %s. You can send more from 12 am.',
          v_max, v_max, private.limit_of('requests_day', true)) end;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.safety_new_request() from public, anon, authenticated;
drop trigger if exists "2_safety_new_request" on public.collabs;
create trigger "2_safety_new_request" before insert on public.collabs for each row execute function private.safety_new_request();

-- A message in a collab's chat.
create or replace function private.safety_message()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_brand uuid;
  v_stop text;
  v_max integer;
begin
  if auth.uid() is null then
    return new;
  end if;
  select c.brand_id into v_brand from public.collabs c where c.id = new.collab_id;
  if new.sender = 'brand' then
    v_owner := private.owner_of(auth.uid());
    v_stop := private.brand_stop(v_owner);
    if v_stop is not null then
      raise exception '%', v_stop;
    end if;
    if exists (select 1 from public.safety_blocks b where b.side = 'creator' and b.creator_id = new.creator_id
               and (b.owner = v_owner or b.brand_id = v_brand)) then
      raise exception 'This creator isn''t taking messages from you.';
    end if;
    v_max := private.limit_of('messages_hour', private.brand_trusted(v_owner));
  else
    v_owner := private.company_of_brand(v_brand);
    if v_owner is not null and exists (select 1 from public.safety_blocks b where b.side = 'brand' and b.creator_id = new.creator_id and b.owner = v_owner) then
      raise exception 'This brand isn''t taking messages from you.';
    end if;
    v_max := private.limit_of('messages_hour', true);
  end if;
  if (select count(*) from public.collab_messages m where m.author = auth.uid() and m.created_at > now() - interval '1 hour') >= v_max then
    raise exception 'LIMIT:messages_hour:You''ve sent a lot of messages this hour. Try again in a little while.';
  end if;
  if exists (select 1 from public.banned b where b.kind = 'upi' and position(b.value in lower(new.body)) > 0) then
    raise exception 'This message can''t be sent.';
  end if;
  return new;
end;
$$;
revoke execute on function private.safety_message() from public, anon, authenticated;
drop trigger if exists "1_safety_message" on public.collab_messages;
create trigger "1_safety_message" before insert on public.collab_messages for each row execute function private.safety_message();

-- Opening a brief for applications.
create or replace function private.safety_open_brief()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_stop text;
  v_trusted boolean;
  v_max integer;
begin
  if not new.open or coalesce(old.open, false) then
    return new;
  end if;
  v_stop := private.brand_stop(new.owner);
  if v_stop is not null then
    raise exception '%', v_stop;
  end if;
  v_trusted := private.brand_trusted(new.owner);
  v_max := private.limit_of('open_briefs', v_trusted);
  if (select count(*) from public.brand_campaigns k where k.owner = new.owner and k.open and k.id <> new.id) >= v_max then
    raise exception '%', case when v_trusted
      then format('LIMIT:open_briefs:You can have %s open briefs at a time. Close one first.', v_max)
      else format('LIMIT:open_briefs:New brands can have %s open brief at a time. Close it first, or connect Instagram to have up to %s.', v_max, private.limit_of('open_briefs', true)) end;
  end if;
  return new;
end;
$$;
revoke execute on function private.safety_open_brief() from public, anon, authenticated;
drop trigger if exists "1_safety_open_brief" on public.brand_campaigns;
create trigger "1_safety_open_brief" before update of open on public.brand_campaigns for each row execute function private.safety_open_brief();

-- A question from the creator's page.
create or replace function private.safety_question()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_max integer := private.limit_of('questions_day', false);
begin
  if exists (select 1 from public.banned b where b.kind = 'email' and b.value = lower(new.email)) then
    raise exception 'This account was closed.';
  end if;
  if (select count(*) from public.brand_questions q where q.creator_id = new.creator_id and lower(q.email) = lower(new.email)
      and q.created_at > now() - interval '1 day') >= v_max then
    raise exception 'LIMIT:questions_day:You''ve sent % questions today. You''ll get a reply by email soon.', v_max;
  end if;
  return new;
end;
$$;
revoke execute on function private.safety_question() from public, anon, authenticated;
drop trigger if exists "1_safety_question" on public.brand_questions;
create trigger "1_safety_question" before insert on public.brand_questions for each row execute function private.safety_question();

-- Signing up, as a brand or a creator: a few an hour from one network, and never a closed account's email.
create or replace function private.safety_signup()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ip text := private.client_ip();
  v_email text := public.jwt_email();
begin
  -- Not a sign-up: a company made for an older brand that is being deleted.
  if current_setting('app.no_signup_check', true) = 'on' then
    return new;
  end if;
  if v_email <> '' and exists (select 1 from public.banned b where b.kind = 'email' and b.value = v_email) then
    raise exception 'This email can''t be used on Miracle.';
  end if;
  if v_ip <> '' then
    if (select count(*) from public.safety_events e where e.kind = 'signup' and e.who = v_ip and e.at > now() - interval '1 hour')
       >= private.limit_of('signups_hour', false) then
      raise exception 'LIMIT:signups_hour:Lots of sign-ups from this network just now. Try again in an hour.';
    end if;
    insert into public.safety_events (kind, who) values ('signup', v_ip);
  end if;
  return new;
end;
$$;
revoke execute on function private.safety_signup() from public, anon, authenticated;
drop trigger if exists "1_safety_signup" on public.brand_profiles;
create trigger "1_safety_signup" before insert on public.brand_profiles for each row execute function private.safety_signup();
drop trigger if exists "1_safety_signup" on public.creator_settings;
create trigger "1_safety_signup" before insert on public.creator_settings for each row
  when (auth.uid() is not null) execute function private.safety_signup();

-- A limit the person ran into (the error rolls back anything the database writes, so the app tells us).
create or replace function public.safety_hit(p_kind text)
returns void
language sql security definer
set search_path = public
as $$
  insert into public.safety_events (kind, who)
  select 'hit:' || p_kind, coalesce(nullif(public.jwt_email(), ''), private.client_ip(), '')
  where p_kind in ('requests_day', 'messages_hour', 'open_briefs', 'questions_day', 'signups_hour')
    and (select count(*) from public.safety_events e where e.kind = 'hit:' || p_kind
         and e.who = coalesce(nullif(public.jwt_email(), ''), private.client_ip(), '') and e.at > now() - interval '1 hour') < 20;
$$;
revoke execute on function public.safety_hit(text) from public;
grant execute on function public.safety_hit(text) to anon, authenticated;

-- 4. Report and block -----------------------------------------------------------------------------------------------
create or replace function public.safety_report(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_reason text := coalesce(p ->> 'reason', '');
  v_details text := left(btrim(coalesce(p ->> 'details', '')), 1000);
  v_block boolean := coalesce((p ->> 'block')::boolean, false);
  v_collab uuid := nullif(p ->> 'collab_id', '')::uuid;
  v_brand uuid := nullif(p ->> 'brand_id', '')::uuid;
  v_creator integer := nullif(p ->> 'creator_id', '')::integer;
  v_me integer;
  v_owner uuid;
  v_name text;
  c public.collabs;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if (select count(*) from public.safety_reports r where r.by_login = auth.uid() and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'You''ve sent a lot of reports today. We''re looking at them.';
  end if;

  if public.is_creator() then
    -- A creator reporting a brand: one of her own brands (or the brand on one of her collabs).
    v_me := public.current_creator();
    if v_collab is not null then
      select * into c from public.collabs where id = v_collab and creator_id = v_me;
      if c.id is null then raise exception 'That request isn''t yours.'; end if;
      v_brand := c.brand_id;
    end if;
    select b.name into v_name from public.brands b where b.id = v_brand and b.creator_id = v_me;
    if v_name is null then raise exception 'Pick the brand to report.'; end if;
    if v_reason not in ('pay_to_work', 'fake', 'not_paid', 'abuse', 'spam', 'other') then raise exception 'Pick what''s wrong.'; end if;
    v_owner := private.company_of_brand(v_brand);
    insert into public.safety_reports (by_side, by_creator, by_login, by_email, by_name, target_kind, target_owner, target_brand, target_name, collab_id, reason, details)
    values ('creator', v_me, auth.uid(), public.jwt_email(), (select display_name from public.creator_settings where id = v_me),
      'brand', v_owner, v_brand, v_name, v_collab, v_reason, v_details);
    if v_block then
      perform public.safety_block(jsonb_build_object('brand_id', v_brand, 'collab_id', v_collab));
    end if;
    return jsonb_build_object('ok', true, 'blocked', v_block);
  end if;

  -- A brand reporting a creator it works with, or one it found in Discover.
  v_owner := public.brand_owner();
  if v_collab is not null then
    select k.* into c from private.company_collabs(v_owner) k where k.id = v_collab;
    if c.id is null then raise exception 'That request isn''t yours.'; end if;
    v_creator := c.creator_id;
  end if;
  select s.display_name into v_name from public.creator_settings s where s.id = v_creator and s.status in ('active', 'paused');
  if v_name is null then raise exception 'Pick the creator to report.'; end if;
  if v_reason not in ('not_posted', 'fake_followers', 'no_approval', 'abuse', 'spam', 'other') then raise exception 'Pick what''s wrong.'; end if;
  insert into public.safety_reports (by_side, by_login, by_email, by_name, target_kind, target_creator, target_name, collab_id, reason, details)
  values ('brand', auth.uid(), public.jwt_email(), coalesce((select f.name from public.brand_profiles f where f.owner = v_owner), ''),
    'creator', v_creator, v_name, v_collab, v_reason, v_details);
  if v_block then
    perform public.safety_block(jsonb_build_object('creator_id', v_creator));
  end if;
  return jsonb_build_object('ok', true, 'blocked', v_block);
end;
$$;
revoke execute on function public.safety_report(jsonb) from public, anon;
grant execute on function public.safety_report(jsonb) to authenticated;

create or replace function public.safety_block(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_brand uuid := nullif(p ->> 'brand_id', '')::uuid;
  v_creator integer := nullif(p ->> 'creator_id', '')::integer;
  v_me integer;
  v_name text;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    v_me := public.current_creator();
    select b.name into v_name from public.brands b where b.id = v_brand and b.creator_id = v_me;
    if v_name is null then raise exception 'Pick the brand to block.'; end if;
    insert into public.safety_blocks (side, creator_id, owner, brand_id, name)
    values ('creator', v_me, private.company_of_brand(v_brand), v_brand, v_name)
    on conflict do nothing;
    -- Their open requests move to Declined.
    update public.collabs set stage = 'declined' where creator_id = v_me and brand_id = v_brand and stage in ('request', 'negotiating');
    return public.my_blocks();
  end if;
  v_owner := public.brand_owner();
  -- From one of the company's requests: the creator it's with.
  if v_creator is null and nullif(p ->> 'collab_id', '') is not null then
    select k.creator_id into v_creator from private.company_collabs(v_owner) k where k.id = (p ->> 'collab_id')::uuid;
  end if;
  select s.display_name into v_name from public.creator_settings s where s.id = v_creator;
  if v_name is null then raise exception 'Pick the creator to block.'; end if;
  insert into public.safety_blocks (side, creator_id, owner, name)
  values ('brand', v_creator, v_owner, v_name)
  on conflict do nothing;
  return public.my_blocks();
end;
$$;
revoke execute on function public.safety_block(jsonb) from public, anon;
grant execute on function public.safety_block(jsonb) to authenticated;

create or replace function public.safety_unblock(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if public.is_creator() then
    delete from public.safety_blocks where id = p_id and side = 'creator' and creator_id = public.current_creator();
  else
    delete from public.safety_blocks where id = p_id and side = 'brand' and owner = public.brand_owner();
  end if;
  return public.my_blocks();
end;
$$;
revoke execute on function public.safety_unblock(uuid) from public, anon;
grant execute on function public.safety_unblock(uuid) to authenticated;

create or replace function public.my_blocks()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'brand_id', b.brand_id, 'creator_id', b.creator_id,
      'photo', case when b.side = 'brand' then (select nullif(a.profile_picture_url, '') from public.ig_account a where a.id = b.creator_id and a.connected) end,
      'at', b.created_at) order by b.created_at desc), '[]'::jsonb)
  from public.safety_blocks b
  where auth.uid() is not null and (
    (public.is_creator() and b.side = 'creator' and b.creator_id = public.current_creator())
    or (not public.is_creator() and b.side = 'brand' and b.owner = public.brand_owner()));
$$;
revoke execute on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated;

-- Enough reports from different people: the account pauses itself until an admin looks.
create or replace function private.safety_auto_pause()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_n integer;
  v_paused boolean := false;
begin
  if new.target_kind = 'brand' and new.target_owner is not null then
    select count(distinct coalesce(r.by_creator::text, r.by_login::text)) into v_n from public.safety_reports r
    where r.target_owner = new.target_owner and r.created_at > now() - interval '30 days';
    if v_n >= private.limit_of('auto_pause', false) then
      update public.brand_profiles set paused_at = now() where owner = new.target_owner and paused_at is null and closed_at is null;
      v_paused := found;
    end if;
  elsif new.target_kind = 'creator' and new.target_creator is not null then
    select count(distinct coalesce(r.by_creator::text, r.by_login::text)) into v_n from public.safety_reports r
    where r.target_creator = new.target_creator and r.created_at > now() - interval '30 days';
    if v_n >= private.limit_of('auto_pause', false) then
      update public.creator_settings set status = 'paused' where id = new.target_creator and status = 'active';
      v_paused := found;
    end if;
  end if;
  if v_paused then
    update public.safety_reports set auto_paused = true where id = new.id;
    perform private.safety_mail_target(new.target_kind, new.target_owner, new.target_creator, 'account_paused', new.target_name);
  end if;
  return null;
end;
$$;

-- An email to the reported account: to the company's owner (from Miracle), or to the creator.
create or replace function private.safety_mail_target(p_kind text, p_owner uuid, p_creator integer, p_mail text, p_name text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_kind = 'brand' and p_owner is not null then
    insert into public.outbox (creator_id, kind, to_email, payload)
    select null, p_mail, u.email, jsonb_build_object('app', true, 'name', p_name, 'side', 'brand')
    from auth.users u where u.id = p_owner and coalesce(u.email, '') <> '';
  elsif p_kind = 'creator' and p_creator is not null then
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (p_creator, p_mail, '', jsonb_build_object('name', p_name, 'side', 'creator'));
  end if;
end;
$$;
revoke execute on function private.safety_mail_target(text, uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function private.safety_auto_pause() from public, anon, authenticated;
drop trigger if exists safety_auto_pause on public.safety_reports;
create trigger safety_auto_pause after insert on public.safety_reports for each row execute function private.safety_auto_pause();

-- 5. Where an account stands (adds "closed by Miracle" for brands) ----------------------------------------------------
create or replace function public.account_closing()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  f public.brand_profiles;
begin
  if auth.uid() is null then
    return null;
  end if;
  if public.is_creator() then
    select * into s from public.creator_settings where id = public.current_creator();
    if s.status = 'deleted' then
      return jsonb_build_object('kind', 'creator', 'state', 'deleting', 'name', s.display_name, 'erase_after', s.erase_after, 'owner', public.is_owner());
    elsif s.status = 'closed' then
      return jsonb_build_object('kind', 'creator', 'state', 'closed', 'name', s.display_name, 'owner', public.is_owner());
    end if;
    return null;
  end if;
  select * into f from public.brand_profiles where owner = public.brand_owner();
  if f.owner is null then
    return null;
  end if;
  if f.closed_at is not null then
    return jsonb_build_object('kind', 'brand', 'state', 'closed', 'name', f.name, 'owner', f.owner = auth.uid());
  elsif f.closing_at is not null then
    return jsonb_build_object('kind', 'brand', 'state', 'deleting', 'name', f.name, 'erase_after', f.erase_after, 'owner', f.owner = auth.uid());
  elsif f.paused_at is not null then
    return jsonb_build_object('kind', 'brand', 'state', 'paused', 'name', f.name, 'owner', f.owner = auth.uid());
  end if;
  return null;
end;
$$;
revoke execute on function public.account_closing() from public, anon;
grant execute on function public.account_closing() to authenticated;

-- 6. The admin panel's Safety tab ------------------------------------------------------------------------------------
create or replace function public.admin_safety()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_today timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  if not public.is_app_admin() then
    raise exception 'Only Miracle admins can see this.';
  end if;
  return jsonb_build_object(
    -- Reports, one row per reported account, open ones first.
    'targets', coalesce((select jsonb_agg(t order by t.open desc, t.last desc) from (
      select
        r.target_kind || ':' || coalesce(r.target_owner::text, r.target_creator::text, r.target_brand::text) as key,
        r.target_kind as kind,
        max(r.target_name) as name,
        bool_or(r.status = 'open') as open,
        max(r.created_at) as last,
        count(*) as reports,
        count(distinct coalesce(r.by_creator::text, r.by_login::text)) as people,
        mode() within group (order by r.reason) as reason,
        bool_or(r.auto_paused) as auto_paused,
        case r.target_kind
          when 'brand' then (select case when f.closed_at is not null then 'closed' when f.paused_at is not null then 'paused' else 'active' end
                             from public.brand_profiles f where f.owner = max(r.target_owner::text)::uuid)
          else (select s.status from public.creator_settings s where s.id = max(r.target_creator)) end as state,
        case r.target_kind
          when 'brand' then (select jsonb_build_object('email', u.email, 'joined', u.created_at,
              'instagram', exists (select 1 from public.brand_ig g where g.owner = u.id),
              'requests_2d', (select count(*) from private.company_collabs(u.id) c where c.created_at > now() - interval '2 days'))
            from auth.users u where u.id = max(r.target_owner::text)::uuid)
          else (select jsonb_build_object('email', s.creator_email, 'joined', s.created_at, 'slug', s.slug,
              'instagram', exists (select 1 from public.ig_account a where a.id = s.id and a.connected))
            from public.creator_settings s where s.id = max(r.target_creator)) end as about,
        jsonb_agg(jsonb_build_object('id', r.id, 'by', r.by_name, 'side', r.by_side, 'reason', r.reason, 'details', r.details,
          'at', r.created_at, 'status', r.status, 'outcome', r.outcome) order by r.created_at desc) as items
      from public.safety_reports r
      where r.status = 'open' or r.created_at > now() - interval '30 days'
      group by r.target_kind, coalesce(r.target_owner::text, r.target_creator::text, r.target_brand::text)
    ) t), '[]'::jsonb),
    -- Limits people ran into today.
    'hits', coalesce((select jsonb_agg(jsonb_build_object('kind', h.kind, 'who', h.who, 'n', h.n, 'last', h.last) order by h.n desc)
      from (select substr(e.kind, 5) as kind, e.who, count(*) as n, max(e.at) as last from public.safety_events e
            where e.kind like 'hit:%' and e.at >= v_today group by e.kind, e.who) h), '[]'::jsonb),
    'limits', coalesce((select jsonb_agg(jsonb_build_object('key', l.key, 'new', l.new_v, 'trusted', l.trusted_v) order by l.sort) from public.app_limits l), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.admin_safety() from public, anon;
grant execute on function public.admin_safety() to authenticated;

-- Close the account, keep it paused (and ask them), or decide it's fine.
create or replace function public.admin_safety_act(p_key text, p_action text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_kind text := split_part(p_key, ':', 1);
  v_id text := split_part(p_key, ':', 2);
  v_owner uuid;
  v_creator integer;
  v_name text;
  c record;
  r record;
begin
  if not public.is_app_admin() then
    raise exception 'Only Miracle admins can do this.';
  end if;
  -- Changes to collabs are logged with who made them (a profile).
  insert into public.profiles (id, email) values (auth.uid(), public.jwt_email()) on conflict (id) do nothing;
  if p_action not in ('close', 'keep', 'unpause') then
    raise exception 'Pick close, keep or unpause.';
  end if;
  if v_kind = 'brand' then
    v_owner := v_id::uuid;
    select f.name into v_name from public.brand_profiles f where f.owner = v_owner;
  else
    v_creator := v_id::integer;
    select s.display_name into v_name from public.creator_settings s where s.id = v_creator;
  end if;
  if v_name is null then
    -- A brand the creator added herself (no login): there's nothing to close, the report is just done.
    update public.safety_reports set status = 'done', outcome = p_action, closed_at = now()
    where status = 'open' and ((v_kind = 'brand' and (target_owner::text = v_id or target_brand::text = v_id)) or (v_kind = 'creator' and target_creator::text = v_id));
    return public.admin_safety();
  end if;

  if p_action = 'close' then
    if v_kind = 'brand' then
      update public.brand_profiles set closed_at = now(), paused_at = null where owner = v_owner;
      for c in select k.id, k.code, k.creator_id from private.company_collabs(v_owner) k where k.stage not in ('wrapped', 'declined', 'cancelled') loop
        update public.collabs set stage = 'cancelled', lifecycle_reason = 'Miracle closed this brand''s account.' where id = c.id;
      end loop;
      -- Every creator they wrote to hears about it.
      insert into public.outbox (creator_id, kind, to_email, payload)
      select distinct on (k.creator_id) k.creator_id, 'collab_closed_creator', '', jsonb_build_object('brand', v_name, 'why', 'closed', 'code', k.code)
      from private.company_collabs(v_owner) k order by k.creator_id, k.created_at desc;
      update public.brand_campaigns set open = false where owner = v_owner and open;
      insert into public.banned (kind, value, reason)
      select 'email', lower(u.email), 'Closed: ' || v_name from auth.users u where u.id in (select private.team_logins(v_owner)) and coalesce(u.email, '') <> ''
      on conflict do nothing;
      -- UPI IDs they sent creators can't be sent again.
      insert into public.banned (kind, value, reason)
      select distinct 'upi', lower(m[1]), 'Closed: ' || v_name
      from public.collab_messages x
      cross join lateral regexp_matches(x.body, '([a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,})(?![a-zA-Z.])', 'g') m
      where x.sender = 'brand' and x.author in (select private.team_logins(v_owner))
      on conflict do nothing;
      delete from public.brand_push_subscriptions where user_id in (select private.team_logins(v_owner));
    else
      update public.creator_settings set status = 'closed' where id = v_creator;
      for c in select k.id, k.code, k.contact_email, k.contact_name, b.name as brand from public.collabs k join public.brands b on b.id = k.brand_id
               where k.creator_id = v_creator and k.stage not in ('wrapped', 'declined', 'cancelled') loop
        update public.collabs set stage = 'cancelled', lifecycle_reason = 'Miracle closed this creator''s page.' where id = c.id;
        if coalesce(btrim(c.contact_email), '') <> '' then
          insert into public.outbox (creator_id, kind, to_email, payload)
          values (null, 'collab_closed', c.contact_email, jsonb_build_object('app', true, 'code', c.code, 'brand', c.brand, 'contact', c.contact_name,
            'creator', v_name, 'why', 'closed'));
        end if;
      end loop;
    end if;
    perform private.safety_mail_target(v_kind, v_owner, v_creator, 'account_closed', v_name);
  elsif p_action = 'keep' then
    if v_kind = 'brand' then
      update public.brand_profiles set paused_at = coalesce(paused_at, now()) where owner = v_owner;
    else
      update public.creator_settings set status = 'paused' where id = v_creator and status = 'active';
    end if;
    perform private.safety_mail_target(v_kind, v_owner, v_creator, 'account_paused', v_name);
  else
    if v_kind = 'brand' then
      update public.brand_profiles set paused_at = null where owner = v_owner and closed_at is null;
    else
      update public.creator_settings set status = 'active' where id = v_creator and status = 'paused';
    end if;
  end if;

  -- The people who reported hear back.
  for r in select * from public.safety_reports x
           where x.status = 'open' and ((v_kind = 'brand' and x.target_owner = v_owner) or (v_kind = 'creator' and x.target_creator = v_creator)) loop
    if r.by_side = 'creator' and r.by_creator is not null then
      insert into public.outbox (creator_id, kind, to_email, payload)
      values (r.by_creator, 'report_update', '', jsonb_build_object('name', v_name, 'outcome', p_action));
    elsif coalesce(r.by_email, '') <> '' then
      insert into public.outbox (creator_id, kind, to_email, payload)
      values (null, 'report_update', r.by_email, jsonb_build_object('app', true, 'name', v_name, 'outcome', p_action));
    end if;
  end loop;
  update public.safety_reports set status = 'done', outcome = p_action, closed_at = now()
  where status = 'open' and ((v_kind = 'brand' and target_owner = v_owner) or (v_kind = 'creator' and target_creator = v_creator));
  return public.admin_safety();
end;
$$;
revoke execute on function public.admin_safety_act(text, text) from public, anon;
grant execute on function public.admin_safety_act(text, text) to authenticated;

create or replace function public.admin_limits_set(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  k text;
begin
  if not public.is_app_admin() then
    raise exception 'Only Miracle admins can do this.';
  end if;
  for k in select jsonb_object_keys(p) loop
    update public.app_limits set
      new_v = coalesce((p -> k ->> 'new')::integer, new_v),
      trusted_v = case when trusted_v is null then null else coalesce((p -> k ->> 'trusted')::integer, trusted_v) end
    where key = k;
  end loop;
  return public.admin_safety();
end;
$$;
revoke execute on function public.admin_limits_set(jsonb) from public, anon;
grant execute on function public.admin_limits_set(jsonb) to authenticated;

select cron.unschedule('safety-cleanup') where exists (select 1 from cron.job where jobname = 'safety-cleanup');
select cron.schedule('safety-cleanup', '50 1 * * *', $$delete from public.safety_events where at < now() - interval '14 days'$$);
