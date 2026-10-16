-- Reels: Instagram's average watch time per view (milliseconds), averaged on the insights page.
alter table public.ig_media add column if not exists avg_watch_ms integer;
