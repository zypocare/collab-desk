-- Brand side, phase 2: autopilots.
-- Five agents work on a brand login's collabs every day, each Off, Ask me (it prepares the step and
-- waits in "Waiting for your OK") or Auto (it does it and logs it):
--   shortlist  creators who fit a campaign's brief
--   followup   a nudge in the request's chat when a quote, draft or post is late
--   draft      checks a draft's caption against the brief (mentions, hashtags, promo, link, #ad)
--   negotiate  accepts campaign quotes within budget, asks for a lower price on ones a little over
--   rebook     offers creators with the best results the same brief again
-- Everything they do goes through the same database functions the brand's own buttons use.

-- 1. Settings and the inbox -----------------------------------------------------------------------------
create table if not exists public.brand_autopilots (
  owner uuid primary key references auth.users (id) on delete cascade,
  shortlist text not null default 'ask' check (shortlist in ('off', 'ask', 'auto')),
  shortlist_max integer not null default 8 check (shortlist_max between 1 and 20),
  followup text not null default 'off' check (followup in ('off', 'ask', 'auto')),
  followup_days integer not null default 3 check (followup_days between 1 and 14),
  draftcheck text not null default 'ask' check (draftcheck in ('off', 'ask', 'auto')),
  negotiate text not null default 'off' check (negotiate in ('off', 'ask', 'auto')),
  negotiate_over integer not null default 20 check (negotiate_over between 0 and 100),
  -- Accepting a quote signs its agreement: the name the negotiator signs with.
  signer text not null default '' check (char_length(signer) <= 120),
  rebook text not null default 'off' check (rebook in ('off', 'ask', 'auto')),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_autopilot_items (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('shortlist', 'followup', 'draft', 'negotiate', 'rebook')),
  campaign_id uuid references public.brand_campaigns (id) on delete cascade,
  collab_id uuid references public.collabs (id) on delete cascade,
  -- What it is about: the quote, the draft, or (for nudges) what was late.
  ref text not null default '',
  title text not null,
  body text not null default '',
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped', 'auto')),
  note text not null default '',
  created_at timestamptz not null default now(),
  acted_at timestamptz
);
create index if not exists brand_autopilot_items_owner_idx on public.brand_autopilot_items (owner, status, created_at desc);
create unique index if not exists brand_autopilot_items_once on public.brand_autopilot_items (owner, kind, coalesce(collab_id, campaign_id), ref);

alter table public.brand_autopilots enable row level security;
alter table public.brand_autopilot_items enable row level security;
drop policy if exists "brand reads own autopilots" on public.brand_autopilots;
create policy "brand reads own autopilots" on public.brand_autopilots for select to authenticated using (owner = (select auth.uid()));
drop policy if exists "brand reads own autopilot items" on public.brand_autopilot_items;
create policy "brand reads own autopilot items" on public.brand_autopilot_items for select to authenticated using (owner = (select auth.uid()));

-- A brand that starts campaigns gets the autopilots with their starting settings.
create or replace function private.campaign_autopilots()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.brand_autopilots (owner) values (new.owner) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists "autopilots" on public.brand_campaigns;
create trigger "autopilots" after insert on public.brand_campaigns for each row execute function private.campaign_autopilots();
revoke execute on function private.campaign_autopilots() from public, anon, authenticated;

-- Run as a brand login (the daily job): the same checks as when they press the buttons themselves.
create or replace function private.as_brand(p_owner uuid)
returns void
language sql
set search_path = ''
as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_owner, 'role', 'authenticated',
    'email', (select lower(u.email) from auth.users u where u.id = p_owner))::text, true);
$$;
revoke execute on function private.as_brand(uuid) from public, anon, authenticated;

