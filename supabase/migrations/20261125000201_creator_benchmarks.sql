-- Creator Peer Benchmarks: tracks public Business/Creator handles via Instagram business_discovery
-- for side-by-side engagement, posting cadence, and breakout Reel topic comparison.

create table if not exists public.creator_benchmarks (
  id                  uuid primary key default gen_random_uuid(),
  creator_id          integer not null references public.creator_settings (id) on delete cascade,
  username            text not null check (char_length(btrim(username)) between 1 and 60),
  name                text not null default '',
  profile_picture_url text not null default '',
  followers_count     integer not null default 0,
  media_count         integer not null default 0,
  avg_likes           integer not null default 0,
  avg_comments        integer not null default 0,
  engagement_rate     numeric(5,2) not null default 0,
  posts_per_week      numeric(4,1) not null default 0,
  top_posts           jsonb not null default '[]'::jsonb,
  synced_at           timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create unique index if not exists creator_benchmarks_creator_user_uq
  on public.creator_benchmarks (creator_id, lower(btrim(username)));

create index if not exists creator_benchmarks_creator_idx
  on public.creator_benchmarks (creator_id, created_at desc);

alter table public.creator_benchmarks enable row level security;

drop policy if exists "creator manages creator_benchmarks" on public.creator_benchmarks;
create policy "creator manages creator_benchmarks" on public.creator_benchmarks
  for all to authenticated
  using (
    creator_id = (select public.current_creator())
    and (select public.team_role()) in ('owner', 'manager', 'assistant')
  )
  with check (
    creator_id = (select public.current_creator())
    and (select public.team_role()) in ('owner', 'manager', 'assistant')
  );

grant select, insert, update, delete on public.creator_benchmarks to authenticated;

drop trigger if exists "0_fill_creator" on public.creator_benchmarks;
create trigger "0_fill_creator" before insert on public.creator_benchmarks
  for each row execute function private.fill_creator();

drop trigger if exists "0_keep_creator" on public.creator_benchmarks;
create trigger "0_keep_creator" before update of creator_id on public.creator_benchmarks
  for each row execute function private.keep_creator();
