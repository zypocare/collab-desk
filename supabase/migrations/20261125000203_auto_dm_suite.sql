-- Full Instagram Automation Suite: Comment-to-DM + Public Comment Reply + DM Keyword + Story Reply + Per-Reel targeting.

alter table public.dm_rules
  add column if not exists trigger_type text not null default 'comment' check (trigger_type in ('comment', 'dm', 'story_reply')),
  add column if not exists match_type text not null default 'contains' check (match_type in ('contains', 'exact', 'any')),
  add column if not exists media_id text,
  add column if not exists public_reply text not null default '';

-- Allow '*' for 'any' match_type while keeping 1..30 char bounds
alter table public.dm_rules drop constraint if exists dm_rules_keyword_check;
alter table public.dm_rules add constraint dm_rules_keyword_check check (char_length(btrim(keyword)) between 1 and 30);

-- Scope uniqueness by (creator, trigger_type, target media_id, keyword) so creators can run per-Reel rules
drop index if exists public.dm_rules_keyword_uq;
create unique index if not exists dm_rules_scope_uq
  on public.dm_rules (creator_id, trigger_type, coalesce(media_id, ''), lower(btrim(keyword)));

alter table public.dm_auto_log
  add column if not exists trigger_type text not null default 'comment',
  add column if not exists sender_igsid text,
  add column if not exists public_replied boolean not null default false;
