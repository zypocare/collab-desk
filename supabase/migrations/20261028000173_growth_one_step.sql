-- One step at a time for a Claude search (growth-finder ?collect=1, every minute): the step that's running holds
-- busy_until, so the next minute's call skips instead of checking the same creators again.
alter table public.growth_runs add column if not exists busy_until timestamptz;
