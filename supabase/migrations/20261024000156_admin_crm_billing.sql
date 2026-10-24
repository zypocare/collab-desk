-- The admin panel as a CRM: Billing. Miracle's own plans (migration 154) get a Billing area: an overview
-- (MRR, live plans, trials ending), lists of subscriptions and payments, and a plan block on every creator,
-- brand workspace and login page. Plan prices, settings, free plans and ending trials go through the
-- admin_billing_* functions from 154, which log to the audit trail.

-- Who a subscription is for, as a name.
create or replace function private.billing_subject_name(p_kind text, p_subject text)
returns text
language sql stable security definer
set search_path = public
as $$
  select case p_kind
    when 'creator' then (select coalesce(nullif(s.display_name, ''), s.creator_email) from public.creator_settings s where s.id::text = p_subject)
    when 'workspace' then (select coalesce(f.name, u.email) from auth.users u left join public.brand_profiles f on f.owner = u.id where u.id::text = p_subject)
    else (select coalesce(nullif(p.full_name, ''), u.email) from auth.users u left join public.profiles p on p.id = u.id where u.id::text = p_subject) end;
$$;
revoke execute on function private.billing_subject_name(text, text) from public, anon, authenticated;

-- 1. The overview -----------------------------------------------------------------------------------------------
create or replace function public.admin_billing_overview()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_month timestamptz := date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  perform private.admin_check();
  return jsonb_build_object(
    'mrr', (select coalesce(round(sum(case b.period when 'month' then p.price_month
              when 'year' then (case when b.founding then coalesce(p.founding_year, p.price_year) else p.price_year end) / 12.0 else 0 end)), 0)
            from public.billing_subscriptions b join public.billing_plans p on p.code = b.plan where private.sub_live(b) and b.source = 'razorpay'),
    'paid', (select count(*) from public.billing_subscriptions b where private.sub_live(b) and b.source = 'razorpay'),
    'trials', (select count(*) from public.billing_subscriptions b where private.sub_live(b) and b.period = 'trial'),
    'comps', (select count(*) from public.billing_subscriptions b where private.sub_live(b) and b.period = 'comp'),
    'halted', (select count(*) from public.billing_subscriptions b where b.status = 'halted' and private.sub_live(b)),
    'cancelling', (select count(*) from public.billing_subscriptions b where private.sub_live(b) and (b.cancel_at_end or b.status = 'cancelled')),
    'by_plan', coalesce((select jsonb_agg(jsonb_build_object('code', p.code, 'name', p.name, 'side', p.side, 'active', p.active,
        'price_month', p.price_month, 'price_year', p.price_year,
        'month', (select count(*) from public.billing_subscriptions b where b.plan = p.code and b.period = 'month' and private.sub_live(b)),
        'year', (select count(*) from public.billing_subscriptions b where b.plan = p.code and b.period = 'year' and private.sub_live(b)),
        'trial', (select count(*) from public.billing_subscriptions b where b.plan = p.code and b.period = 'trial' and private.sub_live(b)),
        'comp', (select count(*) from public.billing_subscriptions b where b.plan = p.code and b.period = 'comp' and private.sub_live(b))) order by p.sort)
      from public.billing_plans p), '[]'::jsonb),
    'trials_ending', coalesce((select jsonb_agg(x order by x ->> 'ends_at') from (
      select jsonb_build_object('id', b.id, 'kind', b.subject_kind, 'subject', b.subject, 'name', private.billing_subject_name(b.subject_kind, b.subject),
        'plan', b.plan, 'ends_at', b.ends_at, 'email', b.email) x
      from public.billing_subscriptions b where b.period = 'trial' and private.sub_live(b) and b.ends_at < now() + interval '7 days' order by b.ends_at limit 30) z), '[]'::jsonb),
    'revenue_month', (select coalesce(sum(y.amount), 0) from public.billing_payments y where y.paid_at >= v_month),
    'gst_month', (select coalesce(sum(y.gst), 0) from public.billing_payments y where y.paid_at >= v_month),
    'payments_month', (select count(*) from public.billing_payments y where y.paid_at >= v_month),
    'new_paid_30d', (select count(*) from public.billing_subscriptions b where b.source = 'razorpay' and b.created_at > now() - interval '30 days' and b.status <> 'pending'),
    'ended_30d', (select count(*) from public.billing_subscriptions b where b.source = 'razorpay' and b.status in ('ended', 'cancelled') and b.updated_at > now() - interval '30 days'),
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'revenue', (select coalesce(sum(y.amount), 0) from public.billing_payments y
        where y.paid_at >= m::timestamp at time zone 'Asia/Kolkata' and y.paid_at < (m + interval '1 month')::timestamp at time zone 'Asia/Kolkata')) order by m)
      from generate_series(date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '5 months', date_trunc('month', now() at time zone 'Asia/Kolkata'), interval '1 month') g(m)), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', y.id, 'invoice_no', y.invoice_no, 'amount', y.amount, 'gst', y.gst, 'paid_at', y.paid_at, 'plan', b.plan,
        'kind', b.subject_kind, 'subject', b.subject, 'name', private.billing_subject_name(b.subject_kind, b.subject)) x
      from public.billing_payments y join public.billing_subscriptions b on b.id = y.subscription_id order by y.paid_at desc limit 10) z), '[]'::jsonb));
