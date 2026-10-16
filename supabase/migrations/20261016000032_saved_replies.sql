-- Her own saved replies (title + text with {name}, {brand}… placeholders), offered next to the
-- automatic suggestions in every message thread.
alter table public.creator_settings
  add column saved_replies jsonb not null default '[]' check (jsonb_typeof(saved_replies) = 'array');
