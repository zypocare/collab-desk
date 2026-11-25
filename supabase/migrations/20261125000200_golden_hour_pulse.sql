-- Golden Hour Launch Pulse: first-60-minute Reel momentum tracking, snapshots, and push alerts.

create table if not exists public.ig_launch_pulses (
  id                  uuid primary key default gen_random_uuid(),
  creator_id          integer not null references public.creator_settings (id) on delete cascade,
  media_id            text not null,
  caption             text not null default '',
  permalink           text not null default '',
  thumbnail_url       text not null default '',
  posted_at           timestamptz not null,
  snapshots           jsonb not null default '[]'::jsonb,
  latest_views        integer not null default 0,
  latest_shares       integer not null default 0,
  latest_saves        integer not null default 0,
  latest_likes        integer not null default 0,
  latest_comments     integer not null default 0,
  median_views        integer not null default 0,
  median_shares_1k    numeric(6,2) not null default 0,
  median_saves_1k     numeric(6,2) not null default 0,
  pulse_score         integer not null default 50 check (pulse_score between 0 and 100),
  status              text not null default 'steady' check (status in ('hot', 'steady', 'slow')),
  story_hook          text not null default '',
  story_done          boolean not null default false,
  dm_keyword          text,
  notified_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists ig_launch_pulses_creator_media_uq
  on public.ig_launch_pulses (creator_id, media_id);

create index if not exists ig_launch_pulses_creator_posted_idx
  on public.ig_launch_pulses (creator_id, posted_at desc);

alter table public.ig_launch_pulses enable row level security;

drop policy if exists "creator manages ig_launch_pulses" on public.ig_launch_pulses;
create policy "creator manages ig_launch_pulses" on public.ig_launch_pulses
  for all to authenticated
  using (
    creator_id = (select public.current_creator())
    and (select public.team_role()) in ('owner', 'manager', 'assistant')
  )
  with check (
    creator_id = (select public.current_creator())
    and (select public.team_role()) in ('owner', 'manager', 'assistant')
  );

grant select, insert, update, delete on public.ig_launch_pulses to authenticated;

drop trigger if exists "0_fill_creator" on public.ig_launch_pulses;
create trigger "0_fill_creator" before insert on public.ig_launch_pulses
  for each row execute function private.fill_creator();

drop trigger if exists "0_keep_creator" on public.ig_launch_pulses;
create trigger "0_keep_creator" before update of creator_id on public.ig_launch_pulses
  for each row execute function private.keep_creator();

-- Poll every 10 minutes so newly posted Reels are caught inside their first 60-minute Golden Hour.
select cron.unschedule('golden-hour-pulse')
  where exists (select 1 from cron.job where jobname = 'golden-hour-pulse');

select cron.schedule(
  'golden-hour-pulse',
  '*/10 * * * *',
  $$select private.call_function('golden-hour-pulse')$$
);
