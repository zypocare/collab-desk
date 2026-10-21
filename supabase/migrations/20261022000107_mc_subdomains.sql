-- Miracle for many creators, part 8: each creator has an address, name.miracleapp.live.
-- The app and the Worker send the name in an x-creator header; public pages, the request form and
-- "ask a question" then work for that creator. An unknown name gets nothing, never someone else's page.

alter table public.creator_settings add column if not exists slug text;
update public.creator_settings set slug = 'nivy' where id = 1 and slug is null;
update public.creator_settings set slug = 'creator' || id where slug is null;
alter table public.creator_settings alter column slug set not null;
alter table public.creator_settings add constraint creator_settings_slug_check check (
  slug ~ '^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$'
  and slug not in ('www', 'app', 'api', 'admin', 'mail', 'email', 'studio', 'brand', 'brands', 'help', 'support',
                   'blog', 'status', 'miracle', 'docs', 'login', 'signup', 'static', 'cdn', 'assets', 'test', 'dev', 'staging'));
create unique index if not exists creator_settings_slug_idx on public.creator_settings (slug);

-- The name sent with this request (the part before .miracleapp.live), if any.
create or replace function private.header_slug()
returns text
language sql stable
set search_path = ''
as $$
  select nullif(lower(btrim(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-creator', ''))), '');
$$;
revoke execute on function private.header_slug() from public, anon, authenticated;

-- The creator a public page is for: the one a server function is working for, else the address the
-- page was opened on, else the signed-in person's creator, else the only creator there is.
create or replace function private.page_creator()
returns integer
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_set text := nullif(current_setting('app.creator', true), '');
  v_slug text := private.header_slug();
begin
  if v_set is not null then
    return v_set::integer;
  end if;
  if v_slug is not null then
    return (select s.id from public.creator_settings s where s.slug = v_slug and s.status = 'active');
  end if;
  return coalesce(public.current_creator(), (select min(s.id) from public.creator_settings s having count(*) = 1));
end;
$$;
revoke execute on function private.page_creator() from public, anon, authenticated;

-- Who this address belongs to, for the Worker and the app (null: no creator here).
create or replace function public.page_owner()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.display_name, 'handle', s.handle, 'site_url', s.site_url)
  from public.creator_settings s
  where s.id = private.page_creator() and s.status = 'active';
$$;
grant execute on function public.page_owner() to anon, authenticated;

-- A creator can't take a name that is already taken (case and spaces don't matter).
create or replace function public.slug_free(p_slug text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select lower(btrim(coalesce(p_slug, ''))) ~ '^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$'
    and lower(btrim(p_slug)) not in ('www', 'app', 'api', 'admin', 'mail', 'email', 'studio', 'brand', 'brands', 'help', 'support',
                                     'blog', 'status', 'miracle', 'docs', 'login', 'signup', 'static', 'cdn', 'assets', 'test', 'dev', 'staging')
    and not exists (select 1 from public.creator_settings s where s.slug = lower(btrim(p_slug)));
$$;
grant execute on function public.slug_free(text) to anon, authenticated;
