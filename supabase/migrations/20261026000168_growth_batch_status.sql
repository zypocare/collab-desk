-- Growth Autopilot: each check on a pending Claude search records what Claude said (still processing, ended, or an
-- error) and when, so the panel shows where a search is; an admin can cancel one that seems stuck. A run left open
-- from before searches went through batches is closed.
alter table public.growth_runs add column if not exists batch_status text not null default '';
alter table public.growth_runs add column if not exists checked_at timestamptz;
update public.growth_runs set finished_at = now(), error = 'stopped: the search took longer than the server allows'
where finished_at is null and batch_id is null and at < now() - interval '10 minutes';
