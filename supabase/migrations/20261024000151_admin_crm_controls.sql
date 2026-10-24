-- The admin panel as a CRM, part 3: controls. Feature switches that really stop the feature, limits for
-- one account, autopilot switches per creator and per brand workspace, the outbox (retry, skip), the
-- scheduled jobs (pause, resume, run now), AI usage, Instagram connections and the admin list. Every
-- change is logged in the audit trail.
--
-- * A switch only means something where the feature checks it. Each one below names what it stops:
--   sign-up triggers, the AI budget functions, claim_outbox, private.call_function (edge functions) and
--   the cron commands of SQL jobs. Switched off, AI answers "budget" so the app shows its usual
--   "used up for today" message; email waits in the outbox until the switch is back on.
-- * Limit overrides apply to one creator or one brand workspace, for requests, messages, open briefs
--   and the daily AI share. An AI override can only lower the built-in daily share.

-- 1. Switches ----------------------------------------------------------------------------------------
create table if not exists public.app_flags (
  key text primary key,
  "on" boolean not null default true,
  label text not null,
  grp text not null,
  note text not null default '',
  functions text[] not null default '{}',
  jobs text[] not null default '{}',
  sort integer not null default 0,
  reason text not null default '',
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.app_flags enable row level security;
revoke all on public.app_flags from anon, authenticated;

insert into public.app_flags (key, label, grp, note, functions, jobs, sort) values
  ('creator_signup', 'Creator sign-ups', 'Sign-ups', 'New creators asking to join, from the site and the app', '{}', '{}', 10),
  ('brand_signup', 'Brand sign-ups', 'Sign-ups', 'New brand accounts', '{}', '{}', 20),
  ('ai_creator', 'Creator AI', 'AI', 'Replies, captions, offer checks and every other creator AI', '{}', '{}', 30),
  ('ai_brand', 'Brand AI', 'AI', 'Briefs, questions and the brand helpers', '{}', '{}', 40),
  ('ai_gemini', 'Gemini backup', 'AI', 'The free Gemini backup after Workers AI runs out for the day', '{}', '{}', 50),
  ('email_send', 'Sending email', 'Email & alerts', 'Emails wait in the outbox while this is off', '{}', '{}', 60),
  ('payment_reminders', 'Payment reminders', 'Email & alerts', 'Reminder emails to brands and the creator''s payment alerts', '{payment-reminders,payment-alerts}', '{}', 70),
  ('digests', 'Digests and nudges', 'Email & alerts', 'Daily digest, day nudges and the brief digest', '{daily-digest,day-nudges}', '{brief-digest}', 80),
  ('pitch_autopilot', 'Pitch autopilot', 'Creator autopilots', 'Finding brands, sending pitches and follow-ups', '{pitch-finder}', '{pitch-sender,pitch-followups}', 90),
  ('creator_autopilots', 'Creator nudges and rebooks', 'Creator autopilots', 'Autopilot nudges, rebook offers and tracking links', '{}', '{autopilot-nudges,rebook-offers,auto-track-links}', 100),
  ('retainers', 'Retainer collabs', 'Creator autopilots', 'Making each month''s retainer collab', '{}', '{run-retainers}', 110),
  ('growth', 'Growth checkups', 'Creator autopilots', 'The weekly growth checkup', '{growth-checkup}', '{}', 120),
  ('brand_autopilots', 'Brand autopilots', 'Brand autopilots', 'Shortlist, follow-up, draft check, negotiate and rebook', '{}', '{brand-autopilots}', 130),
  ('competitor_watch', 'Competitor watch', 'Brand autopilots', 'Scanning competitor posts', '{competitor-watch}', '{}', 140),
  ('ig_sync', 'Instagram sync', 'Instagram', 'Followers, media, insights and stories', '{instagram-sync,instagram-stories}', '{}', 150),
  ('ig_publish', 'Instagram publishing', 'Instagram', 'Scheduled posts going out', '{instagram-publish}', '{instagram-publish}', 160)
on conflict (key) do nothing;

create or replace function private.flag_on(p_key text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select f."on" from public.app_flags f where f.key = p_key), true);
$$;
revoke execute on function private.flag_on(text) from public, anon, authenticated;

-- 2. Limits for one account ----------------------------------------------------------------------------
create table if not exists public.app_limit_overrides (
  id bigint generated always as identity primary key,
  key text not null check (key in ('requests_day', 'messages_hour', 'open_briefs', 'ai_day')),
  subject_kind text not null check (subject_kind in ('creator', 'workspace')),
  subject text not null,
  value integer not null check (value >= 0),
  until timestamptz,
  reason text not null default '',
  set_by text not null,
  set_at timestamptz not null default now(),
  unique (key, subject_kind, subject)
);
alter table public.app_limit_overrides enable row level security;
revoke all on public.app_limit_overrides from anon, authenticated;

create or replace function private.override_of(p_key text, p_kind text, p_subject text)
returns integer
language sql stable security definer
set search_path = public
as $$
  select o.value from public.app_limit_overrides o
  where o.key = p_key and o.subject_kind = p_kind and o.subject = p_subject and (o.until is null or o.until > now());
