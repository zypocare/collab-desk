-- Miracle for many creators, part 2: small helpers the rewritten functions share.

-- The creator a public page (her link, the request form, "ask a question") is for. Until pages pass
-- the creator they belong to (from the address: name.miracleapp.live), it is the creator the request
-- works for, else the only creator there is.
create or replace function private.page_creator()
returns integer
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.current_creator(), (select min(s.id) from public.creator_settings s having count(*) = 1));
$$;
revoke execute on function private.page_creator() from public, anon, authenticated;

-- One creator's settings row (for functions that used "where id = 1").
create or replace function private.settings_of(p_creator integer)
returns public.creator_settings
language sql stable security definer
set search_path = public
as $$ select s from public.creator_settings s where s.id = p_creator; $$;
revoke execute on function private.settings_of(integer) from public, anon, authenticated;

-- Stop a studio action on a row of another creator.
create or replace function private.must_own(p_creator integer)
returns void
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_creator is null or not public.is_creator_of(p_creator) then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function private.must_own(integer) from public, anon, authenticated;
