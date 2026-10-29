-- Pitches by Instagram DM: Meta doesn't let an app start a DM, so the app copies a short message and opens the
-- brand's chat, and she sends it herself. This remembers when she did, so the pitch shows "DM sent".
alter table public.pitches add column if not exists dm_sent_at timestamptz;