-- 2. The draft checker ---------------------------------------------------------------------------------
-- A draft's caption against its collab's brief: mentions, hashtags, promo code, link, and the #ad label.
create or replace function private.draft_checks(p_draft uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  d public.drafts;
  b jsonb;
  cap text;
  v_checks jsonb := '[]'::jsonb;
  v_missing text[] := '{}';
  x text;
  v_link text;
begin
  select * into d from public.drafts where id = p_draft;
  if d.id is null then return null; end if;
  select coalesce(c.brief_details, '{}'::jsonb) into b from public.collabs c where c.id = d.collab_id;
  cap := lower(coalesce(d.caption, ''));
  for x in select lower(regexp_replace(btrim(m), '^@+', '')) from jsonb_array_elements_text(case when jsonb_typeof(b -> 'mentions') = 'array' then b -> 'mentions' else '[]'::jsonb end) m where btrim(m) <> '' loop
    v_checks := v_checks || jsonb_build_object('label', 'Mentions @' || x, 'ok', cap like '%@' || x || '%');
    if cap not like '%@' || x || '%' then v_missing := v_missing || ('add the mention @' || x); end if;
  end loop;
  for x in select lower(regexp_replace(btrim(h), '^#+', '')) from jsonb_array_elements_text(case when jsonb_typeof(b -> 'hashtags') = 'array' then b -> 'hashtags' else '[]'::jsonb end) h where btrim(h) <> '' loop
    v_checks := v_checks || jsonb_build_object('label', 'Hashtag #' || x, 'ok', cap like '%#' || x || '%');
    if cap not like '%#' || x || '%' then v_missing := v_missing || ('add the hashtag #' || x); end if;
  end loop;
  x := btrim(coalesce(b ->> 'promo', ''));
  if x <> '' then
    v_checks := v_checks || jsonb_build_object('label', 'Promo code ' || x, 'ok', cap like '%' || lower(x) || '%');
    if cap not like '%' || lower(x) || '%' then v_missing := v_missing || ('add the promo code ' || x); end if;
  end if;
  v_link := lower(regexp_replace(regexp_replace(btrim(coalesce(b ->> 'link', '')), '^https?://(www\.)?', ''), '/+$', ''));
  if v_link <> '' then
    v_checks := v_checks || jsonb_build_object('label', 'Link ' || v_link, 'ok', cap like '%' || v_link || '%' or cap like '%link in bio%');
    if not (cap like '%' || v_link || '%' or cap like '%link in bio%') then v_missing := v_missing || ('add the link ' || v_link); end if;
  end if;
  -- The paid partnership label, always.
  v_checks := v_checks || jsonb_build_object('label', 'Paid partnership label (#ad)',
    'ok', cap ~ '(#ad\M|#sponsored|#paidpartnership|paid partnership|#collab\M|#gifted)');
  if not cap ~ '(#ad\M|#sponsored|#paidpartnership|paid partnership|#collab\M|#gifted)' then
    v_missing := array_append(v_missing, 'mark it as a paid partnership (#ad)');
  end if;
  if btrim(coalesce(b ->> 'dos', '')) <> '' or btrim(coalesce(b ->> 'donts', '')) <> '' then
    v_checks := v_checks || jsonb_build_object('label', 'Do''s and don''ts: check the video yourself', 'ok', null);
  end if;
  return jsonb_build_object('caption', d.caption, 'checks', v_checks, 'missing', cardinality(v_missing),
    'message', case when cardinality(v_missing) = 0 then ''
      when cardinality(v_missing) = 1 then 'Love it! One small thing: please ' || v_missing[1] || '.'
      else 'Love it! A few small things: please ' || array_to_string(v_missing[1:cardinality(v_missing) - 1], ', ') || ' and ' || v_missing[cardinality(v_missing)] || '.' end);
end;
$$;
revoke execute on function private.draft_checks(uuid) from public, anon, authenticated;

-- For the brand's own drafts (the checklist on a request's page).
create or replace function public.draft_check(p_draft uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select private.draft_checks(d.id)
  from public.drafts d join public.collabs c on c.id = d.collab_id
  where d.id = p_draft and exists (select 1 from public.brand_members m where m.brand_id = c.brand_id and m.profile_id = auth.uid());
$$;

-- 3. The shortlist -----------------------------------------------------------------------------------------
-- Creators who fit a brief, best first, with why: listed (or already working together), taking work,
-- making the content, in the brand's niche, engaging, past results, and price within budget when shown.
create or replace function public.shortlist_for(p_campaign uuid default null, p_brief jsonb default null, p_limit integer default 8)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_brief jsonb := p_brief;
  v_cat text;
  v_out jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  if p_campaign is not null then
    select coalesce(v_brief, c.brief), b.category into v_brief, v_cat
    from public.brand_campaigns c left join public.brands b on b.id = c.brand_from
    where c.id = p_campaign and c.owner = auth.uid();
    if v_brief is null then return '[]'::jsonb; end if;
  end if;
  v_brief := coalesce(v_brief, '{}'::jsonb);
  if v_cat is null then
    select b.category into v_cat from public.brands b where b.id = public.my_brand_id();
  end if;
  with want as (
    select btrim(x ->> 'kind') as kind, coalesce(nullif(x ->> 'qty', '')::integer, 0) as qty
    from jsonb_array_elements(case when jsonb_typeof(v_brief -> 'deliverables') = 'array' then v_brief -> 'deliverables' else '[]'::jsonb end) x
    where coalesce(nullif(x ->> 'qty', '')::integer, 0) > 0
  ), cand as (
    select s.*, a.engagement_rate as eng, a.followers as fol,
      (select count(*) from want w where w.kind = any(s.offered_kinds)) as kinds_ok,
      (select count(*) from want) as kinds_all,
      exists (select 1 from public.collabs k join public.brand_members m on m.brand_id = k.brand_id and m.profile_id = auth.uid()
              where k.creator_id = s.id and k.stage in ('live', 'wrapped')) as worked,
      case when s.show_rates and (select count(*) from want) > 0 and not exists (select 1 from want w where not (s.rates ? w.kind))
        then (select sum(w.qty * (s.rates ->> w.kind)::numeric) from want w) end as est
    from public.creator_settings s left join public.ig_account a on a.id = s.id and a.connected
    where s.status = 'active' and s.accepting and private.brand_can_reach(s.id)
      and (p_campaign is null or not exists (select 1 from public.campaign_creators x where x.campaign_id = p_campaign and x.creator_id = s.id))
  ), scored as (
    select c.id,
      least(100, greatest(0,
        case when c.kinds_all = 0 then 10 when c.kinds_ok = c.kinds_all then 25 else 10 end
        + case when coalesce(v_cat, '') <> '' and c.niche ilike '%' || v_cat || '%' then 30 else 0 end
        + case when c.eng >= 3 then 15 when c.eng >= 1.5 then 8 else 0 end
        + case when c.worked then 15 else 0 end
        + case when c.est is null or coalesce((v_brief ->> 'fee')::numeric, 0) = 0 then 0
               when c.est <= (v_brief ->> 'fee')::numeric then 15
               when c.est > (v_brief ->> 'fee')::numeric * 1.3 then -10 else 0 end
        + case when c.fol is not null then 5 else 0 end
        + case when jsonb_typeof(v_brief -> 'content_language') = 'array' and jsonb_array_length(v_brief -> 'content_language') > 0
                 and exists (select 1 from jsonb_array_elements_text(v_brief -> 'content_language') l where l = any(c.content_languages)) then 5 else 0 end)) as score,
      array_remove(array[
        case when coalesce(v_cat, '') <> '' and c.niche ilike '%' || v_cat || '%' then 'fits your niche' end,
        case when c.kinds_all > 0 and c.kinds_ok = c.kinds_all then 'makes this content' when c.kinds_ok > 0 then 'makes some of this content' end,
        case when c.worked then 'worked with you before' end,
        case when c.eng >= 3 then 'strong engagement' end,
        case when c.est is not null and coalesce((v_brief ->> 'fee')::numeric, 0) > 0 and c.est <= (v_brief ->> 'fee')::numeric then 'within your budget' end
      ], null) as why
    from cand c
    where c.kinds_all = 0 or c.kinds_ok > 0
  )
  select coalesce(jsonb_agg(private.creator_card(x.id) || jsonb_build_object('score', x.score, 'why', to_jsonb(x.why)) order by x.score desc, x.id), '[]'::jsonb)
  into v_out
  from (select * from scored order by score desc, id limit greatest(1, least(coalesce(p_limit, 8), 20))) x;
  return v_out;
end;
$$;

-- 4. Doing what an item says (from the inbox, or by the daily run on Auto) -------------------------------
-- A nudge in a request's chat, as the brand.
create or replace function private.brand_nudge(p_owner uuid, p_collab uuid, p_body text, p_auto boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.collab_messages (collab_id, sender, author, body, auto)
  values (p_collab, 'brand', p_owner, left(btrim(p_body), 2000), p_auto);
end;
$$;
revoke execute on function private.brand_nudge(uuid, uuid, text, boolean) from public, anon, authenticated;

-- The same brief again, to the same creator (a rebooking), sent as the same company.
create or replace function private.rebook_send(p_collab uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  k public.collabs;
  v_p jsonb;
begin
  select * into k from public.collabs where id = p_collab;
  perform private.act_for(k.creator_id);
  update public.profiles set brand_id = k.brand_id where id = auth.uid();
  v_p := jsonb_build_object('type', k.type, 'fee', k.fee, 'product', k.product, 'product_value', k.product_value,
    'barter_kind', k.barter_kind, 'usage', k.usage, 'brief', k.brief, 'brief_details', coalesce(k.brief_details, '{}'::jsonb),
    'deliverables', (select coalesce(jsonb_agg(jsonb_build_object('kind', d.kind, 'qty', d.qty) order by d.position), '[]'::jsonb) from public.deliverables d where d.collab_id = k.id));
  return public.submit_request(v_p);
end;
$$;
revoke execute on function private.rebook_send(uuid) from public, anon, authenticated;

-- Carry out one item as the signed-in brand. p_action: 'approve' (do what it prepared), 'alt' (the
-- other choice: approve a draft anyway), or 'skip'. p_body: the edited message, if they changed it.
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

create or replace function public.autopilot_act(p_item uuid, p_action text, p_body text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  i public.brand_autopilot_items;
begin
  select * into i from public.brand_autopilot_items where id = p_item and owner = auth.uid() and status = 'pending';
  if i.id is null then
    raise exception 'That has already been dealt with.';
  end if;
  if p_action = 'skip' then
    update public.brand_autopilot_items set status = 'skipped', acted_at = now() where id = i.id;
  else
    if i.kind <> 'shortlist' then
      perform private.autopilot_do(i, p_action, p_body, false);
    end if;
    update public.brand_autopilot_items set status = 'done', acted_at = now() where id = i.id;
  end if;
  return public.autopilot_items();
end;
$$;

-- 5. Finding work: what each agent sees for one brand login ------------------------------------------------
create or replace function private.autopilot_add(p_owner uuid, p_kind text, p_campaign uuid, p_collab uuid, p_ref text,
  p_title text, p_body text, p_payload jsonb, p_mode text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  i public.brand_autopilot_items;
begin
  insert into public.brand_autopilot_items (owner, kind, campaign_id, collab_id, ref, title, body, payload)
  values (p_owner, p_kind, p_campaign, p_collab, coalesce(p_ref, ''), p_title, coalesce(p_body, ''), coalesce(p_payload, '{}'))
  on conflict do nothing
  returning * into i;
  -- Auto: do it now. If it can't be done (say, no name to sign with), it waits for an OK instead.
  if i.id is not null and p_mode = 'auto' and p_kind <> 'shortlist' and coalesce(p_payload ->> 'action', '') <> 'review' then
    begin
      perform private.autopilot_do(i, 'approve', null, true);
      update public.brand_autopilot_items set status = 'auto', acted_at = now() where id = i.id;
    exception when others then
      update public.brand_autopilot_items set note = left(sqlerrm, 200) where id = i.id;
    end;
  end if;
end;
$$;
revoke execute on function private.autopilot_add(uuid, text, uuid, uuid, text, text, text, jsonb, text) from public, anon, authenticated;

create or replace function private.brand_autopilots_for(p_owner uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  st public.brand_autopilots;
  r record;
  v_checks jsonb;
  v_first text;
  v_fee numeric;
  v_total numeric;
  v_median numeric;
  v_sug jsonb;
begin
  select * into st from public.brand_autopilots where owner = p_owner;
  if st.owner is null then return; end if;
  perform private.as_brand(p_owner);

  -- Shortlist: campaigns sent in the last two weeks, with creators who'd fit and weren't asked.
  if st.shortlist <> 'off' then
    for r in select c.* from public.brand_campaigns c where c.owner = p_owner and c.status = 'sent' and c.sent_at > now() - interval '14 days' loop
      if not exists (select 1 from public.brand_autopilot_items x where x.owner = p_owner and x.kind = 'shortlist' and x.campaign_id = r.id and x.created_at > now() - interval '7 days') then
        v_sug := public.shortlist_for(r.id, null, st.shortlist_max);
        if jsonb_array_length(v_sug) > 0 then
          perform private.autopilot_add(p_owner, 'shortlist', r.id, null, to_char(now(), 'IYYY-IW'),
            format('%s creator%s fit %s', jsonb_array_length(v_sug), case when jsonb_array_length(v_sug) = 1 then '' else 's' end, r.name),
            '', jsonb_build_object('creators', v_sug), st.shortlist);
        end if;
      end if;
    end loop;
  end if;

  -- Follow-up: requests from this login's campaigns that went quiet.
  if st.followup <> 'off' then
    for r in
      select k.*, s.display_name as cname, c.name as campaign, c.id as campaign_id,
        case
          when k.stage = 'request' and not exists (select 1 from public.quotes q where q.collab_id = k.id)
               and k.created_at < now() - make_interval(days => st.followup_days) then 'quote'
          when k.stage in ('confirmed', 'creating') and k.draft_date < current_date
               and not exists (select 1 from public.drafts d where d.collab_id = k.id) then 'draft'
          when k.stage = 'creating' and k.live_date < current_date then 'post'
        end as late
      from public.campaign_creators x
      join public.brand_campaigns c on c.id = x.campaign_id and c.owner = p_owner
      join public.collabs k on k.id = x.collab_id
      join public.creator_settings s on s.id = k.creator_id
    loop
      continue when r.late is null;
      -- At most one nudge a week for each request.
      continue when exists (select 1 from public.brand_autopilot_items x where x.owner = p_owner and x.kind = 'followup' and x.collab_id = r.id and x.created_at > now() - interval '7 days');
      v_first := split_part(r.cname, ' ', 1);
      perform private.autopilot_add(p_owner, 'followup', r.campaign_id, r.id, r.late || ':' || to_char(now(), 'YYYY-MM-DD'),
        case r.late when 'quote' then format('Nudge %s about the quote', v_first)
                    when 'draft' then format('Nudge %s about the draft (due %s)', v_first, to_char(r.draft_date, 'DD Mon'))
                    else format('Ask %s when the post goes live', v_first) end,
        case r.late when 'quote' then format('Hi %s! Just checking in on our %s brief. Would love your quote when you get a moment. Thanks!', v_first, r.campaign)
                    when 'draft' then format('Hi %s! Hope the shoot went well. Could you share the draft when it''s ready? It was due on %s. Thanks!', v_first, to_char(r.draft_date, 'DD Mon'))
                    else format('Hi %s! Just checking: is the post going live soon? It was planned for %s. Thanks!', v_first, to_char(r.live_date, 'DD Mon')) end,
        jsonb_build_object('late', r.late), st.followup);
    end loop;
  end if;

  -- Draft checker: drafts waiting for this login's answer, on any of its collabs.
  if st.draftcheck <> 'off' then
    for r in
      select d.id as draft_id, k.id as collab_id, s.display_name as cname,
        (select x.campaign_id from public.campaign_creators x where x.collab_id = k.id limit 1) as campaign_id
      from public.drafts d
      join public.collabs k on k.id = d.collab_id
      join public.creator_settings s on s.id = k.creator_id
      where d.status = 'pending'
        and exists (select 1 from public.brand_members m where m.brand_id = k.brand_id and m.profile_id = p_owner)
    loop
      v_checks := private.draft_checks(r.draft_id);
      v_first := split_part(r.cname, ' ', 1);
      perform private.autopilot_add(p_owner, 'draft', r.campaign_id, r.collab_id, r.draft_id::text,
        case when (v_checks ->> 'missing')::int = 0 then format('%s''s draft passes every check', v_first)
             else format('%s thing%s missing in %s''s draft', v_checks ->> 'missing', case when (v_checks ->> 'missing')::int = 1 then '' else 's' end, v_first) end,
        v_checks ->> 'message',
        jsonb_build_object('checks', v_checks -> 'checks', 'action', case when (v_checks ->> 'missing')::int = 0 then 'approve' else 'changes' end),
        -- Auto only approves drafts that pass every check; anything missing waits for an OK.
        case when st.draftcheck = 'auto' and (v_checks ->> 'missing')::int = 0 then 'auto' else 'ask' end);
    end loop;
  end if;

  -- Negotiator: campaign quotes waiting for an answer, against the budget per creator.
  if st.negotiate <> 'off' then
    for r in
      select k.id as collab_id, c.id as campaign_id, c.brief, s.display_name as cname, q.id as quote_id, q.total
      from public.campaign_creators x
      join public.brand_campaigns c on c.id = x.campaign_id and c.owner = p_owner
      join public.collabs k on k.id = x.collab_id
      join public.creator_settings s on s.id = k.creator_id
      join public.quotes q on q.collab_id = k.id and q.status = 'sent'
        and q.version = (select max(q2.version) from public.quotes q2 where q2.collab_id = k.id)
    loop
      v_fee := coalesce(nullif(r.brief ->> 'fee', '')::numeric, 0);
      continue when v_fee <= 0;
      v_total := r.total;
      v_first := split_part(r.cname, ' ', 1);
      if v_total <= v_fee then
        perform private.autopilot_add(p_owner, 'negotiate', r.campaign_id, r.collab_id, r.quote_id::text,
          format('Accept %s''s quote: ₹%s', v_first, to_char(v_total, 'FM99,99,99,990')),
          format('Within your ₹%s budget per creator.', to_char(v_fee, 'FM99,99,99,990')),
          jsonb_build_object('action', 'accept', 'total', v_total, 'budget', v_fee), st.negotiate);
      elsif v_total <= v_fee * (1 + st.negotiate_over / 100.0) then
        perform private.autopilot_add(p_owner, 'negotiate', r.campaign_id, r.collab_id, r.quote_id::text,
          format('Ask %s to come down to ₹%s', v_first, to_char(v_fee, 'FM99,99,99,990')),
          format('Thanks for the quote, %s! Our budget for this is ₹%s. Could you do it for that?', v_first, to_char(v_fee, 'FM99,99,99,990')),
          jsonb_build_object('action', 'counter', 'total', v_total, 'budget', v_fee), st.negotiate);
      else
        perform private.autopilot_add(p_owner, 'negotiate', r.campaign_id, r.collab_id, r.quote_id::text,
          format('%s''s quote is %s%% over your budget', v_first, round((v_total / v_fee - 1) * 100)),
          format('₹%s against your ₹%s budget per creator. Your call.', to_char(v_total, 'FM99,99,99,990'), to_char(v_fee, 'FM99,99,99,990')),
          jsonb_build_object('action', 'review', 'total', v_total, 'budget', v_fee), 'ask');
      end if;
    end loop;
  end if;

  -- Rebook: finished collabs whose cost per 1,000 views beat this login's usual.
  if st.rebook <> 'off' then
    with done as (
      select k.id, k.fee, k.creator_id, k.wrapped_at,
        (select sum(m.views) from public.collab_posts p join public.ig_media m on m.id = p.media_id where p.collab_id = k.id) as views
      from public.collabs k
      where k.stage = 'wrapped' and k.fee > 0
        and exists (select 1 from public.brand_members m where m.brand_id = k.brand_id and m.profile_id = p_owner)
    )
    select percentile_cont(0.5) within group (order by fee / views * 1000) into v_median from done where views > 0;
    for r in
      select k.id, k.fee, s.display_name as cname, s.slug, k.code,
        k.fee / v.views * 1000 as cpk
      from public.collabs k
      join public.creator_settings s on s.id = k.creator_id and s.status = 'active' and s.accepting
      cross join lateral (select sum(m.views) as views from public.collab_posts p join public.ig_media m on m.id = p.media_id where p.collab_id = k.id) v
      where k.stage = 'wrapped' and k.fee > 0 and v.views > 0 and k.wrapped_at > now() - interval '30 days'
        and exists (select 1 from public.brand_members m where m.brand_id = k.brand_id and m.profile_id = p_owner)
    loop
      continue when v_median is not null and r.cpk > v_median;
      v_first := split_part(r.cname, ' ', 1);
      perform private.autopilot_add(p_owner, 'rebook', null, r.id, 'rebook',
        format('Book %s again', v_first),
        format('₹%s per 1,000 views on %s%s. Sends the same brief again.', to_char(r.cpk, 'FM99,99,990'), r.code,
          case when v_median is not null and r.cpk < v_median then ', better than your usual' else '' end),
        jsonb_build_object('cpk', r.cpk, 'code', r.code, 'slug', r.slug), st.rebook);
    end loop;
  end if;

  perform private.act_for(null);
end;
$$;
revoke execute on function private.brand_autopilots_for(uuid) from public, anon, authenticated;

-- The daily run, for every brand login with autopilots. One login failing never stops the others.
create or replace function private.brand_autopilots_run()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  for v_owner in select owner from public.brand_autopilots loop
    begin
      perform private.brand_autopilots_for(v_owner);
    exception when others then
      raise warning '[brand autopilots] %: %', v_owner, sqlerrm;
    end;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end;
$$;
revoke execute on function private.brand_autopilots_run() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'brand-autopilots';
select cron.schedule('brand-autopilots', '30 4 * * *', $$select private.brand_autopilots_run()$$);

-- 6. What the brand's screens call ---------------------------------------------------------------------
create or replace function public.autopilots_get()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  st public.brand_autopilots;
begin
  if auth.uid() is null or public.is_creator() then
    raise exception 'Sign in with your brand email first.';
  end if;
  insert into public.brand_autopilots (owner) values (auth.uid()) on conflict do nothing;
  select * into st from public.brand_autopilots where owner = auth.uid();
  return to_jsonb(st) - 'owner' || jsonb_build_object(
    'waiting', (select count(*) from public.brand_autopilot_items where owner = auth.uid() and status = 'pending'),
    'lately', coalesce((
      select jsonb_object_agg(x.kind, jsonb_build_object('title', x.title, 'status', x.status, 'at', x.created_at))
      from (select distinct on (kind) kind, title, status, created_at from public.brand_autopilot_items
            where owner = auth.uid() order by kind, created_at desc) x), '{}'::jsonb));
end;
$$;

create or replace function public.autopilots_save(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_creator() then
    raise exception 'Sign in with your brand email first.';
  end if;
  insert into public.brand_autopilots (owner) values (auth.uid()) on conflict do nothing;
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
    updated_at = now()
  where owner = auth.uid();
  return public.autopilots_get();
end;
$$;

-- What's waiting for this login's OK (and what the autopilots did lately).
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
  where i.owner = auth.uid() and (i.status = 'pending' or i.created_at > now() - interval '14 days');
$$;

-- Run this login's autopilots now (the Autopilots page does, so it opens up to date).
create or replace function public.autopilots_run_now()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
begin
  if auth.uid() is null or public.is_creator() then
    raise exception 'Sign in with your brand email first.';
  end if;
  insert into public.brand_autopilots (owner) values (auth.uid()) on conflict do nothing;
  perform private.brand_autopilots_for(auth.uid());
  perform set_config('request.jwt.claims', v_claims, true);
  return public.autopilot_items();
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['draft_check(uuid)', 'shortlist_for(uuid, jsonb, integer)', 'autopilot_act(uuid, text, text)',
    'autopilots_get()', 'autopilots_save(jsonb)', 'autopilot_items()', 'autopilots_run_now()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
