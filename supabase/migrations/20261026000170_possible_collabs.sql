-- Possible collabs (the creator's "Possible collabs" screen): every Instagram chat the check flagged as a
-- possible collab stays listed, newest first, whether it's still new or already on the board. flagged_at is when
-- the chat was first spotted as one; it's set here, so the webhook doesn't need to know.
alter table public.ig_threads add column if not exists flagged_at timestamptz;

update public.ig_threads set flagged_at = coalesce(last_from_them_at, last_at, now())
 where flagged_at is null and collab_flag in ('likely', 'maybe');

create or replace function private.ig_thread_flagged() returns trigger language plpgsql as $$
begin
  if new.collab_flag in ('likely', 'maybe') and new.flagged_at is null then
    new.flagged_at := now();
  end if;
  return new;
end $$;

drop trigger if exists ig_thread_flagged on public.ig_threads;
create trigger ig_thread_flagged before insert or update of collab_flag on public.ig_threads
  for each row execute function private.ig_thread_flagged();
