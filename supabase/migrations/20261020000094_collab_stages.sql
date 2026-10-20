-- Commit enum additions before the next migration uses them.
alter type public.collab_stage add value if not exists 'paused';
alter type public.collab_stage add value if not exists 'cancelled';
