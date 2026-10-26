-- Growth Autopilot: each search is kept (which AI ran it, what it found, what it cost), so the admin panel shows
-- the last runs and what Claude has cost this month. The Claude key (GROWTH_ANTHROPIC_API_KEY) is used for
-- nothing else, so this is the whole of its spend.
create table if not exists public.growth_runs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  engine text not null default 'gemini' check (engine in ('claude', 'gemini')),
  manual boolean not null default false,
  added integer not null default 0,
  asked integer not null default 0,
  confirmed integer not null default 0,
  cost_usd numeric(8, 2) not null default 0,
  seconds integer not null default 0,
  error text not null default ''
);
create index if not exists growth_runs_at_idx on public.growth_runs (at desc);
alter table public.growth_runs enable row level security;
revoke all on public.growth_runs from anon, authenticated;

create or replace function public.admin_growth()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  return jsonb_build_object(
    'settings', (select to_jsonb(g) - 'id' from public.growth_settings g where id = 1),
    'counts', (select jsonb_build_object(
        'found', count(*),
        'waiting', count(*) filter (where status = 'ready'),
        'queued', count(*) filter (where status = 'approved'),
        'sent', count(*) filter (where sent_at is not null),
        'sent_today', count(*) filter (where sent_at >= private.day_start() or followed_at >= private.day_start()),
        'clicked', count(*) filter (where clicked_at is not null),
        'joined', count(*) filter (where joined_at is not null),
        'unsubscribed', count(*) filter (where status = 'unsubscribed'),
        'suppressed', (select count(*) from public.growth_suppress))
      from public.growth_leads),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'sent', s, 'joined', j) order by d) from (
        select (coalesce(sent_at, followed_at) at time zone 'Asia/Kolkata')::date as d, count(*) as s, count(*) filter (where joined_at is not null) as j
        from public.growth_leads where coalesce(sent_at, followed_at) > now() - interval '30 days' group by 1) x), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(to_jsonb(l) - 'token' order by l.created_at desc) from (select * from public.growth_leads order by created_at desc limit 400) l), '[]'::jsonb),
    -- The last searches, and what Claude has cost this month (estimated at list prices).
    'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r.at desc) from (select * from public.growth_runs order by at desc limit 10) r), '[]'::jsonb),
    'month_cost', (select coalesce(sum(cost_usd), 0) from public.growth_runs where at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'));
end;
$$;

