-- "Should I take it?": what she needs for the decision report on each request.
-- Her home area (only for travel time, never shown to brands), how she travels, and what a
-- professional look or a new outfit costs her. The AI's reading of each request (travel, outfit,
-- makeup, red flags) is kept in its own creator-only table, so brands can never see it.

alter table public.creator_settings
  add column if not exists home_area text not null default '',
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision,
  add column if not exists travel_mode text not null default 'car' check (travel_mode in ('car', 'bike', 'cab', 'public')),
  add column if not exists travel_max_min integer not null default 60 check (travel_max_min between 10 and 600),
  add column if not exists makeup_cost integer not null default 0 check (makeup_cost >= 0),
  add column if not exists outfit_cost integer not null default 0 check (outfit_cost >= 0),
  add column if not exists avoid_brands text not null default '';

create table if not exists public.collab_fit (
  collab_id  uuid primary key references public.collabs(id) on delete cascade,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.collab_fit enable row level security;
drop policy if exists "creator manages fit" on public.collab_fit;
create policy "creator manages fit" on public.collab_fit for all to authenticated using (public.is_creator()) with check (public.is_creator());
revoke all on public.collab_fit from anon;
grant select, insert, update, delete on public.collab_fit to authenticated;

-- Free AI uses left today (shown on the AI assistant card).
create or replace function public.ai_left()
returns integer
language sql stable security definer
set search_path = public
as $$
  select case when public.is_creator()
    then greatest(0, 50 - coalesce((select sum(calls) from public.ai_usage where day = (now() at time zone 'Asia/Kolkata')::date), 0))::integer
  end
$$;
revoke execute on function public.ai_left() from public;
grant execute on function public.ai_left() to authenticated;
