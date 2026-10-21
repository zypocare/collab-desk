-- Miracle for many creators, part 3: the pages brands open without signing in.
-- Links with a token (quotes, drafts, briefs, files, reviews, invoices, insights) answer for the
-- creator of the row they open; her public page and "ask a question" for private.page_creator().

create or replace function public.action_info(p_token text)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  a private.action_links;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
  q public.quotes;
  d public.drafts;
  v_state text;
begin
  select * into a from private.action_links where token = p_token;
  if a.token is null or a.kind not in ('quote', 'draft', 'counter') then
    return jsonb_build_object('state', 'missing');
  end if;
  if a.kind = 'quote' then
    select * into q from public.quotes where id = a.ref_id;
    select * into c from public.collabs where id = q.collab_id;
  elsif a.kind = 'draft' then
    select * into d from public.drafts where id = a.ref_id;
    select * into c from public.collabs where id = d.collab_id;
  else
    select * into c from public.collabs where id = a.ref_id;
  end if;
  select * into b from public.brands where id = c.brand_id;
  s := private.settings_of(c.creator_id);

  v_state := case
    when c.stage in ('paused', 'cancelled') then 'closed'
    when a.used_at is not null then 'used'
    when a.expires_at < now() then 'expired'
    when a.kind = 'quote' and q.status <> 'sent' then 'closed'
    when a.kind = 'quote' and q.valid_until is not null and q.valid_until < current_date then 'expired'
    when a.kind = 'draft' and d.status <> 'pending' then 'closed'
    when a.kind = 'counter' and (c.counter_status <> 'sent' or c.stage <> 'request' or c.type <> 'barter') then 'closed'
    else 'open' end;

  return jsonb_build_object(
    'state', v_state, 'kind', a.kind, 'code', c.code, 'brand', b.name, 'contact', c.contact_name,
    'creator', s.display_name,
    'quote', case when a.kind = 'quote' then jsonb_build_object(
      'version', q.version, 'items', q.items, 'usage', q.usage, 'usage_fee', q.usage_fee, 'discount', q.discount,
      'total', q.total, 'currency', q.currency, 'advance_pct', q.advance_pct, 'pay_days', q.pay_days, 'revision_rounds', q.revision_rounds,
      'exclusivity_days', q.exclusivity_days, 'valid_until', q.valid_until, 'notes', q.notes, 'options', q.options) end,
    'draft', case when a.kind = 'draft' then jsonb_build_object(
      'round', d.round, 'link', d.link, 'caption', d.caption, 'note', d.note, 'file_path', case when d.preview_path is not null and d.released_at is null then d.preview_path else d.file_path end, 'file_type', case when d.preview_path is not null and d.released_at is null then d.preview_type else d.file_type end,
      'comments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.at_seconds, 'body', x.body, 'name', x.name) order by x.at_seconds nulls last, x.id)
                            from public.draft_comments x where x.draft_id = d.id), '[]'::jsonb)) end,
    'counter', case when a.kind = 'counter' then jsonb_build_object(
      'fee', c.counter_fee, 'product', c.product, 'reply_time', s.barter_reply_time,
      'deliverables', (select string_agg(qty || ' × ' || kind, ', ' order by position) from public.deliverables where collab_id = c.id)) end);
end;
$$;

