-- Support: when the help centre and its AI helper don't solve it, a ticket to the people who run Miracle.
-- Anyone signed in (a creator, someone on her team, a brand) can raise one, with screenshots; the app
-- adds which phone and version. The Miracle team answers in the admin panel (Support tab). Replies reach
-- the person by email, a phone alert and Alerts; their replies reach the team by email.

create sequence if not exists public.support_ticket_no start 1001;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('public.support_ticket_no'),
  user_id uuid not null,
  email text not null default '' check (char_length(email) <= 200),
  name text not null default '' check (char_length(name) <= 120),
  side text not null default 'creator' check (side in ('creator', 'brand', 'other')),
  creator_id integer references public.creator_settings (id) on delete set null,
  brand_id uuid,
  category text not null default 'other' check (category in ('collabs', 'money', 'instagram', 'account', 'bug', 'idea', 'brand', 'other')),
  subject text not null check (char_length(subject) between 3 and 140),
  status text not null default 'open' check (status in ('open', 'waiting', 'solved')),
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  device jsonb not null default '{}',
  -- What the help centre tried first (the AI's answer, the articles it showed).
  tried jsonb not null default '{}',
  user_unread boolean not null default false,
  team_unread boolean not null default true,
  rating integer check (rating between 1 and 5),
  rating_note text not null default '' check (char_length(rating_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  solved_at timestamptz
);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, updated_at desc);
create index if not exists support_tickets_queue_idx on public.support_tickets (status, updated_at desc);
alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from anon, authenticated;

create table if not exists public.support_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  from_team boolean not null default false,
  internal boolean not null default false,
  author text not null default '' check (char_length(author) <= 120),
  body text not null default '' check (char_length(body) <= 5000),
  files jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);
alter table public.support_messages enable row level security;
revoke all on public.support_messages from anon, authenticated;

-- Screenshots: each person uploads under their own id; the Miracle team can open them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support', 'support', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;
drop policy if exists "people upload their support files" on storage.objects;
create policy "people upload their support files" on storage.objects for insert to authenticated
  with check (bucket_id = 'support' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "people and the team open support files" on storage.objects;
create policy "people and the team open support files" on storage.objects for select to authenticated
  using (bucket_id = 'support' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_app_admin())));

-- Files on a message: only paths in this person's own folder (the team's own uploads go under theirs).
create or replace function private.support_files(p_files jsonb)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('path', f ->> 'path', 'name', left(coalesce(f ->> 'name', 'file'), 120), 'type', left(coalesce(f ->> 'type', ''), 60), 'size', coalesce((f ->> 'size')::bigint, 0))), '[]'::jsonb)
  from (select f from jsonb_array_elements(case when jsonb_typeof(p_files) = 'array' then p_files else '[]'::jsonb end) f limit 4) x
  where coalesce(f ->> 'path', '') ~ ('^' || auth.uid()::text || '/[^/]{1,200}$');
$$;

-- One ticket as its owner sees it (never the team's internal notes).
create or replace function private.support_ticket_json(p_id uuid, p_team boolean)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select to_jsonb(t) - 'tried' - (case when p_team then '' else 'team_unread' end)
    || jsonb_build_object('messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'from_team', m.from_team, 'internal', m.internal, 'author', m.author, 'body', m.body, 'files', m.files, 'created_at', m.created_at) order by m.created_at)
      from public.support_messages m where m.ticket_id = t.id and (p_team or not m.internal)), '[]'::jsonb))
    || case when p_team then jsonb_build_object('tried', t.tried,
         'creator', (select jsonb_build_object('slug', s.slug, 'name', s.display_name, 'status', s.status) from public.creator_settings s where s.id = t.creator_id),
         'brand', (select jsonb_build_object('name', b.name) from public.brands b where b.id = t.brand_id),
         'others', (select count(*) from public.support_tickets o where o.user_id = t.user_id and o.id <> t.id)) else '{}'::jsonb end
  from public.support_tickets t where t.id = p_id;
