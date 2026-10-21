-- Miracle for many creators, part 7: loose ends after the function rewrites.
-- The desk's knowledge index is keyed per creator (an email can reach two creators), and the AI
-- allowances that protect the one shared AI account hold for all creators together as well as each.

alter table public.desk_chunks drop constraint if exists desk_chunks_source_source_id_key;
alter table public.desk_chunks add constraint desk_chunks_source_source_id_key unique (creator_id, source, source_id);

CREATE OR REPLACE FUNCTION private.desk_put(p_source text, p_id text, p_collab uuid, p_brand uuid, p_body text, p_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c integer := coalesce((select creator_id from public.collabs where id = p_collab), (select creator_id from public.brands where id = p_brand));
begin
  -- source ids (an email's msg_id) can repeat across creators: each creator keeps their own chunk
  if coalesce(btrim(p_body), '') = '' then
    delete from public.desk_chunks where source = p_source and source_id = p_id and (v_c is null or creator_id = v_c);
    return;
  end if;
  insert into public.desk_chunks (creator_id, source, source_id, collab_id, brand_id, body, at)
  values (v_c, p_source, p_id, p_collab, coalesce(p_brand, (select brand_id from public.collabs where id = p_collab)), left(btrim(p_body), 2000), coalesce(p_at, now()))
  on conflict (creator_id, source, source_id) do update
    set body = excluded.body, collab_id = excluded.collab_id, brand_id = excluded.brand_id, at = excluded.at,
        embedding = case when public.desk_chunks.body = excluded.body then public.desk_chunks.embedding end;
end $function$;

CREATE OR REPLACE FUNCTION public.ai_take2(p_kind text, p_cost integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_used integer;
  v_cap constant integer := 9000;
  v_cost integer := greatest(1, least(coalesce(p_cost, 150), 2000));
  v_me integer := public.current_creator();
begin
  if not public.is_creator() then return jsonb_build_object('ok', false, 'reason', 'not_creator'); end if;
  select coalesce(sum(cost), 0) into v_used from public.ai_usage where creator_id = v_me and day = private.ai_day() and kind not like 'gemini%';
  if v_used + v_cost > v_cap then return jsonb_build_object('ok', false, 'reason', 'budget', 'used', v_used); end if;
  -- the AI account is shared by every creator: its daily allowance holds for all of them together
  if (select coalesce(sum(cost), 0) from public.ai_usage where day = private.ai_day() and kind not like 'gemini%') + v_cost > v_cap then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'used', v_used);
  end if;
  insert into public.ai_usage (creator_id, day, kind, calls, cost) values (v_me, private.ai_day(), left(coalesce(p_kind, ''), 20), 1, v_cost)
  on conflict (creator_id, day, kind) do update set calls = public.ai_usage.calls + 1, cost = public.ai_usage.cost + v_cost;
  return jsonb_build_object('ok', true, 'used', v_used + v_cost);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ai_take_ticket(p_ticket text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_kind text;
  v_creator integer;
  v_used integer;
  v_cost integer;
begin
  delete from public.ai_tickets where token = p_ticket and created_at > now() - interval '2 minutes' returning kind, creator_id into v_kind, v_creator;
  if v_kind is null then return jsonb_build_object('ok', false); end if;
  -- clearing out old tickets is housekeeping for every creator at once
  delete from public.ai_tickets where created_at < now() - interval '1 hour';
  v_cost := case when v_kind in ('cheer', 'scout', 'pitch') then 0 else 40 end;
  -- the daily budget is per creator: the ticket's creator
  select coalesce(sum(cost), 0) into v_used from public.ai_usage where creator_id = v_creator and day = private.ai_day() and kind not like 'gemini%';
  if v_used + v_cost > 9000 then return jsonb_build_object('ok', false, 'left', 0); end if;
  -- the AI account is shared by every creator: its daily allowance holds for all of them together
  if (select coalesce(sum(cost), 0) from public.ai_usage where day = private.ai_day() and kind not like 'gemini%') + v_cost > 9000 then
    return jsonb_build_object('ok', false, 'left', 0);
  end if;
  insert into public.ai_usage (creator_id, day, kind, calls, cost) values (v_creator, private.ai_day(), v_kind, 1, v_cost)
  on conflict (creator_id, day, kind) do update set calls = public.ai_usage.calls + 1, cost = public.ai_usage.cost + v_cost;
  return jsonb_build_object('ok', true, 'kind', v_kind);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ai_take_gemini(p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_used integer;
  v_me integer := public.current_creator();
begin
  if not public.is_creator() then return jsonb_build_object('ok', false, 'reason', 'not_creator'); end if;
  select coalesce(sum(calls), 0) into v_used from public.ai_usage where creator_id = v_me and day = private.ai_day() and kind like 'gemini%';
  if v_used >= 250 then return jsonb_build_object('ok', false, 'reason', 'budget'); end if;
  -- one Gemini key for every creator: 250 calls a day in total
  if (select coalesce(sum(calls), 0) from public.ai_usage where day = private.ai_day() and kind like 'gemini%') >= 250 then
    return jsonb_build_object('ok', false, 'reason', 'budget');
  end if;
  insert into public.ai_usage (creator_id, day, kind, calls, cost) values (v_me, private.ai_day(), left('gemini:' || coalesce(p_kind, ''), 20), 1, 0)
  on conflict (creator_id, day, kind) do update set calls = public.ai_usage.calls + 1;
  return jsonb_build_object('ok', true);
end;
$function$;
