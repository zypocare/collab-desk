-- "Someday": a collab that might happen but has no date yet (a brand said "let's do something later",
-- or she added it by hand from a DM). It stays a request or a negotiation, kept out of her Today list
-- and the nudges until she brings it back. someday_on is an optional day to check back.

alter table public.collabs
  add column if not exists someday boolean not null default false,
  add column if not exists someday_on date;

-- Once a deal moves on (agreed, declined, paused...), it's no longer "someday".
create or replace function private.someday_clears() returns trigger
language plpgsql as $$
begin
  if new.someday and new.stage not in ('request', 'negotiating') then
    new.someday := false;
    new.someday_on := null;
  end if;
  return new;
end $$;

drop trigger if exists "3_someday_clears" on public.collabs;
create trigger "3_someday_clears" before insert or update of stage, someday on public.collabs
  for each row execute function private.someday_clears();
