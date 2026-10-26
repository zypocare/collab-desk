-- Growth Autopilot: a search now runs in the background, so each run is kept from the moment it starts and marked
-- when it ends. One that never ends was stopped by the platform's time limit; the panel says so.
alter table public.growth_runs add column if not exists finished_at timestamptz;
-- Runs from before this were written when they ended.
update public.growth_runs set finished_at = at where finished_at is null;