create or replace function public.action_pick(p_token text, p_option integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a private.action_links;
begin
  select * into a from private.action_links where token = p_token;
  if a.token is null or a.kind <> 'quote' or a.used_at is not null or a.expires_at < now() then return; end if;
  -- the rest of this call works for the creator of the quote
  perform private.act_for((select q.creator_id from public.quotes q where q.id = a.ref_id));
  perform private.quote_pick(a.ref_id, p_option);
end;
$$;

create or replace function public.action_run(p_token text, p_yes boolean, p_name text default ''::text, p_note text default ''::text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a private.action_links;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
  v_name text;
begin
  select * into a from private.action_links where token = p_token for update;
  if a.token is null or a.kind = 'review' then raise exception 'This link is not valid.'; end if;
  if a.used_at is not null then raise exception 'This link has already been used.'; end if;
  if a.expires_at < now() then raise exception 'This link has expired. Open your request page instead.'; end if;

  -- each branch finds the collab first; the rest of this call works for its creator
  if a.kind = 'quote' then
    select x.* into c from public.collabs x join public.quotes q on q.collab_id = x.id where q.id = a.ref_id;
    perform private.act_for(c.creator_id);
    v_name := coalesce(nullif(btrim(p_name), ''), nullif(c.contact_name, ''), a.email);
    perform private.quote_response(a.ref_id, p_yes, v_name, p_note, a.email, null);
  elsif a.kind = 'draft' then
    select x.* into c from public.collabs x join public.drafts d on d.collab_id = x.id where d.id = a.ref_id;
    perform private.act_for(c.creator_id);
    v_name := coalesce(nullif(btrim(p_name), ''), nullif(c.contact_name, ''), a.email);
    perform private.draft_response(a.ref_id, p_yes, p_note, v_name, null);
  else
    select * into c from public.collabs where id = a.ref_id for update;
    perform private.act_for(c.creator_id);
    if c.counter_status <> 'sent' or c.stage <> 'request' or c.type <> 'barter' then
      raise exception 'This request has already moved on. Open your request page instead.';
    end if;
    select * into b from public.brands where id = c.brand_id;
    s := private.settings_of(c.creator_id);
    if p_yes then
      update public.collabs set type = 'hybrid', fee = c.counter_fee, counter_status = 'taken' where id = c.id;
      insert into public.collab_events (collab_id, kind, text, visible_to_brand)
      values (c.id, 'note', format('Brand switched to Paid + product at ₹%s.', to_char(c.counter_fee, 'FM99,99,99,999')), true);
      insert into public.outbox (creator_id, kind, to_email, payload)
      values (c.creator_id, 'counter_taken', s.creator_email, jsonb_build_object('code', c.code, 'brand', b.name, 'fee', c.counter_fee));
    else
      update public.collabs set counter_status = 'kept' where id = c.id;
      insert into public.collab_events (collab_id, kind, text, visible_to_brand)
      values (c.id, 'note', 'Brand kept the request as barter.', true);
    end if;
  end if;
  update private.action_links set used_at = now() where token = p_token;
  return jsonb_build_object('ok', true, 'code', c.code);
end;
$$;

create or replace function public.ai_take_ticket(p_ticket text)
returns jsonb
language plpgsql
security definer
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
  v_cost := case when v_kind in ('cheer', 'scout', 'pitch') then 0 else 40 end;
  -- the daily budget is per creator: the ticket's creator
  select coalesce(sum(cost), 0) into v_used from public.ai_usage where creator_id = v_creator and day = private.ai_day() and kind not like 'gemini%';
  if v_used + v_cost > 9000 then return jsonb_build_object('ok', false, 'left', 0); end if;
  insert into public.ai_usage (creator_id, day, kind, calls, cost) values (v_creator, private.ai_day(), v_kind, 1, v_cost)
  on conflict (creator_id, day, kind) do update set calls = public.ai_usage.calls + 1, cost = public.ai_usage.cost + v_cost;
  return jsonb_build_object('ok', true, 'kind', v_kind);
end;
$$;

create or replace function public.ask_question(p_name text, p_email text, p_brand text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_creator integer := private.page_creator();
  s public.creator_settings;
begin
  if auth.uid() is null or v_email = '' then raise exception 'Sign in with your email first, so the reply reaches you.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 3 then raise exception 'Type your question.'; end if;
  -- Keep it to real questions: a few per email a day, and a limit overall.
  if (select count(*) from public.brand_questions where creator_id = v_creator and email = v_email and created_at > now() - interval '1 day') >= 3 then
    raise exception 'You''ve sent a few questions today. You''ll get a reply by email soon.';
  end if;
  if (select count(*) from public.brand_questions where creator_id = v_creator and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Lots of questions right now. Please try again in a little while.';
  end if;
  s := private.settings_of(v_creator);
  insert into public.brand_questions (creator_id, name, email, brand, body)
  values (v_creator, left(btrim(coalesce(p_name, '')), 80), v_email, left(btrim(coalesce(p_brand, '')), 80), left(btrim(p_body), 2000));
  insert into public.outbox (creator_id, kind, to_email, payload) values (v_creator, 'question_received', s.creator_email, jsonb_build_object(
    'name', btrim(coalesce(p_name, '')), 'email', v_email, 'brand', btrim(coalesce(p_brand, '')), 'body', left(btrim(p_body), 600)));
end;
$$;

create or replace function public.brief_form_info(p_token text)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  a private.action_links;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  select * into a from private.action_links where token = p_token and kind = 'brief';
  if a.token is null then return jsonb_build_object('state', 'missing'); end if;
  select * into c from public.collabs where id = a.ref_id;
  select * into b from public.brands where id = c.brand_id;
  s := private.settings_of(c.creator_id);
  return jsonb_build_object(
    'state', case when a.used_at is not null then 'used' when a.expires_at < now() then 'expired' else 'open' end,
    'code', c.code, 'brand', b.name, 'category', b.category, 'instagram', b.instagram, 'contact', c.contact_name,
    'creator', s.display_name, 'details', c.brief_details, 'missing', to_jsonb(public.brief_missing(c.id)),
    'deliverables', (select string_agg(qty || ' × ' || kind, ', ' order by position) from public.deliverables where collab_id = c.id));
end;
$$;

create or replace function public.brief_form_submit(p_token text, p_details jsonb, p_instagram text default ''::text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a private.action_links;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  select * into a from private.action_links where token = p_token and kind = 'brief' for update;
  if a.token is null then raise exception 'This link is not valid.'; end if;
  if a.used_at is not null then raise exception 'These details were already sent. Reply to the email to add more.'; end if;
  if a.expires_at < now() then raise exception 'This link has expired. Open your request page instead.'; end if;
  select * into c from public.collabs where id = a.ref_id;
  select * into b from public.brands where id = c.brand_id;
  s := private.settings_of(c.creator_id);
  perform private.act_for(c.creator_id);

  update public.collabs set brief_details = public.clean_brief(coalesce(brief_details, '{}') || coalesce(p_details, '{}')) where id = c.id;
  if btrim(coalesce(p_instagram, '')) <> '' and coalesce(b.instagram, '') = '' then
    update public.brands set instagram = left(regexp_replace(btrim(p_instagram), '^@+', ''), 60) where id = b.id;
  end if;
  update private.action_links set used_at = now() where token = p_token;
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (c.id, 'note', format('%s added the brief details.', coalesce(nullif(c.contact_name, ''), b.name)), true);
  insert into public.outbox (creator_id, kind, to_email, payload)
  values (c.creator_id, 'brief_completed', s.creator_email, jsonb_build_object('code', c.code, 'brand', b.name, 'still_missing', to_jsonb(public.brief_missing(c.id))));
  return jsonb_build_object('ok', true, 'code', c.code);
end;
$$;

create or replace function public.files_info(p_token text)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  a private.action_links;
  c public.collabs;
begin
  select * into a from private.action_links where token = p_token and kind = 'files';
  if a.token is null then return jsonb_build_object('state', 'missing'); end if;
  if a.expires_at < now() then return jsonb_build_object('state', 'expired'); end if;
  select * into c from public.collabs where id = a.ref_id;
  return jsonb_build_object('state', 'open', 'code', c.code,
    'brand', (select name from public.brands where id = c.brand_id),
    'creator', (select display_name from public.creator_settings where id = c.creator_id),
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'label', f.label, 'url', f.url, 'file_path', f.file_path,
      'file_type', f.file_type, 'size', f.size_bytes) order by f.created_at) from public.collab_files f where f.collab_id = c.id), '[]'::jsonb));
end;
$$;

-- Runs from the collabs insert trigger, which can't pass the new row's creator: the prefix is that
-- of the creator the request works for (a function inserting for a brand calls act_for first), else
-- the only creator. Codes stay unique across all creators (brands look requests up by code alone).
create or replace function public.gen_collab_code()
returns text
language plpgsql
set search_path = public, extensions
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  prefix text;
  v_code text;
  bytes bytea;
begin
  select code_prefix into prefix from public.creator_settings
  where id = coalesce(public.current_creator(), (select min(x.id) from public.creator_settings x having count(*) = 1));
  loop
    bytes := gen_random_bytes(6);
    v_code := coalesce(prefix, 'CD') || '-';
    for i in 0..5 loop
      v_code := v_code || substr(alphabet, 1 + (get_byte(bytes, i) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.collabs c where c.code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.insight_link_open(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.insight_links;
  s public.creator_settings;
begin
  update public.insight_links
     set views = views + 1, last_viewed_at = now()
   where token = p_token and active
  returning * into l;
  if l.token is null then return null; end if;
  if l.notified_at is null or l.notified_at < now() - interval '30 minutes' then
    s := private.settings_of(l.creator_id);
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (l.creator_id, 'insights_viewed', s.creator_email, jsonb_build_object('label', l.label, 'views', l.views));
    update public.insight_links set notified_at = now() where token = l.token;
  end if;
  return jsonb_build_object('label', l.label, 'hide', to_jsonb(l.hide));
end;
$$;

create or replace function public.invoice_claim_paid(p_token text, p_amount numeric, p_ref text, p_on date, p_name text default ''::text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.invoices;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  select * into i from public.invoices where public_token = p_token and length(p_token) >= 24 for update;
  if i.id is null then raise exception 'Invoice not found.'; end if;
  if i.status not in ('sent', 'partly_paid') then raise exception 'This invoice is not waiting for payment.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter the amount you paid.'; end if;
  if btrim(coalesce(p_ref, '')) = '' then raise exception 'Enter the UTR or transaction reference.'; end if;
  perform private.act_for(i.creator_id);
  update public.invoices set claim_amount = p_amount, claim_ref = left(btrim(p_ref), 60), claim_on = coalesce(p_on, current_date),
    claim_at = now(), claim_by = left(btrim(coalesce(p_name, '')), 80), auto_remind = false
  where id = i.id;
  select * into c from public.collabs where id = i.collab_id;
  select * into b from public.brands where id = c.brand_id;
  s := private.settings_of(i.creator_id);
  insert into public.collab_events (collab_id, kind, text, visible_to_brand)
  values (c.id, 'payment', format('Brand reported paying ₹%s for %s (ref %s). Waiting for confirmation.', to_char(p_amount, 'FM99,99,99,999'), i.number, btrim(p_ref)), true);
  insert into public.outbox (creator_id, kind, to_email, payload) values (i.creator_id, 'payment_claimed', s.creator_email, jsonb_build_object(
    'code', c.code, 'brand', b.name, 'number', i.number, 'amount', p_amount, 'ref', btrim(p_ref), 'on', coalesce(p_on, current_date)));
end;
$$;

create or replace function public.page_card()
returns jsonb
language sql
stable security definer
set search_path = ''
as $$
  select jsonb_build_object('v', page_card_v) from public.creator_settings where id = private.page_creator();
$$;

create or replace function public.page_extras()
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'content_languages', to_jsonb(s.content_languages),
    'instant_booking', s.instant_booking,
    'weeks', case when s.instant_booking then public.availability() else null end,
    'away_until', case when public.is_away() then s.away_until end,
    'demand_factor', public.demand_factor())
  from public.creator_settings s where s.id = private.page_creator();
$$;

create or replace function public.public_insights()
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select case when not s.show_insights or not a.connected then null else jsonb_build_object(
    'display_name', s.display_name, 'handle', s.handle, 'niche', s.niche, 'city', s.city,
    'username', a.username, 'profile_picture_url', a.profile_picture_url,
    'followers', a.followers, 'media_count', a.media_count,
    'engagement_rate', a.engagement_rate, 'avg_views', a.avg_views, 'avg_reach', a.avg_reach,
    'demographics', a.demographics,
    'insights', case
      when not s.insights_stories then coalesce(a.insights, '{}'::jsonb) #- '{formats,stories}'
      when a.insights ? 'formats' and (s.story_stats ?| array['avg_views', 'avg_reach', 'avg_interactions']) then
        jsonb_set(a.insights, '{formats,stories}',
          coalesce(a.insights #> '{formats,stories}', '{"posts": 0}'::jsonb)
          || jsonb_strip_nulls(jsonb_build_object(
               'avg_views', s.story_stats -> 'avg_views',
               'avg_reach', s.story_stats -> 'avg_reach',
               'avg_interactions', s.story_stats -> 'avg_interactions'))
          || '{"manual": true}'::jsonb)
      else a.insights end,
    'updated_at', a.last_sync_at,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('day', h.day, 'followers', h.followers) order by h.day)
      from public.ig_followers_history h where h.creator_id = s.id and h.day >= current_date - 90), '[]'::jsonb),
    'top', coalesce((
      select jsonb_agg(t) from (
        select jsonb_build_object('permalink', m.permalink, 'thumbnail_url', m.thumbnail_url, 'media_type', m.media_type,
          'product_type', m.product_type, 'views', m.views, 'reach', m.reach, 'interactions', m.interactions,
          'likes', m.likes, 'comments', m.comments, 'posted_at', m.posted_at) t
        from (select * from public.ig_media where creator_id = s.id and product_type <> 'STORY' order by posted_at desc limit 30) m
        order by coalesce(m.views, m.reach, m.interactions, m.likes, 0) desc
        limit 6) x), '[]'::jsonb)
  ) end
  from public.creator_settings s, public.ig_account a
  where s.id = private.page_creator() and a.id = s.id;
$$;

-- A creator who has not connected Instagram yet (no ig_account row) still gets her page.
create or replace function public.public_page()
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'app_name', s.app_name,
    'display_name', s.display_name,
    'handle', s.handle,
    'niche', s.niche,
    'city', s.city,
    'followers', s.followers,
    'engagement', s.engagement,
    'reply_time', s.reply_time,
    'accepting', s.accepting,
    'offered', to_jsonb(s.offered_kinds),
    'whatsapp', nullif(regexp_replace(s.whatsapp, '\D', '', 'g'), ''),
    'rates', case when s.show_rates then s.rates else null end,
    'results', case when s.show_results then coalesce((
      select jsonb_agg(r order by (r ->> 'views')::bigint desc nulls last)
      from (
        select distinct on (c.id) jsonb_build_object(
          'brand', b.name, 'views', m.views, 'reach', m.reach, 'likes', m.likes, 'kind', m.product_type,
          'permalink', m.permalink, 'thumbnail', m.thumbnail_url, 'posted_at', m.posted_at) as r
        from public.collab_posts p
        join public.ig_media m on m.id = p.media_id
        join public.collabs c on c.id = p.collab_id
        join public.brands b on b.id = c.brand_id
        where c.creator_id = s.id and c.stage in ('live', 'wrapped') and coalesce(m.views, m.reach, 0) > 0
        order by c.id, m.views desc nulls last
        limit 40
      ) t
    ), '[]'::jsonb) else '[]'::jsonb end,
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object('rating', v.rating, 'text', v.body, 'name', v.name, 'brand', b.name) order by v.created_at desc)
      from (select * from public.brand_reviews where creator_id = s.id and shown order by created_at desc limit 8) v
      join public.collabs c on c.id = v.collab_id join public.brands b on b.id = c.brand_id
    ), '[]'::jsonb),
    'availability', case when s.show_availability then public.availability() else null end,
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'description', k.description, 'items', k.items,
        'price', k.price, 'badge', k.badge) order by k.position, k.created_at)
      from public.packages k where k.creator_id = s.id and k.active
    ), '[]'::jsonb),
    'barter', jsonb_build_object(
      'mode', s.barter_mode,
      'min_value', s.barter_min_value,
      'reply_time', s.barter_reply_time,
      'slots_left', case when s.barter_monthly_cap > 0 then greatest(0, s.barter_monthly_cap - public.barter_slots_used()) else null end),
    'worked_with', coalesce((
      select jsonb_agg(w.name order by w.name)
      from (
        select distinct b.name
        from public.collabs c join public.brands b on b.id = c.brand_id
        where c.creator_id = s.id and c.stage in ('live', 'wrapped')
        limit 24
      ) w
    ), '[]'::jsonb),
    'instagram', case when a.connected then jsonb_build_object(
      'username', a.username, 'followers', a.followers, 'engagement_rate', a.engagement_rate,
      'avg_views', a.avg_views, 'avg_reach', a.avg_reach, 'demographics', a.demographics,
      'profile_picture_url', a.profile_picture_url, 'updated_at', a.last_sync_at) else null end
  )
  from public.creator_settings s
  left join public.ig_account a on a.id = s.id
  where s.id = private.page_creator();
