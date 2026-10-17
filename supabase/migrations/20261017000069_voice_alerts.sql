-- A chime and a spoken line in the app when a possible collab or a new request arrives while the
-- app is open ("Hey Nivy! You might have a new collab. Check your collab app."). On by default.
alter table public.creator_settings add column if not exists voice_alerts boolean not null default true;
