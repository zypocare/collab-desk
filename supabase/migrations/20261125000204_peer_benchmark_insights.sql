-- Add rich competitor intelligence metadata (format mix, avg Reel views, posting schedule,
-- comment-magnet lift, collab ratio, top hashtags) to creator_benchmarks.

alter table public.creator_benchmarks
  add column if not exists insights jsonb not null default '{}'::jsonb;
