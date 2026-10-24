-- The admin panel as a CRM, part 2: Deals. Lists of brands (companies), collabs, quotes, invoices,
-- payments (bank alerts), drafts, scheduled posts, campaigns, pools, retainers and pitches; record pages
-- for a collab, a brand and a campaign; and the actions on them, each logged in the audit trail.
--
-- * Collab messages are private between a creator and a brand. An admin reads them only through
--   admin_collab_messages(), which needs a reason and logs who read them and why.
-- * Actions on things that belong to a collab (its invoices, posts) are logged on the collab, so its
--   page shows everything an admin did to it.

-- 1. Who an action on a collab is logged as (collab events record a profile).
create or replace function private.admin_profile()
returns void
language sql security definer
set search_path = public
as $$
  insert into public.profiles (id, email) select u.id, public.jwt_email() from auth.users u where u.id = auth.uid() on conflict (id) do nothing;
$$;
revoke execute on function private.admin_profile() from public, anon, authenticated;

create or replace function private.collab_label(p_id uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select c.code || ' · ' || coalesce(b.name, '') || ' × ' || coalesce(s.display_name, '')
  from public.collabs c left join public.brands b on b.id = c.brand_id left join public.creator_settings s on s.id = c.creator_id where c.id = p_id;
$$;
revoke execute on function private.collab_label(uuid) from public, anon, authenticated;

-- 2. Record pages ------------------------------------------------------------------------------------
create or replace function public.admin_collab(p_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  perform private.admin_check();
  select * into c from public.collabs where id = p_id;
  if c.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = c.creator_id;
  return jsonb_build_object(
    'id', c.id, 'code', c.code, 'stage', c.stage, 'stage_label', public.stage_label(c.stage), 'pay', c.pay_status, 'type', c.type, 'source', c.source,
    'fee', c.fee, 'product', c.product, 'product_value', c.product_value, 'usage', c.usage, 'usage_ends', c.usage_ends, 'territory', c.territory,
    'exclusivity', c.excl_scope, 'brief', left(coalesce(c.brief, ''), 2000), 'received_on', c.received_on, 'draft_date', c.draft_date, 'live_date', c.live_date,
    'live_time', c.live_time, 'pay_due', c.pay_due, 'paid_on', c.paid_on, 'counter_fee', c.counter_fee, 'counter_status', c.counter_status,
    'lifecycle_reason', nullif(c.lifecycle_reason, ''), 'resume_on', c.resume_on, 'resume_stage', c.resume_stage, 'paused_at', c.paused_at, 'cancelled_at', c.cancelled_at,
    'ad_code', c.ad_code, 'contact_name', c.contact_name, 'contact_email', c.contact_email, 'created_at', c.created_at, 'updated_at', c.updated_at,
    'ship_tracking', nullif(c.ship_tracking, ''), 'shipped_at', c.shipped_at, 'product_received_at', c.product_received_at,
    'creator', jsonb_build_object('id', s.id, 'name', s.display_name, 'email', s.creator_email, 'slug', case when s.slug_chosen then s.slug end, 'status', s.status),
    'brand', case when b.id is null then null else jsonb_build_object('id', b.id, 'name', b.name, 'category', b.category) end,
    'logins', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'workspace', m.owner,
        'workspace_name', coalesce((select f.name from public.brand_profiles f where f.owner = m.owner), (select x.email from auth.users x where x.id = m.owner))) order by u.email)
      from public.brand_members m join auth.users u on u.id = m.profile_id where m.brand_id = c.brand_id), '[]'::jsonb),
    'deliverables', coalesce((select jsonb_agg(jsonb_build_object('kind', d.kind, 'qty', d.qty, 'done', d.done,
        'items', (select coalesce(jsonb_agg(jsonb_build_object('status', i.status, 'due', i.due_date) order by i.position), '[]'::jsonb) from public.deliverable_items i where i.deliverable_id = d.id)) order by d.position)
      from public.deliverables d where d.collab_id = p_id), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'version', q.version, 'total', q.total, 'status', q.status, 'sent_at', q.sent_at,
        'responded_at', q.responded_at, 'accepted_by', nullif(q.accepted_email, ''), 'valid_until', q.valid_until, 'advance_pct', q.advance_pct) order by q.version)
      from public.quotes q where q.collab_id = p_id), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'kind', i.kind, 'total', i.total, 'received', i.amount_received,
        'tds', i.tds_deducted, 'status', i.status, 'due', i.due_date, 'sent_at', i.sent_at, 'paid_on', i.paid_on, 'auto_remind', i.auto_remind,
        'reminders_sent', i.reminders_sent, 'claim_at', i.claim_at,
        'demands', (select coalesce(jsonb_agg(jsonb_build_object('step', d.step, 'kind', d.kind, 'via', d.via, 'sent_at', d.sent_at) order by d.sent_at), '[]'::jsonb)
          from public.payment_demands d where d.invoice_id = i.id),
        'alerts', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'amount', a.amount, 'at', a.received_at, 'status', a.status) order by a.received_at), '[]'::jsonb)
          from public.bank_alerts a where a.invoice_id = i.id)) order by i.created_at)
      from public.invoices i where i.collab_id = p_id), '[]'::jsonb),
    'drafts', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'round', d.round, 'status', d.status, 'submitted_at', d.submitted_at, 'responded_at', d.responded_at,
        'has_file', d.file_path is not null or coalesce(d.link, '') <> '', 'comments', (select count(*) from public.draft_comments x where x.draft_id = d.id)) order by d.round)
      from public.drafts d where d.collab_id = p_id), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status, 'publish_at', x.publish_at, 'error', nullif(x.error, ''), 'permalink', x.permalink) order by x.publish_at)
      from public.scheduled_posts x where x.collab_id = p_id), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('slug', l.slug, 'clicks', l.clicks, 'sales', l.sales, 'revenue', l.revenue, 'code', l.promo_code))
      from public.collab_links l where l.collab_id = p_id), '[]'::jsonb),
    'messages', jsonb_build_object('n', (select count(*) from public.collab_messages m where m.collab_id = p_id),
      'last', (select max(m.created_at) from public.collab_messages m where m.collab_id = p_id),
      'creator', (select count(*) from public.collab_messages m where m.collab_id = p_id and m.sender = 'creator'),
      'brand', (select count(*) from public.collab_messages m where m.collab_id = p_id and m.sender = 'brand')),
    'files', (select count(*) from public.collab_files f where f.collab_id = p_id),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'by', r.by_name, 'reason', r.reason, 'status', r.status, 'at', r.created_at))
      from public.safety_reports r where r.collab_id = p_id), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(e order by e ->> 'at' desc) from (
      select e from (
        select jsonb_build_object('at', ev.at, 'kind', case when ev.actor is null then 'system'
            when exists (select 1 from public.brand_members m where m.profile_id = ev.actor and m.brand_id = c.brand_id) then 'brand'
            when exists (select 1 from auth.users u join public.app_admins a on a.email = lower(u.email) where u.id = ev.actor) then 'admin'
            else 'creator' end,
          'title', ev.text, 'text', case when ev.visible_to_brand then null else 'creator only' end) e
        from public.collab_events ev where ev.collab_id = p_id
        union all
        select jsonb_build_object('at', o.created_at, 'kind', 'email', 'title', o.kind || ' to ' || coalesce(nullif(o.to_email, ''), 'the creator'), 'text', o.status)
        from public.outbox o where o.payload ->> 'code' = c.code
        union all
        select jsonb_build_object('at', x.at, 'kind', 'admin', 'title', initcap(replace(x.action, '_', ' ')) || ' by ' || x.admin, 'text', nullif(x.reason, ''))
        from public.admin_audit x where x.kind = 'collab' and x.record = p_id::text
      ) all_e order by e ->> 'at' desc limit 120) z), '[]'::jsonb)
  ) || private.admin_extras('collab', p_id::text);
