-- Growth check-up: why a creator isn't growing and what to change, worked out from her own reels and
-- audience. Each run is kept (to show what moved since the last one), with the actions she ticked off.

create table if not exists public.growth_checkups (
  id uuid primary key default gen_random_uuid(),
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- The numbers, findings, topics and actions of this run.
  data jsonb not null default '{}',
  -- Actions she has done: {"bio": true, "status": true}.
  done jsonb not null default '{}'
);
create index if not exists growth_checkups_creator_idx on public.growth_checkups (creator_id, created_at desc);
alter table public.growth_checkups enable row level security;
drop policy if exists "creator manages growth checkups" on public.growth_checkups;
create policy "creator manages growth checkups" on public.growth_checkups for all to authenticated
  using (creator_id = (select public.current_creator()) and (select public.is_creator()))
  with check (creator_id = (select public.current_creator()) and (select public.is_creator()));
grant select, insert, update, delete on public.growth_checkups to authenticated;
drop trigger if exists "0_fill_creator" on public.growth_checkups;
create trigger "0_fill_creator" before insert on public.growth_checkups for each row execute function private.fill_creator();
drop trigger if exists "0_keep_creator" on public.growth_checkups;
create trigger "0_keep_creator" before update of creator_id on public.growth_checkups for each row execute function private.keep_creator();

-- Reels the check-up plans (festival reels, a weekly format) go in the Calendar like the others.
alter table public.content_plans drop constraint if exists content_plans_source_check;
alter table public.content_plans add constraint content_plans_source_check check (source in ('autopilot', 'check', 'collab', 'checkup'));
