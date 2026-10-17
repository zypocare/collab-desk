-- Free AI (Cloudflare's daily allowance): the site's server asks here before each use. Only the
-- creator's account, and at most 50 uses a day, so it never goes past the free allowance.
create table if not exists public.ai_usage (
  day   date not null,
  kind  text not null,
  calls integer not null default 0,
  primary key (day, kind)
);
alter table public.ai_usage enable row level security;
drop policy if exists "creator reads ai usage" on public.ai_usage;
create policy "creator reads ai usage" on public.ai_usage for select to authenticated using (public.is_creator());

create or replace function public.ai_take(p_kind text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_used integer;
  v_limit constant integer := 50;
begin
  if not public.is_creator() then return jsonb_build_object('ok', false, 'reason', 'not_creator'); end if;
  select coalesce(sum(calls), 0) into v_used from public.ai_usage where day = (now() at time zone 'Asia/Kolkata')::date;
  if v_used >= v_limit then return jsonb_build_object('ok', false, 'left', 0); end if;
  insert into public.ai_usage (day, kind, calls) values ((now() at time zone 'Asia/Kolkata')::date, left(coalesce(p_kind, ''), 20), 1)
  on conflict (day, kind) do update set calls = public.ai_usage.calls + 1;
  return jsonb_build_object('ok', true, 'left', v_limit - v_used - 1);
end;
$$;
revoke execute on function public.ai_take(text) from public, anon;
grant execute on function public.ai_take(text) to authenticated;