$$;
revoke execute on function private.override_of(text, text, text) from public, anon, authenticated;

-- The limit for whoever is acting: their own override first, else the usual new/trusted value.
create or replace function private.limit_of(p_key text, p_trusted boolean)
returns integer
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    case when p_key in ('requests_day', 'messages_hour', 'open_briefs') and auth.uid() is not null then
      case when public.is_creator() then private.override_of(p_key, 'creator', public.current_creator()::text)
           else private.override_of(p_key, 'workspace', private.owner_of(auth.uid())::text) end
    end,
    (select case when p_trusted and l.trusted_v is not null then l.trusted_v else l.new_v end from public.app_limits l where l.key = p_key));
$$;
revoke execute on function private.limit_of(text, boolean) from public, anon, authenticated;

-- 3. Where the switches apply -----------------------------------------------------------------------------
-- Sign-ups.
create or replace function private.signup_gate()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_table_name = 'creator_settings' and not private.flag_on('creator_signup') then
    raise exception 'New sign-ups are paused for a short while. Please try again in a few hours.';
  end if;
  if tg_table_name = 'brand_profiles' and not private.flag_on('brand_signup') then
    -- (A brand editing its company goes through the same insert; that's still allowed.)
    if not exists (select 1 from public.brand_profiles f where f.owner = (to_jsonb(new) ->> 'owner')::uuid) then
      raise exception 'New sign-ups are paused for a short while. Please try again in a few hours.';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.signup_gate() from public, anon, authenticated;
drop trigger if exists signup_gate on public.creator_settings;
create trigger signup_gate before insert on public.creator_settings for each row when (new.status = 'pending') execute function private.signup_gate();
drop trigger if exists signup_gate on public.brand_profiles;
create trigger signup_gate before insert on public.brand_profiles for each row execute function private.signup_gate();

-- AI: the four budget functions keep their bodies (moved to private.*); the public names check the
-- switches and any lower daily share set for this account first.
alter function public.ai_take2(text, integer) set schema private;
alter function private.ai_take2(text, integer) rename to ai_take2_do;
alter function public.ai_take_gemini(text) set schema private;
alter function private.ai_take_gemini(text) rename to ai_take_gemini_do;
alter function public.ai_take_brand(text, integer) set schema private;
alter function private.ai_take_brand(text, integer) rename to ai_take_brand_do;
alter function public.ai_take_brand_gemini(text) set schema private;
alter function private.ai_take_brand_gemini(text) rename to ai_take_brand_gemini_do;
revoke execute on function private.ai_take2_do(text, integer), private.ai_take_gemini_do(text), private.ai_take_brand_do(text, integer),
  private.ai_take_brand_gemini_do(text) from public, anon, authenticated;

create or replace function public.ai_take2(p_kind text, p_cost integer)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_me integer := public.current_creator();
  v_cap integer;
  v_used integer;
begin
  if not private.flag_on('ai_creator') then return jsonb_build_object('ok', false, 'reason', 'budget', 'paused', true); end if;
  v_cap := private.override_of('ai_day', 'creator', v_me::text);
  if v_cap is not null then
    select coalesce(sum(cost), 0) into v_used from public.ai_usage where creator_id = v_me and day = private.ai_day() and kind not like 'gemini%';
    if v_used + greatest(1, least(coalesce(p_cost, 150), 2000)) > v_cap then return jsonb_build_object('ok', false, 'reason', 'budget', 'used', v_used, 'capped', true); end if;
  end if;
  return private.ai_take2_do(p_kind, p_cost);
end;
$$;

create or replace function public.ai_take_gemini(p_kind text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_me integer := public.current_creator();
  v_cap integer := private.override_of('ai_day', 'creator', public.current_creator()::text);
begin
  if not private.flag_on('ai_creator') or not private.flag_on('ai_gemini') then return jsonb_build_object('ok', false, 'reason', 'budget', 'paused', true); end if;
  if v_cap is not null and (select coalesce(sum(cost), 0) from public.ai_usage where creator_id = v_me and day = private.ai_day() and kind not like 'gemini%') >= v_cap then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'capped', true);
  end if;
  return private.ai_take_gemini_do(p_kind);
end;
$$;

create or replace function public.ai_take_brand(p_kind text, p_cost integer)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid := private.ai_brand_owner();
  v_cap integer;
  v_used integer;
begin
  if v_owner is not null and not private.flag_on('ai_brand') then return jsonb_build_object('ok', false, 'reason', 'budget', 'paused', true); end if;
  v_cap := private.override_of('ai_day', 'workspace', v_owner::text);
  if v_cap is not null then
    select coalesce(sum(cost), 0) into v_used from public.brand_ai_usage where owner = v_owner and day = private.ai_day() and kind not like 'gemini%';
    if v_used + greatest(1, least(coalesce(p_cost, 300), 2000)) > v_cap then return jsonb_build_object('ok', false, 'reason', 'budget', 'used', v_used, 'capped', true); end if;
  end if;
  return private.ai_take_brand_do(p_kind, p_cost);
end;
$$;

create or replace function public.ai_take_brand_gemini(p_kind text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid := private.ai_brand_owner();
  v_cap integer := private.override_of('ai_day', 'workspace', private.ai_brand_owner()::text);
begin
  if not private.flag_on('ai_brand') or not private.flag_on('ai_gemini') then return jsonb_build_object('ok', false, 'reason', 'budget', 'paused', true); end if;
  if v_cap is not null and (select coalesce(sum(cost), 0) from public.brand_ai_usage where owner = v_owner and day = private.ai_day() and kind not like 'gemini%') >= v_cap then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'capped', true);
  end if;
  return private.ai_take_brand_gemini_do(p_kind);
end;
$$;
revoke execute on function public.ai_take2(text, integer), public.ai_take_gemini(text), public.ai_take_brand(text, integer), public.ai_take_brand_gemini(text) from public, anon;
grant execute on function public.ai_take2(text, integer), public.ai_take_gemini(text), public.ai_take_brand(text, integer), public.ai_take_brand_gemini(text) to authenticated;

-- Email: the sender claims nothing while sending is off.
alter function public.claim_outbox(integer) set schema private;
alter function private.claim_outbox(integer) rename to claim_outbox_do;
revoke execute on function private.claim_outbox_do(integer) from public, anon, authenticated;
create or replace function public.claim_outbox(n integer default 20)
returns setof public.outbox
language plpgsql security definer
set search_path = public
as $$
begin
  if not private.flag_on('email_send') then return; end if;
  return query select * from private.claim_outbox_do(n);
end;
$$;
revoke execute on function public.claim_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_outbox(integer) to service_role;

-- Edge functions: a switch that lists a function stops every call to it (cron jobs and triggers alike).
alter function private.call_function(text) rename to call_function_do;
revoke execute on function private.call_function_do(text) from public, anon, authenticated;
create or replace function private.call_function(fn text)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.app_flags f where not f."on" and fn = any (f.functions)) then
    return;
  end if;
  perform private.call_function_do(fn);