end;
$$;

-- 2. One account's plan, with its subscription history (for the plan block on record pages) -------------------
create or replace function public.admin_plan(p_kind text, p_subject text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  if p_kind not in ('creator', 'workspace', 'agency') then raise exception 'Pick a creator, workspace or agency login.'; end if;
  return private.plan_json(p_kind, p_subject) || jsonb_build_object(
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'plan', b.plan, 'period', b.period, 'status', b.status, 'source', b.source,
        'kind', b.subject_kind, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'live', private.sub_live(b), 'founding', b.founding, 'note', nullif(b.note, ''),
        'paid', (select coalesce(sum(y.amount), 0) from public.billing_payments y where y.subscription_id = b.id)) order by b.created_at desc)
      from public.billing_subscriptions b
      where (b.subject_kind = p_kind and b.subject = p_subject)
         or (p_kind = 'creator' and b.subject_kind = 'agency' and b.subject in (select private.agency_logins_for_creator(p_subject::integer)))
         or (p_kind = 'workspace' and b.subject_kind = 'agency' and b.subject = p_subject)), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('code', p.code, 'name', p.name, 'side', p.side) order by p.sort) from public.billing_plans p
      where p.active and p.price_month > 0 and p.side = case p_kind when 'creator' then 'creator' when 'workspace' then 'brand' else 'agency' end), '[]'::jsonb));
end;
$$;

