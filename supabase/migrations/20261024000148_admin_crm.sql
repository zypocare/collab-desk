-- The admin panel as a CRM, part 1: an audit trail of every admin action, saved list views, notes on any
-- record, one list function behind every list screen, record pages for creators, brand logins and brand
-- workspaces, global search and the dashboard. Everything here is for Miracle's admins only.
--
-- * admin_audit: append-only. Nobody can change or delete a row, admins included.
-- * The admin actions that already exist (creator status, safety, limits, problems, support) now write
--   to it: each is moved to private.* unchanged and the public name logs, then calls it.
-- * admin_list(kind, ...) filters, sorts and pages one kind of record; the rows come from
--   private.admin_rows(kind), so a new list screen is one more branch there.

-- 1. The audit trail -------------------------------------------------------------------------------
create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin text not null,
  action text not null,
  kind text not null,
  record text not null default '',
  label text not null default '',
  before jsonb,
  after jsonb,
  reason text not null default ''
);
create index if not exists admin_audit_at_idx on public.admin_audit (at desc);
create index if not exists admin_audit_record_idx on public.admin_audit (kind, record, at desc);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;

create or replace function private.admin_audit_frozen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'The audit trail can''t be changed.';
end;
$$;
drop trigger if exists admin_audit_frozen on public.admin_audit;
create trigger admin_audit_frozen before update or delete on public.admin_audit for each row execute function private.admin_audit_frozen();
revoke execute on function private.admin_audit_frozen() from public, anon, authenticated;

create or replace function private.admin_log(p_action text, p_kind text, p_record text, p_label text default '',
  p_before jsonb default null, p_after jsonb default null, p_reason text default '')
returns void
language sql security definer
set search_path = public
as $$
  insert into public.admin_audit (admin, action, kind, record, label, before, after, reason)
  values (coalesce(nullif(public.jwt_email(), ''), 'system'), p_action, p_kind, coalesce(p_record, ''), left(coalesce(p_label, ''), 200),
    p_before, p_after, left(btrim(coalesce(p_reason, '')), 500));
$$;
revoke execute on function private.admin_log(text, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;

-- 2. Saved views and notes ----------------------------------------------------------------------------
create table if not exists public.admin_saved_views (
  id uuid primary key default gen_random_uuid(),
  admin text not null,
  list text not null,
  name text not null check (char_length(name) between 1 and 60),
  filters jsonb not null default '{}',
  q text not null default '',
  sort text not null default '',
  sort_desc boolean not null default true,
  created_at timestamptz not null default now(),
  unique (admin, list, name)
);
alter table public.admin_saved_views enable row level security;
revoke all on public.admin_saved_views from anon, authenticated;

create table if not exists public.admin_notes (
  id bigint generated always as identity primary key,
  kind text not null,
  record text not null,
  body text not null check (char_length(body) between 1 and 4000),
  admin text not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_notes_record_idx on public.admin_notes (kind, record, created_at desc);
alter table public.admin_notes enable row level security;
revoke all on public.admin_notes from anon, authenticated;

create or replace function private.admin_check()
returns void
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Only Miracle admins can do this.';
  end if;
end;
$$;
revoke execute on function private.admin_check() from public, anon, authenticated;

create or replace function public.admin_views(p_list text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'filters', v.filters, 'q', v.q, 'sort', v.sort, 'desc', v.sort_desc) order by v.created_at)
    from public.admin_saved_views v where v.admin = public.jwt_email() and v.list = p_list), '[]'::jsonb);
end;
$$;

create or replace function public.admin_view_save(p_list text, p_name text, p_filters jsonb default '{}', p_q text default '', p_sort text default '', p_desc boolean default true)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Name the view.'; end if;
  if jsonb_typeof(coalesce(p_filters, '{}')) <> 'object' then raise exception 'Filters must be an object.'; end if;
  insert into public.admin_saved_views (admin, list, name, filters, q, sort, sort_desc)
  values (public.jwt_email(), p_list, left(btrim(p_name), 60), coalesce(p_filters, '{}'), left(coalesce(p_q, ''), 200), left(coalesce(p_sort, ''), 40), coalesce(p_desc, true))
  on conflict (admin, list, name) do update set filters = excluded.filters, q = excluded.q, sort = excluded.sort, sort_desc = excluded.sort_desc;
  return public.admin_views(p_list);
end;
$$;

create or replace function public.admin_view_delete(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_list text;
begin
  perform private.admin_check();
  delete from public.admin_saved_views where id = p_id and admin = public.jwt_email() returning list into v_list;
  return public.admin_views(coalesce(v_list, ''));
end;
$$;

create or replace function public.admin_note_add(p_kind text, p_record text, p_body text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  if p_kind not in ('creator', 'brand_login', 'workspace', 'collab', 'brand') then raise exception 'Notes can''t go on %.', p_kind; end if;
  if btrim(coalesce(p_body, '')) = '' then raise exception 'Write the note first.'; end if;
  insert into public.admin_notes (kind, record, body, admin) values (p_kind, p_record, left(btrim(p_body), 4000), public.jwt_email());
  perform private.admin_log('note', p_kind, p_record,
    case p_kind
      when 'creator' then (select coalesce(nullif(s.display_name, ''), s.creator_email) from public.creator_settings s where s.id::text = p_record)
      when 'brand_login' then (select u.email from auth.users u where u.id::text = p_record)
      when 'workspace' then (select coalesce(f.name, u.email) from auth.users u left join public.brand_profiles f on f.owner = u.id where u.id::text = p_record)
      when 'brand' then (select b.name from public.brands b where b.id::text = p_record)
      when 'collab' then (select c.code from public.collabs c where c.id::text = p_record)
    end,
    null, jsonb_build_object('note', left(btrim(p_body), 200)));
  return private.admin_extras(p_kind, p_record);
end;
$$;

-- Notes and audit rows for one record (every record page shows both).
create or replace function private.admin_extras(p_kind text, p_record text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'admin', n.admin, 'at', n.created_at) order by n.created_at desc)
      from public.admin_notes n where n.kind = p_kind and n.record = p_record), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('at', a.at, 'admin', a.admin, 'action', a.action, 'before', a.before, 'after', a.after, 'reason', a.reason) order by a.at desc)
      from (select * from public.admin_audit a where a.kind = p_kind and a.record = p_record order by a.at desc limit 50) a), '[]'::jsonb));
$$;
revoke execute on function private.admin_extras(text, text) from public, anon, authenticated;

-- 3. Rows behind every list screen ------------------------------------------------------------------
-- Each row carries _key (its id), _search (lower-case text the search box matches) and plain fields.
create or replace function private.brand_login_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select u.id from auth.users u
  where (exists (select 1 from public.brand_profiles f where f.owner = u.id)
      or exists (select 1 from public.brand_team_members m where m.profile_id = u.id)
      or exists (select 1 from public.brand_members m where m.profile_id = u.id))
    and not exists (select 1 from public.creator_settings s where lower(s.creator_email) = lower(u.email))
    and not exists (select 1 from public.team_members t where lower(t.email) = lower(u.email));
