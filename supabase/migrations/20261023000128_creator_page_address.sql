-- A creator's page address: creators still on the app's first address (collab-desk.zypocare.workers.dev)
-- move to their own name.miracleapp.live, which their profile, share sheet, QR codes, emails and links
-- use. The old address keeps working (it still opens Niveditha's page), so printed QR codes don't break.
update public.creator_settings
set site_url = 'https://' || slug || '.miracleapp.live'
where slug_chosen and slug is not null and site_url ilike '%workers.dev%';
