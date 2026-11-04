-- A creator picks her link (name.miracleapp.live) while signing up, in the app as on the website, and it's
-- required. It's kept for her while the Miracle team reviews (nobody else can take it) and opens as a page
-- once she's approved: a pending creator's address shows nothing (private.page_creator needs 'active').
-- Creators who signed up before this still pick theirs after approval (choose_my_link, unchanged).

drop function if exists public.creator_signup(text, text, text, text, text[], text[], text, text, text, text);

create or replace function public.creator_signup(p_name text, p_handle text, p_whatsapp text, p_city text, p_niches text[],
  p_languages text[], p_followers text, p_collabs text, p_heard text, p_note text, p_slug text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := public.jwt_email();
  v_name text := btrim(coalesce(p_name, ''));
  v_handle text := regexp_replace(lower(btrim(coalesce(p_handle, ''))), '^@+', '');
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_niches text[] := (select coalesce(array_agg(btrim(x)), '{}') from (select x from unnest(coalesce(p_niches, '{}')) x where btrim(x) <> '' limit 3) n);
  v_langs text[] := (select coalesce(array_agg(btrim(x)), '{}') from (select x from unnest(coalesce(p_languages, '{}')) x where btrim(x) <> '' limit 12) l);
  v_signup jsonb := jsonb_build_object('followers', left(btrim(coalesce(p_followers, '')), 40), 'collabs', left(btrim(coalesce(p_collabs, '')), 40),
                                       'heard', left(btrim(coalesce(p_heard, '')), 60), 'niches', to_jsonb(v_niches));
  v_mine public.creator_settings;
  v_prefix text;
  v_id integer;
  v_admin text;
begin
  if v_email = '' then
    raise exception 'Sign in with your email first.';
  end if;
  select * into v_mine from public.creator_settings s where lower(s.creator_email) = v_email;
  if v_mine.id is not null and v_mine.status in ('active', 'paused') then
    raise exception 'You already have a Miracle studio. Sign in to it instead.';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'Add your name as brands should see it.';
  end if;
  if v_handle !~ '^[a-z0-9._]{1,30}$' then
    raise exception 'Add your Instagram handle (letters, numbers, dots and underscores).';
  end if;
  if exists (select 1 from public.creator_settings s where lower(s.handle) = v_handle and s.id is distinct from v_mine.id) then
    raise exception '@% already has a Miracle page. If it''s yours, sign in with the email you used for it.', v_handle;
  end if;
  if regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g') !~ '^\d{10,13}$' then
    raise exception 'Add your WhatsApp number so we can reach you.';
  end if;
  if btrim(coalesce(p_city, '')) = '' then
    raise exception 'Add your city.';
  end if;
  if cardinality(v_niches) = 0 then
    raise exception 'Pick what you create (up to 3).';
  end if;
  -- Her link: required. The one she already holds (a request sent before) stays hers.
  if v_slug = '' then
    raise exception 'Pick your link, like yourname.miracleapp.live.';
  end if;
  if not (v_mine.id is not null and v_mine.slug_chosen and v_mine.slug = v_slug) and not public.slug_free(v_slug) then
    raise exception '%.miracleapp.live is taken or can''t be used. Pick another link.', v_slug;
  end if;
  -- Collab codes start with the initials of the name (two letters).
  v_prefix := upper(left(regexp_replace(initcap(v_name), '[^A-Z]', '', 'g') || 'MC', 2));

  begin
    if v_mine.id is null then
      insert into public.creator_settings (creator_email, slug, slug_chosen, display_name, handle, niche, city, whatsapp, content_languages,
        request_note, signup, status, requested_at, site_url, app_name, code_prefix)
      values (v_email, v_slug, true, v_name, v_handle,
        array_to_string(v_niches, ', '), btrim(p_city), btrim(p_whatsapp), v_langs, left(btrim(coalesce(p_note, '')), 600), v_signup,
        'pending', now(), 'https://' || v_slug || '.miracleapp.live', 'Miracle', v_prefix)
      returning id into v_id;
    else
      update public.creator_settings set slug = v_slug, slug_chosen = true, site_url = 'https://' || v_slug || '.miracleapp.live',
        display_name = v_name, handle = v_handle, niche = array_to_string(v_niches, ', '),
        city = btrim(p_city), whatsapp = btrim(p_whatsapp), content_languages = v_langs, request_note = left(btrim(coalesce(p_note, '')), 600),
        signup = v_signup, status = 'pending', requested_at = now(), code_prefix = v_prefix
      where id = v_mine.id
      returning id into v_id;
    end if;
  exception when unique_violation then
    -- Someone took the same link a moment ago.
    if sqlerrm ilike '%slug%' then
      raise exception '%.miracleapp.live was just taken. Pick another link.', v_slug;
    end if;
    raise;
  end;

  -- Tell the people who run Miracle (the email says which link she asked for).
  for v_admin in select a.email from public.app_admins a loop
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (v_id, 'creator_request', v_admin, jsonb_build_object('slug', v_slug, 'name', v_name, 'handle', v_handle,
      'niche', array_to_string(v_niches, ', '), 'city', btrim(p_city), 'note', left(btrim(coalesce(p_note, '')), 600), 'email', v_email,
      'followers', v_signup ->> 'followers', 'collabs', v_signup ->> 'collabs'));
  end loop;
  return public.my_creator_request();
end;
$$;
revoke execute on function public.creator_signup(text, text, text, text, text[], text[], text, text, text, text, text) from public, anon;
grant execute on function public.creator_signup(text, text, text, text, text[], text[], text, text, text, text, text) to authenticated;