$$;
revoke execute on function private.brand_login_ids() from public, anon, authenticated;

create or replace function private.workspace_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select owner from public.brand_profiles
  union select owner from public.brand_teams
  union select owner from public.brand_team_members;
$$;
revoke execute on function private.workspace_ids() from public, anon, authenticated;

create or replace function private.admin_rows(p_kind text)
returns setof jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_kind = 'creators' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', s.id::text,
      '_search', lower(concat_ws(' ', s.display_name, s.creator_email, s.slug, s.handle, s.city, s.niche)),
      'id', s.id, 'name', nullif(s.display_name, ''), 'email', s.creator_email, 'slug', case when s.slug_chosen then s.slug end,
      'status', s.status, 'niche', nullif(s.niche, ''), 'city', nullif(s.city, ''), 'handle', nullif(s.handle, ''),
      'followers', a.followers, 'instagram', coalesce(a.connected, false), 'directory', coalesce(s.directory_listed, false),
      'collabs', (select count(*) from public.collabs c where c.creator_id = s.id),
      'open_collabs', (select count(*) from public.collabs c where c.creator_id = s.id and c.stage not in ('wrapped', 'cancelled', 'declined')),
      'paid', (select coalesce(sum(i.total), 0) from public.invoices i where i.creator_id = s.id and i.status = 'paid'),
      'team', (select count(*) from public.team_members t where t.creator_id = s.id),
      'note', nullif(s.request_note, ''), 'heard', s.signup ->> 'heard', 'followers_said', s.signup ->> 'followers',
      'joined', s.created_at, 'requested_at', s.requested_at, 'approved_at', s.approved_at,
      'last_active', greatest((select max(u.last_sign_in_at) from auth.users u where lower(u.email) = lower(s.creator_email)),
        (select max(t.last_seen_at) from public.team_members t where t.creator_id = s.id))))
    from public.creator_settings s
    left join public.ig_account a on a.creator_id = s.id;

  elsif p_kind = 'creator_teams' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', t.creator_id || ':' || t.email,
      '_search', lower(concat_ws(' ', t.name, t.email, s.display_name, s.slug)),
      'creator_id', t.creator_id, 'creator', nullif(s.display_name, ''), 'creator_status', s.status, 'email', t.email, 'name', nullif(t.name, ''),
      'role', t.role, 'copy_emails', t.copy_emails, 'added_at', t.added_at, 'last_seen', t.last_seen_at))
    from public.team_members t join public.creator_settings s on s.id = t.creator_id;

  elsif p_kind = 'brand_logins' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', u.id::text,
      '_search', lower(concat_ws(' ', u.email, p.full_name, f.name, f.city)),
      'id', u.id, 'email', u.email, 'name', nullif(p.full_name, ''), 'company', f.name, 'city', nullif(f.city, ''), 'role', nullif(f.role, ''),
      'state', case when f.closed_at is not null then 'closed' when f.paused_at is not null then 'paused' else 'active' end,
      'workspaces', (select count(*) from private.teams_of(u.id)),
      'agency', (select count(*) from private.teams_of(u.id)) > 1,
      'companies', (select count(*) from public.brand_members m where m.profile_id = u.id),
      'collabs', (select count(*) from public.collabs c where c.created_by = u.id),
      'instagram', exists (select 1 from public.brand_ig g where g.owner = u.id),
      'reports', (select count(*) from public.safety_reports r where r.target_owner = u.id),
      'joined', u.created_at, 'last_active', u.last_sign_in_at))
    from auth.users u
    join private.brand_login_ids() b on b = u.id
    left join public.profiles p on p.id = u.id
    left join public.brand_profiles f on f.owner = u.id;

  elsif p_kind = 'workspaces' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', w::text,
      '_search', lower(concat_ws(' ', f.name, u.email, f.category, f.city)),
      'id', w, 'name', coalesce(f.name, u.email), 'owner_email', u.email, 'category', nullif(f.category, ''), 'city', nullif(f.city, ''),
      'state', case when f.closed_at is not null then 'closed' when f.paused_at is not null then 'paused' else 'active' end,
      'members', (select count(*) from private.team_logins(w)),
      'invited', (select count(*) from public.brand_team_members m where m.owner = w and m.joined_at is null),
      'companies', (select count(distinct m.brand_id) from public.brand_members m where m.owner = w),
      'collabs', (select count(*) from private.company_collabs(w)),
      'campaigns', (select count(*) from public.brand_campaigns c where c.owner = w),
      'autopilots', (select (a.shortlist <> 'off')::int + (a.followup <> 'off')::int + (a.draftcheck <> 'off')::int + (a.negotiate <> 'off')::int
          + (a.rebook <> 'off')::int + (a.watch <> 'off')::int from public.brand_autopilots a where a.owner = w),
      'approvals', coalesce((select t.approval_on from public.brand_teams t where t.owner = w), false),
      'joined', coalesce(f.created_at, u.created_at), 'last_active', (select max(x.last_sign_in_at) from auth.users x where x.id in (select private.team_logins(w)))))
    from private.workspace_ids() w
    join auth.users u on u.id = w
    left join public.brand_profiles f on f.owner = w;

  elsif p_kind = 'audit' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', a.id::text,
      '_search', lower(concat_ws(' ', a.admin, a.action, a.kind, a.label, a.reason, a.record)),
      'id', a.id, 'at', a.at, 'admin', a.admin, 'action', a.action, 'kind', a.kind, 'record', nullif(a.record, ''), 'label', nullif(a.label, ''),
      'before', a.before, 'after', a.after, 'reason', nullif(a.reason, '')))
    from public.admin_audit a;
  else
    raise exception 'Unknown list %.', p_kind;
  end if;
end;
$$;
revoke execute on function private.admin_rows(text) from public, anon, authenticated;

