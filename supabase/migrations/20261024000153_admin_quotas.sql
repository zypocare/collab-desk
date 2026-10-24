-- Daily quotas for the admin panel: how much of each free daily allowance Miracle has used today, and
-- what's left. Email goes out through SMTP accounts whose daily limits depend on the provider, so admins
-- set those numbers; Cloudflare Workers AI (10,000 neurons a day, free) and the Gemini backup have defaults.
--
-- * Workers AI and Gemini reset at 00:00 UTC (5:30 am in India); usage is what the app reserved and
--   corrected per job in ai_usage and brand_ai_usage.
-- * Emails count what the outbox sent since midnight in India. Sign-in code emails go through
--   Supabase Auth's own SMTP setting and aren't in the outbox.

create table if not exists public.app_quotas (
  key text primary key,
  label text not null,
  daily integer check (daily is null or daily >= 0),
  unit text not null default '',
  note text not null default '',
  sort integer not null default 0,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.app_quotas enable row level security;
revoke all on public.app_quotas from anon, authenticated;

insert into public.app_quotas (key, label, daily, unit, note, sort) values
  ('mail_main', 'Main email account', null, 'emails', 'Your sending service''s daily limit (for example Brevo free: 300, Resend free: 100)', 10),
  ('mail_backup', 'Backup email account', null, 'emails', 'Used when the main account fails or hits its limit; leave empty if there is none', 20),
  ('ai_neurons', 'Cloudflare Workers AI', 10000, 'neurons', 'Free allowance for the whole account; resets at 5:30 am', 30),
  ('gemini', 'Gemini backup', 250, 'requests', 'Free requests a day on the Gemini model used; resets at 5:30 am', 40)
on conflict (key) do nothing;

create or replace function public.admin_quotas()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_ist date := (now() at time zone 'Asia/Kolkata')::date;
  v_ai date := private.ai_day();
begin
  perform private.admin_check();
  return jsonb_build_object(
    'limits', coalesce((select jsonb_object_agg(q.key, jsonb_build_object('label', q.label, 'daily', q.daily, 'unit', q.unit, 'note', q.note,
        'by', nullif(q.updated_by, ''), 'at', q.updated_at)) from public.app_quotas q), '{}'::jsonb),
    'mail', jsonb_build_object(
      'sent', (select count(*) from public.outbox where status = 'sent' and sent_at >= v_ist::timestamp at time zone 'Asia/Kolkata'),
      'sent_24h', (select count(*) from public.outbox where status = 'sent' and sent_at > now() - interval '24 hours'),
      'failed', (select count(*) from public.outbox where status = 'failed' and created_at >= v_ist::timestamp at time zone 'Asia/Kolkata'),
      'waiting', (select count(*) from public.outbox where status in ('pending', 'sending')),
      'resets', ((v_ist + 1)::timestamp at time zone 'Asia/Kolkata')),
    'ai', jsonb_build_object(
      'neurons', (select coalesce(sum(cost), 0) from public.ai_usage where day = v_ai and kind not like 'gemini%')
        + (select coalesce(sum(cost), 0) from public.brand_ai_usage where day = v_ai and kind not like 'gemini%'),
      'creators', (select coalesce(sum(cost), 0) from public.ai_usage where day = v_ai and kind not like 'gemini%'),
      'brands', (select coalesce(sum(cost), 0) from public.brand_ai_usage where day = v_ai and kind not like 'gemini%'),
      'calls', (select coalesce(sum(calls), 0) from public.ai_usage where day = v_ai and kind not like 'gemini%')
        + (select coalesce(sum(calls), 0) from public.brand_ai_usage where day = v_ai and kind not like 'gemini%'),
      'gemini', (select coalesce(sum(calls), 0) from public.ai_usage where day = v_ai and kind like 'gemini%')
        + (select coalesce(sum(calls), 0) from public.brand_ai_usage where day = v_ai and kind like 'gemini%'),
      'resets', ((v_ai + 1)::timestamp at time zone 'UTC'),
      'top', coalesce((select jsonb_agg(x order by (x ->> 'neurons')::int desc) from (
        select jsonb_build_object('side', 'creator', 'id', u.creator_id::text, 'name', coalesce(nullif(s.display_name, ''), s.creator_email), 'neurons', sum(u.cost)) x
        from public.ai_usage u left join public.creator_settings s on s.id = u.creator_id
        where u.day = v_ai and u.kind not like 'gemini%' group by u.creator_id, s.display_name, s.creator_email
        union all
        select jsonb_build_object('side', 'workspace', 'id', u.owner::text, 'name', coalesce(f.name, x.email), 'neurons', sum(u.cost))
        from public.brand_ai_usage u left join public.brand_profiles f on f.owner = u.owner left join auth.users x on x.id = u.owner
        where u.day = v_ai and u.kind not like 'gemini%' group by u.owner, f.name, x.email
        order by 1 limit 50) z), '[]'::jsonb)),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', d,
        'mail_sent', (select count(*) from public.outbox o where o.status = 'sent' and (o.sent_at at time zone 'Asia/Kolkata')::date = d),
        'mail_failed', (select count(*) from public.outbox o where o.status = 'failed' and (o.created_at at time zone 'Asia/Kolkata')::date = d),
        'neurons', (select coalesce(sum(cost), 0) from public.ai_usage where day = d and kind not like 'gemini%')
          + (select coalesce(sum(cost), 0) from public.brand_ai_usage where day = d and kind not like 'gemini%'),
        'gemini', (select coalesce(sum(calls), 0) from public.ai_usage where day = d and kind like 'gemini%')
          + (select coalesce(sum(calls), 0) from public.brand_ai_usage where day = d and kind like 'gemini%')) order by d)
      from generate_series(v_ist - 13, v_ist, interval '1 day') g(t) cross join lateral (select g.t::date as d) x), '[]'::jsonb));
end;
$$;

create or replace function public.admin_quota_set(p_key text, p_daily integer, p_reason text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  q public.app_quotas;
begin
  perform private.admin_check();
  select * into q from public.app_quotas where key = p_key;
  if q.key is null then raise exception 'Unknown quota.'; end if;
  if p_daily is not null and p_daily < 0 then raise exception 'Give a number of zero or more, or leave it empty.'; end if;
  update public.app_quotas set daily = p_daily, updated_by = public.jwt_email(), updated_at = now() where key = p_key;
  perform private.admin_log('quota', 'limits', p_key, q.label, jsonb_build_object('daily', q.daily), jsonb_build_object('daily', p_daily), p_reason);
  return public.admin_quotas();
end;
$$;

revoke execute on function public.admin_quotas(), public.admin_quota_set(text, integer, text) from public, anon;
grant execute on function public.admin_quotas(), public.admin_quota_set(text, integer, text) to authenticated;
