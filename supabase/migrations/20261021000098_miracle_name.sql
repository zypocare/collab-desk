-- The app is now called Miracle.
alter table public.creator_settings alter column app_name set default 'Miracle';
update public.creator_settings set app_name = 'Miracle' where app_name in ('', 'Collab Desk');