-- Does a row pass the filters? {"status": ["active", "paused"]} is any of; {"instagram": false} is equal;
-- {"joined:gte": "2026-10-01"} and {"followers:lte": 10000} compare.
create or replace function private.admin_match(x jsonb, p_filters jsonb)
returns boolean
language sql immutable
set search_path = public
as $$
  select not exists (
    select 1 from jsonb_each(coalesce(p_filters, '{}'::jsonb)) f
    where not coalesce(case
      when f.key like '%:gte' and jsonb_typeof(f.value) = 'number' then (x ->> split_part(f.key, ':', 1))::numeric >= (f.value #>> '{}')::numeric
      when f.key like '%:lte' and jsonb_typeof(f.value) = 'number' then (x ->> split_part(f.key, ':', 1))::numeric <= (f.value #>> '{}')::numeric
      when f.key like '%:gte' then x ->> split_part(f.key, ':', 1) >= f.value #>> '{}'
      when f.key like '%:lte' then x ->> split_part(f.key, ':', 1) <= f.value #>> '{}'
      when jsonb_typeof(f.value) = 'array' then jsonb_array_length(f.value) = 0 or f.value @> coalesce(x -> f.key, 'null'::jsonb)
      else coalesce(x -> f.key, 'null'::jsonb) = f.value end, false));
$$;
revoke execute on function private.admin_match(jsonb, jsonb) from public, anon, authenticated;

-- One page of a list. p_counts: {"waiting": {"status": "pending"}, ...} counts each preset (search ignored).
create or replace function public.admin_list(p_kind text, p_q text default '', p_filters jsonb default '{}', p_sort text default '',
  p_desc boolean default true, p_limit integer default 50, p_offset integer default 0, p_counts jsonb default '{}')
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_q text := lower(btrim(coalesce(p_q, '')));
  v_sort text := coalesce(nullif(p_sort, ''), case p_kind when 'audit' then 'at' when 'creator_teams' then 'added_at' else 'joined' end);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 5000);
begin
  perform private.admin_check();
  if jsonb_typeof(coalesce(p_filters, '{}')) <> 'object' or jsonb_typeof(coalesce(p_counts, '{}')) <> 'object' then
    raise exception 'Filters must be an object.';
  end if;
  return (
    with src as (select x from private.admin_rows(p_kind) x),
    hit as (select x from src where (v_q = '' or strpos(x ->> '_search', v_q) > 0) and private.admin_match(x, p_filters)),
    page as (
      select x, row_number() over (order by
        case when p_desc then x -> v_sort end desc nulls last,
        case when not p_desc then x -> v_sort end asc nulls last,
        x ->> '_key') as n
      from hit
      order by n
      limit v_limit offset greatest(coalesce(p_offset, 0), 0))
    select jsonb_build_object(
      'total', (select count(*) from hit),
      'rows', coalesce((select jsonb_agg(x - '_search' order by n) from page), '[]'::jsonb),
      'counts', coalesce((select jsonb_object_agg(c.key, (select count(*) from src where private.admin_match(src.x, c.value)))
        from jsonb_each(coalesce(p_counts, '{}')) c), '{}'::jsonb)));
end;
$$;

-- 4. Record pages ----------------------------------------------------------------------------------
create or replace function public.admin_creator(p_id integer)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  a public.ig_account;
  v_month date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
begin
  perform private.admin_check();
  select * into s from public.creator_settings where id = p_id;
  if s.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  select * into a from public.ig_account where creator_id = p_id;
  return jsonb_build_object(
    'id', s.id, 'name', s.display_name, 'email', s.creator_email, 'slug', case when s.slug_chosen then s.slug end, 'status', s.status,
    'niche', s.niche, 'city', s.city, 'handle', s.handle, 'whatsapp', case when coalesce(s.whatsapp, '') = '' then '' else left(s.whatsapp, 5) || '•••' || right(s.whatsapp, 3) end,
    'note', s.request_note, 'signup', s.signup, 'languages', to_jsonb(coalesce(s.content_languages, '{}'::text[])),
    'directory', coalesce(s.directory_listed, false), 'accepting', s.accepting,
    'joined', s.created_at, 'requested_at', s.requested_at, 'approved_at', s.approved_at, 'closing_at', s.closing_at,
    'gst', case when coalesce(s.gstin, '') = '' then (case when s.gst_registered then 'Registered' else 'Not registered' end)
      else left(s.gstin, 4) || '•••••••' || right(s.gstin, 3) end,
    'bank_set', coalesce(s.upi_id, '') <> '' or coalesce(s.bank_details::text, '') not in ('', '{}', 'null'),
    'rates', s.rates,
    'last_sign_in', (select max(u.last_sign_in_at) from auth.users u where lower(u.email) = lower(s.creator_email)),
    'instagram', case when a.creator_id is null then null else jsonb_build_object('connected', a.connected, 'username', a.username, 'followers', a.followers,
      'media', a.media_count, 'engagement', a.engagement_rate, 'expires', a.token_expires_at, 'synced', a.last_sync_at, 'error', nullif(a.last_error, '')) end,
    'stats', jsonb_build_object(
      'collabs', (select count(*) from public.collabs c where c.creator_id = p_id),
      'open', (select count(*) from public.collabs c where c.creator_id = p_id and c.stage not in ('wrapped', 'cancelled', 'declined')),
      'paid', (select coalesce(sum(i.total), 0) from public.invoices i where i.creator_id = p_id and i.status = 'paid'),
      'paid_month', (select coalesce(sum(i.total), 0) from public.invoices i where i.creator_id = p_id and i.status = 'paid' and i.paid_on >= v_month),
      'waiting', (select coalesce(sum(i.total - i.amount_received), 0) from public.invoices i where i.creator_id = p_id and i.status in ('sent', 'partly_paid')),
      'avg_fee', (select coalesce(round(avg(c.fee)), 0) from public.collabs c where c.creator_id = p_id and c.fee > 0)),
    'related', jsonb_build_object(
      'brands', (select count(*) from public.brands b where b.creator_id = p_id),
      'quotes', (select count(*) from public.quotes q where q.creator_id = p_id),
      'invoices', (select count(*) from public.invoices i where i.creator_id = p_id),
      'drafts', (select count(*) from public.drafts d where d.creator_id = p_id),
      'pitches', (select count(*) from public.pitches x where x.creator_id = p_id),
      'emails', (select count(*) from public.outbox o where o.creator_id = p_id),
      'ai_30d', (select coalesce(sum(u.calls), 0) from public.ai_usage u where u.creator_id = p_id and u.day > current_date - 30),
      'fans', (select count(*) from public.fans f where f.creator_id = p_id),
      'views_30d', (select coalesce(sum(v.views), 0) from public.page_views v where v.creator_id = p_id and v.day > current_date - 30),
      'support', (select count(*) from public.support_tickets t where t.creator_id = p_id),
      'reports', (select count(*) from public.safety_reports r where r.target_creator = p_id)),
    'autopilots', jsonb_build_object('packages', s.autopilot_packages, 'counter', s.autopilot_counter, 'nudge', s.autopilot_nudge, 'review', s.autopilot_review,
      'brief', s.autopilot_brief, 'invoice', s.autopilot_invoice, 'dates', s.autopilot_dates, 'track', s.autopilot_track, 'pitch', s.pitch_auto,
      'pitch_mode', s.pitch_mode, 'comment_dm', s.comment_dm_mode, 'grow', s.grow_mode, 'instant_booking', s.instant_booking, 'rebook', s.rebook_offer, 'demand_pricing', s.demand_pricing),
    'collabs', coalesce((select jsonb_agg(x order by x ->> 'at' desc) from (
      select jsonb_build_object('id', c.id, 'code', c.code, 'brand', b.name, 'stage', c.stage, 'fee', c.fee, 'pay', c.pay_status, 'live', c.live_date, 'at', c.created_at) x
      from public.collabs c left join public.brands b on b.id = c.brand_id where c.creator_id = p_id order by c.created_at desc limit 25) z), '[]'::jsonb),
    'brands', coalesce((select jsonb_agg(x order by (x ->> 'collabs')::int desc) from (
      select jsonb_build_object('id', b.id, 'name', b.name, 'category', b.category,
        'collabs', (select count(*) from public.collabs c where c.brand_id = b.id),
        'paid', (select coalesce(sum(i.total), 0) from public.invoices i join public.collabs c on c.id = i.collab_id where c.brand_id = b.id and i.status = 'paid'),
        'logins', (select count(*) from public.brand_members m where m.brand_id = b.id)) x
      from public.brands b where b.creator_id = p_id order by b.created_at desc limit 50) z), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', i.id, 'number', i.number, 'collab', c.code, 'total', i.total, 'received', i.amount_received, 'status', i.status,
        'due', i.due_date, 'paid_on', i.paid_on) x
      from public.invoices i left join public.collabs c on c.id = i.collab_id where i.creator_id = p_id order by i.created_at desc limit 25) z), '[]'::jsonb),
    'team', coalesce((select jsonb_agg(jsonb_build_object('email', t.email, 'name', t.name, 'role', t.role, 'copy_emails', t.copy_emails, 'last_seen', t.last_seen_at) order by t.added_at)
      from public.team_members t where t.creator_id = p_id), '[]'::jsonb),
    'support', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'number', t.number, 'subject', t.subject, 'status', t.status, 'at', t.updated_at) order by t.updated_at desc)
      from public.support_tickets t where t.creator_id = p_id), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(e order by e ->> 'at' desc) from (
      select e from (
        select jsonb_build_object('at', s.requested_at, 'kind', 'account', 'title', 'Asked to join') e where s.requested_at is not null
        union all select jsonb_build_object('at', s.approved_at, 'kind', 'account', 'title', 'Approved') where s.approved_at is not null
        union all select jsonb_build_object('at', ev.at, 'kind', 'collab', 'title', c.code || ' · ' || coalesce(b.name, ''), 'text', ev.text, 'collab', c.id)
          from (select * from public.collab_events x where x.creator_id = p_id order by x.at desc limit 40) ev
          join public.collabs c on c.id = ev.collab_id left join public.brands b on b.id = c.brand_id
        union all select jsonb_build_object('at', i.paid_on::timestamptz, 'kind', 'money', 'title', 'Invoice ' || i.number || ' paid', 'text', i.total::text)
          from public.invoices i where i.creator_id = p_id and i.status = 'paid' and i.paid_on is not null
        union all select jsonb_build_object('at', t.created_at, 'kind', 'support', 'title', 'Support #' || t.number, 'text', t.subject)
          from public.support_tickets t where t.creator_id = p_id
        union all select jsonb_build_object('at', r.created_at, 'kind', 'safety', 'title', 'Reported by ' || r.by_name, 'text', r.reason)
          from public.safety_reports r where r.target_creator = p_id
        union all select jsonb_build_object('at', x.at, 'kind', 'admin', 'title', initcap(replace(x.action, '_', ' ')) || ' by ' || x.admin, 'text', nullif(x.reason, ''))
          from public.admin_audit x where x.kind = 'creator' and x.record = p_id::text
      ) all_e order by e ->> 'at' desc limit 60) z), '[]'::jsonb)
  ) || private.admin_extras('creator', p_id::text);