$$;

-- The offer is the one of the creator the brand's request belongs to.
create or replace function public.rebook_offer(p_code text)
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select case when c.id is not null and s.rebook_pct > 0 and c.rebook_sent_at is not null
              and c.rebook_sent_at + make_interval(days => s.rebook_days) >= now()
         then jsonb_build_object('pct', s.rebook_pct, 'until', (c.rebook_sent_at + make_interval(days => s.rebook_days))::date) end
  from public.collabs c
  join public.creator_settings s on s.id = c.creator_id
  where upper(c.code) = upper(btrim(p_code)) and c.brand_id = public.my_brand_id();
$$;

create or replace function public.review_info(p_token text)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  a private.action_links;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  select * into a from private.action_links where token = p_token and kind = 'review';
  if a.token is null then return jsonb_build_object('state', 'missing'); end if;
  select * into c from public.collabs where id = a.ref_id;
  select * into b from public.brands where id = c.brand_id;
  s := private.settings_of(c.creator_id);
  return jsonb_build_object(
    'state', case when a.used_at is not null or exists (select 1 from public.brand_reviews where collab_id = c.id) then 'used'
                  when a.expires_at < now() then 'expired' else 'open' end,
    'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'creator', s.display_name);
end;
$$;

create or replace function public.review_submit(p_token text, p_rating integer, p_body text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a private.action_links;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  select * into a from private.action_links where token = p_token and kind = 'review' for update;
  if a.token is null then raise exception 'This link is not valid.'; end if;
  if a.used_at is not null then raise exception 'Thanks, your review is already in.'; end if;
  if a.expires_at < now() then raise exception 'This link has expired.'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Choose 1 to 5 stars.'; end if;
  select * into c from public.collabs where id = a.ref_id;
  select * into b from public.brands where id = c.brand_id;
  s := private.settings_of(c.creator_id);
  perform private.act_for(c.creator_id);

  insert into public.brand_reviews (collab_id, rating, body, name, shown)
  values (c.id, p_rating, left(btrim(coalesce(p_body, '')), 300), left(coalesce(nullif(btrim(p_name), ''), c.contact_name), 80), p_rating >= 4)
  on conflict (collab_id) do nothing;
  update private.action_links set used_at = now() where token = p_token;
  insert into public.collab_events (collab_id, kind, text) values (c.id, 'review', format('%s left a %s-star review', b.name, p_rating));
  insert into public.outbox (creator_id, kind, to_email, payload) values (c.creator_id, 'review_received', s.creator_email,
    jsonb_build_object('code', c.code, 'brand', b.name, 'rating', p_rating, 'body', left(btrim(coalesce(p_body, '')), 300)));
  return jsonb_build_object('ok', true);
end;
$$;