end;
$$;
revoke execute on function private.call_function(text) from public, anon, authenticated;

-- SQL jobs: each job a switch lists runs only while the switch is on.
do $$
declare
  f record;
  j record;
begin
  for f in select key, jobs from public.app_flags where jobs <> '{}' loop
    for j in select jobid, command from cron.job where jobname = any (f.jobs) loop
      if j.command not like '%flag_on%' then
        perform cron.alter_job(j.jobid, command := rtrim(btrim(j.command), ';') || ' where private.flag_on(' || quote_literal(f.key) || ')');
      end if;
    end loop;
  end loop;
exception when others then
  raise notice 'Scheduled jobs not changed: %', sqlerrm;
end $$;

-- 4. Admin controls -------------------------------------------------------------------------------------
-- Switches, limits, overrides and the built-in AI shares, for the Controls screen.
create or replace function public.admin_controls()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  return jsonb_build_object(
    'flags', coalesce((select jsonb_agg(jsonb_build_object('key', f.key, 'on', f."on", 'label', f.label, 'group', f.grp, 'note', f.note,
        'functions', to_jsonb(f.functions), 'jobs', to_jsonb(f.jobs), 'reason', nullif(f.reason, ''), 'by', nullif(f.updated_by, ''), 'at', f.updated_at) order by f.sort)
      from public.app_flags f), '[]'::jsonb),
    'limits', coalesce((select jsonb_agg(jsonb_build_object('key', l.key, 'new', l.new_v, 'trusted', l.trusted_v) order by l.sort) from public.app_limits l), '[]'::jsonb),
    'overrides', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'key', o.key, 'kind', o.subject_kind, 'subject', o.subject, 'value', o.value,
        'until', o.until, 'reason', nullif(o.reason, ''), 'by', o.set_by, 'at', o.set_at, 'expired', o.until is not null and o.until <= now(),
        'name', case o.subject_kind
          when 'creator' then (select coalesce(nullif(s.display_name, ''), s.creator_email) from public.creator_settings s where s.id::text = o.subject)
          else (select coalesce(f.name, u.email) from auth.users u left join public.brand_profiles f on f.owner = u.id where u.id::text = o.subject) end) order by o.set_at desc)
      from public.app_limit_overrides o), '[]'::jsonb),
    'ai', jsonb_build_object('creator_day', 9000, 'creator_gemini', 250, 'brand_day', 3000, 'brand_gemini', 20,
      'today_creators', (select coalesce(sum(cost), 0) from public.ai_usage where day = private.ai_day() and kind not like 'gemini%'),
      'today_brands', (select coalesce(sum(cost), 0) from public.brand_ai_usage where day = private.ai_day() and kind not like 'gemini%'),
      'today_gemini', (select coalesce(sum(calls), 0) from public.ai_usage where day = private.ai_day() and kind like 'gemini%')
        + (select coalesce(sum(calls), 0) from public.brand_ai_usage where day = private.ai_day() and kind like 'gemini%')));
