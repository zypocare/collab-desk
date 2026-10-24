-- Competitor watch: the brands' sixth autopilot. A brand names up to five competitors; every Monday (or on
-- "Check now") Miracle looks for creators those competitors work with:
--   on Miracle   paid posts by listed creators that tag or name the competitor (their own synced posts)
--   on the web   what a Google search finds (the competitor-watch job asks the AI, with sources)
-- and puts a brief in "Waiting for your OK", with an invite to the brand's chosen campaign for each new
-- creator: Ask me waits for a tap, Auto sends up to the weekly limit. Creators not on Miracle are added to
-- the campaign by their Instagram handle, as a brand can already do by hand.

alter table public.brand_autopilots add column if not exists watch text not null default 'off' check (watch in ('off', 'ask', 'auto'));
alter table public.brand_autopilots add column if not exists watch_brands jsonb not null default '[]';
alter table public.brand_autopilots add column if not exists watch_campaign uuid references public.brand_campaigns (id) on delete set null;
alter table public.brand_autopilots add column if not exists watch_max integer not null default 5 check (watch_max between 1 and 20);
alter table public.brand_autopilots add column if not exists watch_checked_at timestamptz;

alter table public.brand_autopilot_items drop constraint if exists brand_autopilot_items_kind_check;
alter table public.brand_autopilot_items add constraint brand_autopilot_items_kind_check
  check (kind in ('shortlist', 'followup', 'draft', 'negotiate', 'rebook', 'watch', 'invite'));

-- Every creator seen with a competitor, so a brief only calls out what's new.
create table if not exists public.brand_watch_sightings (
  id bigint generated always as identity primary key,
  owner uuid not null references auth.users (id) on delete cascade,
  competitor text not null check (char_length(competitor) <= 80),
  source text not null check (source in ('miracle', 'web')),
  creator_id integer references public.creator_settings (id) on delete cascade,
  handle text not null default '' check (char_length(handle) <= 30),
  name text not null default '' check (char_length(name) <= 120),
  link text not null default '' check (char_length(link) <= 500),
  posted_at timestamptz,
  views integer,
  note text not null default '' check (char_length(note) <= 300),
  seen_at timestamptz not null default now()
);
create unique index if not exists brand_watch_sightings_once on public.brand_watch_sightings (owner, lower(competitor), coalesce(nullif(link, ''), handle));
create index if not exists brand_watch_sightings_owner_idx on public.brand_watch_sightings (owner, seen_at desc);
alter table public.brand_watch_sightings enable row level security;
drop policy if exists "brand reads own sightings" on public.brand_watch_sightings;
create policy "brand reads own sightings" on public.brand_watch_sightings for select to authenticated using (owner = (select public.brand_owner()));

-- AI passes for a brand's job (no creator behind them): the ticket names the brand login instead.
alter table public.ai_tickets alter column creator_id drop not null;
alter table public.ai_tickets add column if not exists owner uuid;

create or replace function public.ai_take_ticket(p_ticket text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
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
  -- A brand's job (competitor watch) searches with Gemini's free allowance: nothing to count here.
  if v_creator is null then return jsonb_build_object('ok', true, 'kind', v_kind); end if;
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
$$;

-- Has this brand login already worked with this creator (any of its companies)?
create or replace function private.brand_knows(p_owner uuid, p_creator integer)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.collabs k join public.brand_members m on m.brand_id = k.brand_id
                 where m.profile_id = p_owner and k.creator_id = p_creator);
$$;
revoke execute on function private.brand_knows(uuid, integer) from public, anon, authenticated;

-- Invites: one creator into the brand's chosen campaign (the same function as "Send" on the campaign).
create or replace function private.watch_invite(i public.brand_autopilot_items)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if i.campaign_id is null then raise exception 'Pick a campaign to invite creators to first.'; end if;
  perform private.as_brand(i.owner);
  if (i.payload ->> 'creator_id') is not null then
    perform public.send_campaign(i.campaign_id, array[(i.payload ->> 'creator_id')::integer], '{}');
  else
    perform public.send_campaign(i.campaign_id, '{}', array[i.payload ->> 'handle']);
  end if;
