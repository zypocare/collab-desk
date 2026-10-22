-- Problems: every crash in the app, the AI server and the email/background jobs, grouped by what went
-- wrong, for the admin panel's Problems tab. The first time a new problem shows up (or a fixed one comes
-- back) Miracle's admins get an email. Who it happened to is forgotten after 30 days; message text,
-- quotes and bank details are never sent here.

create table if not exists public.app_problems (
  id bigint generated always as identity primary key,
  fingerprint text not null unique,
  source text not null check (source in ('app', 'server', 'jobs')),
  message text not null check (char_length(message) <= 300),
  place text not null default '' check (char_length(place) <= 200),
  release text not null default '' check (char_length(release) <= 40),
  status text not null default 'open' check (status in ('open', 'fixed', 'ignored')),
  times integer not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  fixed_at timestamptz,
  sample jsonb not null default '{}'
);
create index if not exists app_problems_seen_idx on public.app_problems (last_seen desc);

-- One row per time it happened (at most 200 a day per problem are kept in detail).
create table if not exists public.app_problem_events (
  id bigint generated always as identity primary key,
  problem_id bigint not null references public.app_problems (id) on delete cascade,
  ref text not null unique,
  at timestamptz not null default now(),
  who text not null default '',
  session text not null default '',
  device text not null default '',
  place text not null default '',
  release text not null default '',
  note text not null default '' check (char_length(note) <= 600)
);
create index if not exists app_problem_events_problem_idx on public.app_problem_events (problem_id, at desc);
create index if not exists app_problem_events_session_idx on public.app_problem_events (session, at desc);

-- How many times a day, for the little bars (counted even past the 200 kept in detail).
create table if not exists public.app_problem_days (
  problem_id bigint not null references public.app_problems (id) on delete cascade,
  day date not null,
  n integer not null default 0,
  primary key (problem_id, day)
);

-- Visits (one per device a day), to say how many went without a problem.
create table if not exists public.app_visits (
  day date not null,
  session text not null,
  primary key (day, session)
);

alter table public.app_problems enable row level security;
alter table public.app_problem_events enable row level security;
alter table public.app_problem_days enable row level security;
alter table public.app_visits enable row level security;
revoke all on public.app_problems, public.app_problem_events, public.app_problem_days, public.app_visits from anon, authenticated;

-- Numbers, ids and codes vary from one time to the next; the problem is the same.
create or replace function private.problem_shape(p text)
returns text
language sql immutable
set search_path = ''
as $$
  select regexp_replace(regexp_replace(regexp_replace(lower(coalesce(p, '')),
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':id', 'g'),
    '[a-z]{1,4}-[0-9]{2,}', ':code', 'g'),
    '[0-9]+', '#', 'g');
$$;

-- The app (signed in or not), the AI server and the jobs report here. Hands back the reference shown
-- to the person (M-7F3K2), so a note they add can be matched to it.
create or replace function public.problem_report(p jsonb)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_source text := coalesce(nullif(p ->> 'source', ''), 'app');
  v_message text := left(btrim(coalesce(p ->> 'message', '')), 300);
  v_place text := left(btrim(coalesce(p ->> 'place', '')), 200);
  v_session text := left(coalesce(p ->> 'session', ''), 40);
  v_release text := left(coalesce(p ->> 'release', ''), 40);
  v_ref text := 'M-' || upper(substr(md5(gen_random_uuid()::text), 1, 5));
  v_fp text;
  pr public.app_problems;
  v_new boolean := false;
  v_back boolean := false;