end;
$$;

-- The messages between creator and brand. Private: reading them needs a reason, and is logged.
create or replace function public.admin_collab_messages(p_id uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  if not exists (select 1 from public.collabs where id = p_id) then raise exception 'Not found.' using errcode = 'P0002'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 4 then raise exception 'Say why you need to read these messages.'; end if;
  perform private.admin_log('read_messages', 'collab', p_id::text, private.collab_label(p_id), null,
    jsonb_build_object('messages', (select count(*) from public.collab_messages where collab_id = p_id)), p_reason);
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'sender', m.sender, 'author', u.email, 'body', m.body, 'auto', m.auto,
      'files', jsonb_array_length(coalesce(m.attachments, '[]'::jsonb)), 'at', m.created_at) order by m.created_at)
    from public.collab_messages m left join auth.users u on u.id = m.author where m.collab_id = p_id), '[]'::jsonb);
end;
$$;

create or replace function public.admin_brand(p_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  b public.brands;
  s public.creator_settings;
begin
  perform private.admin_check();
  select * into b from public.brands where id = p_id;
  if b.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  select * into s from public.creator_settings where id = b.creator_id;
  return jsonb_build_object(
    'id', b.id, 'name', b.name, 'category', b.category, 'instagram', b.instagram, 'website', b.website, 'country', b.country, 'currency', b.currency,
    'state', b.state, 'accounts_email', b.accounts_email, 'created_at', b.created_at,
    'gstin', case when coalesce(b.gstin, '') = '' then '' else left(b.gstin, 4) || '•••••••' || right(b.gstin, 3) end,
    'pan', case when coalesce(b.pan, '') = '' then '' else left(b.pan, 2) || '••••••' || right(b.pan, 2) end,
    'creator', jsonb_build_object('id', s.id, 'name', s.display_name, 'slug', case when s.slug_chosen then s.slug end, 'status', s.status),
    'logins', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'name', p.full_name, 'workspace', m.owner,
        'workspace_name', coalesce((select f.name from public.brand_profiles f where f.owner = m.owner), (select x.email from auth.users x where x.id = m.owner)),
        'last_active', u.last_sign_in_at) order by u.email)
      from public.brand_members m join auth.users u on u.id = m.profile_id left join public.profiles p on p.id = u.id where m.brand_id = p_id), '[]'::jsonb),
    'stats', jsonb_build_object(
      'collabs', (select count(*) from public.collabs c where c.brand_id = p_id),
      'open', (select count(*) from public.collabs c where c.brand_id = p_id and c.stage not in ('wrapped', 'cancelled', 'declined')),
      'paid', (select coalesce(sum(i.total), 0) from public.invoices i join public.collabs c on c.id = i.collab_id where c.brand_id = p_id and i.status = 'paid'),
      'waiting', (select coalesce(sum(i.total - i.amount_received), 0) from public.invoices i join public.collabs c on c.id = i.collab_id where c.brand_id = p_id and i.status in ('sent', 'partly_paid')),
      'retainers', (select count(*) from public.retainers r where r.brand_id = p_id and r.active)),
    'collabs', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', c.id, 'code', c.code, 'stage', c.stage, 'fee', c.fee, 'pay', c.pay_status, 'live', c.live_date, 'at', c.created_at) x
      from public.collabs c where c.brand_id = p_id order by c.created_at desc limit 50) z), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('rating', r.rating, 'body', r.body, 'name', r.name, 'shown', r.shown, 'at', r.created_at) order by r.created_at desc)
      from public.brand_reviews r join public.collabs c on c.id = r.collab_id where c.brand_id = p_id), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'by', r.by_name, 'reason', r.reason, 'status', r.status, 'at', r.created_at) order by r.created_at desc)
      from public.safety_reports r where r.target_brand = p_id), '[]'::jsonb),
    'blocked', exists (select 1 from public.safety_blocks k where k.brand_id = p_id)
  ) || private.admin_extras('brand', p_id::text);
end;
$$;

create or replace function public.admin_campaign(p_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  k public.brand_campaigns;
begin
  perform private.admin_check();
  select * into k from public.brand_campaigns where id = p_id;
  if k.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'id', k.id, 'name', k.name, 'status', k.status, 'open', k.open, 'open_until', k.open_until, 'brief', k.brief, 'rules', k.rules,
    'budget_total', k.budget_total, 'budget_min', k.budget_min, 'budget_max', k.budget_max, 'created_at', k.created_at, 'sent_at', k.sent_at,
    'workspace', jsonb_build_object('id', k.owner, 'name', coalesce((select f.name from public.brand_profiles f where f.owner = k.owner), (select u.email from auth.users u where u.id = k.owner))),
    'pool', (select jsonb_build_object('id', p.id, 'name', p.name) from public.brand_pools p where p.id = k.pool_id),
    'applications', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'creator_id', a.creator_id, 'creator', s.display_name, 'rate', a.rate, 'note', a.note,
        'status', a.status, 'collab_id', a.collab_id, 'at', a.created_at) order by a.created_at desc)
      from public.campaign_applications a left join public.creator_settings s on s.id = a.creator_id where a.campaign_id = p_id), '[]'::jsonb),
    'creators', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'creator_id', x.creator_id, 'creator', coalesce(s.display_name, x.handle), 'status', x.status,
        'collab_id', x.collab_id, 'stage', c.stage, 'fee', c.fee, 'at', x.created_at) order by x.created_at)
      from public.campaign_creators x left join public.creator_settings s on s.id = x.creator_id left join public.collabs c on c.id = x.collab_id where x.campaign_id = p_id), '[]'::jsonb)
  ) || private.admin_extras('campaign', p_id::text);
end;
$$;

