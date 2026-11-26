-- Private Home Base (creator settings) + On-Location Shoot & Distance Planner (collabs)
-- Strictly private on creator_settings (never exposed in public_page).

alter table public.creator_settings
  add column if not exists home_address text not null default '',
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision,
  add column if not exists travel_mode text not null default 'cab',
  add column if not exists travel_buffer_mins integer not null default 15;

alter table public.collabs
  add column if not exists shoot_mode text not null default 'home',
  add column if not exists venue_name text not null default '',
  add column if not exists venue_address text not null default '',
  add column if not exists venue_lat double precision,
  add column if not exists venue_lng double precision,
  add column if not exists travel_km double precision,
  add column if not exists travel_mins integer,
  add column if not exists travel_slot text not null default 'midday',
  add column if not exists leave_nudge boolean not null default false;

create index if not exists collabs_location_shoot_idx
  on public.collabs (creator_id, shoot_mode, shoot_date)
  where shoot_mode = 'location';
