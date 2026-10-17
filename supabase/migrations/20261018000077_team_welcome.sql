-- A manager she adds to her team gets a welcome email with how to sign in (before, nothing was sent).
create or replace function public.team_member_welcome()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
begin
  select * into s from public.creator_settings where id = 1;
  insert into public.outbox (kind, to_email, payload)
  values ('team_added', new.email, jsonb_build_object('name', coalesce(new.name, ''), 'link', rtrim(s.site_url, '/') || '/login'));
  return null;
end;
$$;
drop trigger if exists team_member_welcome on public.team_members;
create trigger team_member_welcome after insert on public.team_members
  for each row execute function public.team_member_welcome();