$$;
revoke execute on function private.support_ticket_json(uuid, boolean) from public, anon, authenticated;

-- Tell the Miracle team (by email) about a new ticket or a reply on one.
create or replace function private.support_tell_team(p_ticket public.support_tickets, p_body text, p_new boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_admin text;
begin
  for v_admin in select a.email from public.app_admins a loop
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (null, case when p_new then 'support_new' else 'support_user_reply' end, v_admin, jsonb_build_object(
      'number', p_ticket.number, 'subject', p_ticket.subject, 'category', p_ticket.category, 'side', p_ticket.side,
      'name', p_ticket.name, 'email', p_ticket.email, 'body', left(coalesce(p_body, ''), 1500), 'id', p_ticket.id,
      'urgent', p_ticket.priority = 'urgent', 'app', true));
  end loop;
end;
$$;
revoke execute on function private.support_tell_team(public.support_tickets, text, boolean) from public, anon, authenticated;

-- Raise a ticket. p: {category, subject, body, files, device, tried, name}
create or replace function public.support_create(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_creator integer := public.current_creator();
  v_brand uuid;
  v_side text;
  v_subject text := btrim(coalesce(p ->> 'subject', ''));
  v_body text := btrim(coalesce(p ->> 'body', ''));
  v_cat text := coalesce(nullif(p ->> 'category', ''), 'other');
  t public.support_tickets;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if char_length(v_subject) < 3 then raise exception 'Say in a few words what it''s about.'; end if;
  if char_length(v_body) < 10 then raise exception 'Tell us a little more, so we can help the first time.'; end if;
  if v_cat not in ('collabs', 'money', 'instagram', 'account', 'bug', 'idea', 'brand', 'other') then v_cat := 'other'; end if;
  if (select count(*) from public.support_tickets where user_id = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'LIMIT:support:That''s 5 tickets today. Add to one of your open tickets instead.';
  end if;
  if v_creator is not null and public.team_role() is not null then
    v_side := 'creator';
  else
    v_creator := null;
    v_brand := coalesce(public.my_brand_id(), (select m.brand_id from public.brand_members m where m.profile_id = v_uid order by m.created_at limit 1));
    v_side := case when v_brand is not null or exists (select 1 from public.brand_profiles where owner = v_uid) then 'brand' else 'other' end;
  end if;
  insert into public.support_tickets (user_id, email, name, side, creator_id, brand_id, category, subject, device, tried, status, team_unread)
  values (v_uid, public.jwt_email(), left(btrim(coalesce(p ->> 'name', '')), 120), v_side, v_creator, v_brand, v_cat, left(v_subject, 140),
    case when jsonb_typeof(p -> 'device') = 'object' then p -> 'device' else '{}' end,
    case when jsonb_typeof(p -> 'tried') = 'object' then p -> 'tried' else '{}' end, 'open', true)
  returning * into t;
  insert into public.support_messages (ticket_id, from_team, author, body, files)
  values (t.id, false, t.name, left(v_body, 5000), private.support_files(p -> 'files'));
  perform private.support_tell_team(t, v_body, true);
  return private.support_ticket_json(t.id, false);
end;
$$;
revoke execute on function public.support_create(jsonb) from public, anon;
grant execute on function public.support_create(jsonb) to authenticated;

-- My tickets, newest activity first.
create or replace function public.support_mine()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'number', t.number, 'subject', t.subject, 'category', t.category, 'status', t.status,
      'user_unread', t.user_unread, 'created_at', t.created_at, 'updated_at', t.updated_at,
      'last', (select jsonb_build_object('body', left(m.body, 160), 'from_team', m.from_team, 'at', m.created_at) from public.support_messages m where m.ticket_id = t.id and not m.internal order by m.created_at desc limit 1))
    order by t.updated_at desc), '[]'::jsonb)
  from public.support_tickets t where t.user_id = auth.uid();