end;
$$;
revoke execute on function private.watch_invite(public.brand_autopilot_items) from public, anon, authenticated;

-- The autopilots' "do it" learns the invite (everything else as before).
create or replace function private.autopilot_do(i public.brand_autopilot_items, p_action text, p_body text, p_auto boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  k public.collabs;
  v_body text := coalesce(nullif(btrim(p_body), ''), i.body);
  v_signer text;
begin
  if i.kind = 'invite' then
    perform private.watch_invite(i);
    return;
  end if;
  if i.kind = 'watch' then return; end if;
  if i.collab_id is not null then
    select * into k from public.collabs where id = i.collab_id;
    if not exists (select 1 from public.brand_members m where m.brand_id = k.brand_id and m.profile_id = i.owner) then
      raise exception 'Not found.';
    end if;
    perform private.act_for(k.creator_id);
    update public.profiles set brand_id = k.brand_id where id = i.owner;
  end if;
  if i.kind = 'followup' then
    perform private.brand_nudge(i.owner, i.collab_id, v_body, p_auto);
  elsif i.kind = 'draft' then
    if p_action = 'alt' or i.payload ->> 'action' = 'approve' then
      perform public.respond_draft(i.ref::uuid, true, '');
    else
      perform public.respond_draft(i.ref::uuid, false, v_body);
    end if;
  elsif i.kind = 'negotiate' then
    select coalesce(nullif(btrim(signer), ''), (select p.full_name from public.profiles p where p.id = i.owner), '') into v_signer
    from public.brand_autopilots where owner = i.owner;
    if i.payload ->> 'action' = 'accept' then
      if not private.may_accept((i.payload ->> 'total')::numeric) then
        raise exception 'Over your approval limit: an Admin or Approver has to accept this one.';
      end if;
      perform public.respond_quote(i.ref::uuid, true, coalesce(v_signer, ''), '', null);
    elsif i.payload ->> 'action' = 'counter' then
      perform public.respond_quote(i.ref::uuid, false, '', v_body, null);
    end if;
  elsif i.kind = 'rebook' then
    perform private.rebook_send(i.collab_id);
  end if;
  perform private.act_for(null);
end;
$$;
revoke execute on function private.autopilot_do(public.brand_autopilot_items, text, text, boolean) from public, anon, authenticated;

-- One week's watch for one brand login: records what the web search found (p_web: [{competitor,
-- creators: [{handle, name, url, note}]}]), looks through creators' posts on Miracle, then writes the brief
-- and the invites. Called by the competitor-watch job (service role) and by tests.
create or replace function public.watch_run_service(p_owner uuid, p_web jsonb default '[]')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  st public.brand_autopilots;
  b jsonb;
  w jsonb;
  c jsonb;
  r record;
  v_name text;
  v_handle text;
  v_h text;
  v_creator integer;
  v_week text := to_char(now() at time zone 'Asia/Kolkata', 'IYYY-IW');
  v_since timestamptz;
  v_sections jsonb := '[]';
  v_miracle jsonb;
  v_webl jsonb;
  v_new integer := 0;
  v_total integer := 0;
  v_invites integer := 0;
  v_campaign public.brand_campaigns;
  v_mode text;
  v_title text;
  v_payload jsonb;