begin
  if v_message = '' then
    return v_ref;
  end if;
  if v_source not in ('app', 'server', 'jobs') or (v_source = 'jobs' and coalesce(auth.role(), '') <> 'service_role') then
    v_source := 'app';
  end if;
  -- Noise browsers make that isn't a problem in the app.
  if v_message ~* '(ResizeObserver loop|Script error\.?$|Load failed$|cancelled$|AbortError)' then
    return v_ref;
  end if;
  -- One device in a loop doesn't flood the list: 20 an hour each.
  if v_session <> '' and (select count(*) from public.app_problem_events e where e.session = v_session and e.at > now() - interval '1 hour') >= 20 then
    return v_ref;
  end if;

  v_fp := md5(v_source || '|' || private.problem_shape(v_message) || '|' || private.problem_shape(split_part(v_place, '?', 1)));
  select * into pr from public.app_problems where fingerprint = v_fp for update;
  if pr.id is null then
    insert into public.app_problems (fingerprint, source, message, place, release)
    values (v_fp, v_source, v_message, split_part(v_place, '?', 1), v_release)
    on conflict (fingerprint) do nothing
    returning * into pr;
    if pr.id is null then
      select * into pr from public.app_problems where fingerprint = v_fp;
    else
      v_new := true;
    end if;
  end if;
  if pr.status = 'fixed' then
    v_back := true;
  end if;

  update public.app_problems set
    times = times + 1,
    last_seen = now(),
    release = case when v_release <> '' then v_release else release end,
    status = case when status = 'fixed' then 'open' else status end,
    fixed_at = case when status = 'fixed' then null else fixed_at end,
    sample = jsonb_build_object(
      'stack', left(coalesce(p ->> 'stack', ''), 4000),
      'steps', coalesce((select jsonb_agg(left(x, 80)) from (select jsonb_array_elements_text(case when jsonb_typeof(p -> 'steps') = 'array' then p -> 'steps' else '[]' end) x limit 8) s), '[]'::jsonb),
      'device', left(coalesce(p ->> 'device', ''), 200),
      'place', v_place,
      'ref', v_ref)
  where id = pr.id;
  insert into public.app_problem_days (problem_id, day, n) values (pr.id, (now() at time zone 'Asia/Kolkata')::date, 1)
  on conflict (problem_id, day) do update set n = public.app_problem_days.n + 1;

  if (select count(*) from public.app_problem_events e where e.problem_id = pr.id and e.at > now() - interval '1 day') < 200 then
    insert into public.app_problem_events (problem_id, ref, who, session, device, place, release)
    values (pr.id, v_ref, coalesce(public.jwt_email(), ''), v_session, left(coalesce(p ->> 'device', ''), 200), v_place, v_release);
  end if;

  -- Tell the admins about new problems and ones that came back (at most 10 emails a day).
  if (v_new or v_back) and (select count(*) from public.outbox o where o.kind = 'problem_new' and o.created_at > now() - interval '1 day') < 10 then
    insert into public.outbox (creator_id, kind, to_email, payload)
    select null, 'problem_new', a.email, jsonb_build_object('app', true, 'id', pr.id, 'message', v_message, 'place', split_part(v_place, '?', 1),
      'source', v_source, 'back', v_back)
    from public.app_admins a;
  end if;
  return v_ref;
end;
$$;
revoke execute on function public.problem_report(jsonb) from public;
grant execute on function public.problem_report(jsonb) to anon, authenticated, service_role;

-- What the person was doing, added from the "Something broke" screen within the hour.
create or replace function public.problem_note(p_ref text, p_note text)
returns void
language sql security definer
set search_path = public
as $$
  update public.app_problem_events set note = left(btrim(coalesce(p_note, '')), 600)
  where ref = p_ref and note = '' and at > now() - interval '1 hour';
$$;
revoke execute on function public.problem_note(text, text) from public;
grant execute on function public.problem_note(text, text) to anon, authenticated;

create or replace function public.problem_visit(p_session text)
returns void
language sql security definer
set search_path = public
as $$
  insert into public.app_visits (day, session)
  select (now() at time zone 'Asia/Kolkata')::date, left(p_session, 40)
  where char_length(coalesce(p_session, '')) between 8 and 40
  on conflict do nothing;
$$;
revoke execute on function public.problem_visit(text) from public;
grant execute on function public.problem_visit(text) to anon, authenticated;

-- The admin panel ------------------------------------------------------------------------------------------------
create or replace function public.admin_problems()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_hit integer;
  v_visits integer;
