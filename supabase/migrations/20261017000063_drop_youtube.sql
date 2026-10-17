-- She doesn't do YouTube: remove the channel sync, its data, and "YouTube Short" as a deliverable.

select cron.unschedule('youtube-sync') where exists (select 1 from cron.job where jobname = 'youtube-sync');
drop function if exists public.public_youtube();
drop table if exists public.yt_videos;
alter table public.creator_settings
  drop column if exists youtube_channel,
  drop column if exists youtube_channel_id,
  drop column if exists youtube_title,
  drop column if exists youtube_subscribers,
  drop column if exists youtube_synced_at,
  drop column if exists youtube_error;

update public.creator_settings set
  offered_kinds = array_remove(offered_kinds, 'YouTube Short'),
  rates = rates - 'YouTube Short',
  piece_hours = piece_hours - 'YouTube Short';
alter table public.creator_settings
  alter column offered_kinds set default '{Reel,Story,"Static post",Carousel,"UGC video"}',
  alter column rates set default '{"Reel":25000,"Story":6000,"Static post":12000,"Carousel":16000,"UGC video":15000}',
  alter column piece_hours set default '{"Reel":6,"Story":1,"Static post":3,"Carousel":4,"UGC video":4}';
