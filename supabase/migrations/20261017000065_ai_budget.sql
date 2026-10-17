-- Free AI, counted by size instead of a flat 50 uses. Cloudflare's free allowance is 10,000
-- "neurons" a day (its unit of AI work), reset at 00:00 UTC (5:30 am in India). A quick DM check
-- costs a few, reading a long request a couple of hundred. Each use reserves its expected cost
-- first, then the server corrects it to the real amount. The app stops at 9,000, a safe margin, so
-- AI never goes past the free amount and is never billed. Past that, the site's server can fall
-- back to Google Gemini's free key (no billing attached), counted separately.

alter table public.ai_usage add column if not exists cost integer not null default 0;

create or replace function private.ai_day() returns date language sql stable as $$ select (now() at time zone 'UTC')::date $$;

-- Reserve the expected cost of one use. 'budget' means Cloudflare's free amount is used up today.
create or replace function public.ai_take2(p_kind text, p_cost integer)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_used integer;
  v_cap constant integer := 9000;
  v_cost integer := greatest(1, least(coalesce(p_cost, 150), 2000));
begin
  if not public.is_creator() then return jsonb_build_object('ok', false, 'reason', 'not_creator'); end if;
  select coalesce(sum(cost), 0) into v_used from public.ai_usage where day = private.ai_day() and kind not like 'gemini%';
  if v_used + v_cost > v_cap then return jsonb_build_object('ok', false, 'reason', 'budget', 'used', v_used); end if;
  insert into public.ai_usage (day, kind, calls, cost) values (private.ai_day(), left(coalesce(p_kind, ''), 20), 1, v_cost)
  on conflict (day, kind) do update set calls = public.ai_usage.calls + 1, cost = public.ai_usage.cost + v_cost;
  return jsonb_build_object('ok', true, 'used', v_used + v_cost);
end;
$$;
revoke execute on function public.ai_take2(text, integer) from public, anon;
grant execute on function public.ai_take2(text, integer) to authenticated;

-- After a use, swap the reserved cost for the real one (the model reports what it used).
create or replace function public.ai_settle(p_kind text, p_delta integer)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_creator() then return; end if;
  update public.ai_usage set cost = greatest(0, cost + greatest(-2000, least(coalesce(p_delta, 0), 2000)))
  where day = private.ai_day() and kind = left(coalesce(p_kind, ''), 20);
end;
$$;
revoke execute on function public.ai_settle(text, integer) from public, anon;
grant execute on function public.ai_settle(text, integer) to authenticated;

-- One use of the Gemini backup (its own free daily limit; 250 here keeps well inside it).
create or replace function public.ai_take_gemini(p_kind text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_used integer;
begin
  if not public.is_creator() then return jsonb_build_object('ok', false, 'reason', 'not_creator'); end if;
  select coalesce(sum(calls), 0) into v_used from public.ai_usage where day = private.ai_day() and kind like 'gemini%';
  if v_used >= 250 then return jsonb_build_object('ok', false, 'reason', 'budget'); end if;
  insert into public.ai_usage (day, kind, calls, cost) values (private.ai_day(), left('gemini:' || coalesce(p_kind, ''), 20), 1, 0)
  on conflict (day, kind) do update set calls = public.ai_usage.calls + 1;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.ai_take_gemini(text) from public, anon;
grant execute on function public.ai_take_gemini(text) to authenticated;

-- The DM webhook's single-use pass, now counted by size too (a DM check is small).
create or replace function public.ai_take_ticket(p_ticket text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_used integer;
  v_cost constant integer := 40;
begin
  delete from public.ai_tickets where token = p_ticket and created_at > now() - interval '2 minutes';
  if not found then return jsonb_build_object('ok', false); end if;
  delete from public.ai_tickets where created_at < now() - interval '1 hour';
  select coalesce(sum(cost), 0) into v_used from public.ai_usage where day = private.ai_day() and kind not like 'gemini%';
  if v_used + v_cost > 9000 then return jsonb_build_object('ok', false, 'left', 0); end if;
  insert into public.ai_usage (day, kind, calls, cost) values (private.ai_day(), 'classify', 1, v_cost)
  on conflict (day, kind) do update set calls = public.ai_usage.calls + 1, cost = public.ai_usage.cost + v_cost;
  return jsonb_build_object('ok', true);
end;
$$;

-- How much free AI is left today: Cloudflare as a percentage, and Gemini backup uses.
drop function if exists public.ai_left();
create or replace function public.ai_left()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when public.is_creator() then jsonb_build_object(
    'pct', greatest(0, round(100 - 100.0 * coalesce((select sum(cost) from public.ai_usage where day = private.ai_day() and kind not like 'gemini%'), 0) / 9000))::integer,
    'gemini_left', greatest(0, 250 - coalesce((select sum(calls) from public.ai_usage where day = private.ai_day() and kind like 'gemini%'), 0))::integer
  ) end
$$;
revoke execute on function public.ai_left() from public;
grant execute on function public.ai_left() to authenticated;

-- The old one-use-at-a-time check, kept for a server that hasn't updated yet: same budget.
create or replace function public.ai_take(p_kind text)
returns jsonb
language sql security definer
set search_path = public
as $$ select public.ai_take2(p_kind, 150) $$;
