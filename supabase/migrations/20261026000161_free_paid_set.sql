-- The free and paid set (October 2026). Free is enough to run a creator business; Pro is for when it grows.
--
-- * Creators, Free: 5 collabs in progress at a time (was 3 quotes and 3 invoices a month), unlimited invoices
--   with a small "Sent with Miracle" line, the friendly payment reminders by hand, 1 offer check a day,
--   5 pitches a month, just you.
-- * Creator Pro adds: unlimited collabs and offer checks, invoices and her page without the Miracle line,
--   automatic reminders, the formal demand letter and MSME complaint, every autopilot, and 1 teammate.
-- * Brands, Free: 10 full creator profiles a day (creators you've worked with never count), 3 requests and
--   1 campaign a month. Brand Pro: unlimited.

-- 1. The catalogue ------------------------------------------------------------------------------------------
create or replace function private.add_features(p_have text[], p_add text[])
returns text[]
language sql immutable
as $$
  select coalesce(array_agg(distinct x order by x), '{}') from unnest(p_have || p_add) x;
$$;
revoke execute on function private.add_features(text[], text[]) from public, anon, authenticated;

update public.billing_plans set
  limits = (limits - 'quotes_month' - 'invoices_month') || '{"active_collabs": 5, "offer_checks_day": 1}'::jsonb,
  tagline = 'Your brand page, 5 collabs at a time and unlimited invoices', updated_at = now()
where code = 'creator_free';
update public.billing_plans set
  limits = limits || '{"seats": 2}'::jsonb,
  features = private.add_features(features, '{white_label,demand_letters}'),
  tagline = 'Unlimited collabs, every autopilot, and reminders that chase payments for you', updated_at = now()
where code = 'creator_pro';
update public.billing_plans set limits = limits || '{"profiles_day": 10}'::jsonb, updated_at = now() where code = 'brand_free';
update public.billing_plans set features = private.add_features(features, '{white_label,demand_letters}'), updated_at = now() where code = 'agency';

-- 2. Collabs in progress: a free plan quotes for 5 at a time. A collab counts from its first sent quote
--    until it's wrapped, declined, cancelled or paused; new versions of a quote never count again.
create or replace function private.active_collabs(p_creator integer, p_except uuid default null)
returns integer
language sql stable security definer
set search_path = public
as $$
  select count(distinct q.collab_id)::integer from public.quotes q join public.collabs c on c.id = q.collab_id
  where q.creator_id = p_creator and q.status in ('sent', 'accepted', 'changes')
    and c.stage not in ('wrapped', 'declined', 'cancelled', 'paused') and q.collab_id is distinct from p_except;
$$;
revoke execute on function private.active_collabs(integer, uuid) from public, anon, authenticated;

create or replace function private.plan_quotes()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_cap integer;
begin
  if new.status <> 'sent' or (tg_op = 'UPDATE' and old.status = 'sent') or private.plan_exempt() then return new; end if;
  v_cap := private.plan_limit('creator', new.creator_id::text, 'active_collabs');
  if v_cap is not null and private.active_collabs(new.creator_id, new.collab_id) >= v_cap then
    perform private.plan_block(format('The free plan runs %s collabs at a time. Wrap one up, or go Pro for unlimited collabs.', v_cap));
  end if;
  return new;
end;
$$;

-- Invoices are unlimited on every plan.
drop trigger if exists plan_invoices on public.invoices;
drop function if exists private.plan_invoices();

-- 3. The formal demand letter and the MSME complaint (or legal notice) are Pro; the two reminders stay free.
create or replace function private.plan_demands()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if private.plan_exempt() or private.plan_has('creator', new.creator_id::text, 'demand_letters') then return new; end if;
  perform private.plan_block('The formal demand letter and the MSME complaint are on Creator Pro. Reminders stay free.');
  return new;
end;
$$;
drop trigger if exists plan_demands on public.payment_demands;
create trigger plan_demands before insert on public.payment_demands for each row execute function private.plan_demands();
revoke execute on function private.plan_demands() from public, anon, authenticated;

-- 4. Check the offer: once a day on the free plan, asked before any AI is used.
create or replace function private.day_start()
returns timestamptz
language sql stable
as $$
  select (now() at time zone 'Asia/Kolkata')::date::timestamp at time zone 'Asia/Kolkata';
$$;
revoke execute on function private.day_start() from public, anon, authenticated;

create or replace function public.ai_take2(p_kind text, p_cost integer)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_me integer := public.current_creator();
  v_cap integer;
  v_used integer;
begin
  if not private.flag_on('ai_creator') then return jsonb_build_object('ok', false, 'reason', 'budget', 'paused', true); end if;
  if p_kind = 'offercheck' and not private.plan_exempt() then
    v_cap := private.plan_limit('creator', v_me::text, 'offer_checks_day');
    if v_cap is not null and (select count(*) from public.offer_checks o where o.creator_id = v_me and o.created_at >= private.day_start()) >= v_cap then
      return jsonb_build_object('ok', false, 'reason', 'plan',
        'msg', format('The free plan checks %s offer a day. It''s back tomorrow, or go Pro to check every offer.', v_cap));
    end if;
  end if;
  v_cap := coalesce(private.override_of('ai_day', 'creator', v_me::text), private.plan_limit('creator', v_me::text, 'ai_day'));
  if v_cap is not null then
    select coalesce(sum(cost), 0) into v_used from public.ai_usage where creator_id = v_me and day = private.ai_day() and kind not like 'gemini%';
    if v_used + greatest(1, least(coalesce(p_cost, 150), 2000)) > v_cap then return jsonb_build_object('ok', false, 'reason', 'budget', 'used', v_used, 'capped', true, 'plan', private.plan_code('creator', v_me::text)); end if;
  end if;
  return private.ai_take2_do(p_kind, p_cost);
end;
$$;

-- 5. Full creator profiles a brand opens: 10 a day on the free plan. The same creator again that day, and
--    creators the brand has worked with, never count.
create table if not exists public.brand_profile_views (
  owner uuid not null,
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  day date not null,
  at timestamptz not null default now(),
  primary key (owner, day, creator_id)
);
alter table public.brand_profile_views enable row level security;
revoke all on public.brand_profile_views from anon, authenticated;

create or replace function public.brand_profile_open(p_creator integer)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid := public.brand_owner();
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_cap integer;
  v_used integer;
begin
  if v_owner is null or private.plan_exempt() then return jsonb_build_object('ok', true); end if;
  v_cap := private.plan_limit('workspace', v_owner::text, 'profiles_day');
  if v_cap is null or exists (select 1 from public.collabs c join public.brand_members m on m.brand_id = c.brand_id and m.owner = v_owner where c.creator_id = p_creator) then
    return jsonb_build_object('ok', true);
  end if;
  select count(*) into v_used from public.brand_profile_views where owner = v_owner and day = v_day;
  if exists (select 1 from public.brand_profile_views where owner = v_owner and day = v_day and creator_id = p_creator) then
    return jsonb_build_object('ok', true, 'used', v_used, 'cap', v_cap);
  end if;
  if v_used >= v_cap then
    return jsonb_build_object('ok', false, 'used', v_used, 'cap', v_cap,
      'msg', format('The free plan opens %s full creator profiles a day. More tomorrow, or go Brand Pro for unlimited.', v_cap));
  end if;
  insert into public.brand_profile_views (owner, creator_id, day) values (v_owner, p_creator, v_day) on conflict do nothing;
  return jsonb_build_object('ok', true, 'used', v_used + 1, 'cap', v_cap);
end;
$$;
revoke execute on function public.brand_profile_open(integer) from public, anon;
grant execute on function public.brand_profile_open(integer) to authenticated;

-- 6. "Sent with Miracle": on a free plan's invoices and her page. Pro takes it off.
create or replace function public.public_invoice(p_token text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'number', i.number, 'kind', i.kind, 'issue_date', i.issue_date, 'due_date', i.due_date, 'items', i.items,
    'subtotal', i.subtotal, 'tax_mode', i.tax_mode, 'gst_rate', i.gst_rate, 'cgst', i.cgst, 'sgst', i.sgst, 'igst', i.igst,
    'total', i.total, 'currency', i.currency, 'tds_rate', i.tds_rate, 'tds_amount', i.tds_amount, 'payable', i.payable,
    'amount_received', i.amount_received, 'tds_deducted', i.tds_deducted, 'paid_on', i.paid_on,
    'status', i.status, 'notes', i.notes, 'claim_amount', i.claim_amount, 'claim_ref', i.claim_ref, 'claim_on', i.claim_on, 'claim_at', i.claim_at, 'seller', i.seller, 'bill_to', i.bill_to, 'token', i.public_token,
    'miracle_line', not private.plan_has('creator', i.creator_id::text, 'white_label'))
  from public.invoices i
  where i.public_token = p_token and i.status <> 'draft' and length(p_token) >= 24;
$$;

create or replace function public.page_extras()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'content_languages', to_jsonb(s.content_languages),
    'instant_booking', s.instant_booking,
    'weeks', case when s.instant_booking then public.availability() else null end,
    'away_until', case when public.is_away() then s.away_until end,
    'demand_factor', public.demand_factor(),
    'bio', nullif(btrim(s.bio), ''),
    'links', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'url', l.url) order by l.position, l.created_at)
                       from public.page_links l where l.creator_id = s.id and l.active), '[]'::jsonb),
    'fan_list', case when s.fan_list_on then jsonb_build_object('pitch', nullif(btrim(s.fan_list_pitch), '')) else null end,
    'cases', coalesce((select jsonb_agg(jsonb_build_object('id', cs.id, 'brand', b.name, 'title', cs.title, 'summary', cs.summary,
        'goal', cs.goal, 'made', cs.made, 'results', cs.results, 'highlights', cs.highlights, 'quote', cs.quote, 'quote_by', cs.quote_by,
        'published_at', cs.published_at,
        'post', (select m.permalink from public.collab_posts cp join public.ig_media m on m.id = cp.media_id where cp.collab_id = cs.collab_id order by m.posted_at limit 1))
      order by cs.published_at desc)
      from public.case_studies cs join public.collabs k on k.id = cs.collab_id join public.brands b on b.id = k.brand_id
      where cs.creator_id = s.id and cs.status = 'published'), '[]'::jsonb),
    'white_label', private.plan_has('creator', s.id::text, 'white_label')
  )
  from public.creator_settings s
  where s.id = private.page_creator();