begin
  select * into st from public.brand_autopilots where owner = p_owner;
  if st.owner is null or st.watch = 'off' or jsonb_array_length(st.watch_brands) = 0 then
    return jsonb_build_object('skipped', 'off');
  end if;
  perform private.as_brand(p_owner);
  v_since := coalesce(st.watch_checked_at, now() - interval '120 days');
  select * into v_campaign from public.brand_campaigns where id = st.watch_campaign and owner = p_owner;

  -- 1. What the web search found (handles of creators on Miracle are linked to them, when they're listed).
  for w in select * from jsonb_array_elements(case when jsonb_typeof(p_web) = 'array' then p_web else '[]' end) loop
    v_name := left(btrim(coalesce(w ->> 'competitor', '')), 80);
    continue when v_name = '';
    for c in select * from jsonb_array_elements(case when jsonb_typeof(w -> 'creators') = 'array' then w -> 'creators' else '[]' end) limit 12 loop
      v_h := private.clean_handle(c ->> 'handle');
      continue when v_h = '' or coalesce(c ->> 'url', '') !~ '^https://';
      select s.id into v_creator from public.creator_settings s
      where lower(s.handle) = v_h and s.status = 'active' and s.listed and s.slug_chosen limit 1;
      insert into public.brand_watch_sightings (owner, competitor, source, creator_id, handle, name, link, note)
      values (p_owner, v_name, 'web', v_creator, v_h, left(coalesce(c ->> 'name', ''), 120), left(c ->> 'url', 500), left(coalesce(c ->> 'note', ''), 300))
      on conflict do nothing;
    end loop;
  end loop;

  -- 2. Paid posts by listed creators on Miracle that tag or name a competitor (last 120 days).
  for b in select * from jsonb_array_elements(st.watch_brands) loop
    v_name := left(btrim(coalesce(b ->> 'name', '')), 80);
    v_handle := private.clean_handle(b ->> 'handle');
    continue when v_name = '' and v_handle = '';
    for r in
      select m.permalink, m.posted_at, coalesce(m.views, m.reach) as views, s.id as creator_id, s.handle, s.display_name
      from public.ig_media m
      join public.creator_settings s on s.id = m.creator_id and s.status = 'active' and s.listed and s.slug_chosen
      join public.ig_account a on a.id = s.id and a.connected
      where m.posted_at > now() - interval '120 days' and m.product_type <> 'STORY'
        and ((v_handle <> '' and lower(m.caption) ~ ('@' || v_handle || '([^a-z0-9._]|$)'))
          or (v_name <> '' and position(lower(v_name) in lower(m.caption)) > 0
              and lower(m.caption) ~ '(#ad([^a-z]|$)|#sponsored|#paidpartnership|paid partnership|#collab([^a-z]|$)|#gifted|#partner)'))
    loop
      insert into public.brand_watch_sightings (owner, competitor, source, creator_id, handle, name, link, posted_at, views)
      values (p_owner, coalesce(nullif(v_name, ''), '@' || v_handle), 'miracle', r.creator_id, lower(coalesce(r.handle, '')), r.display_name, r.permalink, r.posted_at, r.views)
      on conflict do nothing;
    end loop;
  end loop;

  -- 3. The brief: each competitor, the creators seen with it (new since the last check marked), on Miracle first.
  for b in select * from jsonb_array_elements(st.watch_brands) loop
    v_name := coalesce(nullif(left(btrim(coalesce(b ->> 'name', '')), 80), ''), '@' || private.clean_handle(b ->> 'handle'));
    select coalesce(jsonb_agg(x order by (x ->> 'new')::boolean desc, x ->> 'latest' desc nulls last), '[]') into v_miracle from (
      select jsonb_build_object('creator', private.creator_card(w.creator_id), 'creator_id', w.creator_id,
        'posts', jsonb_agg(jsonb_build_object('link', w.link, 'posted_at', w.posted_at, 'views', w.views, 'source', w.source) order by w.posted_at desc nulls last),
        'latest', max(w.posted_at), 'new', bool_or(w.seen_at >= v_since), 'known', private.brand_knows(p_owner, w.creator_id)) as x
      from public.brand_watch_sightings w
      where w.owner = p_owner and lower(w.competitor) = lower(v_name) and w.creator_id is not null and w.seen_at > now() - interval '120 days'
      group by w.creator_id) t;
    select coalesce(jsonb_agg(jsonb_build_object('handle', w.handle, 'name', w.name, 'link', w.link, 'note', w.note, 'new', w.seen_at >= v_since) order by w.seen_at desc), '[]') into v_webl
    from public.brand_watch_sightings w
    where w.owner = p_owner and lower(w.competitor) = lower(v_name) and w.creator_id is null and w.source = 'web' and w.seen_at > now() - interval '120 days';
    v_sections := v_sections || jsonb_build_object('name', v_name, 'handle', private.clean_handle(b ->> 'handle'), 'miracle', v_miracle, 'web', v_webl);
    v_total := v_total + jsonb_array_length(v_miracle) + jsonb_array_length(v_webl);
    v_new := v_new + (select count(*) from jsonb_array_elements(v_miracle) x where (x ->> 'new')::boolean)
                   + (select count(*) from jsonb_array_elements(v_webl) x where (x ->> 'new')::boolean);
  end loop;

  -- One brief a week: a second check the same week updates it.
  v_title := case when v_total = 0 then 'Competitor watch: no creators spotted yet'
    else format('Competitor watch: %s creator%s with your competitors%s', v_total, case when v_total = 1 then '' else 's' end,
      case when v_new > 0 then format(' (%s new)', v_new) else '' end) end;
  v_payload := jsonb_build_object('action', 'review', 'week', v_week, 'competitors', v_sections, 'new', v_new,
    'campaign', case when v_campaign.id is not null then jsonb_build_object('id', v_campaign.id, 'name', v_campaign.name) end);
  update public.brand_autopilot_items set title = v_title, payload = v_payload, campaign_id = v_campaign.id, status = 'pending', created_at = now(), acted_at = null
  where owner = p_owner and kind = 'watch' and ref = v_week;
  if not found then
    perform private.autopilot_add(p_owner, 'watch', v_campaign.id, null, v_week, v_title, '', v_payload, 'ask');
  end if;

  -- 4. Invites: new creators the brand hasn't worked with, into the chosen campaign.
  if v_campaign.id is not null then
    v_mode := st.watch;
    for r in
      select distinct on (coalesce(w.creator_id::text, w.handle)) w.creator_id, w.handle, w.name, w.competitor, w.link, w.posted_at
      from public.brand_watch_sightings w
      where w.owner = p_owner and w.seen_at >= v_since
        and (w.creator_id is null or not private.brand_knows(p_owner, w.creator_id))
        and not exists (select 1 from public.campaign_creators cc where cc.campaign_id = v_campaign.id
                        and (cc.creator_id = w.creator_id or (w.creator_id is null and cc.handle = w.handle)))
      order by coalesce(w.creator_id::text, w.handle), (w.creator_id is not null) desc, w.posted_at desc nulls last
    loop
      exit when v_invites >= st.watch_max;
      perform private.autopilot_add(p_owner, 'invite', v_campaign.id, null, coalesce(r.creator_id::text, '@' || r.handle),
        format('Invite %s to %s', coalesce(nullif(split_part(r.name, ' ', 1), ''), '@' || r.handle), v_campaign.name),
        format('Seen with %s%s.', r.competitor, case when r.posted_at is not null then ' on ' || to_char(r.posted_at at time zone 'Asia/Kolkata', 'DD Mon') else '' end),
        jsonb_build_object('creator_id', r.creator_id, 'handle', r.handle, 'competitor', r.competitor, 'link', r.link,
          'creator', case when r.creator_id is not null then private.creator_card(r.creator_id) end,
          'on_miracle', r.creator_id is not null), v_mode);
      v_invites := v_invites + 1;
    end loop;
  end if;

  update public.brand_autopilots set watch_checked_at = now() where owner = p_owner;
  return jsonb_build_object('creators', v_total, 'new', v_new, 'invites', v_invites);
end;
$$;
revoke execute on function public.watch_run_service(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.watch_run_service(uuid, jsonb) to service_role;

-- Whose watch is due (the Monday job), with what to search for.
create or replace function public.watch_due()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('owner', a.owner, 'brands', a.watch_brands,
      'category', (select p.category from public.brand_profiles p where p.owner = a.owner limit 1))), '[]')
  from public.brand_autopilots a
  where a.watch <> 'off' and jsonb_array_length(a.watch_brands) > 0
    and (a.watch_checked_at is null or a.watch_checked_at < now() - interval '6 days');
