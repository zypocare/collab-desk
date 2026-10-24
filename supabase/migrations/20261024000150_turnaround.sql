-- Turnaround (TAT): a clock on every handoff in a collab, who owns it, a backup, and escalation.
-- Brand side (the team owes the next step): deciding on a quote, an internal approval, reviewing a draft,
-- replying to the creator's message, paying an invoice. Creator side (shown, never escalated inside the
-- brand's team): the first quote after a request, and a revised draft after changes were asked.
--
-- * brand_tat_settings: hours allowed per handoff, whether Sundays count, whether to escalate, a backup.
-- * brand_collab_owners: who owns a collab's handoffs on the team, and their backup.
-- * brand_tat(from, to): open clocks (who is holding what, how long is left) and, for the period and the one
--   before it, median and p90 hours and the share on time per handoff and per owner.
-- * tat_escalate() every 30 minutes: past due, the owner is told; still open well past due, the backup
--   and the team's admin are told. Each clock alerts once per level (brand_tat_alerts).
-- Times are counted in India time; with "skip Sundays" a Sunday doesn't count against the clock.

create table if not exists public.brand_tat_settings (
  owner uuid primary key references auth.users (id) on delete cascade,
  hours jsonb not null default '{}'::jsonb,
  skip_sundays boolean not null default true,
  escalate boolean not null default true,
  backup uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.brand_collab_owners (
  owner uuid not null references auth.users (id) on delete cascade,
  collab_id uuid not null references public.collabs (id) on delete cascade,
  assignee uuid references auth.users (id) on delete set null,
  backup uuid references auth.users (id) on delete set null,
  set_at timestamptz not null default now(),
  primary key (owner, collab_id)
);
create table if not exists public.brand_tat_alerts (
  owner uuid not null references auth.users (id) on delete cascade,
  clock text not null,
  level smallint not null check (level in (1, 2)),
  at timestamptz not null default now(),
  primary key (owner, clock, level)
);
alter table public.brand_tat_settings enable row level security;
alter table public.brand_collab_owners enable row level security;
alter table public.brand_tat_alerts enable row level security;
revoke all on public.brand_tat_settings, public.brand_collab_owners, public.brand_tat_alerts from anon, authenticated;

-- The hours each handoff gets unless the team changes them (payment follows the invoice's due date).
create or replace function private.tat_default_hours()
returns jsonb
language sql immutable
as $$
  select '{"quote_decision": 48, "approval": 24, "draft_review": 48, "message_reply": 24, "quote_reply": 72, "draft_revision": 72}'::jsonb;
$$;

-- Clock arithmetic in India time. Hours between two moments, leaving Sundays out when asked.
create or replace function private.tat_hours(p_start timestamptz, p_end timestamptz, p_skip boolean)
returns numeric
language plpgsql immutable
as $$
declare
  v_total numeric := greatest(0, extract(epoch from (p_end - p_start)) / 3600);
  d date;
  d0 timestamptz;
  d1 timestamptz;
begin
  if p_start is null or p_end is null then return null; end if;
  if not p_skip or p_end <= p_start then return round(v_total, 2); end if;
  d := (p_start at time zone 'Asia/Kolkata')::date;
  while d <= (p_end at time zone 'Asia/Kolkata')::date loop
    if extract(dow from d) = 0 then
      d0 := d::timestamp at time zone 'Asia/Kolkata';
      d1 := (d + 1)::timestamp at time zone 'Asia/Kolkata';
      v_total := v_total - greatest(0, extract(epoch from (least(p_end, d1) - greatest(p_start, d0))) / 3600);
    end if;
    d := d + 1;
  end loop;
  return round(greatest(0, v_total), 2);
end;
$$;

-- When a clock started at p_start with p_hours to go falls due.
create or replace function private.tat_due(p_start timestamptz, p_hours numeric, p_skip boolean)
returns timestamptz
language plpgsql immutable
as $$
declare
  t timestamptz := p_start;
  left_h numeric := p_hours;
  boundary timestamptz;
  chunk numeric;
begin
  if p_start is null or p_hours is null then return null; end if;
  if not p_skip then return p_start + make_interval(secs => p_hours * 3600); end if;
  for i in 1..400 loop
    if extract(dow from (t at time zone 'Asia/Kolkata')) = 0 then
      t := (((t at time zone 'Asia/Kolkata')::date + 1)::timestamp) at time zone 'Asia/Kolkata';
    end if;
    exit when left_h <= 0;
    boundary := (((t at time zone 'Asia/Kolkata')::date + 1)::timestamp) at time zone 'Asia/Kolkata';
    chunk := least(left_h, extract(epoch from (boundary - t)) / 3600);
    t := t + make_interval(secs => chunk * 3600);
    left_h := left_h - chunk;
  end loop;
  return t;
end;
$$;

create or replace function private.tat_settings(p_owner uuid)
returns table (hours jsonb, skip_sundays boolean, escalate boolean, backup uuid)
language sql stable security definer
set search_path = public
as $$
  select private.tat_default_hours() || coalesce(s.hours, '{}'::jsonb), coalesce(s.skip_sundays, true), coalesce(s.escalate, true), s.backup
  from (select 1) x left join public.brand_tat_settings s on s.owner = p_owner;
$$;

-- Every handoff clock on a team's collabs over the last 400 days.
create or replace function private.tat_clocks(p_owner uuid)
returns table (clock text, stage text, side text, collab_id uuid, started_at timestamptz, ended_at timestamptz, due_at timestamptz, paused boolean)
language sql stable security definer
set search_path = public
as $$
  with st as (select * from private.tat_settings(p_owner)),
  cc as (select c.id, c.stage, c.created_at from private.company_collabs(p_owner) c),
  raw as (
    -- The creator's first quote after the request.
    select 'quote_reply:' || cc.id::text as clock, 'quote_reply' as stage, 'creator' as side, cc.id as collab_id, cc.created_at as started_at,
      (select min(q.sent_at) from public.quotes q where q.collab_id = cc.id and q.sent_at is not null) as ended_at, null::timestamptz as fixed_due
    from cc where cc.stage not in ('declined', 'cancelled') or exists (select 1 from public.quotes q where q.collab_id = cc.id and q.sent_at is not null)
    union all
    -- Deciding on a quote the creator sent.
    select 'quote_decision:' || q.id::text, 'quote_decision', 'brand', q.collab_id, q.sent_at, q.responded_at, null
    from public.quotes q join cc on cc.id = q.collab_id
    -- (a quote that was answered and then replaced by a newer version is "withdrawn" but still counts)
    where q.sent_at is not null and (q.status in ('sent', 'accepted', 'changes') or q.responded_at is not null)
    union all
    -- An approval inside the team (quotes above the limit).
    select 'approval:' || a.id::text, 'approval', 'brand', a.collab_id, a.created_at, a.decided_at, null
    from public.brand_approvals a where a.owner = p_owner
    union all
    -- Reviewing a draft.
    select 'draft_review:' || d.id::text, 'draft_review', 'brand', d.collab_id, d.submitted_at, d.responded_at, null
    from public.drafts d join cc on cc.id = d.collab_id where d.submitted_at is not null
    union all
    -- The creator's revised draft after changes were asked.
    select 'draft_revision:' || d.id::text, 'draft_revision', 'creator', d.collab_id, d.responded_at,
      (select min(d2.submitted_at) from public.drafts d2 where d2.collab_id = d.collab_id and d2.round > d.round), null
    from public.drafts d join cc on cc.id = d.collab_id where d.status = 'changes' and d.responded_at is not null
    union all
    -- Replying to the creator: the first of her messages after the brand last wrote starts the clock.
    select 'message_reply:' || m.id::text, 'message_reply', 'brand', m.collab_id, m.created_at,
      (select min(b.created_at) from public.collab_messages b where b.collab_id = m.collab_id and b.sender = 'brand' and b.created_at > m.created_at), null
    from (select x.*, lag(x.sender) over (partition by x.collab_id order by x.created_at) as before
          from public.collab_messages x join cc on cc.id = x.collab_id where not coalesce(x.auto, false)) m
    where m.sender = 'creator' and m.before is distinct from 'creator'
    union all
    -- Paying an invoice: due at the end of its due date.
    select 'payment:' || i.id::text, 'payment', 'brand', i.collab_id, i.sent_at,
      case when i.status = 'paid' and i.paid_on is not null then (i.paid_on + 1)::timestamp at time zone 'Asia/Kolkata' - interval '1 second' end,
      case when i.due_date is not null then (i.due_date + 1)::timestamp at time zone 'Asia/Kolkata' - interval '1 second' end
    from public.invoices i join cc on cc.id = i.collab_id
    where i.sent_at is not null and i.status in ('sent', 'partly_paid', 'paid')
  )
  select r.clock, r.stage, r.side, r.collab_id, r.started_at, r.ended_at,
    coalesce(r.fixed_due, private.tat_due(r.started_at, (st.hours ->> r.stage)::numeric, st.skip_sundays)),
    r.ended_at is null and (select c.stage = 'paused' from public.collabs c where c.id = r.collab_id)
  from raw r cross join st
  where r.started_at is not null and r.started_at > now() - interval '400 days';
$$;
revoke execute on function private.tat_hours(timestamptz, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function private.tat_due(timestamptz, numeric, boolean) from public, anon, authenticated;
revoke execute on function private.tat_settings(uuid) from public, anon, authenticated;
revoke execute on function private.tat_clocks(uuid) from public, anon, authenticated;

-- Who holds a handoff, and who covers for them: the collab's owner if one is set; approvals go to an
-- approver and payments to finance by default; everything else to the team's admin.
create or replace function private.tat_holder(p_owner uuid, p_stage text, p_collab uuid)
returns table (assignee uuid, backup uuid)
language sql stable security definer
set search_path = public
as $$
  with o as (select * from public.brand_collab_owners where owner = p_owner and collab_id = p_collab),
  role_pick as (
    select m.profile_id from public.brand_team_members m
    where m.owner = p_owner and m.joined_at is not null and m.profile_id is not null
      and m.role = case p_stage when 'approval' then 'approver' when 'payment' then 'finance' end
    order by m.joined_at limit 1
  ),
  a as (
    select coalesce(
      case when p_stage in ('approval', 'payment') then (select profile_id from role_pick) end,
      (select assignee from o),
      p_owner) as assignee
  )
  select a.assignee,
    nullif(coalesce((select backup from o), (select s.backup from public.brand_tat_settings s where s.owner = p_owner),
                    case when a.assignee <> p_owner then p_owner end), a.assignee)
  from a;
$$;
revoke execute on function private.tat_holder(uuid, text, uuid) from public, anon, authenticated;

create or replace function private.tat_person(p uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when p is null then null else jsonb_build_object('id', p,
    'name', coalesce(nullif((select pr.full_name from public.profiles pr where pr.id = p), ''), (select u.email from auth.users u where u.id = p)),
    'email', (select u.email from auth.users u where u.id = p)) end;
$$;
revoke execute on function private.tat_person(uuid) from public, anon, authenticated;

-- The turnaround report for the team this login works in.
create or replace function public.brand_tat(p_from date default null, p_to date default null)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with me as (select public.brand_owner() as owner),
  st as (select * from private.tat_settings((select owner from me))),
  win as (select coalesce(p_from, current_date - 29) as d0, coalesce(p_to, current_date) as d1),
  prev as (select (select d0 from win) - ((select d1 from win) - (select d0 from win) + 1) as d0, (select d0 from win) - 1 as d1),
  k as (select c.*, h.assignee, h.backup, private.tat_hours(c.started_at, coalesce(c.ended_at, now()), (select skip_sundays from st)) as took
        from private.tat_clocks((select owner from me)) c
        cross join lateral private.tat_holder((select owner from me), c.stage, c.collab_id) h),
  done as (select k.*, case when (k.ended_at at time zone 'Asia/Kolkata')::date between (select d0 from win) and (select d1 from win) then 'now'
                            when (k.ended_at at time zone 'Asia/Kolkata')::date between (select d0 from prev) and (select d1 from prev) then 'before' end as w
           from k where k.ended_at is not null)
  select jsonb_build_object(
    'from', (select d0 from win), 'to', (select d1 from win),
    'settings', (select jsonb_build_object('hours', st.hours, 'skip_sundays', st.skip_sundays, 'escalate', st.escalate, 'backup', private.tat_person(st.backup)) from st),
    'can_edit', private.team_role() = 'admin',
    -- Waiting right now, most urgent first.
    'open', coalesce((select jsonb_agg(jsonb_build_object(
        'clock', k.clock, 'stage', k.stage, 'side', k.side, 'started_at', k.started_at, 'due_at', k.due_at,
        'hours_left', round(case when k.due_at > now() then private.tat_hours(now(), k.due_at, (select skip_sundays from st)) else -private.tat_hours(k.due_at, now(), (select skip_sundays from st)) end, 1),
        'overdue', k.due_at is not null and k.due_at < now() and not k.paused, 'paused', k.paused,
        'collab', c.id, 'code', c.code, 'creator', s.display_name, 'company', b.name,
        'owner', case when k.side = 'brand' then private.tat_person(k.assignee) end,
        'backup', case when k.side = 'brand' then private.tat_person(k.backup) end,
        'alerted', (select max(a.level) from public.brand_tat_alerts a where a.owner = (select owner from me) and a.clock = k.clock))
        order by k.paused, k.due_at nulls last)
      from k join public.collabs c on c.id = k.collab_id join public.brands b on b.id = c.brand_id join public.creator_settings s on s.id = c.creator_id
      where k.ended_at is null and c.stage not in ('declined', 'cancelled', 'wrapped')), '[]'::jsonb),
    -- Each handoff over the period and the one before it.
    'stages', coalesce((select jsonb_agg(jsonb_build_object('stage', x.stage, 'side', x.side,
        'done', x.n, 'median', x.med, 'p90', x.p90, 'on_time', x.on_time, 'median_before', x.med_b, 'done_before', x.n_b,
        'open', (select count(*) from k where k.stage = x.stage and k.ended_at is null), 'overdue', (select count(*) from k where k.stage = x.stage and k.ended_at is null and k.due_at < now() and not k.paused))
        order by array_position(array['quote_decision', 'approval', 'draft_review', 'message_reply', 'payment', 'quote_reply', 'draft_revision'], x.stage))
      from (select g.stage, min(g.side) as side,
              count(*) filter (where g.w = 'now') as n,
              round((percentile_cont(0.5) within group (order by g.took) filter (where g.w = 'now'))::numeric, 1) as med,
              round((percentile_cont(0.9) within group (order by g.took) filter (where g.w = 'now'))::numeric, 1) as p90,
              round(100.0 * count(*) filter (where g.w = 'now' and g.ended_at <= g.due_at) / nullif(count(*) filter (where g.w = 'now' and g.due_at is not null), 0)) as on_time,
              count(*) filter (where g.w = 'before') as n_b,
              round((percentile_cont(0.5) within group (order by g.took) filter (where g.w = 'before'))::numeric, 1) as med_b
            from (select stage, side, w, took, ended_at, due_at from done union all select stage, side, null, null, null, null from k) g
            group by g.stage) x), '[]'::jsonb),
    -- Per owner on the team's side of things.
    'people', coalesce((select jsonb_agg(jsonb_build_object('person', private.tat_person(y.assignee), 'done', y.n, 'median', y.med, 'on_time', y.on_time, 'open', y.open_n, 'overdue', y.late_n) order by y.late_n desc, y.n desc)
      from (select k.assignee,
              count(*) filter (where (k.ended_at at time zone 'Asia/Kolkata')::date between (select d0 from win) and (select d1 from win)) as n,
              round((percentile_cont(0.5) within group (order by k.took) filter (where (k.ended_at at time zone 'Asia/Kolkata')::date between (select d0 from win) and (select d1 from win)))::numeric, 1) as med,
              round(100.0 * count(*) filter (where (k.ended_at at time zone 'Asia/Kolkata')::date between (select d0 from win) and (select d1 from win) and k.ended_at <= k.due_at)
                    / nullif(count(*) filter (where (k.ended_at at time zone 'Asia/Kolkata')::date between (select d0 from win) and (select d1 from win) and k.due_at is not null), 0)) as on_time,
              count(*) filter (where k.ended_at is null) as open_n,
              count(*) filter (where k.ended_at is null and k.due_at < now() and not k.paused) as late_n
            from k where k.side = 'brand' and k.assignee is not null group by k.assignee) y
      where y.n > 0 or y.open_n > 0), '[]'::jsonb),
    -- Who can own handoffs (for the pickers).
    'team', coalesce((select jsonb_agg(private.tat_person(l) || jsonb_build_object('role', case when l = (select owner from me) then 'admin' else
        (select m.role from public.brand_team_members m where m.owner = (select owner from me) and m.profile_id = l) end))
      from private.team_logins((select owner from me)) l), '[]'::jsonb),
    'owners', coalesce((select jsonb_object_agg(o.collab_id::text, jsonb_build_object('assignee', o.assignee, 'backup', o.backup))
      from public.brand_collab_owners o where o.owner = (select owner from me)), '{}'::jsonb))
  where auth.uid() is not null and not public.is_creator();
$$;
revoke execute on function public.brand_tat(date, date) from public, anon;
grant execute on function public.brand_tat(date, date) to authenticated;

-- An admin sets the hours, Sundays, escalation and the team's backup.
create or replace function public.brand_tat_save(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid := public.brand_owner();
  v_hours jsonb := '{}'::jsonb;
  k text;
  v_backup uuid := nullif(p ->> 'backup', '')::uuid;
begin
  if auth.uid() is null or public.is_creator() or private.team_role() <> 'admin' then raise exception 'Only the team''s Admin can change turnaround targets.'; end if;
  for k in select jsonb_object_keys(private.tat_default_hours()) loop
    if p -> 'hours' ? k then
      v_hours := v_hours || jsonb_build_object(k, greatest(1, least(720, round((p -> 'hours' ->> k)::numeric))));
    end if;
  end loop;
  if v_backup is not null and v_backup not in (select private.team_logins(v_owner)) then raise exception 'The backup must be on your team.'; end if;
  insert into public.brand_tat_settings (owner, hours, skip_sundays, escalate, backup)
  values (v_owner, v_hours, coalesce((p ->> 'skip_sundays')::boolean, true), coalesce((p ->> 'escalate')::boolean, true), v_backup)
  on conflict (owner) do update set
    hours = case when p ? 'hours' then excluded.hours else brand_tat_settings.hours end,
    skip_sundays = case when p ? 'skip_sundays' then excluded.skip_sundays else brand_tat_settings.skip_sundays end,
    escalate = case when p ? 'escalate' then excluded.escalate else brand_tat_settings.escalate end,
    backup = case when p ? 'backup' then excluded.backup else brand_tat_settings.backup end,
    updated_at = now();
  return public.brand_tat(null, null);
end;
$$;
revoke execute on function public.brand_tat_save(jsonb) from public, anon;
grant execute on function public.brand_tat_save(jsonb) to authenticated;

-- An admin names who owns a collab's handoffs, and their backup (both on the team; null clears).
create or replace function public.brand_tat_assign(p_collab uuid, p_assignee uuid, p_backup uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid := public.brand_owner();
begin
  if auth.uid() is null or public.is_creator() or private.team_role() <> 'admin' then raise exception 'Only the team''s Admin can assign owners.'; end if;
  if not exists (select 1 from private.company_collabs(v_owner) c where c.id = p_collab) then raise exception 'That collab isn''t your team''s.'; end if;
  if (p_assignee is not null and p_assignee not in (select private.team_logins(v_owner)))
     or (p_backup is not null and p_backup not in (select private.team_logins(v_owner))) then
    raise exception 'Owners must be on your team.';
  end if;
  if p_assignee is not null and p_assignee = p_backup then raise exception 'Pick a different person as the backup.'; end if;
  if p_assignee is null and p_backup is null then
    delete from public.brand_collab_owners where owner = v_owner and collab_id = p_collab;
  else
    insert into public.brand_collab_owners (owner, collab_id, assignee, backup) values (v_owner, p_collab, p_assignee, p_backup)
    on conflict (owner, collab_id) do update set assignee = excluded.assignee, backup = excluded.backup, set_at = now();
  end if;
  return public.brand_tat(null, null);
end;
$$;
revoke execute on function public.brand_tat_assign(uuid, uuid, uuid) from public, anon;
grant execute on function public.brand_tat_assign(uuid, uuid, uuid) to authenticated;

-- Escalation, every 30 minutes. Level 1 once a clock is past due: its owner. Level 2 once it's well past
-- due (half its allowance again, at least 12 hours; an invoice 3 days after its due date): the backup and
-- the admin. Only the team's own
-- handoffs, only clocks started in the last 30 days, never paused collabs, once per level.
create or replace function private.tat_escalate()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  t uuid;
  k record;
  v_lvl smallint;
  v_to uuid[];
  v_person uuid;
  n integer := 0;
  v_label text;
begin
  for t in select distinct m.owner from public.brand_members m loop
    continue when not (select escalate from private.tat_settings(t));
    for k in
      select c.*, h.assignee, h.backup, x.code, s.display_name as creator
      from private.tat_clocks(t) c
      cross join lateral private.tat_holder(t, c.stage, c.collab_id) h
      join public.collabs x on x.id = c.collab_id join public.creator_settings s on s.id = x.creator_id
      where c.side = 'brand' and c.ended_at is null and not c.paused and c.due_at < now()
        and c.started_at > now() - interval '30 days' and x.stage not in ('declined', 'cancelled', 'wrapped')
    loop
      v_lvl := case when now() > k.due_at + case when k.stage = 'payment' then interval '3 days' else greatest(interval '12 hours', (k.due_at - k.started_at) / 2) end then 2 else 1 end;
      continue when exists (select 1 from public.brand_tat_alerts a where a.owner = t and a.clock = k.clock and a.level >= v_lvl);
      v_label := case k.stage when 'quote_decision' then 'A quote to decide on' when 'approval' then 'A quote to approve'
        when 'draft_review' then 'A draft to review' when 'message_reply' then 'A message to answer' else 'An invoice to pay' end;
      v_to := case when v_lvl = 1 then array[k.assignee] else array(select distinct p from unnest(array[k.backup, t]) p where p is distinct from k.assignee) end;
      foreach v_person in array v_to loop
        continue when v_person is null;
        insert into public.outbox (creator_id, kind, to_email, payload)
        select null, case when v_lvl = 1 then 'tat_overdue' else 'tat_escalated' end, u.email, jsonb_build_object(
          'app', true, 'stage', k.stage, 'label', v_label, 'code', k.code, 'creator', k.creator, 'due_at', k.due_at,
          'hours_over', round(extract(epoch from (now() - k.due_at)) / 3600), 'owner', private.tat_person(k.assignee) ->> 'name')
        from auth.users u where u.id = v_person and coalesce(u.email, '') <> '';
        n := n + 1;
      end loop;
      insert into public.brand_tat_alerts (owner, clock, level) values (t, k.clock, v_lvl) on conflict do nothing;
      -- Reaching level 2 straight away still counts level 1 as done.
      insert into public.brand_tat_alerts (owner, clock, level) values (t, k.clock, 1) on conflict do nothing;
    end loop;
  end loop;
  return n;
end;
$$;
revoke execute on function private.tat_escalate() from public, anon, authenticated;

select cron.unschedule('tat-escalate') where exists (select 1 from cron.job where jobname = 'tat-escalate');
select cron.schedule('tat-escalate', '*/30 * * * *', $$select private.tat_escalate()$$);
select cron.schedule('tat-alerts-cleanup', '35 1 * * *', $$delete from public.brand_tat_alerts where at < now() - interval '120 days'$$)
where not exists (select 1 from cron.job where jobname = 'tat-alerts-cleanup');