begin
  if not public.is_app_admin() then
    raise exception 'Only Miracle admins can see this.';
  end if;
  select count(distinct coalesce(nullif(e.session, ''), nullif(e.who, ''), e.ref)) into v_hit
  from public.app_problem_events e join public.app_problems x on x.id = e.problem_id
  where e.at > now() - interval '7 days' and x.status <> 'ignored';
  select count(distinct session) into v_visits from public.app_visits where day > v_today - 7;
  return jsonb_build_object(
    'release', (select release from public.app_problems where release <> '' order by last_seen desc limit 1),
    'new_today', (select count(*) from public.app_problems where first_seen at time zone 'Asia/Kolkata' >= v_today),
    'open', (select count(*) from public.app_problems where status = 'open'),
    'fixed', (select count(*) from public.app_problems where status = 'fixed'),
    'ignored', (select count(*) from public.app_problems where status = 'ignored'),
    'people', v_hit,
    'visits', v_visits,
    'list', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'source', x.source, 'message', x.message, 'place', x.place, 'status', x.status, 'release', x.release,
        'first_seen', x.first_seen, 'last_seen', x.last_seen, 'fixed_at', x.fixed_at,
        'new', x.first_seen > now() - interval '1 day',
        'device', x.sample ->> 'device',
        'times', (select coalesce(sum(d.n), 0) from public.app_problem_days d where d.problem_id = x.id and d.day > v_today - 7),
        'people', (select count(distinct coalesce(nullif(e.session, ''), nullif(e.who, ''), e.ref)) from public.app_problem_events e
                   where e.problem_id = x.id and e.at > now() - interval '7 days'),
        'days', (select jsonb_agg(coalesce((select d.n from public.app_problem_days d where d.problem_id = x.id and d.day = g::date), 0) order by g)
                 from generate_series(v_today - 6, v_today, interval '1 day') g)
      ) order by (x.status = 'open') desc, x.last_seen desc)
      from public.app_problems x
      where x.status = 'open' or x.last_seen > now() - interval '30 days'), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.admin_problems() from public, anon;
grant execute on function public.admin_problems() to authenticated;

create or replace function public.admin_problem(p_id bigint)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Only Miracle admins can see this.';
  end if;
  return (select jsonb_build_object(
    'id', x.id, 'source', x.source, 'message', x.message, 'place', x.place, 'status', x.status, 'release', x.release,
    'first_seen', x.first_seen, 'last_seen', x.last_seen, 'times', x.times, 'sample', x.sample,
    'events', coalesce((select jsonb_agg(jsonb_build_object('ref', e.ref, 'at', e.at, 'who', e.who, 'device', e.device, 'place', e.place,
        'release', e.release, 'note', e.note) order by e.at desc)
      from (select * from public.app_problem_events e where e.problem_id = x.id order by e.at desc limit 20) e), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('ref', e.ref, 'at', e.at, 'who', e.who, 'device', e.device, 'note', e.note) order by e.at desc)
      from (select * from public.app_problem_events e where e.problem_id = x.id and e.note <> '' order by e.at desc limit 5) e), '[]'::jsonb))
    from public.app_problems x where x.id = p_id);
end;
$$;
revoke execute on function public.admin_problem(bigint) from public, anon;
grant execute on function public.admin_problem(bigint) to authenticated;

create or replace function public.admin_problem_set(p_id bigint, p_status text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Only Miracle admins can do this.';
  end if;
  if p_status not in ('open', 'fixed', 'ignored') then
    raise exception 'Pick open, fixed or ignored.';
  end if;
  update public.app_problems set status = p_status, fixed_at = case when p_status = 'fixed' then now() end where id = p_id;
  return public.admin_problems();
end;
$$;
revoke execute on function public.admin_problem_set(bigint, text) from public, anon;
grant execute on function public.admin_problem_set(bigint, text) to authenticated;

-- Forget who after 30 days; drop old fixed problems after 90.
select cron.unschedule('problems-cleanup') where exists (select 1 from cron.job where jobname = 'problems-cleanup');
select cron.schedule('problems-cleanup', '45 1 * * *', $$
  delete from public.app_problem_events where at < now() - interval '30 days';
  delete from public.app_problem_days where day < current_date - 60;
  delete from public.app_visits where day < current_date - 30;
  delete from public.app_problems where status <> 'open' and last_seen < now() - interval '90 days';
$$);