$$;

-- 7. What the plan page shows as used.
create or replace function public.my_plan()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with me as (select * from private.my_subject())
  select private.plan_json(me.kind, me.subject) || jsonb_build_object(
    -- How much of the free allowances is used.
    'usage', case when me.kind = 'creator' then jsonb_build_object(
        'active_collabs', private.active_collabs(me.subject::integer),
        'offer_checks_day', (select count(*) from public.offer_checks o where o.creator_id = me.subject::integer and o.created_at >= private.day_start()),
        'pitches_month', (select count(*) from public.pitches p where p.creator_id = me.subject::integer and p.sent_at >= private.month_start()),
        'ai_day', (select coalesce(sum(u.cost), 0) from public.ai_usage u where u.creator_id = me.subject::integer and u.day = private.ai_day() and u.kind not like 'gemini%'),
        'seats', 1 + (select count(*) from public.team_members t where t.creator_id = me.subject::integer and t.role <> 'owner'))
      else jsonb_build_object(
        'profiles_day', (select count(*) from public.brand_profile_views v where v.owner = me.subject::uuid and v.day = (now() at time zone 'Asia/Kolkata')::date),
        'requests_month', (select count(distinct c.id) from public.collabs c join public.brand_members m on m.brand_id = c.brand_id and m.owner = me.subject::uuid where c.created_at >= private.month_start()),
        'campaigns_month', (select count(*) from public.brand_campaigns c where c.owner = me.subject::uuid and c.sent_at >= private.month_start()),
        'ai_day', (select coalesce(sum(u.cost), 0) from public.brand_ai_usage u where u.owner = me.subject::uuid and u.day = private.ai_day() and u.kind not like 'gemini%'),
        'seats', 1 + (select count(*) from public.brand_team_members t where t.owner = me.subject::uuid)) end,
    -- The plans this side can buy, with prices (GST included).
    'catalog', (select jsonb_agg(jsonb_build_object('code', p.code, 'side', p.side, 'name', p.name, 'tagline', p.tagline, 'rank', p.rank,
        'price_month', p.price_month, 'price_year', p.price_year, 'founding_year', p.founding_year, 'limits', p.limits, 'features', to_jsonb(p.features)) order by p.sort)
      from public.billing_plans p where p.active and (p.side = case when me.kind = 'creator' then 'creator' else 'brand' end or p.side = 'agency')),
    'offer', (select jsonb_build_object('on', s.founding_on and s.founding_left > 0, 'left', s.founding_left) from public.billing_settings s where s.id = 1),
    -- The login's own Agency plan, if any (it also covers this account when it manages it).
    'agency', private.plan_json('agency', auth.uid()::text),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'amount', y.amount, 'gst', y.gst, 'invoice_no', y.invoice_no, 'paid_at', y.paid_at, 'plan', b.plan, 'period', b.period, 'token', y.token) order by y.paid_at desc)
      from public.billing_payments y join public.billing_subscriptions b on b.id = y.subscription_id
      where (b.subject_kind = me.kind and b.subject = me.subject) or (b.subject_kind = 'agency' and b.subject = auth.uid()::text)), '[]'::jsonb))
  from me
  where auth.uid() is not null;
$$;
