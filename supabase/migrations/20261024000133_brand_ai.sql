-- AI for brands: a plain-language analyst over their reports, and a brief written from a product link.
-- Creators have their own daily allowance (ai_take2); brands get a smaller one per team, counted here.

create table if not exists public.brand_ai_usage (
  owner uuid not null,
  day date not null,
  kind text not null,
  calls integer not null default 0,
  cost integer not null default 0,
  primary key (owner, day, kind)
);
alter table public.brand_ai_usage enable row level security;
-- No policies: only the functions below read and write it.

-- A brand login (any of a team's logins that works with at least one brand), never a creator.
create or replace function private.ai_brand_owner()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select o.owner from (select public.brand_owner() as owner) o
  where o.owner is not null and not public.is_creator()
    and exists (select 1 from public.brand_members bm where bm.profile_id in (select private.team_logins(o.owner)));
$$;
revoke execute on function private.ai_brand_owner() from public, anon, authenticated;

-- Reserve the expected cost of one use on Cloudflare's free AI ('budget' when today's share is gone).
create or replace function public.ai_take_brand(p_kind text, p_cost integer)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid := private.ai_brand_owner();
  v_cap constant integer := 3000;
  v_cost integer := greatest(1, least(coalesce(p_cost, 300), 2000));
  v_used integer;
begin
  if v_owner is null then return jsonb_build_object('ok', false, 'reason', 'not_brand'); end if;
  select coalesce(sum(cost), 0) into v_used from public.brand_ai_usage where owner = v_owner and day = private.ai_day() and kind not like 'gemini%';
  if v_used + v_cost > v_cap then return jsonb_build_object('ok', false, 'reason', 'budget', 'used', v_used); end if;
  insert into public.brand_ai_usage (owner, day, kind, calls, cost) values (v_owner, private.ai_day(), left(coalesce(p_kind, ''), 20), 1, v_cost)
  on conflict (owner, day, kind) do update set calls = public.brand_ai_usage.calls + 1, cost = public.brand_ai_usage.cost + v_cost;
  return jsonb_build_object('ok', true, 'used', v_used + v_cost);
end;
$$;

-- The free Gemini backup when Cloudflare's share is used up: a few uses a day per brand team.
create or replace function public.ai_take_brand_gemini(p_kind text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid := private.ai_brand_owner();
  v_used integer;
begin
  if v_owner is null then return jsonb_build_object('ok', false, 'reason', 'not_brand'); end if;
  select coalesce(sum(calls), 0) into v_used from public.brand_ai_usage where owner = v_owner and day = private.ai_day() and kind like 'gemini%';
  if v_used >= 20 then return jsonb_build_object('ok', false, 'reason', 'budget'); end if;
  insert into public.brand_ai_usage (owner, day, kind, calls, cost) values (v_owner, private.ai_day(), left('gemini:' || coalesce(p_kind, ''), 20), 1, 0)
  on conflict (owner, day, kind) do update set calls = public.brand_ai_usage.calls + 1;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.ai_take_brand(text, integer) from public, anon;
revoke execute on function public.ai_take_brand_gemini(text) from public, anon;
grant execute on function public.ai_take_brand(text, integer) to authenticated;
grant execute on function public.ai_take_brand_gemini(text) to authenticated;

-- Old counts go after two months.
select cron.unschedule('brand-ai-usage-cleanup') where exists (select 1 from cron.job where jobname = 'brand-ai-usage-cleanup');
select cron.schedule('brand-ai-usage-cleanup', '20 1 * * *', $$delete from public.brand_ai_usage where day < current_date - 60$$);