-- 3. Actions, each logged ------------------------------------------------------------------------------
-- Pause, cancel or resume a collab, the same way the creator does it in the app (posts go on hold,
-- emails about it stop) but with Miracle's reason.
create or replace function public.admin_collab_lifecycle(p_id uuid, p_action text, p_reason text, p_resume_on date default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
begin
  perform private.admin_check();
  if p_action not in ('pause', 'cancel', 'resume') then raise exception 'Pick pause, cancel or resume.'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Say why, for the audit trail.'; end if;
  select * into c from public.collabs where id = p_id;
  if c.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  perform private.admin_profile();
  if p_action = 'resume' then
    if c.stage not in ('paused', 'cancelled') then raise exception 'This collab isn''t paused or cancelled.'; end if;
    update public.collabs set stage = coalesce(c.resume_stage, 'request') where id = p_id;
  else
    update public.collabs set stage = case when p_action = 'pause' then 'paused' else 'cancelled' end::public.collab_stage,
      lifecycle_reason = left('Miracle: ' || btrim(p_reason), 600), resume_on = case when p_action = 'pause' then p_resume_on end
    where id = p_id;
  end if;
  perform private.admin_log(p_action, 'collab', p_id::text, private.collab_label(p_id), jsonb_build_object('stage', c.stage),
    jsonb_build_object('stage', (select stage from public.collabs where id = p_id)), p_reason);
  return public.admin_collab(p_id);
end;
$$;

create or replace function public.admin_invoice_reminders(p_id uuid, p_on boolean, p_reason text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  i public.invoices;
begin
  perform private.admin_check();
  select * into i from public.invoices where id = p_id;
  if i.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  update public.invoices set auto_remind = p_on where id = p_id;
  perform private.admin_log(case when p_on then 'reminders_on' else 'reminders_off' end, 'collab', i.collab_id::text,
    private.collab_label(i.collab_id) || ' · ' || i.number, jsonb_build_object('invoice', i.number, 'reminders', i.auto_remind), jsonb_build_object('reminders', p_on), p_reason);
  return public.admin_collab(i.collab_id);
end;
$$;

create or replace function public.admin_post_cancel(p_id uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  x public.scheduled_posts;
begin
  perform private.admin_check();
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Say why, for the audit trail.'; end if;
  select * into x from public.scheduled_posts where id = p_id;
  if x.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  if x.status not in ('scheduled', 'on_hold', 'failed') then raise exception 'Only a post that hasn''t gone out can be cancelled.'; end if;
  update public.scheduled_posts set status = 'cancelled', error = left('Cancelled by Miracle: ' || btrim(p_reason), 300) where id = p_id;
  perform private.admin_log('post_cancel', 'collab', x.collab_id::text, private.collab_label(x.collab_id),
    jsonb_build_object('post', x.status, 'publish_at', x.publish_at), jsonb_build_object('post', 'cancelled'), p_reason);
  return public.admin_collab(x.collab_id);
end;
$$;

create or replace function public.admin_campaign_close(p_id uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  k public.brand_campaigns;
begin
  perform private.admin_check();
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Say why, for the audit trail.'; end if;
  select * into k from public.brand_campaigns where id = p_id;
  if k.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  if not k.open then raise exception 'This brief isn''t open.'; end if;
  update public.brand_campaigns set open = false where id = p_id;
  perform private.admin_log('brief_close', 'campaign', p_id::text, k.name, jsonb_build_object('open', true), jsonb_build_object('open', false), p_reason);
  return public.admin_campaign(p_id);
end;
$$;

create or replace function public.admin_retainer_set(p_id uuid, p_active boolean, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  r public.retainers;
begin
  perform private.admin_check();
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Say why, for the audit trail.'; end if;
  select * into r from public.retainers where id = p_id;
  if r.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  update public.retainers set active = p_active where id = p_id;
  perform private.admin_log(case when p_active then 'retainer_on' else 'retainer_off' end, 'creator', r.creator_id::text, r.title,
    jsonb_build_object('retainer', r.title, 'active', r.active), jsonb_build_object('active', p_active), p_reason);
  return jsonb_build_object('id', p_id, 'active', p_active);
end;
$$;

create or replace function public.admin_pitch_stop(p_id uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  x public.pitches;
begin
  perform private.admin_check();
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Say why, for the audit trail.'; end if;
  select * into x from public.pitches where id = p_id;
  if x.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  update public.pitches set auto_follow = false, next_follow_on = null where id = p_id;
  perform private.admin_log('pitch_followups_off', 'creator', x.creator_id::text, x.brand_name,
    jsonb_build_object('pitch', x.brand_name, 'follow_ups', x.auto_follow), jsonb_build_object('follow_ups', false), p_reason);
  return jsonb_build_object('id', p_id, 'auto_follow', false);
end;
$$;

create or replace function public.admin_bank_alert_ignore(p_id uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  a public.bank_alerts;
begin
  perform private.admin_check();
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Say why, for the audit trail.'; end if;
  select * into a from public.bank_alerts where id = p_id;
  if a.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  if a.status <> 'unmatched' then raise exception 'Only an unmatched alert can be set aside.'; end if;
  update public.bank_alerts set status = 'ignored', note = left(btrim(p_reason), 300) where id = p_id;
  perform private.admin_log('bank_alert_ignored', 'creator', a.creator_id::text, '₹' || a.amount::text || ' from ' || coalesce(a.sender, ''),
    jsonb_build_object('alert', a.status), jsonb_build_object('alert', 'ignored'), p_reason);
  return jsonb_build_object('id', p_id, 'status', 'ignored');
end;
$$;

-- 4. The Deals lists, the default sort for them, search and the dashboard linking to collab pages, and
-- notes on campaigns. (These replace the part 1 versions; only the noted parts changed.)
create or replace function private.admin_rows(p_kind text)
returns setof jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_kind = 'creators' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', s.id::text,
      '_search', lower(concat_ws(' ', s.display_name, s.creator_email, s.slug, s.handle, s.city, s.niche)),
      'id', s.id, 'name', nullif(s.display_name, ''), 'email', s.creator_email, 'slug', case when s.slug_chosen then s.slug end,
      'status', s.status, 'niche', nullif(s.niche, ''), 'city', nullif(s.city, ''), 'handle', nullif(s.handle, ''),
      'followers', a.followers, 'instagram', coalesce(a.connected, false), 'directory', coalesce(s.directory_listed, false),
      'collabs', (select count(*) from public.collabs c where c.creator_id = s.id),
      'open_collabs', (select count(*) from public.collabs c where c.creator_id = s.id and c.stage not in ('wrapped', 'cancelled', 'declined')),
      'paid', (select coalesce(sum(i.total), 0) from public.invoices i where i.creator_id = s.id and i.status = 'paid'),
      'team', (select count(*) from public.team_members t where t.creator_id = s.id),
      'note', nullif(s.request_note, ''), 'heard', s.signup ->> 'heard', 'followers_said', s.signup ->> 'followers',
      'joined', s.created_at, 'requested_at', s.requested_at, 'approved_at', s.approved_at,
      'last_active', greatest((select max(u.last_sign_in_at) from auth.users u where lower(u.email) = lower(s.creator_email)),
        (select max(t.last_seen_at) from public.team_members t where t.creator_id = s.id))))
    from public.creator_settings s
    left join public.ig_account a on a.creator_id = s.id;

  elsif p_kind = 'creator_teams' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', t.creator_id || ':' || t.email,
      '_search', lower(concat_ws(' ', t.name, t.email, s.display_name, s.slug)),
      'creator_id', t.creator_id, 'creator', nullif(s.display_name, ''), 'creator_status', s.status, 'email', t.email, 'name', nullif(t.name, ''),
      'role', t.role, 'copy_emails', t.copy_emails, 'added_at', t.added_at, 'last_seen', t.last_seen_at))
    from public.team_members t join public.creator_settings s on s.id = t.creator_id;

  elsif p_kind = 'brand_logins' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', u.id::text,
      '_search', lower(concat_ws(' ', u.email, p.full_name, f.name, f.city)),
      'id', u.id, 'email', u.email, 'name', nullif(p.full_name, ''), 'company', f.name, 'city', nullif(f.city, ''), 'role', nullif(f.role, ''),
      'state', case when f.closed_at is not null then 'closed' when f.paused_at is not null then 'paused' else 'active' end,
      'workspaces', (select count(*) from private.teams_of(u.id)),
      'agency', (select count(*) from private.teams_of(u.id)) > 1,
      'companies', (select count(*) from public.brand_members m where m.profile_id = u.id),
      'collabs', (select count(*) from public.collabs c where c.created_by = u.id),
      'instagram', exists (select 1 from public.brand_ig g where g.owner = u.id),
      'reports', (select count(*) from public.safety_reports r where r.target_owner = u.id),
      'joined', u.created_at, 'last_active', u.last_sign_in_at))
    from auth.users u
    join private.brand_login_ids() b on b = u.id
    left join public.profiles p on p.id = u.id
    left join public.brand_profiles f on f.owner = u.id;

  elsif p_kind = 'workspaces' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', w::text,
      '_search', lower(concat_ws(' ', f.name, u.email, f.category, f.city)),
      'id', w, 'name', coalesce(f.name, u.email), 'owner_email', u.email, 'category', nullif(f.category, ''), 'city', nullif(f.city, ''),
      'state', case when f.closed_at is not null then 'closed' when f.paused_at is not null then 'paused' else 'active' end,
      'members', (select count(*) from private.team_logins(w)),
      'invited', (select count(*) from public.brand_team_members m where m.owner = w and m.joined_at is null),
      'companies', (select count(distinct m.brand_id) from public.brand_members m where m.owner = w),
      'collabs', (select count(*) from private.company_collabs(w)),
      'campaigns', (select count(*) from public.brand_campaigns c where c.owner = w),
      'autopilots', (select (a.shortlist <> 'off')::int + (a.followup <> 'off')::int + (a.draftcheck <> 'off')::int + (a.negotiate <> 'off')::int
          + (a.rebook <> 'off')::int + (a.watch <> 'off')::int from public.brand_autopilots a where a.owner = w),
      'approvals', coalesce((select t.approval_on from public.brand_teams t where t.owner = w), false),
      'joined', coalesce(f.created_at, u.created_at), 'last_active', (select max(x.last_sign_in_at) from auth.users x where x.id in (select private.team_logins(w)))))
    from private.workspace_ids() w
    join auth.users u on u.id = w
    left join public.brand_profiles f on f.owner = w;

  elsif p_kind = 'brands' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', b.id::text,
      '_search', lower(concat_ws(' ', b.name, b.category, b.instagram, b.website, s.display_name, b.accounts_email)),
      'id', b.id, 'name', b.name, 'category', nullif(b.category, ''), 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'collabs', (select count(*) from public.collabs c where c.brand_id = b.id),
      'open', (select count(*) from public.collabs c where c.brand_id = b.id and c.stage not in ('wrapped', 'cancelled', 'declined')),
      'paid', (select coalesce(sum(i.total), 0) from public.invoices i join public.collabs c on c.id = i.collab_id where c.brand_id = b.id and i.status = 'paid'),
      'logins', (select count(*) from public.brand_members m where m.brand_id = b.id),
      'gst', coalesce(b.gstin, '') <> '',
      'last_collab', (select max(c.created_at) from public.collabs c where c.brand_id = b.id),
      'created', b.created_at))
    from public.brands b left join public.creator_settings s on s.id = b.creator_id;

  elsif p_kind = 'collabs' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', c.id::text,
      '_search', lower(concat_ws(' ', c.code, b.name, s.display_name, c.contact_name, c.contact_email, c.product)),
      'id', c.id, 'code', c.code, 'brand', b.name, 'brand_id', b.id, 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'stage', c.stage::text, 'pay', c.pay_status, 'type', c.type, 'source', c.source, 'fee', c.fee,
      'live', c.live_date, 'pay_due', c.pay_due, 'contact', nullif(c.contact_email, ''),
      'messages', (select count(*) from public.collab_messages m where m.collab_id = c.id),
      'invoiced', (select coalesce(sum(i.total), 0) from public.invoices i where i.collab_id = c.id),
      'received', (select coalesce(sum(i.amount_received), 0) from public.invoices i where i.collab_id = c.id),
      'updated', c.updated_at, 'created', c.created_at))
    from public.collabs c left join public.brands b on b.id = c.brand_id left join public.creator_settings s on s.id = c.creator_id;

  elsif p_kind = 'quotes' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', q.id::text,
      '_search', lower(concat_ws(' ', c.code, b.name, s.display_name, q.accepted_email)),
      'id', q.id, 'collab_id', c.id, 'code', c.code, 'brand', b.name, 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'version', q.version, 'total', q.total, 'status', q.status, 'advance_pct', q.advance_pct, 'sent_at', q.sent_at, 'responded_at', q.responded_at,
      'valid_until', q.valid_until, 'accepted_by', nullif(q.accepted_email, ''), 'created', q.created_at))
    from public.quotes q join public.collabs c on c.id = q.collab_id left join public.brands b on b.id = c.brand_id left join public.creator_settings s on s.id = c.creator_id;

  elsif p_kind = 'invoices' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', i.id::text,
      '_search', lower(concat_ws(' ', i.number, c.code, b.name, s.display_name, i.send_to)),
      'id', i.id, 'collab_id', c.id, 'number', i.number, 'code', c.code, 'brand', b.name, 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'kind', i.kind, 'total', i.total, 'received', i.amount_received, 'outstanding', greatest(i.total - i.amount_received - i.tds_deducted, 0),
      'status', i.status, 'due', i.due_date, 'paid_on', i.paid_on, 'sent_at', i.sent_at,
      'overdue', i.status in ('sent', 'partly_paid') and i.due_date < (now() at time zone 'Asia/Kolkata')::date,
      'reminders', i.auto_remind, 'reminders_sent', i.reminders_sent, 'created', i.created_at))
    from public.invoices i left join public.collabs c on c.id = i.collab_id left join public.brands b on b.id = c.brand_id left join public.creator_settings s on s.id = i.creator_id;

  elsif p_kind = 'payments' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', a.id::text,
      '_search', lower(concat_ws(' ', a.sender, a.ref, i.number, s.display_name, a.amount::text)),
      'id', a.id, 'amount', a.amount, 'sender', nullif(a.sender, ''), 'ref', nullif(a.ref, ''), 'status', a.status,
      'invoice', i.number, 'collab_id', i.collab_id, 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'note', nullif(a.note, ''), 'created', coalesce(a.received_at, a.created_at)))
    from public.bank_alerts a left join public.invoices i on i.id = a.invoice_id left join public.creator_settings s on s.id = a.creator_id;

  elsif p_kind = 'drafts' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', d.id::text,
      '_search', lower(concat_ws(' ', c.code, b.name, s.display_name, d.status)),
      'id', d.id, 'collab_id', c.id, 'code', c.code, 'brand', b.name, 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'round', d.round, 'status', d.status, 'submitted_at', d.submitted_at, 'responded_at', d.responded_at,
      'waiting_days', case when d.status = 'pending' and d.submitted_at is not null then extract(day from now() - d.submitted_at)::int end,
      'comments', (select count(*) from public.draft_comments x where x.draft_id = d.id), 'created', d.submitted_at))
    from public.drafts d join public.collabs c on c.id = d.collab_id left join public.brands b on b.id = c.brand_id left join public.creator_settings s on s.id = c.creator_id;

  elsif p_kind = 'posts' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', x.id::text,
      '_search', lower(concat_ws(' ', c.code, b.name, s.display_name, x.status, x.error)),
      'id', x.id, 'collab_id', c.id, 'code', c.code, 'brand', b.name, 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'status', x.status, 'publish_at', x.publish_at, 'error', nullif(x.error, ''), 'permalink', x.permalink, 'created', x.created_at))
    from public.scheduled_posts x left join public.collabs c on c.id = x.collab_id left join public.brands b on b.id = c.brand_id left join public.creator_settings s on s.id = x.creator_id;

  elsif p_kind = 'campaigns' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', k.id::text,
      '_search', lower(concat_ws(' ', k.name, f.name, u.email)),
      'id', k.id, 'name', k.name, 'workspace', coalesce(f.name, u.email), 'workspace_id', k.owner, 'status', k.status,
      'open', k.open, 'open_until', k.open_until, 'budget', k.budget_total,
      'creators', (select count(*) from public.campaign_creators x where x.campaign_id = k.id),
      'applications', (select count(*) from public.campaign_applications x where x.campaign_id = k.id),
      'collabs', (select count(*) from public.campaign_creators x where x.campaign_id = k.id and x.collab_id is not null),
      'sent_at', k.sent_at, 'created', k.created_at))
    from public.brand_campaigns k left join auth.users u on u.id = k.owner left join public.brand_profiles f on f.owner = k.owner;

  elsif p_kind = 'pools' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', p.id::text,
      '_search', lower(concat_ws(' ', p.name, f.name, u.email)),
      'id', p.id, 'name', p.name, 'workspace', coalesce(f.name, u.email), 'workspace_id', p.owner,
      'creators', (select count(*) from public.brand_pool_members m where m.pool_id = p.id),
      'on_miracle', (select count(*) from public.brand_pool_members m where m.pool_id = p.id and m.creator_id is not null),
      'campaigns', (select count(*) from public.brand_campaigns k where k.pool_id = p.id), 'created', p.created_at))
    from public.brand_pools p left join auth.users u on u.id = p.owner left join public.brand_profiles f on f.owner = p.owner;

  elsif p_kind = 'retainers' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', r.id::text,
      '_search', lower(concat_ws(' ', r.title, b.name, s.display_name, r.contact_email)),
      'id', r.id, 'title', r.title, 'brand', b.name, 'brand_id', b.id, 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'fee', r.fee, 'months', r.months, 'starts_on', r.starts_on, 'active', r.active,
      'collabs', (select count(*) from public.collabs c where c.retainer_id = r.id), 'created', r.created_at))
    from public.retainers r left join public.brands b on b.id = r.brand_id left join public.creator_settings s on s.id = r.creator_id;

  elsif p_kind = 'pitches' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', x.id::text,
      '_search', lower(concat_ws(' ', x.brand_name, x.category, x.email, x.instagram, s.display_name)),
      'id', x.id, 'brand', x.brand_name, 'category', nullif(x.category, ''), 'email', nullif(x.email, ''), 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'status', x.status, 'source', nullif(x.source, ''), 'auto_follow', x.auto_follow, 'followups', x.followups, 'approved', x.approved,
      'sent_at', x.sent_at, 'next_follow_on', x.next_follow_on, 'replied_at', x.replied_at, 'collab_id', x.collab_id, 'created', x.created_at))
    from public.pitches x left join public.creator_settings s on s.id = x.creator_id;

  elsif p_kind = 'audit' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', a.id::text,
      '_search', lower(concat_ws(' ', a.admin, a.action, a.kind, a.label, a.reason, a.record)),
      'id', a.id, 'at', a.at, 'admin', a.admin, 'action', a.action, 'kind', a.kind, 'record', nullif(a.record, ''), 'label', nullif(a.label, ''),
      'before', a.before, 'after', a.after, 'reason', nullif(a.reason, '')))
    from public.admin_audit a;
  else
    raise exception 'Unknown list %.', p_kind;
  end if;
