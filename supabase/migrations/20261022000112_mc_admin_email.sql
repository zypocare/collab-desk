-- The Miracle admin login is admin@miracleapp.live (not a personal address).
delete from public.app_admins where email = 'jtndra1988@gmail.com';
insert into public.app_admins (email) values ('admin@miracleapp.live') on conflict do nothing;