$$;
revoke execute on function public.support_mine() from public, anon;
grant execute on function public.support_mine() to authenticated;

-- One of my tickets (and it's read now).
create or replace function public.support_ticket(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.support_tickets where id = p_id and user_id = auth.uid()) then return null; end if;
  update public.support_tickets set user_unread = false where id = p_id and user_unread;
  return private.support_ticket_json(p_id, false);
end;
$$;
revoke execute on function public.support_ticket(uuid) from public, anon;
grant execute on function public.support_ticket(uuid) to authenticated;

-- I reply (a solved ticket opens again).
create or replace function public.support_reply(p_id uuid, p_body text, p_files jsonb default '[]')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  t public.support_tickets;
  v_files jsonb := private.support_files(p_files);
begin
  select * into t from public.support_tickets where id = p_id and user_id = auth.uid();
  if t.id is null then raise exception 'Ticket not found.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 and jsonb_array_length(v_files) = 0 then raise exception 'Write a reply first.'; end if;
  if (select count(*) from public.support_messages m join public.support_tickets x on x.id = m.ticket_id
      where x.user_id = auth.uid() and not m.from_team and m.created_at > now() - interval '1 day') >= 60 then
    raise exception 'LIMIT:support:That''s a lot of messages today. We''ll get back to you soon.';
  end if;
  insert into public.support_messages (ticket_id, from_team, author, body, files) values (t.id, false, t.name, left(btrim(coalesce(p_body, '')), 5000), v_files);
  update public.support_tickets set status = 'open', team_unread = true, updated_at = now(), solved_at = null where id = t.id returning * into t;
  perform private.support_tell_team(t, p_body, false);
  return private.support_ticket_json(t.id, false);
end;
$$;
revoke execute on function public.support_reply(uuid, text, jsonb) from public, anon;
grant execute on function public.support_reply(uuid, text, jsonb) to authenticated;

-- It's sorted (from my side), optionally with a rating.
create or replace function public.support_solved(p_id uuid, p_rating integer default null, p_note text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  update public.support_tickets set status = 'solved', solved_at = coalesce(solved_at, now()), updated_at = now(),
    rating = coalesce(case when p_rating between 1 and 5 then p_rating end, rating), rating_note = left(coalesce(nullif(btrim(p_note), ''), rating_note), 500)
  where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Ticket not found.'; end if;
  return private.support_ticket_json(p_id, false);
end;
$$;
revoke execute on function public.support_solved(uuid, integer, text) from public, anon;
grant execute on function public.support_solved(uuid, integer, text) to authenticated;

-- How many of my tickets have an answer I haven't read.
create or replace function public.support_unread()
returns integer
language sql stable security definer
set search_path = public
as $$ select count(*)::integer from public.support_tickets where user_id = auth.uid() and user_unread; $$;
revoke execute on function public.support_unread() from public, anon;
grant execute on function public.support_unread() to authenticated;

-- ------------------------------------------------------------------- the Miracle team (admin panel)
create or replace function public.admin_support(p_status text default 'open')
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then raise exception 'Only Miracle admins can see this.'; end if;
  return jsonb_build_object(
    'counts', (select jsonb_build_object('open', count(*) filter (where status = 'open'), 'waiting', count(*) filter (where status = 'waiting'),
      'solved', count(*) filter (where status = 'solved'), 'unread', count(*) filter (where team_unread), 'urgent', count(*) filter (where priority = 'urgent' and status <> 'solved'),
      'rating', round(avg(rating)::numeric, 1), 'rated', count(rating)) from public.support_tickets),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'number', t.number, 'subject', t.subject, 'category', t.category, 'status', t.status,
        'priority', t.priority, 'side', t.side, 'name', t.name, 'email', t.email, 'team_unread', t.team_unread, 'created_at', t.created_at, 'updated_at', t.updated_at,
        'creator', (select s.slug from public.creator_settings s where s.id = t.creator_id),
        'last', (select jsonb_build_object('body', left(m.body, 160), 'from_team', m.from_team, 'at', m.created_at) from public.support_messages m where m.ticket_id = t.id order by m.created_at desc limit 1))
      order by (t.priority = 'urgent') desc, t.team_unread desc, t.updated_at desc)
      from public.support_tickets t where coalesce(p_status, 'all') in ('all', t.status) or (p_status = 'unread' and t.team_unread)), '[]'::jsonb));
