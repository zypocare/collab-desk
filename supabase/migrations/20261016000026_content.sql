-- Content week: when she shoots each collab, a shot list per collab, and how long each piece takes,
-- so the studio can plan shoot days and show how full each week really is (in hours, not just collabs).

alter table public.collabs
  add column shoot_date date,
  add column shot_list jsonb not null default '[]' check (jsonb_typeof(shot_list) = 'array');

alter table public.creator_settings
  add column piece_hours jsonb not null default '{"Reel":6,"Story":1,"Static post":3,"Carousel":4,"YouTube Short":5,"UGC video":4}',
  add column weekly_hours integer not null default 25 check (weekly_hours between 2 and 80);