end;
$$;

create or replace function public.admin_flag_set(p_key text, p_on boolean, p_reason text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  f public.app_flags;
begin
  perform private.admin_check();
  select * into f from public.app_flags where key = p_key;
  if f.key is null then raise exception 'Unknown switch.'; end if;
  if not p_on and btrim(coalesce(p_reason, '')) = '' then raise exception 'Say why you''re switching it off.'; end if;
  update public.app_flags set "on" = p_on, reason = left(btrim(coalesce(p_reason, '')), 300), updated_by = public.jwt_email(), updated_at = now() where key = p_key;
  perform private.admin_log(case when p_on then 'switch_on' else 'switch_off' end, 'flag', p_key, f.label,
    jsonb_build_object('on', f."on"), jsonb_build_object('on', p_on), p_reason);
  return public.admin_controls();
end;
$$;

create or replace function public.admin_override_set(p_key text, p_kind text, p_subject text, p_value integer, p_until timestamptz default null, p_reason text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_old integer;
  v_name text;
  v_max integer;
begin
  perform private.admin_check();
  if p_key not in ('requests_day', 'messages_hour', 'open_briefs', 'ai_day') then raise exception 'That limit can''t be set for one account.'; end if;
  if p_kind not in ('creator', 'workspace') then raise exception 'Pick a creator or a workspace.'; end if;
  if p_key in ('requests_day', 'open_briefs') and p_kind = 'creator' then raise exception 'That limit is for brand workspaces.'; end if;
  if p_value is null or p_value < 0 then raise exception 'Give a number of zero or more.'; end if;
  if p_until is not null and p_until <= now() then raise exception 'The end date has to be in the future.'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Say why, for the audit trail.'; end if;
  v_max := case p_kind when 'creator' then 9000 else 3000 end;
  if p_key = 'ai_day' and p_value > v_max then
    raise exception 'The AI share can only be lowered (up to % a day).', v_max;
  end if;
  if p_kind = 'creator' then
    select coalesce(nullif(display_name, ''), creator_email) into v_name from public.creator_settings where id::text = p_subject;
  else
    select coalesce(f.name, u.email) into v_name from auth.users u left join public.brand_profiles f on f.owner = u.id
    where u.id::text = p_subject and u.id in (select private.workspace_ids());
  end if;
  if v_name is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  select value into v_old from public.app_limit_overrides where key = p_key and subject_kind = p_kind and subject = p_subject;
  insert into public.app_limit_overrides (key, subject_kind, subject, value, until, reason, set_by)
  values (p_key, p_kind, p_subject, p_value, p_until, left(btrim(p_reason), 300), public.jwt_email())
  on conflict (key, subject_kind, subject) do update set value = excluded.value, until = excluded.until, reason = excluded.reason, set_by = excluded.set_by, set_at = now();
  perform private.admin_log('limit_override', p_kind, p_subject, v_name, jsonb_build_object(p_key, v_old),
    jsonb_build_object(p_key, p_value, 'until', p_until), p_reason);
  return public.admin_controls();
end;
$$;

create or replace function public.admin_override_delete(p_id bigint, p_reason text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  o public.app_limit_overrides;
begin
  perform private.admin_check();
  delete from public.app_limit_overrides where id = p_id returning * into o;
  if o.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  perform private.admin_log('limit_override_removed', o.subject_kind, o.subject, '', jsonb_build_object(o.key, o.value), jsonb_build_object(o.key, 'default'), p_reason);
  return public.admin_controls();
end;
$$;

-- Autopilots on one creator: each switch as the creator would flip it in Settings.
create or replace function public.admin_creator_autopilot(p_id integer, p_key text, p_on boolean, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_col text := case p_key
    when 'packages' then 'autopilot_packages' when 'counter' then 'autopilot_counter' when 'nudge' then 'autopilot_nudge'
    when 'review' then 'autopilot_review' when 'brief' then 'autopilot_brief' when 'invoice' then 'autopilot_invoice'
    when 'dates' then 'autopilot_dates' when 'track' then 'autopilot_track' when 'pitch' then 'pitch_auto'
    when 'instant_booking' then 'instant_booking' when 'rebook' then 'rebook_offer' when 'demand_pricing' then 'demand_pricing' end;
  v_before text;
  s public.creator_settings;
begin
  perform private.admin_check();
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Say why, for the audit trail.'; end if;
  select * into s from public.creator_settings where id = p_id;
  if s.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  if p_key = 'comment_dm' then
    if p_on then raise exception 'Only the creator can turn comment replies on.'; end if;
    v_before := s.comment_dm_mode;
    update public.creator_settings set comment_dm_mode = 'off' where id = p_id;
  elsif v_col is null then
    raise exception 'Unknown autopilot.';
  else
    execute format('select (%I)::text from public.creator_settings where id = $1', v_col) into v_before using p_id;
    execute format('update public.creator_settings set %I = $1 where id = $2', v_col) using p_on, p_id;
  end if;
  perform private.admin_log(case when p_on then 'autopilot_on' else 'autopilot_off' end, 'creator', p_id::text, coalesce(nullif(s.display_name, ''), s.creator_email),
    jsonb_build_object(p_key, v_before), jsonb_build_object(p_key, case when p_key = 'comment_dm' then 'off' else p_on::text end), p_reason);
  return public.admin_creator(p_id);
end;
$$;

create or replace function public.admin_workspace_autopilot(p_owner uuid, p_key text, p_mode text, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_before text;
begin
  perform private.admin_check();
  if p_key not in ('shortlist', 'followup', 'draftcheck', 'negotiate', 'rebook', 'watch') then raise exception 'Unknown autopilot.'; end if;
  if p_mode not in ('off', 'ask', 'auto') then raise exception 'Pick off, ask first or automatic.'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Say why, for the audit trail.'; end if;
  if p_owner not in (select private.workspace_ids()) then raise exception 'Not found.' using errcode = 'P0002'; end if;
  insert into public.brand_autopilots (owner) values (p_owner) on conflict (owner) do nothing;
  execute format('select %I from public.brand_autopilots where owner = $1', p_key) into v_before using p_owner;
  execute format('update public.brand_autopilots set %I = $1, updated_at = now() where owner = $2', p_key) using p_mode, p_owner;
  perform private.admin_log('autopilot_' || p_mode, 'workspace', p_owner::text, (select name from public.brand_profiles where owner = p_owner),
    jsonb_build_object(p_key, v_before), jsonb_build_object(p_key, p_mode), p_reason);
  return public.admin_workspace(p_owner);
end;
$$;

-- The outbox: send a failed email again, or stop one from going.
create or replace function public.admin_outbox_set(p_ids bigint[], p_action text, p_reason text default '')
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  n integer;
begin
  perform private.admin_check();
  if p_action not in ('retry', 'skip') then raise exception 'Pick retry or skip.'; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 or array_length(p_ids, 1) > 500 then raise exception 'Pick between 1 and 500 emails.'; end if;
  if p_action = 'retry' then
    update public.outbox set status = 'pending', attempts = 0, last_error = null where id = any (p_ids) and status in ('failed', 'skipped');
  else
    update public.outbox set status = 'skipped', last_error = left('Skipped by Miracle: ' || coalesce(nullif(btrim(p_reason), ''), 'no reason'), 300)
    where id = any (p_ids) and status in ('failed', 'pending');
  end if;
  get diagnostics n = row_count;
  if n > 0 then
    perform private.admin_log('outbox_' || p_action, 'outbox', array_to_string(p_ids[1:20], ','), n || ' email' || case when n = 1 then '' else 's' end,
      null, jsonb_build_object('emails', n), p_reason);
    if p_action = 'retry' then perform private.call_function('process-outbox'); end if;
  end if;
  return n;
end;
$$;

-- Scheduled jobs: what each runs is never shown (it can name settings); only its name, schedule and runs.
create or replace function public.admin_jobs()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  return coalesce((select jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'active', j.active,
      'last', (select jsonb_build_object('status', d.status, 'start', d.start_time, 'end', d.end_time, 'message', left(coalesce(d.return_message, ''), 200))
               from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1),
      'runs', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '1 day'),
      'failed', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '1 day' and d.status = 'failed'),
      'kind', case when j.command like '%call_function(%' then 'edge' when j.command ilike '%delete from%' then 'cleanup' else 'sql' end,
      'switch', (select f.key from public.app_flags f where j.jobname = any (f.jobs) or substring(j.command from 'call_function\(''([a-z-]+)''\)') = any (f.functions) limit 1))
    order by j.jobname) from cron.job j), '[]'::jsonb);
end;
$$;

create or replace function public.admin_job_set(p_name text, p_active boolean, p_reason text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  j record;
begin
  perform private.admin_check();
  select jobid, active into j from cron.job where jobname = p_name;
  if j.jobid is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  if not p_active and btrim(coalesce(p_reason, '')) = '' then raise exception 'Say why you''re pausing it.'; end if;
  perform cron.alter_job(j.jobid, active := p_active);
  perform private.admin_log(case when p_active then 'job_resume' else 'job_pause' end, 'job', p_name, p_name,
    jsonb_build_object('active', j.active), jsonb_build_object('active', p_active), p_reason);
  return public.admin_jobs();
end;
$$;

create or replace function public.admin_job_run(p_name text, p_reason text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  j record;
  v_err text;
begin
  perform private.admin_check();
  select jobid, command into j from cron.job where jobname = p_name;
  if j.jobid is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  begin
    execute j.command;
  exception when others then
    v_err := left(sqlerrm, 300);
  end;
  perform private.admin_log('job_run', 'job', p_name, p_name, null, jsonb_build_object('ok', v_err is null, 'error', v_err), p_reason);
  return jsonb_build_object('ok', v_err is null, 'error', v_err, 'jobs', public.admin_jobs());
end;
$$;

-- Admins.
create or replace function public.admin_admins()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  return coalesce((select jsonb_agg(jsonb_build_object('email', a.email, 'added_at', a.added_at, 'me', a.email = public.jwt_email(),
      'last_sign_in', (select max(u.last_sign_in_at) from auth.users u where lower(u.email) = a.email),
      'actions_30d', (select count(*) from public.admin_audit x where x.admin = a.email and x.at > now() - interval '30 days')) order by a.added_at)
    from public.app_admins a), '[]'::jsonb);
end;
$$;

create or replace function public.admin_admin_set(p_email text, p_add boolean, p_reason text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  n integer;
begin
  perform private.admin_check();
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Say why, for the audit trail.'; end if;
  if p_add then
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Type a full email address.'; end if;
    if exists (select 1 from public.creator_settings s where lower(s.creator_email) = v_email) then raise exception 'That email has a creator studio. Use a separate email for admin work.'; end if;
    insert into public.app_admins (email) values (v_email) on conflict do nothing;
  else
    if v_email = public.jwt_email() then raise exception 'You can''t remove yourself.'; end if;
    delete from public.app_admins where email = v_email;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'Not an admin.'; end if;
  end if;
  perform private.admin_log(case when p_add then 'admin_add' else 'admin_remove' end, 'admins', v_email, v_email, null, jsonb_build_object('admin', p_add), p_reason);
  return public.admin_admins();
end;
$$;

-- 5. Lists for the System section: the outbox, inbound mail, AI usage (per account per day) and Instagram
-- connections. (This replaces the part 2 admin_rows; only these branches are new.)
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

  elsif p_kind = 'brands' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', b.id::text,
      '_search', lower(concat_ws(' ', b.name, b.category, b.instagram, b.website, s.display_name, b.accounts_email)),
      'id', b.id, 'name', b.name, 'category', nullif(b.category, ''), 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'collabs', (select count(*) from public.collabs c where c.brand_id = b.id),
      'open', (select count(*) from public.collabs c where c.brand_id = b.id and c.stage not in ('wrapped', 'cancelled', 'declined')),
      'paid', (select coalesce(sum(i.total), 0) from public.invoices i join public.collabs c on c.id = i.collab_id where c.brand_id = b.id and i.status = 'paid'),
      'logins', (select count(*) from public.brand_members m where m.brand_id = b.id),
      'gst', coalesce(b.gstin, '') <> '',
      'last_collab', (select max(c.created_at) from public.collabs c where c.brand_id = b.id),
      'created', b.created_at))
    from public.brands b left join public.creator_settings s on s.id = b.creator_id;

  elsif p_kind = 'collabs' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', c.id::text,
      '_search', lower(concat_ws(' ', c.code, b.name, s.display_name, c.contact_name, c.contact_email, c.product)),
      'id', c.id, 'code', c.code, 'brand', b.name, 'brand_id', b.id, 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'stage', c.stage::text, 'pay', c.pay_status, 'type', c.type, 'source', c.source, 'fee', c.fee,
      'live', c.live_date, 'pay_due', c.pay_due, 'contact', nullif(c.contact_email, ''),
      'messages', (select count(*) from public.collab_messages m where m.collab_id = c.id),
      'invoiced', (select coalesce(sum(i.total), 0) from public.invoices i where i.collab_id = c.id),
      'received', (select coalesce(sum(i.amount_received), 0) from public.invoices i where i.collab_id = c.id),
      'updated', c.updated_at, 'created', c.created_at))
    from public.collabs c left join public.brands b on b.id = c.brand_id left join public.creator_settings s on s.id = c.creator_id;

  elsif p_kind = 'quotes' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', q.id::text,
      '_search', lower(concat_ws(' ', c.code, b.name, s.display_name, q.accepted_email)),
      'id', q.id, 'collab_id', c.id, 'code', c.code, 'brand', b.name, 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'version', q.version, 'total', q.total, 'status', q.status, 'advance_pct', q.advance_pct, 'sent_at', q.sent_at, 'responded_at', q.responded_at,
      'valid_until', q.valid_until, 'accepted_by', nullif(q.accepted_email, ''), 'created', q.created_at))
    from public.quotes q join public.collabs c on c.id = q.collab_id left join public.brands b on b.id = c.brand_id left join public.creator_settings s on s.id = c.creator_id;

  elsif p_kind = 'invoices' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', i.id::text,
      '_search', lower(concat_ws(' ', i.number, c.code, b.name, s.display_name, i.send_to)),
      'id', i.id, 'collab_id', c.id, 'number', i.number, 'code', c.code, 'brand', b.name, 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'kind', i.kind, 'total', i.total, 'received', i.amount_received, 'outstanding', greatest(i.total - i.amount_received - i.tds_deducted, 0),
      'status', i.status, 'due', i.due_date, 'paid_on', i.paid_on, 'sent_at', i.sent_at,
      'overdue', i.status in ('sent', 'partly_paid') and i.due_date < (now() at time zone 'Asia/Kolkata')::date,
      'reminders', i.auto_remind, 'reminders_sent', i.reminders_sent, 'created', i.created_at))
    from public.invoices i left join public.collabs c on c.id = i.collab_id left join public.brands b on b.id = c.brand_id left join public.creator_settings s on s.id = i.creator_id;

  elsif p_kind = 'payments' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', a.id::text,
      '_search', lower(concat_ws(' ', a.sender, a.ref, i.number, s.display_name, a.amount::text)),
      'id', a.id, 'amount', a.amount, 'sender', nullif(a.sender, ''), 'ref', nullif(a.ref, ''), 'status', a.status,
      'invoice', i.number, 'collab_id', i.collab_id, 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'note', nullif(a.note, ''), 'created', coalesce(a.received_at, a.created_at)))
    from public.bank_alerts a left join public.invoices i on i.id = a.invoice_id left join public.creator_settings s on s.id = a.creator_id;

  elsif p_kind = 'drafts' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', d.id::text,
      '_search', lower(concat_ws(' ', c.code, b.name, s.display_name, d.status)),
      'id', d.id, 'collab_id', c.id, 'code', c.code, 'brand', b.name, 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'round', d.round, 'status', d.status, 'submitted_at', d.submitted_at, 'responded_at', d.responded_at,
      'waiting_days', case when d.status = 'pending' and d.submitted_at is not null then extract(day from now() - d.submitted_at)::int end,
      'comments', (select count(*) from public.draft_comments x where x.draft_id = d.id), 'created', d.submitted_at))
    from public.drafts d join public.collabs c on c.id = d.collab_id left join public.brands b on b.id = c.brand_id left join public.creator_settings s on s.id = c.creator_id;

  elsif p_kind = 'posts' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', x.id::text,
      '_search', lower(concat_ws(' ', c.code, b.name, s.display_name, x.status, x.error)),
      'id', x.id, 'collab_id', c.id, 'code', c.code, 'brand', b.name, 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'status', x.status, 'publish_at', x.publish_at, 'error', nullif(x.error, ''), 'permalink', x.permalink, 'created', x.created_at))
    from public.scheduled_posts x left join public.collabs c on c.id = x.collab_id left join public.brands b on b.id = c.brand_id left join public.creator_settings s on s.id = x.creator_id;

  elsif p_kind = 'campaigns' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', k.id::text,
      '_search', lower(concat_ws(' ', k.name, f.name, u.email)),
      'id', k.id, 'name', k.name, 'workspace', coalesce(f.name, u.email), 'workspace_id', k.owner, 'status', k.status,
      'open', k.open, 'open_until', k.open_until, 'budget', k.budget_total,
      'creators', (select count(*) from public.campaign_creators x where x.campaign_id = k.id),
      'applications', (select count(*) from public.campaign_applications x where x.campaign_id = k.id),
      'collabs', (select count(*) from public.campaign_creators x where x.campaign_id = k.id and x.collab_id is not null),
      'sent_at', k.sent_at, 'created', k.created_at))
    from public.brand_campaigns k left join auth.users u on u.id = k.owner left join public.brand_profiles f on f.owner = k.owner;

  elsif p_kind = 'pools' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', p.id::text,
      '_search', lower(concat_ws(' ', p.name, f.name, u.email)),
      'id', p.id, 'name', p.name, 'workspace', coalesce(f.name, u.email), 'workspace_id', p.owner,
      'creators', (select count(*) from public.brand_pool_members m where m.pool_id = p.id),
      'on_miracle', (select count(*) from public.brand_pool_members m where m.pool_id = p.id and m.creator_id is not null),
      'campaigns', (select count(*) from public.brand_campaigns k where k.pool_id = p.id), 'created', p.created_at))
    from public.brand_pools p left join auth.users u on u.id = p.owner left join public.brand_profiles f on f.owner = p.owner;

  elsif p_kind = 'retainers' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', r.id::text,
      '_search', lower(concat_ws(' ', r.title, b.name, s.display_name, r.contact_email)),
      'id', r.id, 'title', r.title, 'brand', b.name, 'brand_id', b.id, 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'fee', r.fee, 'months', r.months, 'starts_on', r.starts_on, 'active', r.active,
      'collabs', (select count(*) from public.collabs c where c.retainer_id = r.id), 'created', r.created_at))
    from public.retainers r left join public.brands b on b.id = r.brand_id left join public.creator_settings s on s.id = r.creator_id;

  elsif p_kind = 'pitches' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', x.id::text,
      '_search', lower(concat_ws(' ', x.brand_name, x.category, x.email, x.instagram, s.display_name)),
      'id', x.id, 'brand', x.brand_name, 'category', nullif(x.category, ''), 'email', nullif(x.email, ''), 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'status', x.status, 'source', nullif(x.source, ''), 'auto_follow', x.auto_follow, 'followups', x.followups, 'approved', x.approved,
      'sent_at', x.sent_at, 'next_follow_on', x.next_follow_on, 'replied_at', x.replied_at, 'collab_id', x.collab_id, 'created', x.created_at))
    from public.pitches x left join public.creator_settings s on s.id = x.creator_id;

  elsif p_kind = 'outbox' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', o.id::text,
      '_search', lower(concat_ws(' ', o.kind, o.to_email, o.last_error, s.display_name, o.status)),
      'id', o.id, 'kind', o.kind, 'to', coalesce(nullif(o.to_email, ''), s.creator_email), 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'status', o.status, 'attempts', o.attempts, 'error', nullif(o.last_error, ''), 'sent_at', o.sent_at, 'created', o.created_at))
    from public.outbox o left join public.creator_settings s on s.id = o.creator_id;

  elsif p_kind = 'inbound' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', e.msg_id,
      '_search', lower(concat_ws(' ', e.sender, e.subject, e.action, s.display_name, c.code)),
      'sender', e.sender, 'subject', nullif(e.subject, ''), 'action', nullif(e.action, ''), 'collab_id', e.collab_id, 'code', c.code,
      'creator', nullif(s.display_name, ''), 'creator_id', s.id, 'created', e.created_at))
    from public.inbound_emails e left join public.creator_settings s on s.id = e.creator_id left join public.collabs c on c.id = e.collab_id;

  elsif p_kind = 'ai_usage' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', 'c:' || u.creator_id || ':' || u.day,
      '_search', lower(concat_ws(' ', s.display_name, s.creator_email, string_agg(u.kind, ' '))),
      'side', 'creator', 'account', coalesce(nullif(s.display_name, ''), s.creator_email), 'account_id', u.creator_id::text, 'day', u.day,
      'calls', sum(u.calls) filter (where u.kind not like 'gemini%'), 'cost', sum(u.cost), 'gemini', coalesce(sum(u.calls) filter (where u.kind like 'gemini%'), 0),
      'share', round(100.0 * sum(u.cost) / 9000), 'capped', private.override_of('ai_day', 'creator', u.creator_id::text),
      'kinds', string_agg(distinct regexp_replace(u.kind, '^gemini:', ''), ', '), 'created', u.day::timestamptz))
    from public.ai_usage u left join public.creator_settings s on s.id = u.creator_id
    group by u.creator_id, u.day, s.display_name, s.creator_email
    union all
    select jsonb_strip_nulls(jsonb_build_object('_key', 'w:' || u.owner || ':' || u.day,
      '_search', lower(concat_ws(' ', f.name, x.email, string_agg(u.kind, ' '))),
      'side', 'workspace', 'account', coalesce(f.name, x.email), 'account_id', u.owner::text, 'day', u.day,
      'calls', sum(u.calls) filter (where u.kind not like 'gemini%'), 'cost', sum(u.cost), 'gemini', coalesce(sum(u.calls) filter (where u.kind like 'gemini%'), 0),
      'share', round(100.0 * sum(u.cost) / 3000), 'capped', private.override_of('ai_day', 'workspace', u.owner::text),
      'kinds', string_agg(distinct regexp_replace(u.kind, '^gemini:', ''), ', '), 'created', u.day::timestamptz))
    from public.brand_ai_usage u left join public.brand_profiles f on f.owner = u.owner left join auth.users x on x.id = u.owner
    group by u.owner, u.day, f.name, x.email;

  elsif p_kind = 'instagram' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', 'c:' || a.creator_id,
      '_search', lower(concat_ws(' ', a.username, s.display_name, s.creator_email, a.last_error)),
      'side', 'creator', 'account', coalesce(nullif(s.display_name, ''), s.creator_email), 'account_id', a.creator_id::text,
      'username', a.username, 'followers', a.followers, 'connected', coalesce(a.connected, false), 'expires', a.token_expires_at,
      'expiring', coalesce(a.connected, false) and a.token_expires_at < now() + interval '7 days',
      'synced', a.last_sync_at, 'error', nullif(a.last_error, ''), 'created', a.updated_at))
    from public.ig_account a left join public.creator_settings s on s.id = a.creator_id
    union all
    select jsonb_strip_nulls(jsonb_build_object('_key', 'w:' || g.owner,
      '_search', lower(concat_ws(' ', g.username, f.name, x.email)),
      'side', 'workspace', 'account', coalesce(f.name, x.email), 'account_id', g.owner::text,
      'username', g.username, 'followers', g.followers, 'connected', true, 'expires', t.expires_at,
      'expiring', t.expires_at < now() + interval '7 days', 'synced', g.synced_at, 'created', g.connected_at))
    from public.brand_ig g left join public.brand_ig_token t on t.owner = g.owner left join public.brand_profiles f on f.owner = g.owner left join auth.users x on x.id = g.owner;

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

-- 6. Who can call what: signed-in admins only (each function checks), never anon.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_controls()', 'public.admin_flag_set(text, boolean, text)', 'public.admin_override_set(text, text, text, integer, timestamptz, text)',
    'public.admin_override_delete(bigint, text)', 'public.admin_creator_autopilot(integer, text, boolean, text)',
    'public.admin_workspace_autopilot(uuid, text, text, text)', 'public.admin_outbox_set(bigint[], text, text)', 'public.admin_jobs()',
    'public.admin_job_set(text, boolean, text)', 'public.admin_job_run(text, text)', 'public.admin_admins()', 'public.admin_admin_set(text, boolean, text)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
