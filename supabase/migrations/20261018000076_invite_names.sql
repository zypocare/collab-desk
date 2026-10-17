-- An invited colleague keeps the name they were invited with (it was dropped on first sign-in, so
-- emails said "Hi there" and the form showed "Sending as Brand · ").
create or replace function public.profiles_join_invites()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.brand_members (profile_id, brand_id)
  select new.id, i.brand_id from public.brand_invites i where i.email = lower(new.email)
  on conflict do nothing;
  if new.brand_id is null then
    update public.profiles set brand_id = (select i.brand_id from public.brand_invites i where i.email = lower(new.email) order by i.created_at limit 1)
    where id = new.id;
  end if;
  if coalesce(btrim(new.full_name), '') = '' then
    update public.profiles set full_name = coalesce((select nullif(btrim(i.name), '') from public.brand_invites i where i.email = lower(new.email) order by i.created_at limit 1), '')
    where id = new.id;
  end if;
  return null;
end;
$$;

-- Colleagues who already joined without a name get the one they were invited with.
update public.profiles p set full_name = i.name
from public.brand_invites i
where i.email = lower(p.email) and coalesce(btrim(p.full_name), '') = '' and coalesce(btrim(i.name), '') <> '';
