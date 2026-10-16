-- Stories disappear (with their numbers) 24 hours after posting, so they are saved every 2 hours.
select cron.schedule('instagram-stories', '15 */2 * * *', $$select private.call_function('instagram-stories')$$);

-- matched_by can now also be 'date' (a Story on a collab's go-live day).
alter table public.collab_posts drop constraint if exists collab_posts_matched_by_check;
alter table public.collab_posts add constraint collab_posts_matched_by_check check (matched_by in ('auto', 'manual', 'date'));
