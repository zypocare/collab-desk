-- Pitch autopilot: every morning up to 10 new brands are found (Gemini with Google Search, then
-- each brand's own website for a public business email), a pitch is written for each, and they
-- go out from her email between 10 AM and 6 PM, one at a time. "approve": she approves each one
-- first; "auto": they go out on their own. A brand is never pitched twice.

alter table public.creator_settings add column if not exists pitch_auto boolean not null default false;
alter table public.creator_settings add column if not exists pitch_mode text not null default 'approve';
alter table public.creator_settings add column if not exists pitch_daily smallint not null default 10;
alter table public.creator_settings drop constraint if exists creator_settings_pitch_mode_check;
alter table public.creator_settings add constraint creator_settings_pitch_mode_check check (pitch_mode in ('approve', 'auto'));
alter table public.creator_settings drop constraint if exists creator_settings_pitch_daily_check;
alter table public.creator_settings add constraint creator_settings_pitch_daily_check check (pitch_daily between 1 and 10);

-- 'ready': found and written, waiting to go out. 'skipped': she passed on it (never offered again).
alter table public.pitches drop constraint if exists pitches_status_check;
alter table public.pitches add constraint pitches_status_check check (status in ('idea', 'ready', 'sent', 'replied', 'won', 'not_now', 'skipped'));
alter table public.pitches add column if not exists website text not null default '';
alter table public.pitches add column if not exists source text not null default '';
alter table public.pitches add column if not exists fit_note text not null default '';
alter table public.pitches add column if not exists found_on date;
alter table public.pitches add column if not exists approved boolean not null default false;
alter table public.pitches add column if not exists send_after timestamptz;
create index if not exists pitches_ready_idx on public.pitches (send_after) where status = 'ready';

-- Every 30 minutes from 10 AM to 6 PM (India): the next due pitch goes out, one per run.
create or replace function private.pitch_send_due()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  p public.pitches;
  h integer := extract(hour from now() at time zone 'Asia/Kolkata');
begin
  if h < 10 or h >= 18 then return 0; end if;
  select * into s from public.creator_settings where id = 1;
  select * into p from public.pitches
   where status = 'ready' and send_after <= now() and (approved or s.pitch_mode = 'auto')
     and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and btrim(subject) <> '' and btrim(body) <> ''
   order by send_after limit 1;
  if p.id is null then return 0; end if;
  insert into public.outbox (kind, to_email, payload) values ('pitch', p.email, jsonb_build_object(
    'subject', p.subject, 'body', p.body, 'name', s.display_name, 'contact', p.contact_name, 'brand', p.brand_name));
  update public.pitches set status = 'sent', sent_at = now(), followups = 0, next_follow_on = current_date + 5 where id = p.id;
  return 1;
end;
$$;
revoke execute on function private.pitch_send_due() from public;

select cron.unschedule('pitch-sender') where exists (select 1 from cron.job where jobname = 'pitch-sender');
select cron.schedule('pitch-sender', '15,45 * * * *', $$select private.pitch_send_due()$$);
-- 8:30 AM India (3:00 UTC): find and write the day's pitches.
select cron.unschedule('pitch-finder') where exists (select 1 from cron.job where jobname = 'pitch-finder');
select cron.schedule('pitch-finder', '0 3 * * *', $$select private.call_function('pitch-finder')$$);

-- The finder's AI passes (finding brands, writing pitches) use Gemini first, like the fun nudges:
-- they don't take from her Cloudflare allowance up front.
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
  v_cost := case when v_kind in ('cheer', 'scout', 'pitch') then 0 else 40 end;
  select coalesce(sum(cost), 0) into v_used from public.ai_usage where day = private.ai_day() and kind not like 'gemini%';
  if v_used + v_cost > 9000 then return jsonb_build_object('ok', false, 'left', 0); end if;
  insert into public.ai_usage (day, kind, calls, cost) values (private.ai_day(), v_kind, 1, v_cost)
  on conflict (day, kind) do update set calls = public.ai_usage.calls + 1, cost = public.ai_usage.cost + v_cost;
  return jsonb_build_object('ok', true, 'kind', v_kind);
end;
$$;