end;
$$;

create or replace function public.admin_brand_login(p_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  u auth.users;
  p public.profiles;
  f public.brand_profiles;
begin
  perform private.admin_check();
  select * into u from auth.users where id = p_id;
  if u.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  select * into p from public.profiles where id = p_id;
  select * into f from public.brand_profiles where owner = p_id;
  return jsonb_build_object(
    'id', u.id, 'email', u.email, 'name', p.full_name, 'phone', case when coalesce(p.phone, '') = '' then '' else left(p.phone, 5) || '•••' || right(p.phone, 3) end,
    'joined', u.created_at, 'last_sign_in', u.last_sign_in_at,
    'company', case when f.owner is null then null else jsonb_build_object('name', f.name, 'category', f.category, 'website', f.website, 'instagram', f.instagram,
      'role', f.role, 'city', f.city, 'goals', to_jsonb(f.goals), 'legal_name', f.legal_name,
      'gstin', case when f.gstin = '' then '' else left(f.gstin, 4) || '•••••••' || right(f.gstin, 3) end) end,
    'state', case when f.closed_at is not null then 'closed' when f.paused_at is not null then 'paused' else 'active' end,
    'active_workspace', private.owner_of(p_id),
    'workspaces', coalesce((select jsonb_agg(jsonb_build_object('id', w, 'name', coalesce((select x.name from public.brand_profiles x where x.owner = w), (select x.email from auth.users x where x.id = w)),
        'role', case when w = p_id then 'owner' else (select m.role from public.brand_team_members m where m.owner = w and m.profile_id = p_id) end,
        'companies', (select count(*) from public.brand_members m where m.profile_id = p_id and m.owner = w)))
      from private.teams_of(p_id) w), '[]'::jsonb),
    'companies', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'creator', s.display_name, 'creator_id', s.id, 'workspace', m.owner) order by b.name)
      from public.brand_members m join public.brands b on b.id = m.brand_id left join public.creator_settings s on s.id = b.creator_id where m.profile_id = p_id), '[]'::jsonb),
    'collabs', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', c.id, 'code', c.code, 'creator', s.display_name, 'creator_id', s.id, 'stage', c.stage, 'fee', c.fee, 'pay', c.pay_status, 'at', c.created_at) x
      from public.collabs c join public.brand_members m on m.brand_id = c.brand_id and m.profile_id = p_id
      left join public.creator_settings s on s.id = c.creator_id order by c.created_at desc limit 25) z), '[]'::jsonb),
    'support', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'number', t.number, 'subject', t.subject, 'status', t.status, 'at', t.updated_at) order by t.updated_at desc)
      from public.support_tickets t where t.user_id = p_id), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'by', r.by_name, 'reason', r.reason, 'status', r.status, 'at', r.created_at) order by r.created_at desc)
      from public.safety_reports r where r.target_owner = p_id), '[]'::jsonb),
    'blocked_by', (select count(*) from public.safety_blocks b where b.owner = p_id),
    'instagram', (select jsonb_build_object('username', g.username, 'followers', g.followers, 'synced', g.synced_at) from public.brand_ig g where g.owner = p_id)
  ) || private.admin_extras('brand_login', p_id::text);
end;
$$;

