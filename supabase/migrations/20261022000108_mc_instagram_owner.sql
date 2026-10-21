-- Miracle for many creators, part 9: an Instagram account belongs to one creator, so messages and
-- comments Instagram sends us can be matched to the creator by the account they arrived for.
create unique index if not exists ig_account_user_idx on public.ig_account (ig_user_id) where coalesce(ig_user_id, '') <> '';