end;
$$;

create or replace function public.admin_list(p_kind text, p_q text default '', p_filters jsonb default '{}', p_sort text default '',
  p_desc boolean default true, p_limit integer default 50, p_offset integer default 0, p_counts jsonb default '{}')
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_q text := lower(btrim(coalesce(p_q, '')));
  v_sort text := coalesce(nullif(p_sort, ''), case when p_kind = 'audit' then 'at' when p_kind = 'creator_teams' then 'added_at'
    when p_kind in ('creators', 'brand_logins', 'workspaces') then 'joined' else 'created' end);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 5000);
begin
  perform private.admin_check();
  if jsonb_typeof(coalesce(p_filters, '{}')) <> 'object' or jsonb_typeof(coalesce(p_counts, '{}')) <> 'object' then
    raise exception 'Filters must be an object.';
  end if;
  return (
    with src as (select x from private.admin_rows(p_kind) x),
    hit as (select x from src where (v_q = '' or strpos(x ->> '_search', v_q) > 0) and private.admin_match(x, p_filters)),
    page as (
      select x, row_number() over (order by
        case when p_desc then x -> v_sort end desc nulls last,
        case when not p_desc then x -> v_sort end asc nulls last,
        x ->> '_key') as n
      from hit
      order by n
      limit v_limit offset greatest(coalesce(p_offset, 0), 0))
    select jsonb_build_object(
      'total', (select count(*) from hit),
      'rows', coalesce((select jsonb_agg(x - '_search' order by n) from page), '[]'::jsonb),
      'counts', coalesce((select jsonb_object_agg(c.key, (select count(*) from src where private.admin_match(src.x, c.value)))
        from jsonb_each(coalesce(p_counts, '{}')) c), '{}'::jsonb)));
