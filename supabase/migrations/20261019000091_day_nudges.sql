-- Fun nudges through the day: a light, funny phone notification every hour (11 AM to 11 PM India time
-- to start). Work lines come from her real day; water and food in between; yoga at 6 PM; a wind-down
-- at the end. Every one sent is kept, so no line is ever sent twice.

alter table public.creator_settings add column if not exists fun_nudges boolean not null default true;
alter table public.creator_settings add column if not exists fun_from smallint not null default 11;
alter table public.creator_settings add column if not exists fun_to smallint not null default 23;
alter table public.creator_settings add column if not exists fun_yoga_hour smallint not null default 18;
alter table public.creator_settings add column if not exists fun_food boolean not null default true;
alter table public.creator_settings drop constraint if exists creator_settings_fun_hours_check;
alter table public.creator_settings add constraint creator_settings_fun_hours_check
  check (fun_from between 5 and 23 and fun_to between 5 and 23 and fun_from <= fun_to and (fun_yoga_hour = 0 or fun_yoga_hour between 5 and 23));

-- Every nudge sent. "norm" is the words alone (lower case, no punctuation), so the same line can't go
-- out twice; the hourly job also compares new lines with recent ones and drops near-copies.
create table if not exists public.fun_nudges_sent (
  id      bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  kind    text not null,
  topic   text not null default '',
  title   text not null,
  body    text not null,
  source  text not null default 'ai',
  norm    text not null unique
);
create index if not exists fun_nudges_sent_at_idx on public.fun_nudges_sent (sent_at desc);
alter table public.fun_nudges_sent enable row level security;
revoke all on public.fun_nudges_sent from anon, authenticated;

-- Single-use AI passes now say which job they are for (made only by the server's own functions).
alter table public.ai_tickets add column if not exists kind text not null default 'classify';

create or replace function public.ai_take_ticket(p_ticket text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_kind text;
  v_used integer;
  v_cost integer;
begin
  delete from public.ai_tickets where token = p_ticket and created_at > now() - interval '2 minutes' returning kind into v_kind;
  if v_kind is null then return jsonb_build_object('ok', false); end if;
  delete from public.ai_tickets where created_at < now() - interval '1 hour';
  v_cost := case v_kind when 'cheer' then 60 else 40 end;
  select coalesce(sum(cost), 0) into v_used from public.ai_usage where day = private.ai_day() and kind not like 'gemini%';
  if v_used + v_cost > 9000 then return jsonb_build_object('ok', false, 'left', 0); end if;
  insert into public.ai_usage (day, kind, calls, cost) values (private.ai_day(), v_kind, 1, v_cost)
  on conflict (day, kind) do update set calls = public.ai_usage.calls + 1, cost = public.ai_usage.cost + v_cost;
  return jsonb_build_object('ok', true, 'kind', v_kind);
end;
$$;

-- Every hour on the hour, India time (UTC + 5:30, so :30 in UTC).
select cron.unschedule('day-nudges') where exists (select 1 from cron.job where jobname = 'day-nudges');
select cron.schedule('day-nudges', '30 * * * *', $$select private.call_function('day-nudges')$$);