end;
$$;
revoke execute on function public.admin_support(text) from public, anon;
grant execute on function public.admin_support(text) to authenticated;

create or replace function public.admin_support_ticket(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then raise exception 'Only Miracle admins can see this.'; end if;
  update public.support_tickets set team_unread = false where id = p_id and team_unread;
  return private.support_ticket_json(p_id, true);
end;
$$;
revoke execute on function public.admin_support_ticket(uuid) from public, anon;
grant execute on function public.admin_support_ticket(uuid) to authenticated;

-- Answer (or a note only the team sees), and set where it stands. p_status '' keeps it as is; an answer
-- moves an open ticket to "waiting on them".
create or replace function public.admin_support_reply(p_id uuid, p_body text, p_internal boolean default false, p_status text default '', p_files jsonb default '[]')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  t public.support_tickets;
  v_body text := btrim(coalesce(p_body, ''));
  v_files jsonb := private.support_files(p_files);
  v_status text;
  v_link text;
begin
  if not public.is_app_admin() then raise exception 'Only Miracle admins can do this.'; end if;
  select * into t from public.support_tickets where id = p_id;
  if t.id is null then raise exception 'Ticket not found.'; end if;
  if v_body = '' and jsonb_array_length(v_files) = 0 then raise exception 'Write a reply first.'; end if;
  insert into public.support_messages (ticket_id, from_team, internal, author, body, files) values (t.id, true, coalesce(p_internal, false), 'Miracle support', left(v_body, 5000), v_files);
  v_status := case when p_status in ('open', 'waiting', 'solved') then p_status when coalesce(p_internal, false) then t.status else 'waiting' end;
  update public.support_tickets set status = v_status, updated_at = now(), team_unread = false,
    user_unread = case when coalesce(p_internal, false) then user_unread else true end,
    solved_at = case when v_status = 'solved' then coalesce(solved_at, now()) else null end
  where id = t.id returning * into t;
  if not coalesce(p_internal, false) then
    v_link := case when t.side = 'creator' then '/studio/help/tickets/' else '/brand/help/tickets/' end || t.id::text;
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (case when t.side = 'creator' then t.creator_id end, 'support_reply', t.email, jsonb_build_object(
      'number', t.number, 'subject', t.subject, 'name', t.name, 'body', left(v_body, 1500), 'link', v_link, 'id', t.id, 'solved', v_status = 'solved', 'app', t.side <> 'creator'));
  end if;
  return private.support_ticket_json(t.id, true);
end;
$$;
revoke execute on function public.admin_support_reply(uuid, text, boolean, text, jsonb) from public, anon;
grant execute on function public.admin_support_reply(uuid, text, boolean, text, jsonb) to authenticated;

create or replace function public.admin_support_set(p_id uuid, p_status text default '', p_priority text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then raise exception 'Only Miracle admins can do this.'; end if;
  update public.support_tickets set
    status = case when p_status in ('open', 'waiting', 'solved') then p_status else status end,
    priority = case when p_priority in ('normal', 'urgent') then p_priority else priority end,
    solved_at = case when p_status = 'solved' then coalesce(solved_at, now()) when p_status in ('open', 'waiting') then null else solved_at end,
    updated_at = now()
  where id = p_id;
  return private.support_ticket_json(p_id, true);
end;
$$;
revoke execute on function public.admin_support_set(uuid, text, text) from public, anon;
grant execute on function public.admin_support_set(uuid, text, text) to authenticated;
