-- Hand the studio to another sign-in email (e.g. from the person who set it up to the creator herself).
-- Only the current owner can do it. The old email can stay on as a manager so they don't get locked out.

create or replace function public.studio_transfer(p_email text, p_keep_me boolean default true)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_new text := lower(btrim(coalesce(p_email, '')));
  v_old text;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can change the sign-in email.';
  end if;
  if v_new !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That doesn''t look like an email address.';
  end if;
  select lower(creator_email) into v_old from public.creator_settings limit 1;
  if v_new = v_old then
    raise exception 'That is already the sign-in email.';
  end if;

  -- The new owner isn't also a team member.
  delete from public.team_members where email = v_new;
  if p_keep_me then
    insert into public.team_members (email, name, role, copy_emails)
    values (v_old, 'Previous owner', 'manager', true)
    on conflict (email) do nothing;
  end if;

  update public.creator_settings set creator_email = v_new where true;
  return jsonb_build_object('owner', v_new, 'kept', p_keep_me);
end;
$$;
revoke execute on function public.studio_transfer(text, boolean) from anon;
