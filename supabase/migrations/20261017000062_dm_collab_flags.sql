-- Instagram DMs that look like brand collaborations get a "Collab?" label and a one-line summary.
-- The DM webhook first checks for business words; only those DMs go to the free AI, using a
-- single-use pass (the webhook can't sign in as the creator), still counted in the 50-a-day limit.

alter table public.ig_threads
  add column if not exists collab_flag text not null default '' check (collab_flag in ('', 'likely', 'maybe', 'no')),
  add column if not exists collab_hint text not null default '';

-- The label shows up while the inbox is open.
alter publication supabase_realtime add table public.ig_threads;

create table if not exists public.ai_tickets (
  token      text primary key,
  created_at timestamptz not null default now()
);
alter table public.ai_tickets enable row level security;
revoke all on public.ai_tickets from anon, authenticated;

-- The site's AI server spends a pass: valid once, for 2 minutes, and within today's limit.
create or replace function public.ai_take_ticket(p_ticket text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_used integer;
  v_limit constant integer := 50;
begin
  delete from public.ai_tickets where token = p_ticket and created_at > now() - interval '2 minutes';
  if not found then return jsonb_build_object('ok', false); end if;
  delete from public.ai_tickets where created_at < now() - interval '1 hour';
  select coalesce(sum(calls), 0) into v_used from public.ai_usage where day = (now() at time zone 'Asia/Kolkata')::date;
  if v_used >= v_limit then return jsonb_build_object('ok', false, 'left', 0); end if;
  insert into public.ai_usage (day, kind, calls) values ((now() at time zone 'Asia/Kolkata')::date, 'classify', 1)
  on conflict (day, kind) do update set calls = public.ai_usage.calls + 1;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.ai_take_ticket(text) from public;
grant execute on function public.ai_take_ticket(text) to anon, authenticated;