create or replace function public.admin_workspace(p_owner uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  u auth.users;
  f public.brand_profiles;
  t public.brand_teams;
  a public.brand_autopilots;
begin
  perform private.admin_check();
  select * into u from auth.users where id = p_owner;
  if u.id is null or p_owner not in (select private.workspace_ids()) then raise exception 'Not found.' using errcode = 'P0002'; end if;
  select * into f from public.brand_profiles where owner = p_owner;
  select * into t from public.brand_teams where owner = p_owner;
  select * into a from public.brand_autopilots where owner = p_owner;
  return jsonb_build_object(
    'id', p_owner, 'name', coalesce(f.name, u.email), 'owner_email', u.email, 'has_profile', f.owner is not null, 'category', f.category, 'city', f.city, 'website', f.website, 'instagram', f.instagram,
    'joined', coalesce(f.created_at, u.created_at),
    'state', case when f.closed_at is not null then 'closed' when f.paused_at is not null then 'paused' else 'active' end,
    'approval_on', coalesce(t.approval_on, false), 'approval_limit', t.approval_limit,
    'members', coalesce((select jsonb_agg(x order by x ->> 'joined' nulls last) from (
      select jsonb_build_object('email', u.email, 'name', (select p.full_name from public.profiles p where p.id = p_owner), 'role', 'owner', 'id', p_owner,
        'joined', coalesce(f.created_at, u.created_at), 'last_active', u.last_sign_in_at) x
      union all
      select jsonb_build_object('email', m.email, 'name', m.name, 'role', m.role, 'id', m.profile_id, 'joined', m.joined_at, 'invited', m.invited_at,
        'last_active', (select x.last_sign_in_at from auth.users x where x.id = m.profile_id))
      from public.brand_team_members m where m.owner = p_owner) z), '[]'::jsonb),
    'autopilots', case when a.owner is null then null else jsonb_build_object('shortlist', a.shortlist, 'shortlist_max', a.shortlist_max, 'followup', a.followup,
      'followup_days', a.followup_days, 'draftcheck', a.draftcheck, 'negotiate', a.negotiate, 'negotiate_over', a.negotiate_over, 'rebook', a.rebook,
      'watch', a.watch, 'watch_max', a.watch_max, 'updated_at', a.updated_at) end,
    'items', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', i.id, 'kind', i.kind, 'title', i.title, 'status', i.status, 'at', i.created_at) x
      from public.brand_autopilot_items i where i.owner = p_owner order by i.created_at desc limit 25) z), '[]'::jsonb),
    'item_counts', coalesce((select jsonb_object_agg(status, n) from (select i.status, count(*) n from public.brand_autopilot_items i where i.owner = p_owner group by i.status) z), '{}'::jsonb),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'open', c.open, 'budget', c.budget_total,
        'creators', (select count(*) from public.campaign_creators x where x.campaign_id = c.id),
        'applications', (select count(*) from public.campaign_applications x where x.campaign_id = c.id)) order by c.created_at desc)
      from public.brand_campaigns c where c.owner = p_owner), '[]'::jsonb),
    'pools', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'creators', (select count(*) from public.brand_pool_members m where m.pool_id = x.id)) order by x.created_at desc)
      from public.brand_pools x where x.owner = p_owner), '[]'::jsonb),
    'approvals', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'total', x.total, 'status', x.status, 'at', x.created_at) order by x.created_at desc)
      from (select * from public.brand_approvals x where x.owner = p_owner order by x.created_at desc limit 10) x), '[]'::jsonb),
    'stats', jsonb_build_object(
      'collabs', (select count(*) from private.company_collabs(p_owner)),
      'open', (select count(*) from private.company_collabs(p_owner) c where c.stage not in ('wrapped', 'cancelled', 'declined')),
      'paid', (select coalesce(sum(i.total), 0) from public.invoices i where i.status = 'paid' and i.collab_id in (select c.id from private.company_collabs(p_owner) c)),
      'companies', (select count(distinct m.brand_id) from public.brand_members m where m.owner = p_owner),
      'ai_30d', (select coalesce(sum(x.calls), 0) from public.brand_ai_usage x where x.owner = p_owner and x.day > current_date - 30),
      'reports', (select count(*) from public.safety_reports r where r.target_owner = p_owner),
      'blocked_by', (select count(*) from public.safety_blocks b where b.owner = p_owner)),
    'instagram', (select jsonb_build_object('username', g.username, 'followers', g.followers, 'synced', g.synced_at) from public.brand_ig g where g.owner = p_owner)
  ) || private.admin_extras('workspace', p_owner::text);
end;
$$;

