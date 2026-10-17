-- YouTube: recent videos and Shorts with their views, from the channel's public feed (no key
-- needed). With a free YouTube Data API key (secret YOUTUBE_API_KEY) the subscriber count too.
alter table public.creator_settings
  add column if not exists youtube_channel text not null default '',
  add column if not exists youtube_channel_id text not null default '',
  add column if not exists youtube_title text not null default '',
  add column if not exists youtube_subscribers bigint,
  add column if not exists youtube_synced_at timestamptz,
  add column if not exists youtube_error text not null default '';

create table if not exists public.yt_videos (
  video_id     text primary key,
  title        text not null default '',
  published_at timestamptz,
  views        bigint,
  likes        bigint,
  thumbnail    text not null default '',
  is_short     boolean not null default false,
  synced_at    timestamptz not null default now()
);
alter table public.yt_videos enable row level security;
drop policy if exists "creator reads yt videos" on public.yt_videos;
create policy "creator reads yt videos" on public.yt_videos for select to authenticated using (public.is_creator());

-- For her brand page and media kit (public, like her Instagram numbers).
create or replace function public.public_youtube()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when s.youtube_channel_id = '' then null else jsonb_build_object(
    'title', s.youtube_title, 'channel_id', s.youtube_channel_id, 'subscribers', s.youtube_subscribers,
    'shorts_avg_views', (select round(avg(views)) from (select views from public.yt_videos where is_short and views is not null order by published_at desc limit 12) x),
    'videos_avg_views', (select round(avg(views)) from (select views from public.yt_videos where not is_short and views is not null order by published_at desc limit 12) x),
    'shorts', (select count(*) from public.yt_videos where is_short),
    'updated_at', s.youtube_synced_at) end
  from public.creator_settings s where s.id = 1;
$$;
grant execute on function public.public_youtube() to anon, authenticated;

select cron.unschedule('youtube-sync') where exists (select 1 from cron.job where jobname = 'youtube-sync');
select cron.schedule('youtube-sync', '45 0 * * *', $$select private.call_function('youtube-sync')$$);