$$;
revoke execute on function public.watch_due() from public, anon, authenticated;
grant execute on function public.watch_due() to service_role;

-- Settings: the brand's screen saves these with the other autopilots.
create or replace function public.autopilots_save(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_brands jsonb;
  v_campaign uuid;
begin
  if auth.uid() is null or public.is_creator() then
    raise exception 'Sign in with your brand email first.';
  end if;
  insert into public.brand_autopilots (owner) values (public.brand_owner()) on conflict do nothing;
  if p ? 'watch_brands' then
    select coalesce(jsonb_agg(jsonb_build_object('name', left(btrim(coalesce(x ->> 'name', '')), 80), 'handle', private.clean_handle(x ->> 'handle'))), '[]')
    into v_brands
    from (select x from jsonb_array_elements(case when jsonb_typeof(p -> 'watch_brands') = 'array' then p -> 'watch_brands' else '[]' end) x limit 5) t
    where btrim(coalesce(x ->> 'name', '')) <> '' or private.clean_handle(x ->> 'handle') <> '';
  end if;
  if p ? 'watch_campaign' then
    v_campaign := nullif(p ->> 'watch_campaign', '')::uuid;
    if v_campaign is not null and not exists (select 1 from public.brand_campaigns where id = v_campaign and owner = public.brand_owner()) then
      v_campaign := null;
    end if;
  end if;
  update public.brand_autopilots set
    shortlist = coalesce(p ->> 'shortlist', shortlist),
    shortlist_max = coalesce(nullif(p ->> 'shortlist_max', '')::integer, shortlist_max),
    followup = coalesce(p ->> 'followup', followup),
    followup_days = coalesce(nullif(p ->> 'followup_days', '')::integer, followup_days),
    draftcheck = coalesce(p ->> 'draftcheck', draftcheck),
    negotiate = coalesce(p ->> 'negotiate', negotiate),
    negotiate_over = coalesce(nullif(p ->> 'negotiate_over', '')::integer, negotiate_over),
    signer = coalesce(left(btrim(p ->> 'signer'), 120), signer),
    rebook = coalesce(p ->> 'rebook', rebook),
    watch = coalesce(p ->> 'watch', watch),
    watch_brands = case when p ? 'watch_brands' then v_brands else watch_brands end,
    watch_campaign = case when p ? 'watch_campaign' then v_campaign else watch_campaign end,
    watch_max = coalesce(nullif(p ->> 'watch_max', '')::integer, watch_max),
    updated_at = now()
  where owner = public.brand_owner();
  return public.autopilots_get();
end;
$$;
revoke execute on function public.autopilots_save(jsonb) from public, anon;
grant execute on function public.autopilots_save(jsonb) to authenticated;

-- What's waiting (now with each invite's creator).
create or replace function public.autopilot_items()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'status', i.status, 'title', i.title, 'body', i.body,
      'payload', i.payload, 'note', i.note, 'created_at', i.created_at, 'acted_at', i.acted_at, 'campaign_id', i.campaign_id,
      'campaign', c.name, 'code', k.code, 'slug', s.slug, 'creator', case when k.id is not null then private.creator_card(k.creator_id) end)
    order by (i.status = 'pending') desc, i.created_at desc), '[]'::jsonb)
  from public.brand_autopilot_items i
  left join public.brand_campaigns c on c.id = i.campaign_id
  left join public.collabs k on k.id = i.collab_id
  left join public.creator_settings s on s.id = k.creator_id
  where i.owner = public.brand_owner() and (i.status = 'pending' or i.created_at > now() - interval '14 days');
$$;
revoke execute on function public.autopilot_items() from public, anon;
grant execute on function public.autopilot_items() to authenticated;

-- Mondays 9:00 India: the competitor-watch job (a missed week runs the next time it's due).
select cron.unschedule(jobid) from cron.job where jobname = 'competitor-watch';
select cron.schedule('competitor-watch', '30 3 * * 1', $$select private.call_function('competitor-watch')$$);