-- 5. Global search ---------------------------------------------------------------------------------
create or replace function public.admin_search(p_q text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_q text := lower(btrim(coalesce(p_q, '')));
  v_like text;
begin
  perform private.admin_check();
  if char_length(v_q) < 2 then return '[]'::jsonb; end if;
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((select jsonb_agg(g order by g ->> 'n') from (
    select jsonb_build_object('n', 1, 'kind', 'creator', 'label', 'Creators', 'items', jsonb_agg(x)) g from (
      select jsonb_build_object('id', s.id::text, 'title', coalesce(nullif(s.display_name, ''), s.creator_email), 'sub', concat_ws(' · ', s.creator_email, case when s.slug_chosen then s.slug || '.miracleapp.live' end), 'meta', s.status) x
      from public.creator_settings s
      where lower(concat_ws(' ', s.display_name, s.creator_email, s.slug, s.handle)) like v_like order by s.status = 'active' desc, s.id limit 6) z having count(*) > 0
    union all
    select jsonb_build_object('n', 2, 'kind', 'brand_login', 'label', 'Brand logins', 'items', jsonb_agg(x)) from (
      select jsonb_build_object('id', u.id::text, 'title', u.email, 'sub', concat_ws(' · ', nullif(p.full_name, ''), f.name), 'meta', '') x
      from auth.users u join private.brand_login_ids() b on b = u.id left join public.profiles p on p.id = u.id left join public.brand_profiles f on f.owner = u.id
      where lower(concat_ws(' ', u.email, p.full_name, f.name)) like v_like limit 6) z having count(*) > 0
    union all
    select jsonb_build_object('n', 3, 'kind', 'workspace', 'label', 'Brand workspaces', 'items', jsonb_agg(x)) from (
      select jsonb_build_object('id', w::text, 'title', coalesce(f.name, u.email), 'sub', 'Owner ' || u.email, 'meta', '') x
      from private.workspace_ids() w join auth.users u on u.id = w left join public.brand_profiles f on f.owner = w
      where lower(concat_ws(' ', f.name, u.email)) like v_like limit 6) z having count(*) > 0
    union all
    select jsonb_build_object('n', 4, 'kind', 'brand', 'label', 'Brands (companies)', 'items', jsonb_agg(x)) from (
      select jsonb_build_object('id', b.id::text, 'title', b.name, 'sub', 'In ' || coalesce(s.display_name, 'a creator') || '''s studio', 'meta', coalesce(b.category, '')) x
      from public.brands b left join public.creator_settings s on s.id = b.creator_id
      where lower(b.name) like v_like order by b.created_at desc limit 6) z having count(*) > 0
    union all
    select jsonb_build_object('n', 5, 'kind', 'collab', 'label', 'Collabs', 'items', jsonb_agg(x)) from (
      select jsonb_build_object('id', c.id::text, 'title', c.code || ' · ' || coalesce(b.name, '') || ' × ' || coalesce(s.display_name, ''), 'sub', c.stage || ' · ₹' || coalesce(c.fee, 0)::text, 'meta', '', 'creator', s.id) x
      from public.collabs c left join public.brands b on b.id = c.brand_id left join public.creator_settings s on s.id = c.creator_id
      where lower(concat_ws(' ', c.code, b.name, c.contact_email)) like v_like order by c.created_at desc limit 6) z having count(*) > 0
    union all
    select jsonb_build_object('n', 6, 'kind', 'invoice', 'label', 'Invoices', 'items', jsonb_agg(x)) from (
      select jsonb_build_object('id', i.id::text, 'title', i.number, 'sub', i.status || ' · ₹' || i.total::text, 'meta', '', 'creator', i.creator_id) x
      from public.invoices i where lower(i.number) like v_like order by i.created_at desc limit 6) z having count(*) > 0
    union all
    select jsonb_build_object('n', 7, 'kind', 'ticket', 'label', 'Support tickets', 'items', jsonb_agg(x)) from (
      select jsonb_build_object('id', t.id::text, 'title', '#' || t.number || ' ' || t.subject, 'sub', t.email, 'meta', t.status) x
      from public.support_tickets t where lower(concat_ws(' ', '#' || t.number, t.subject, t.email, t.name)) like v_like order by t.updated_at desc limit 6) z having count(*) > 0
  ) all_g), '[]'::jsonb);
end;
$$;

-- 6. The dashboard ---------------------------------------------------------------------------------
-- p_days: 7, 30, 90, or 0 for all time. Deltas compare with the period before.
create or replace function public.admin_dashboard(p_days integer default 30)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_days integer := case when p_days in (7, 30, 90) then p_days else 0 end;
  v_from timestamptz := case when v_days = 0 then '-infinity'::timestamptz else now() - make_interval(days => v_days) end;
  v_prev timestamptz := case when v_days = 0 then '-infinity'::timestamptz else now() - make_interval(days => v_days * 2) end;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_jobs jsonb;
begin
  perform private.admin_check();
  begin
    select jsonb_build_object('failed', count(*) filter (where d.status = 'failed'), 'runs', count(*), 'last', max(d.end_time))
      into v_jobs from cron.job_run_details d where d.start_time > now() - interval '1 day';
  exception when others then
    v_jobs := null;
  end;
  return jsonb_build_object(
    'days', v_days,
    'kpis', jsonb_build_object(
      'creators', jsonb_build_object('now', (select count(*) from public.creator_settings where status = 'active'),
        'cur', (select count(*) from public.creator_settings where approved_at >= v_from), 'prev', (select count(*) from public.creator_settings where approved_at >= v_prev and approved_at < v_from)),
      'brand_logins', jsonb_build_object('now', (select count(*) from private.brand_login_ids()),
        'cur', (select count(*) from auth.users u join private.brand_login_ids() b on b = u.id where u.created_at >= v_from),
        'prev', (select count(*) from auth.users u join private.brand_login_ids() b on b = u.id where u.created_at >= v_prev and u.created_at < v_from)),
      'collabs', jsonb_build_object('cur', (select count(*) from public.collabs where created_at >= v_from), 'prev', (select count(*) from public.collabs where created_at >= v_prev and created_at < v_from)),
      'paid', jsonb_build_object('cur', (select coalesce(sum(total), 0) from public.invoices where status = 'paid' and paid_on >= v_from::date),
        'prev', (select coalesce(sum(total), 0) from public.invoices where status = 'paid' and paid_on >= v_prev::date and paid_on < v_from::date)),
      'emails', jsonb_build_object('cur', (select count(*) from public.outbox where status = 'sent' and created_at >= v_from),
        'failed', (select count(*) from public.outbox where status = 'failed' and created_at >= v_from)),
      'ai', jsonb_build_object('cur', (select coalesce(sum(calls), 0) from public.ai_usage where day >= v_from::date) + (select coalesce(sum(calls), 0) from public.brand_ai_usage where day >= v_from::date),
        'prev', (select coalesce(sum(calls), 0) from public.ai_usage where day >= v_prev::date and day < v_from::date) + (select coalesce(sum(calls), 0) from public.brand_ai_usage where day >= v_prev::date and day < v_from::date),
        'today', (select coalesce(sum(calls), 0) from public.ai_usage where day = v_today) + (select coalesce(sum(calls), 0) from public.brand_ai_usage where day = v_today))),
    'queue', jsonb_build_object(
      'signups', (select count(*) from public.creator_settings where status = 'pending'),
      'signups_oldest', (select min(coalesce(requested_at, created_at)) from public.creator_settings where status = 'pending'),
      'support', (select count(*) from public.support_tickets where status = 'open'),
      'support_urgent', (select count(*) from public.support_tickets where status = 'open' and priority = 'urgent'),
      'support_unread', (select count(*) from public.support_tickets where team_unread),
      'safety', (select count(distinct coalesce(target_owner::text, target_creator::text, target_brand::text)) from public.safety_reports where status = 'open'),
      'safety_paused', (select count(*) from public.safety_reports where status = 'open' and auto_paused),
      'emails_failed', (select count(*) from public.outbox where status = 'failed' and created_at > now() - interval '7 days'),
      'problems_new', (select count(*) from public.app_problems where status = 'open' and first_seen >= v_today),
      'problems_open', (select count(*) from public.app_problems where status = 'open'),
      'ig_expiring', (select count(*) from public.ig_account where connected and token_expires_at < now() + interval '7 days')),
    'creator_funnel', (select jsonb_build_object(
        'signed_up', count(*), 'approved', count(*) filter (where s.approved_at is not null),
        'instagram', count(*) filter (where exists (select 1 from public.ig_account a where a.creator_id = s.id and a.connected)),
        'collab', count(*) filter (where exists (select 1 from public.collabs c where c.creator_id = s.id)),
        'paid', count(*) filter (where exists (select 1 from public.invoices i where i.creator_id = s.id and i.status = 'paid')))
      from public.creator_settings s where coalesce(s.requested_at, s.created_at) >= v_from),
    'brand_funnel', (select jsonb_build_object(
        'signed_up', count(*),
        'company', count(*) filter (where exists (select 1 from public.brand_members m where m.owner = f.owner)),
        'asked', count(*) filter (where exists (select 1 from private.company_collabs(f.owner))),
        'accepted', count(*) filter (where exists (select 1 from public.quotes q where q.status = 'accepted' and q.collab_id in (select c.id from private.company_collabs(f.owner) c))),
        'paid', count(*) filter (where exists (select 1 from public.invoices i where i.status = 'paid' and i.collab_id in (select c.id from private.company_collabs(f.owner) c))))
      from public.brand_profiles f where f.created_at >= v_from),
    'stages', coalesce((select jsonb_object_agg(stage, jsonb_build_object('n', n, 'value', v)) from (
      select c.stage, count(*) n, coalesce(sum(c.fee), 0) v from public.collabs c group by c.stage) z), '{}'::jsonb),
    'weeks', coalesce((select jsonb_agg(jsonb_build_object('week', w, 'paid', coalesce((select sum(i.total) from public.invoices i
        where i.status = 'paid' and i.paid_on >= w and i.paid_on < w + 7), 0)) order by w)
      from generate_series(date_trunc('week', v_today)::date - 77, date_trunc('week', v_today)::date, interval '7 days') g(w0)
      cross join lateral (select g.w0::date as w) x), '[]'::jsonb),
    'health', jsonb_build_object(
      'outbox_last_sent', (select max(sent_at) from public.outbox where status = 'sent'),
      'outbox_pending', (select count(*) from public.outbox where status = 'pending'),
      'ig_last_sync', (select max(last_sync_at) from public.ig_account where connected),
      'ig_errors', (select count(*) from public.ig_account where connected and coalesce(last_error, '') <> ''),
      'jobs', v_jobs),
    'feed', coalesce((select jsonb_agg(e order by e ->> 'at' desc) from (
      select e from (
        select jsonb_build_object('at', a.at, 'kind', 'admin', 'text', initcap(replace(a.action, '_', ' ')) || coalesce(' · ' || nullif(a.label, ''), '') || ' (' || a.admin || ')',
          'link', a.kind, 'id', a.record) e from (select * from public.admin_audit order by at desc limit 8) a
        union all
        select jsonb_build_object('at', ev.at, 'kind', 'collab', 'text', c.code || ' · ' || coalesce(b.name, '') || ' × ' || coalesce(s.display_name, '') || ': ' || ev.text,
          'link', 'creator', 'id', c.creator_id::text)
          from (select * from public.collab_events order by at desc limit 10) ev join public.collabs c on c.id = ev.collab_id
          left join public.brands b on b.id = c.brand_id left join public.creator_settings s on s.id = c.creator_id
        union all
        select jsonb_build_object('at', s.requested_at, 'kind', 'signup', 'text', coalesce(nullif(s.display_name, ''), s.creator_email) || ' asked to join', 'link', 'creator', 'id', s.id::text)
          from (select * from public.creator_settings where requested_at is not null order by requested_at desc limit 5) s
        union all
        select jsonb_build_object('at', o.created_at, 'kind', 'email', 'text', o.kind || ' to ' || o.to_email || ' failed: ' || left(coalesce(o.last_error, ''), 80), 'link', 'outbox', 'id', o.id::text)
          from (select * from public.outbox where status = 'failed' order by created_at desc limit 5) o
        union all
        select jsonb_build_object('at', t.created_at, 'kind', 'support', 'text', 'Support #' || t.number || ': ' || t.subject, 'link', 'ticket', 'id', t.id::text)
          from (select * from public.support_tickets order by created_at desc limit 5) t
      ) all_e order by e ->> 'at' desc limit 18) z), '[]'::jsonb));
end;
$$;

-- 7. Actions on People, each logged ------------------------------------------------------------------
create or replace function public.admin_creator_directory(p_id integer, p_listed boolean, p_reason text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
begin
  perform private.admin_check();
  select * into s from public.creator_settings where id = p_id;
  if s.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  if p_listed and s.status <> 'active' then raise exception 'Only an active creator can be in the directory.'; end if;
  update public.creator_settings set directory_listed = p_listed where id = p_id;
  perform private.admin_log(case when p_listed then 'directory_on' else 'directory_off' end, 'creator', p_id::text, s.display_name,
    jsonb_build_object('directory', coalesce(s.directory_listed, false)), jsonb_build_object('directory', p_listed), p_reason);
  return public.admin_creator(p_id);
end;
$$;

-- Pause or resume a brand login's own workspace (the same pause a safety report puts on it): nobody working in
-- it can send requests, messages or open briefs while it's paused.
create or replace function public.admin_brand_login_set(p_id uuid, p_action text, p_reason text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  f public.brand_profiles;
  v_before text;
begin
  perform private.admin_check();
  if p_action not in ('pause', 'resume') then raise exception 'Pick pause or resume.'; end if;
  select * into f from public.brand_profiles where owner = p_id;
  if f.owner is null then raise exception 'This login has no brand account of its own to pause.'; end if;
  if f.closed_at is not null then raise exception 'This account is closed.'; end if;
  v_before := case when f.paused_at is not null then 'paused' else 'active' end;
  if p_action = 'pause' then
    if btrim(coalesce(p_reason, '')) = '' then raise exception 'Say why, for the audit trail.'; end if;
    update public.brand_profiles set paused_at = coalesce(paused_at, now()) where owner = p_id;
    if v_before = 'active' then perform private.safety_mail_target('brand', p_id, null, 'account_paused', f.name); end if;
  else
    update public.brand_profiles set paused_at = null where owner = p_id;
  end if;
  perform private.admin_log(p_action, 'brand_login', p_id::text, f.name, jsonb_build_object('state', v_before),
    jsonb_build_object('state', case when p_action = 'pause' then 'paused' else 'active' end), p_reason);
  return public.admin_brand_login(p_id);
end;
$$;

create or replace function public.admin_workspace_approvals(p_owner uuid, p_on boolean, p_limit integer default null, p_reason text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  t public.brand_teams;
begin
  perform private.admin_check();
  if p_owner not in (select private.workspace_ids()) then raise exception 'Not found.' using errcode = 'P0002'; end if;
  if p_limit is not null and p_limit < 0 then raise exception 'The limit can''t be below zero.'; end if;
  select * into t from public.brand_teams where owner = p_owner;
  insert into public.brand_teams (owner, approval_on, approval_limit) values (p_owner, p_on, coalesce(p_limit, 0))
  on conflict (owner) do update set approval_on = excluded.approval_on, approval_limit = coalesce(p_limit, public.brand_teams.approval_limit);
  perform private.admin_log('approvals', 'workspace', p_owner::text, (select name from public.brand_profiles where owner = p_owner),
    jsonb_build_object('on', coalesce(t.approval_on, false), 'limit', t.approval_limit),
    jsonb_build_object('on', p_on, 'limit', coalesce(p_limit, t.approval_limit, 0)), p_reason);
  return public.admin_workspace(p_owner);
end;
$$;

-- Take someone out of a workspace: the same as its Admin removing them in the app.
create or replace function public.admin_workspace_remove(p_owner uuid, p_email text, p_reason text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  m public.brand_team_members;
begin
  perform private.admin_check();
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Say why, for the audit trail.'; end if;
  delete from public.brand_team_members where owner = p_owner and email = lower(btrim(p_email)) returning * into m;
  if m.owner is null then raise exception 'They aren''t in this workspace.'; end if;
  if m.profile_id is not null then
    delete from public.brand_members x
    where x.profile_id = m.profile_id and x.owner = p_owner
      and not exists (select 1 from public.collabs k where k.brand_id = x.brand_id and lower(k.contact_email) = lower(m.email));
    delete from public.brand_active_team where profile_id = m.profile_id and owner = p_owner;
  end if;
  perform private.admin_log('remove_member', 'workspace', p_owner::text, (select name from public.brand_profiles where owner = p_owner),
    jsonb_build_object('email', m.email, 'role', m.role), null, p_reason);
  return public.admin_workspace(p_owner);
end;
$$;

-- 8. The existing admin actions now log too. Each keeps its body (moved to private.*) and its signature.
alter function public.admin_set_creator(integer, text) set schema private;
alter function private.admin_set_creator(integer, text) rename to admin_set_creator_do;
revoke execute on function private.admin_set_creator_do(integer, text) from public, anon, authenticated;
create or replace function public.admin_set_creator(p_id integer, p_status text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  r jsonb;
begin
  perform private.admin_check();
  select * into s from public.creator_settings where id = p_id;
  r := private.admin_set_creator_do(p_id, p_status);
  if s.status is distinct from p_status then
    perform private.admin_log(case p_status when 'active' then (case when s.status = 'paused' then 'resume' else 'approve' end)
      when 'declined' then 'decline' when 'paused' then 'pause' else 'reopen' end,
      'creator', p_id::text, coalesce(nullif(s.display_name, ''), s.creator_email), jsonb_build_object('status', s.status), jsonb_build_object('status', p_status));
  end if;
  return r;
end;
$$;

alter function public.admin_safety_act(text, text) set schema private;
alter function private.admin_safety_act(text, text) rename to admin_safety_act_do;
revoke execute on function private.admin_safety_act_do(text, text) from public, anon, authenticated;
create or replace function public.admin_safety_act(p_key text, p_action text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  r jsonb;
  v_id text := split_part(p_key, ':', 2);
begin
  perform private.admin_check();
  r := private.admin_safety_act_do(p_key, p_action);
  perform private.admin_log('safety_' || p_action, case split_part(p_key, ':', 1) when 'brand' then 'brand_login' else 'creator' end, v_id,
    coalesce((select name from public.brand_profiles where owner::text = v_id), (select display_name from public.creator_settings where id::text = v_id), ''),
    null, jsonb_build_object('action', p_action));
  return r;
end;
$$;

alter function public.admin_limits_set(jsonb) set schema private;
alter function private.admin_limits_set(jsonb) rename to admin_limits_set_do;
revoke execute on function private.admin_limits_set_do(jsonb) from public, anon, authenticated;
create or replace function public.admin_limits_set(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_before jsonb;
  r jsonb;
begin
  perform private.admin_check();
  select jsonb_object_agg(key, jsonb_build_object('new', new_v, 'trusted', trusted_v)) into v_before from public.app_limits where key in (select jsonb_object_keys(p));
  r := private.admin_limits_set_do(p);
  perform private.admin_log('limits', 'limits', '', 'Spam limits', v_before,
    (select jsonb_object_agg(key, jsonb_build_object('new', new_v, 'trusted', trusted_v)) from public.app_limits where key in (select jsonb_object_keys(p))));
  return r;
end;
$$;

alter function public.admin_problem_set(bigint, text) set schema private;
alter function private.admin_problem_set(bigint, text) rename to admin_problem_set_do;
revoke execute on function private.admin_problem_set_do(bigint, text) from public, anon, authenticated;
create or replace function public.admin_problem_set(p_id bigint, p_status text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_before text;
  r jsonb;
begin
  perform private.admin_check();
  select status into v_before from public.app_problems where id = p_id;
  r := private.admin_problem_set_do(p_id, p_status);
  perform private.admin_log('problem_' || p_status, 'problem', p_id::text, (select left(message, 120) from public.app_problems where id = p_id),
    jsonb_build_object('status', v_before), jsonb_build_object('status', p_status));
  return r;
end;
$$;

alter function public.admin_support_reply(uuid, text, boolean, text, jsonb) set schema private;
alter function private.admin_support_reply(uuid, text, boolean, text, jsonb) rename to admin_support_reply_do;
revoke execute on function private.admin_support_reply_do(uuid, text, boolean, text, jsonb) from public, anon, authenticated;
create or replace function public.admin_support_reply(p_id uuid, p_body text, p_internal boolean default false, p_status text default '', p_files jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  t public.support_tickets;
  r jsonb;
begin
  perform private.admin_check();
  select * into t from public.support_tickets where id = p_id;
  r := private.admin_support_reply_do(p_id, p_body, p_internal, p_status, p_files);
  perform private.admin_log(case when p_internal then 'support_note' else 'support_reply' end, 'ticket', p_id::text, '#' || t.number || ' ' || t.subject,
    jsonb_build_object('status', t.status), jsonb_build_object('status', r ->> 'status'));
  return r;
end;
$$;

alter function public.admin_support_set(uuid, text, text) set schema private;
alter function private.admin_support_set(uuid, text, text) rename to admin_support_set_do;
revoke execute on function private.admin_support_set_do(uuid, text, text) from public, anon, authenticated;
create or replace function public.admin_support_set(p_id uuid, p_status text default '', p_priority text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  t public.support_tickets;
  r jsonb;
begin
  perform private.admin_check();
  select * into t from public.support_tickets where id = p_id;
  r := private.admin_support_set_do(p_id, p_status, p_priority);
  perform private.admin_log('support_set', 'ticket', p_id::text, '#' || t.number || ' ' || t.subject,
    jsonb_build_object('status', t.status, 'priority', t.priority), jsonb_build_object('status', r ->> 'status', 'priority', r ->> 'priority'));
  return r;
end;
$$;

-- 9. Who can call what: signed-in admins only (each function checks), never anon.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_views(text)', 'public.admin_view_save(text, text, jsonb, text, text, boolean)', 'public.admin_view_delete(uuid)',
    'public.admin_note_add(text, text, text)', 'public.admin_list(text, text, jsonb, text, boolean, integer, integer, jsonb)',
    'public.admin_creator(integer)', 'public.admin_brand_login(uuid)', 'public.admin_workspace(uuid)', 'public.admin_search(text)',
    'public.admin_dashboard(integer)', 'public.admin_creator_directory(integer, boolean, text)', 'public.admin_brand_login_set(uuid, text, text)',
    'public.admin_workspace_approvals(uuid, boolean, integer, text)', 'public.admin_workspace_remove(uuid, text, text)',
    'public.admin_set_creator(integer, text)', 'public.admin_safety_act(text, text)', 'public.admin_limits_set(jsonb)',
    'public.admin_problem_set(bigint, text)', 'public.admin_support_reply(uuid, text, boolean, text, jsonb)', 'public.admin_support_set(uuid, text, text)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
