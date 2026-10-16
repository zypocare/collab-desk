-- Brand teammates: anyone on a brand can add a colleague or their agency by email. They sign in with
-- that email (a one-time code) and see the same requests. Invites wait until the person first signs in.

create table public.brand_invites (
  brand_id   uuid not null references public.brands(id) on delete cascade,
  email      text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name       text not null default '',
  invited_by text not null default '',
  created_at timestamptz not null default now(),
  primary key (brand_id, email)
);
alter table public.brand_invites enable row level security;
create policy "creator reads brand invites" on public.brand_invites for select to authenticated using (public.is_creator());

-- First sign-in of an invited email: join the brand(s).
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
  return null;
end;
$$;
create trigger profiles_join_invites
  after insert on public.profiles
  for each row execute function public.profiles_join_invites();

-- The brand's people: who has access, and who is invited.
create or replace function public.brand_team()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('email', p.email, 'name', p.full_name, 'me', p.id = auth.uid()) order by p.created_at)
      from public.brand_members m join public.profiles p on p.id = m.profile_id
      where m.brand_id = public.my_brand_id()), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('email', i.email, 'name', i.name, 'invited_by', i.invited_by, 'at', i.created_at) order by i.created_at)
      from public.brand_invites i
      where i.brand_id = public.my_brand_id()
        and not exists (select 1 from public.brand_members m join public.profiles p on p.id = m.profile_id
                        where m.brand_id = i.brand_id and p.email = i.email)), '[]'::jsonb))
  where public.my_brand_id() is not null;
$$;
revoke execute on function public.brand_team() from anon;

create or replace function public.brand_invite(p_email text, p_name text default '')
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  me public.profiles;
  b public.brands;
  existing uuid;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or public.my_brand_id() is null then raise exception 'Sign in to your brand first.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Type a full email address.'; end if;
  if v_email = lower(me.email) then raise exception 'That''s you.'; end if;
  if (select count(*) from public.brand_invites where brand_id = public.my_brand_id()) >= 20 then raise exception 'That''s a lot of people. Remove someone first.'; end if;
  select * into b from public.brands where id = public.my_brand_id();

  insert into public.brand_invites (brand_id, email, name, invited_by)
  values (b.id, v_email, left(btrim(coalesce(p_name, '')), 80), coalesce(nullif(me.full_name, ''), me.email))
  on conflict (brand_id, email) do update set name = excluded.name;
  -- Already has a login: add them now.
  select id into existing from public.profiles where lower(email) = v_email;
  if existing is not null then
    insert into public.brand_members (profile_id, brand_id) values (existing, b.id) on conflict do nothing;
  end if;

  insert into public.outbox (kind, to_email, payload) values ('brand_invite', v_email, jsonb_build_object(
    'brand', b.name, 'name', btrim(coalesce(p_name, '')), 'by', coalesce(nullif(me.full_name, ''), me.email)));
end;
$$;
revoke execute on function public.brand_invite(text, text) from anon;

create or replace function public.brand_remove(p_email text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_brand uuid := public.my_brand_id();
begin
  if v_brand is null then raise exception 'Sign in to your brand first.'; end if;
  if v_email = (select lower(email) from public.profiles where id = auth.uid()) then raise exception 'You can''t remove yourself.'; end if;
  delete from public.brand_invites where brand_id = v_brand and email = v_email;
  delete from public.brand_members m using public.profiles p
  where m.profile_id = p.id and m.brand_id = v_brand and lower(p.email) = v_email;
  update public.profiles set brand_id = null where lower(email) = v_email and brand_id = v_brand;
end;
$$;
revoke execute on function public.brand_remove(text) from anon;
