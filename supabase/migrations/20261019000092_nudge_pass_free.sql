-- The fun nudges are written by Gemini first now, so their pass doesn't take from her Cloudflare
-- allowance up front (a fallback to Cloudflare is a small one, 13 a day at most). It is still refused
-- when the day's Cloudflare allowance is already used up.
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
  v_cost := case v_kind when 'cheer' then 0 else 40 end;
  select coalesce(sum(cost), 0) into v_used from public.ai_usage where day = private.ai_day() and kind not like 'gemini%';
  if v_used + v_cost > 9000 then return jsonb_build_object('ok', false, 'left', 0); end if;
  insert into public.ai_usage (day, kind, calls, cost) values (private.ai_day(), v_kind, 1, v_cost)
  on conflict (day, kind) do update set calls = public.ai_usage.calls + 1, cost = public.ai_usage.cost + v_cost;
  return jsonb_build_object('ok', true, 'kind', v_kind);
end;
$$;
