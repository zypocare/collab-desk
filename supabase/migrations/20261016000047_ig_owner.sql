-- Switching the connected Instagram account left the old account's posts and audience behind.
-- Each stored post now records which account it belongs to (the sync removes the others), and the
-- audience has its own "fetched at" so it really refreshes weekly (and at once after a switch).

alter table public.ig_media add column if not exists owner_id text;
alter table public.ig_account add column if not exists demographics_at timestamptz;