-- 3. The subscriptions and payments lists (this replaces the part 4 admin_rows; only these branches are new).
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

  elsif p_kind = 'outbox' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', o.id::text,
      '_search', lower(concat_ws(' ', o.kind, o.to_email, o.last_error, s.display_name, o.status)),
      'id', o.id, 'kind', o.kind, 'to', coalesce(nullif(o.to_email, ''), s.creator_email), 'creator', nullif(s.display_name, ''), 'creator_id', s.id,
      'status', o.status, 'attempts', o.attempts, 'error', nullif(o.last_error, ''), 'sent_at', o.sent_at, 'created', o.created_at))
    from public.outbox o left join public.creator_settings s on s.id = o.creator_id;

  elsif p_kind = 'inbound' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', e.msg_id,
      '_search', lower(concat_ws(' ', e.sender, e.subject, e.action, s.display_name, c.code)),
      'sender', e.sender, 'subject', nullif(e.subject, ''), 'action', nullif(e.action, ''), 'collab_id', e.collab_id, 'code', c.code,
      'creator', nullif(s.display_name, ''), 'creator_id', s.id, 'created', e.created_at))
    from public.inbound_emails e left join public.creator_settings s on s.id = e.creator_id left join public.collabs c on c.id = e.collab_id;

  elsif p_kind = 'ai_usage' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', 'c:' || u.creator_id || ':' || u.day,
      '_search', lower(concat_ws(' ', s.display_name, s.creator_email, string_agg(u.kind, ' '))),
      'side', 'creator', 'account', coalesce(nullif(s.display_name, ''), s.creator_email), 'account_id', u.creator_id::text, 'day', u.day,
      'calls', sum(u.calls) filter (where u.kind not like 'gemini%'), 'cost', sum(u.cost), 'gemini', coalesce(sum(u.calls) filter (where u.kind like 'gemini%'), 0),
      'share', round(100.0 * sum(u.cost) / 9000), 'capped', private.override_of('ai_day', 'creator', u.creator_id::text),
      'kinds', string_agg(distinct regexp_replace(u.kind, '^gemini:', ''), ', '), 'created', u.day::timestamptz))
    from public.ai_usage u left join public.creator_settings s on s.id = u.creator_id
    group by u.creator_id, u.day, s.display_name, s.creator_email
    union all
    select jsonb_strip_nulls(jsonb_build_object('_key', 'w:' || u.owner || ':' || u.day,
      '_search', lower(concat_ws(' ', f.name, x.email, string_agg(u.kind, ' '))),
      'side', 'workspace', 'account', coalesce(f.name, x.email), 'account_id', u.owner::text, 'day', u.day,
      'calls', sum(u.calls) filter (where u.kind not like 'gemini%'), 'cost', sum(u.cost), 'gemini', coalesce(sum(u.calls) filter (where u.kind like 'gemini%'), 0),
      'share', round(100.0 * sum(u.cost) / 3000), 'capped', private.override_of('ai_day', 'workspace', u.owner::text),
      'kinds', string_agg(distinct regexp_replace(u.kind, '^gemini:', ''), ', '), 'created', u.day::timestamptz))
    from public.brand_ai_usage u left join public.brand_profiles f on f.owner = u.owner left join auth.users x on x.id = u.owner
    group by u.owner, u.day, f.name, x.email;

  elsif p_kind = 'instagram' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', 'c:' || a.creator_id,
      '_search', lower(concat_ws(' ', a.username, s.display_name, s.creator_email, a.last_error)),
      'side', 'creator', 'account', coalesce(nullif(s.display_name, ''), s.creator_email), 'account_id', a.creator_id::text,
      'username', a.username, 'followers', a.followers, 'connected', coalesce(a.connected, false), 'expires', a.token_expires_at,
      'expiring', coalesce(a.connected, false) and a.token_expires_at < now() + interval '7 days',
      'synced', a.last_sync_at, 'error', nullif(a.last_error, ''), 'created', a.updated_at))
    from public.ig_account a left join public.creator_settings s on s.id = a.creator_id
    union all
    select jsonb_strip_nulls(jsonb_build_object('_key', 'w:' || g.owner,
      '_search', lower(concat_ws(' ', g.username, f.name, x.email)),
      'side', 'workspace', 'account', coalesce(f.name, x.email), 'account_id', g.owner::text,
      'username', g.username, 'followers', g.followers, 'connected', true, 'expires', t.expires_at,
      'expiring', t.expires_at < now() + interval '7 days', 'synced', g.synced_at, 'created', g.connected_at))
    from public.brand_ig g left join public.brand_ig_token t on t.owner = g.owner left join public.brand_profiles f on f.owner = g.owner left join auth.users x on x.id = g.owner;

  elsif p_kind = 'tickets' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', t.id::text,
      '_search', lower(concat_ws(' ', '#' || t.number, t.subject, t.email, t.name, s.display_name, t.category)),
      'id', t.id, 'number', t.number, 'subject', t.subject, 'category', t.category, 'status', t.status, 'priority', t.priority, 'side', t.side,
      'name', nullif(t.name, ''), 'email', t.email, 'creator', nullif(s.display_name, ''), 'creator_id', t.creator_id, 'user_id', t.user_id,
      'unread', t.team_unread, 'rating', t.rating,
      'messages', (select count(*) from public.support_messages m where m.ticket_id = t.id and not m.internal),
      'last_from_team', (select m.from_team from public.support_messages m where m.ticket_id = t.id and not m.internal order by m.created_at desc limit 1),
      'updated', t.updated_at, 'created', t.created_at))
    from public.support_tickets t left join public.creator_settings s on s.id = t.creator_id;

  elsif p_kind = 'problems' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', p.id::text,
      '_search', lower(concat_ws(' ', p.message, p.place, p.source, p.release)),
      'id', p.id, 'message', p.message, 'source', p.source, 'place', nullif(p.place, ''), 'status', p.status, 'release', nullif(p.release, ''),
      'times', p.times, 'new', p.first_seen >= (now() at time zone 'Asia/Kolkata')::date,
      'week', (select coalesce(sum(d.n), 0) from public.app_problem_days d where d.problem_id = p.id and d.day > current_date - 7),
      'people', (select count(distinct coalesce(nullif(e.session, ''), nullif(e.who, ''), e.ref)) from public.app_problem_events e where e.problem_id = p.id and e.at > now() - interval '7 days'),
      'first_seen', p.first_seen, 'created', p.last_seen))
    from public.app_problems p;

  elsif p_kind = 'safety' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', t.key,
      '_search', lower(concat_ws(' ', t.name, t.kind, t.reason)),
      'key', t.key, 'kind', t.kind, 'name', t.name, 'open', t.open, 'reports', t.reports, 'people', t.people, 'reason', t.reason,
      'auto_paused', t.auto_paused, 'state', t.state, 'record', t.record, 'created', t.last))
    from (
      select r.target_kind || ':' || coalesce(r.target_owner::text, r.target_creator::text, r.target_brand::text) as key,
        r.target_kind as kind, max(r.target_name) as name, bool_or(r.status = 'open') as open, count(*) as reports,
        count(distinct coalesce(r.by_creator::text, r.by_login::text, r.by_email)) as people,
        mode() within group (order by r.reason) as reason, bool_or(r.auto_paused and r.status = 'open') as auto_paused, max(r.created_at) as last,
        case r.target_kind
          when 'brand' then coalesce((select case when f.closed_at is not null then 'closed' when f.paused_at is not null then 'paused' else 'active' end
                             from public.brand_profiles f where f.owner::text = max(r.target_owner::text)), 'no_login')
          else (select s.status from public.creator_settings s where s.id = max(r.target_creator)) end as state,
        coalesce(max(r.target_owner::text), max(r.target_creator::text), max(r.target_brand::text)) as record
      from public.safety_reports r
      group by r.target_kind, coalesce(r.target_owner::text, r.target_creator::text, r.target_brand::text)
    ) t;

  elsif p_kind = 'bans' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', b.kind || ':' || b.value,
      '_search', lower(concat_ws(' ', b.kind, b.value, b.reason)),
      'kind', b.kind, 'value', b.value, 'reason', nullif(b.reason, ''), 'created', b.created_at))
    from public.banned b;

  elsif p_kind = 'blocks' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', k.id::text,
      '_search', lower(concat_ws(' ', k.name, s.display_name, f.name, b.name)),
      'id', k.id, 'side', k.side, 'creator', nullif(s.display_name, ''), 'creator_id', k.creator_id,
      'workspace', coalesce(f.name, u.email), 'workspace_id', k.owner, 'brand', b.name, 'brand_id', k.brand_id,
      'name', nullif(k.name, ''), 'created', k.created_at))
    from public.safety_blocks k left join public.creator_settings s on s.id = k.creator_id left join public.brand_profiles f on f.owner = k.owner
    left join auth.users u on u.id = k.owner left join public.brands b on b.id = k.brand_id;

  elsif p_kind = 'directory' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', s.id::text,
      '_search', lower(concat_ws(' ', s.display_name, s.creator_email, s.slug, s.niche, s.city)),
      'id', s.id, 'name', coalesce(nullif(s.display_name, ''), s.creator_email), 'slug', case when s.slug_chosen then s.slug end,
      'niche', nullif(s.niche, ''), 'city', nullif(s.city, ''), 'listed', coalesce(s.directory_listed, false),
      'followers', a.followers, 'instagram', coalesce(a.connected, false), 'has_bio', coalesce(s.bio, '') <> '',
      'cases', (select count(*) from public.case_studies c where c.creator_id = s.id and c.status = 'published'),
      'collabs', (select count(*) from public.collabs c where c.creator_id = s.id and c.stage = 'wrapped'),
      'views_30d', (select coalesce(sum(v.views), 0) from public.page_views v where v.creator_id = s.id and v.day > current_date - 30),
      'created', s.approved_at))
    from public.creator_settings s left join public.ig_account a on a.creator_id = s.id
    where s.status = 'active';

  elsif p_kind = 'cases' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', c.id::text,
      '_search', lower(concat_ws(' ', c.title, s.display_name, b.name, k.code)),
      'id', c.id, 'title', nullif(c.title, ''), 'creator', nullif(s.display_name, ''), 'creator_id', c.creator_id, 'brand', b.name,
      'collab_id', c.collab_id, 'code', k.code, 'status', c.status, 'asked_at', c.asked_at, 'answered_at', c.answered_at,
      'published_at', c.published_at, 'created', c.updated_at))
    from public.case_studies c left join public.creator_settings s on s.id = c.creator_id left join public.collabs k on k.id = c.collab_id
    left join public.brands b on b.id = k.brand_id;

  elsif p_kind = 'pages' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', s.id::text,
      '_search', lower(concat_ws(' ', s.display_name, s.creator_email, s.slug)),
      'id', s.id, 'name', coalesce(nullif(s.display_name, ''), s.creator_email), 'slug', case when s.slug_chosen then s.slug end,
      'views_30d', (select coalesce(sum(v.views), 0) from public.page_views v where v.creator_id = s.id and v.day > current_date - 30),
      'fans', (select count(*) from public.fans f where f.creator_id = s.id and f.unsubscribed_at is null),
      'unsubscribed', (select count(*) from public.fans f where f.creator_id = s.id and f.unsubscribed_at is not null),
      'broadcasts', (select count(*) from public.fan_broadcasts x where x.creator_id = s.id),
      'links', (select count(*) from public.page_links l where l.creator_id = s.id and l.active),
      'link_clicks', (select coalesce(sum(l.clicks), 0) from public.page_links l where l.creator_id = s.id),
      'qr_scans', (select coalesce(sum(q.scans), 0) from public.qr_codes q where q.creator_id = s.id),
      'created', s.approved_at))
    from public.creator_settings s where s.status = 'active';

  elsif p_kind = 'reels' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', r.id::text,
      '_search', lower(concat_ws(' ', a.display_name, b.display_name, r.idea, r.status)),
      'id', r.id, 'from', nullif(a.display_name, ''), 'from_id', r.from_creator, 'to', nullif(b.display_name, ''), 'to_id', r.to_creator,
      'idea', r.idea, 'status', r.status, 'post_at', r.post_at, 'answered_at', r.answered_at, 'created', r.created_at))
    from public.collab_reels r left join public.creator_settings a on a.id = r.from_creator left join public.creator_settings b on b.id = r.to_creator;

  elsif p_kind = 'autopilot_items' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', i.id::text,
      '_search', lower(concat_ws(' ', i.title, i.kind, f.name, u.email, i.status)),
      'id', i.id, 'kind', i.kind, 'title', i.title, 'status', i.status, 'workspace', coalesce(f.name, u.email), 'workspace_id', i.owner,
      'collab_id', i.collab_id, 'campaign_id', i.campaign_id, 'note', nullif(i.note, ''), 'acted_at', i.acted_at, 'created', i.created_at))
    from public.brand_autopilot_items i left join public.brand_profiles f on f.owner = i.owner left join auth.users u on u.id = i.owner;

  elsif p_kind = 'dm_rules' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', d.id::text,
      '_search', lower(concat_ws(' ', d.keyword, d.reply, s.display_name)),
      'id', d.id, 'keyword', d.keyword, 'reply', left(d.reply, 160), 'active', d.active, 'uses', d.uses,
      'creator', nullif(s.display_name, ''), 'creator_id', d.creator_id,
      'sent', (select count(*) from public.dm_auto_log l where l.rule_id = d.id and l.status = 'sent'),
      'failed', (select count(*) from public.dm_auto_log l where l.rule_id = d.id and l.status = 'failed'),
      'last_error', (select l.error from public.dm_auto_log l where l.rule_id = d.id and l.status = 'failed' order by l.created_at desc limit 1),
      'created', d.created_at))
    from public.dm_rules d left join public.creator_settings s on s.id = d.creator_id;

  elsif p_kind = 'subscriptions' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', b.id::text,
      '_search', lower(concat_ws(' ', private.billing_subject_name(b.subject_kind, b.subject), b.email, b.plan, p.name, b.note, b.gateway_id)),
      'id', b.id, 'kind', b.subject_kind, 'subject', b.subject, 'name', private.billing_subject_name(b.subject_kind, b.subject), 'email', nullif(b.email, ''),
      'plan', b.plan, 'plan_name', p.name, 'side', p.side, 'period', b.period, 'status', b.status, 'source', b.source, 'live', private.sub_live(b),
      'founding', b.founding, 'cancel_at_end', b.cancel_at_end,
      'price', case b.period when 'month' then p.price_month when 'year' then case when b.founding then coalesce(p.founding_year, p.price_year) else p.price_year end end,
      'starts_at', b.starts_at, 'ends_at', b.ends_at,
      'days_left', case when b.ends_at is not null then greatest(0, ceil(extract(epoch from (b.ends_at - now())) / 86400))::integer end,
      'paid', (select coalesce(sum(y.amount), 0) from public.billing_payments y where y.subscription_id = b.id),
      'note', nullif(b.note, ''), 'created', b.created_at))
    from public.billing_subscriptions b join public.billing_plans p on p.code = b.plan;

  elsif p_kind = 'billing_payments' then
    return query
    select jsonb_strip_nulls(jsonb_build_object('_key', y.id::text,
      '_search', lower(concat_ws(' ', y.invoice_no, y.gateway_payment_id, private.billing_subject_name(b.subject_kind, b.subject), b.email, b.plan)),
      'id', y.id, 'invoice_no', y.invoice_no, 'amount', y.amount, 'gst', y.gst, 'net', y.amount - y.gst, 'plan', b.plan, 'plan_name', p.name,
      'period', b.period, 'kind', b.subject_kind, 'subject', b.subject, 'name', private.billing_subject_name(b.subject_kind, b.subject), 'email', nullif(b.email, ''),
      'subscription_id', b.id, 'period_end', y.period_end, 'created', y.paid_at))
    from public.billing_payments y join public.billing_subscriptions b on b.id = y.subscription_id join public.billing_plans p on p.code = b.plan;

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

-- 4. Who can call what: signed-in admins only (each function checks), never anon.
revoke execute on function public.admin_billing_overview(), public.admin_plan(text, text) from public, anon;
grant execute on function public.admin_billing_overview(), public.admin_plan(text, text) to authenticated;