end;
$$;

create or replace function public.admin_search(p_q text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_q text := lower(btrim(coalesce(p_q, '')));
  v_like text;
begin
  perform private.admin_check();
  if char_length(v_q) < 2 then return '[]'::jsonb; end if;
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((select jsonb_agg(g order by g ->> 'n') from (
    select jsonb_build_object('n', 1, 'kind', 'creator', 'label', 'Creators', 'items', jsonb_agg(x)) g from (
      select jsonb_build_object('id', s.id::text, 'title', coalesce(nullif(s.display_name, ''), s.creator_email), 'sub', concat_ws(' · ', s.creator_email, case when s.slug_chosen then s.slug || '.miracleapp.live' end), 'meta', s.status) x
      from public.creator_settings s
      where lower(concat_ws(' ', s.display_name, s.creator_email, s.slug, s.handle)) like v_like order by s.status = 'active' desc, s.id limit 6) z having count(*) > 0
    union all
    select jsonb_build_object('n', 2, 'kind', 'brand_login', 'label', 'Brand logins', 'items', jsonb_agg(x)) from (
      select jsonb_build_object('id', u.id::text, 'title', u.email, 'sub', concat_ws(' · ', nullif(p.full_name, ''), f.name), 'meta', '') x
      from auth.users u join private.brand_login_ids() b on b = u.id left join public.profiles p on p.id = u.id left join public.brand_profiles f on f.owner = u.id
      where lower(concat_ws(' ', u.email, p.full_name, f.name)) like v_like limit 6) z having count(*) > 0
    union all
    select jsonb_build_object('n', 3, 'kind', 'workspace', 'label', 'Brand workspaces', 'items', jsonb_agg(x)) from (
      select jsonb_build_object('id', w::text, 'title', coalesce(f.name, u.email), 'sub', 'Owner ' || u.email, 'meta', '') x
      from private.workspace_ids() w join auth.users u on u.id = w left join public.brand_profiles f on f.owner = w
      where lower(concat_ws(' ', f.name, u.email)) like v_like limit 6) z having count(*) > 0
    union all
    select jsonb_build_object('n', 4, 'kind', 'brand', 'label', 'Brands (companies)', 'items', jsonb_agg(x)) from (
      select jsonb_build_object('id', b.id::text, 'title', b.name, 'sub', 'In ' || coalesce(s.display_name, 'a creator') || '''s studio', 'meta', coalesce(b.category, '')) x
      from public.brands b left join public.creator_settings s on s.id = b.creator_id
      where lower(b.name) like v_like order by b.created_at desc limit 6) z having count(*) > 0
    union all
    select jsonb_build_object('n', 5, 'kind', 'collab', 'label', 'Collabs', 'items', jsonb_agg(x)) from (
      select jsonb_build_object('id', c.id::text, 'title', c.code || ' · ' || coalesce(b.name, '') || ' × ' || coalesce(s.display_name, ''), 'sub', c.stage || ' · ₹' || coalesce(c.fee, 0)::text, 'meta', '', 'creator', s.id) x
      from public.collabs c left join public.brands b on b.id = c.brand_id left join public.creator_settings s on s.id = c.creator_id
      where lower(concat_ws(' ', c.code, b.name, c.contact_email)) like v_like order by c.created_at desc limit 6) z having count(*) > 0
    union all
    select jsonb_build_object('n', 6, 'kind', 'invoice', 'label', 'Invoices', 'items', jsonb_agg(x)) from (
      select jsonb_build_object('id', i.id::text, 'title', i.number, 'sub', i.status || ' · ₹' || i.total::text, 'meta', '', 'creator', i.creator_id, 'collab', i.collab_id) x
      from public.invoices i where lower(i.number) like v_like order by i.created_at desc limit 6) z having count(*) > 0
    union all
    select jsonb_build_object('n', 7, 'kind', 'ticket', 'label', 'Support tickets', 'items', jsonb_agg(x)) from (
      select jsonb_build_object('id', t.id::text, 'title', '#' || t.number || ' ' || t.subject, 'sub', t.email, 'meta', t.status) x
      from public.support_tickets t where lower(concat_ws(' ', '#' || t.number, t.subject, t.email, t.name)) like v_like order by t.updated_at desc limit 6) z having count(*) > 0
  ) all_g), '[]'::jsonb);
end;
$$;

create or replace function public.admin_dashboard(p_days integer default 30)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_days integer := case when p_days in (7, 30, 90) then p_days else 0 end;
  v_from timestamptz := case when v_days = 0 then '-infinity'::timestamptz else now() - make_interval(days => v_days) end;
  v_prev timestamptz := case when v_days = 0 then '-infinity'::timestamptz else now() - make_interval(days => v_days * 2) end;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_jobs jsonb;
begin
  perform private.admin_check();
  begin
    select jsonb_build_object('failed', count(*) filter (where d.status = 'failed'), 'runs', count(*), 'last', max(d.end_time))
      into v_jobs from cron.job_run_details d where d.start_time > now() - interval '1 day';
  exception when others then
    v_jobs := null;
  end;
  return jsonb_build_object(
    'days', v_days,
    'kpis', jsonb_build_object(
      'creators', jsonb_build_object('now', (select count(*) from public.creator_settings where status = 'active'),
        'cur', (select count(*) from public.creator_settings where approved_at >= v_from), 'prev', (select count(*) from public.creator_settings where approved_at >= v_prev and approved_at < v_from)),
      'brand_logins', jsonb_build_object('now', (select count(*) from private.brand_login_ids()),
        'cur', (select count(*) from auth.users u join private.brand_login_ids() b on b = u.id where u.created_at >= v_from),
        'prev', (select count(*) from auth.users u join private.brand_login_ids() b on b = u.id where u.created_at >= v_prev and u.created_at < v_from)),
      'collabs', jsonb_build_object('cur', (select count(*) from public.collabs where created_at >= v_from), 'prev', (select count(*) from public.collabs where created_at >= v_prev and created_at < v_from)),
      'paid', jsonb_build_object('cur', (select coalesce(sum(total), 0) from public.invoices where status = 'paid' and paid_on >= v_from::date),
        'prev', (select coalesce(sum(total), 0) from public.invoices where status = 'paid' and paid_on >= v_prev::date and paid_on < v_from::date)),
      'emails', jsonb_build_object('cur', (select count(*) from public.outbox where status = 'sent' and created_at >= v_from),
        'failed', (select count(*) from public.outbox where status = 'failed' and created_at >= v_from)),
      'ai', jsonb_build_object('cur', (select coalesce(sum(calls), 0) from public.ai_usage where day >= v_from::date) + (select coalesce(sum(calls), 0) from public.brand_ai_usage where day >= v_from::date),
        'prev', (select coalesce(sum(calls), 0) from public.ai_usage where day >= v_prev::date and day < v_from::date) + (select coalesce(sum(calls), 0) from public.brand_ai_usage where day >= v_prev::date and day < v_from::date),
        'today', (select coalesce(sum(calls), 0) from public.ai_usage where day = v_today) + (select coalesce(sum(calls), 0) from public.brand_ai_usage where day = v_today))),
    'queue', jsonb_build_object(
      'signups', (select count(*) from public.creator_settings where status = 'pending'),
      'signups_oldest', (select min(coalesce(requested_at, created_at)) from public.creator_settings where status = 'pending'),
      'support', (select count(*) from public.support_tickets where status = 'open'),
      'support_urgent', (select count(*) from public.support_tickets where status = 'open' and priority = 'urgent'),
      'support_unread', (select count(*) from public.support_tickets where team_unread),
      'safety', (select count(distinct coalesce(target_owner::text, target_creator::text, target_brand::text)) from public.safety_reports where status = 'open'),
      'safety_paused', (select count(*) from public.safety_reports where status = 'open' and auto_paused),
      'emails_failed', (select count(*) from public.outbox where status = 'failed' and created_at > now() - interval '7 days'),
      'problems_new', (select count(*) from public.app_problems where status = 'open' and first_seen >= v_today),
      'problems_open', (select count(*) from public.app_problems where status = 'open'),
      'ig_expiring', (select count(*) from public.ig_account where connected and token_expires_at < now() + interval '7 days')),
    'creator_funnel', (select jsonb_build_object(
        'signed_up', count(*), 'approved', count(*) filter (where s.approved_at is not null),
        'instagram', count(*) filter (where exists (select 1 from public.ig_account a where a.creator_id = s.id and a.connected)),
        'collab', count(*) filter (where exists (select 1 from public.collabs c where c.creator_id = s.id)),
        'paid', count(*) filter (where exists (select 1 from public.invoices i where i.creator_id = s.id and i.status = 'paid')))
      from public.creator_settings s where coalesce(s.requested_at, s.created_at) >= v_from),
    'brand_funnel', (select jsonb_build_object(
        'signed_up', count(*),
        'company', count(*) filter (where exists (select 1 from public.brand_members m where m.owner = f.owner)),
        'asked', count(*) filter (where exists (select 1 from private.company_collabs(f.owner))),
        'accepted', count(*) filter (where exists (select 1 from public.quotes q where q.status = 'accepted' and q.collab_id in (select c.id from private.company_collabs(f.owner) c))),
        'paid', count(*) filter (where exists (select 1 from public.invoices i where i.status = 'paid' and i.collab_id in (select c.id from private.company_collabs(f.owner) c))))
      from public.brand_profiles f where f.created_at >= v_from),
    'stages', coalesce((select jsonb_object_agg(stage, jsonb_build_object('n', n, 'value', v)) from (
      select c.stage, count(*) n, coalesce(sum(c.fee), 0) v from public.collabs c group by c.stage) z), '{}'::jsonb),
    'weeks', coalesce((select jsonb_agg(jsonb_build_object('week', w, 'paid', coalesce((select sum(i.total) from public.invoices i
        where i.status = 'paid' and i.paid_on >= w and i.paid_on < w + 7), 0)) order by w)
      from generate_series(date_trunc('week', v_today)::date - 77, date_trunc('week', v_today)::date, interval '7 days') g(w0)
      cross join lateral (select g.w0::date as w) x), '[]'::jsonb),
    'health', jsonb_build_object(
      'outbox_last_sent', (select max(sent_at) from public.outbox where status = 'sent'),
      'outbox_pending', (select count(*) from public.outbox where status = 'pending'),
      'ig_last_sync', (select max(last_sync_at) from public.ig_account where connected),
      'ig_errors', (select count(*) from public.ig_account where connected and coalesce(last_error, '') <> ''),
      'jobs', v_jobs),
    'feed', coalesce((select jsonb_agg(e order by e ->> 'at' desc) from (
      select e from (
        select jsonb_build_object('at', a.at, 'kind', 'admin', 'text', initcap(replace(a.action, '_', ' ')) || coalesce(' · ' || nullif(a.label, ''), '') || ' (' || a.admin || ')',
          'link', a.kind, 'id', a.record) e from (select * from public.admin_audit order by at desc limit 8) a
        union all
        select jsonb_build_object('at', ev.at, 'kind', 'collab', 'text', c.code || ' · ' || coalesce(b.name, '') || ' × ' || coalesce(s.display_name, '') || ': ' || ev.text,
          'link', 'collab', 'id', c.id::text)
          from (select * from public.collab_events order by at desc limit 10) ev join public.collabs c on c.id = ev.collab_id
          left join public.brands b on b.id = c.brand_id left join public.creator_settings s on s.id = c.creator_id
        union all
        select jsonb_build_object('at', s.requested_at, 'kind', 'signup', 'text', coalesce(nullif(s.display_name, ''), s.creator_email) || ' asked to join', 'link', 'creator', 'id', s.id::text)
          from (select * from public.creator_settings where requested_at is not null order by requested_at desc limit 5) s
        union all
        select jsonb_build_object('at', o.created_at, 'kind', 'email', 'text', o.kind || ' to ' || o.to_email || ' failed: ' || left(coalesce(o.last_error, ''), 80), 'link', 'outbox', 'id', o.id::text)
          from (select * from public.outbox where status = 'failed' order by created_at desc limit 5) o
        union all
        select jsonb_build_object('at', t.created_at, 'kind', 'support', 'text', 'Support #' || t.number || ': ' || t.subject, 'link', 'ticket', 'id', t.id::text)
          from (select * from public.support_tickets order by created_at desc limit 5) t
      ) all_e order by e ->> 'at' desc limit 18) z), '[]'::jsonb));
end;
$$;

create or replace function public.admin_note_add(p_kind text, p_record text, p_body text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  if p_kind not in ('creator', 'brand_login', 'workspace', 'collab', 'brand', 'campaign') then raise exception 'Notes can''t go on %.', p_kind; end if;
  if btrim(coalesce(p_body, '')) = '' then raise exception 'Write the note first.'; end if;
  insert into public.admin_notes (kind, record, body, admin) values (p_kind, p_record, left(btrim(p_body), 4000), public.jwt_email());
  perform private.admin_log('note', p_kind, p_record,
    case p_kind
      when 'creator' then (select coalesce(nullif(s.display_name, ''), s.creator_email) from public.creator_settings s where s.id::text = p_record)
      when 'brand_login' then (select u.email from auth.users u where u.id::text = p_record)
      when 'workspace' then (select coalesce(f.name, u.email) from auth.users u left join public.brand_profiles f on f.owner = u.id where u.id::text = p_record)
      when 'brand' then (select b.name from public.brands b where b.id::text = p_record)
      when 'collab' then (select private.collab_label(c.id) from public.collabs c where c.id::text = p_record)
      when 'campaign' then (select k.name from public.brand_campaigns k where k.id::text = p_record)
    end,
    null, jsonb_build_object('note', left(btrim(p_body), 200)));
  return private.admin_extras(p_kind, p_record);
end;
$$;

-- The creator page's invoices link to their collab.
create or replace function public.admin_creator(p_id integer)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  a public.ig_account;
  v_month date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
begin
  perform private.admin_check();
  select * into s from public.creator_settings where id = p_id;
  if s.id is null then raise exception 'Not found.' using errcode = 'P0002'; end if;
  select * into a from public.ig_account where creator_id = p_id;
  return jsonb_build_object(
    'id', s.id, 'name', s.display_name, 'email', s.creator_email, 'slug', case when s.slug_chosen then s.slug end, 'status', s.status,
    'niche', s.niche, 'city', s.city, 'handle', s.handle, 'whatsapp', case when coalesce(s.whatsapp, '') = '' then '' else left(s.whatsapp, 5) || '•••' || right(s.whatsapp, 3) end,
    'note', s.request_note, 'signup', s.signup, 'languages', to_jsonb(coalesce(s.content_languages, '{}'::text[])),
    'directory', coalesce(s.directory_listed, false), 'accepting', s.accepting,
    'joined', s.created_at, 'requested_at', s.requested_at, 'approved_at', s.approved_at, 'closing_at', s.closing_at,
    'gst', case when coalesce(s.gstin, '') = '' then (case when s.gst_registered then 'Registered' else 'Not registered' end)
      else left(s.gstin, 4) || '•••••••' || right(s.gstin, 3) end,
    'bank_set', coalesce(s.upi_id, '') <> '' or coalesce(s.bank_details::text, '') not in ('', '{}', 'null'),
    'rates', s.rates,
    'last_sign_in', (select max(u.last_sign_in_at) from auth.users u where lower(u.email) = lower(s.creator_email)),
    'instagram', case when a.creator_id is null then null else jsonb_build_object('connected', a.connected, 'username', a.username, 'followers', a.followers,
      'media', a.media_count, 'engagement', a.engagement_rate, 'expires', a.token_expires_at, 'synced', a.last_sync_at, 'error', nullif(a.last_error, '')) end,
    'stats', jsonb_build_object(
      'collabs', (select count(*) from public.collabs c where c.creator_id = p_id),
      'open', (select count(*) from public.collabs c where c.creator_id = p_id and c.stage not in ('wrapped', 'cancelled', 'declined')),
      'paid', (select coalesce(sum(i.total), 0) from public.invoices i where i.creator_id = p_id and i.status = 'paid'),
      'paid_month', (select coalesce(sum(i.total), 0) from public.invoices i where i.creator_id = p_id and i.status = 'paid' and i.paid_on >= v_month),
      'waiting', (select coalesce(sum(i.total - i.amount_received), 0) from public.invoices i where i.creator_id = p_id and i.status in ('sent', 'partly_paid')),
      'avg_fee', (select coalesce(round(avg(c.fee)), 0) from public.collabs c where c.creator_id = p_id and c.fee > 0)),
    'related', jsonb_build_object(
      'brands', (select count(*) from public.brands b where b.creator_id = p_id),
      'quotes', (select count(*) from public.quotes q where q.creator_id = p_id),
      'invoices', (select count(*) from public.invoices i where i.creator_id = p_id),
      'drafts', (select count(*) from public.drafts d where d.creator_id = p_id),
      'pitches', (select count(*) from public.pitches x where x.creator_id = p_id),
      'emails', (select count(*) from public.outbox o where o.creator_id = p_id),
      'ai_30d', (select coalesce(sum(u.calls), 0) from public.ai_usage u where u.creator_id = p_id and u.day > current_date - 30),
      'fans', (select count(*) from public.fans f where f.creator_id = p_id),
      'views_30d', (select coalesce(sum(v.views), 0) from public.page_views v where v.creator_id = p_id and v.day > current_date - 30),
      'support', (select count(*) from public.support_tickets t where t.creator_id = p_id),
      'reports', (select count(*) from public.safety_reports r where r.target_creator = p_id)),
    'autopilots', jsonb_build_object('packages', s.autopilot_packages, 'counter', s.autopilot_counter, 'nudge', s.autopilot_nudge, 'review', s.autopilot_review,
      'brief', s.autopilot_brief, 'invoice', s.autopilot_invoice, 'dates', s.autopilot_dates, 'track', s.autopilot_track, 'pitch', s.pitch_auto,
      'pitch_mode', s.pitch_mode, 'comment_dm', s.comment_dm_mode, 'grow', s.grow_mode, 'instant_booking', s.instant_booking, 'rebook', s.rebook_offer, 'demand_pricing', s.demand_pricing),
    'collabs', coalesce((select jsonb_agg(x order by x ->> 'at' desc) from (
      select jsonb_build_object('id', c.id, 'code', c.code, 'brand', b.name, 'stage', c.stage, 'fee', c.fee, 'pay', c.pay_status, 'live', c.live_date, 'at', c.created_at) x
      from public.collabs c left join public.brands b on b.id = c.brand_id where c.creator_id = p_id order by c.created_at desc limit 25) z), '[]'::jsonb),
    'brands', coalesce((select jsonb_agg(x order by (x ->> 'collabs')::int desc) from (
      select jsonb_build_object('id', b.id, 'name', b.name, 'category', b.category,
        'collabs', (select count(*) from public.collabs c where c.brand_id = b.id),
        'paid', (select coalesce(sum(i.total), 0) from public.invoices i join public.collabs c on c.id = i.collab_id where c.brand_id = b.id and i.status = 'paid'),
        'logins', (select count(*) from public.brand_members m where m.brand_id = b.id)) x
      from public.brands b where b.creator_id = p_id order by b.created_at desc limit 50) z), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', i.id, 'number', i.number, 'collab', c.code, 'collab_id', c.id, 'total', i.total, 'received', i.amount_received, 'status', i.status,
        'due', i.due_date, 'paid_on', i.paid_on) x
      from public.invoices i left join public.collabs c on c.id = i.collab_id where i.creator_id = p_id order by i.created_at desc limit 25) z), '[]'::jsonb),
    'team', coalesce((select jsonb_agg(jsonb_build_object('email', t.email, 'name', t.name, 'role', t.role, 'copy_emails', t.copy_emails, 'last_seen', t.last_seen_at) order by t.added_at)
      from public.team_members t where t.creator_id = p_id), '[]'::jsonb),
    'support', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'number', t.number, 'subject', t.subject, 'status', t.status, 'at', t.updated_at) order by t.updated_at desc)
      from public.support_tickets t where t.creator_id = p_id), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(e order by e ->> 'at' desc) from (
      select e from (
        select jsonb_build_object('at', s.requested_at, 'kind', 'account', 'title', 'Asked to join') e where s.requested_at is not null
        union all select jsonb_build_object('at', s.approved_at, 'kind', 'account', 'title', 'Approved') where s.approved_at is not null
        union all select jsonb_build_object('at', ev.at, 'kind', 'collab', 'title', c.code || ' · ' || coalesce(b.name, ''), 'text', ev.text, 'collab', c.id)
          from (select * from public.collab_events x where x.creator_id = p_id order by x.at desc limit 40) ev
          join public.collabs c on c.id = ev.collab_id left join public.brands b on b.id = c.brand_id
        union all select jsonb_build_object('at', i.paid_on::timestamptz, 'kind', 'money', 'title', 'Invoice ' || i.number || ' paid', 'text', i.total::text)
          from public.invoices i where i.creator_id = p_id and i.status = 'paid' and i.paid_on is not null
        union all select jsonb_build_object('at', t.created_at, 'kind', 'support', 'title', 'Support #' || t.number, 'text', t.subject)
          from public.support_tickets t where t.creator_id = p_id
        union all select jsonb_build_object('at', r.created_at, 'kind', 'safety', 'title', 'Reported by ' || r.by_name, 'text', r.reason)
          from public.safety_reports r where r.target_creator = p_id
        union all select jsonb_build_object('at', x.at, 'kind', 'admin', 'title', initcap(replace(x.action, '_', ' ')) || ' by ' || x.admin, 'text', nullif(x.reason, ''))
          from public.admin_audit x where x.kind = 'creator' and x.record = p_id::text
      ) all_e order by e ->> 'at' desc limit 60) z), '[]'::jsonb)
  ) || private.admin_extras('creator', p_id::text);
end;
$$;

-- 5. Who can call what: signed-in admins only (each function checks), never anon.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_collab(uuid)', 'public.admin_collab_messages(uuid, text)', 'public.admin_brand(uuid)', 'public.admin_campaign(uuid)',
    'public.admin_collab_lifecycle(uuid, text, text, date)', 'public.admin_invoice_reminders(uuid, boolean, text)', 'public.admin_post_cancel(uuid, text)',
    'public.admin_campaign_close(uuid, text)', 'public.admin_retainer_set(uuid, boolean, text)', 'public.admin_pitch_stop(uuid, text)',
    'public.admin_bank_alert_ignore(uuid, text)', 'public.admin_list(text, text, jsonb, text, boolean, integer, integer, jsonb)',
    'public.admin_search(text)', 'public.admin_dashboard(integer)', 'public.admin_note_add(text, text, text)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
