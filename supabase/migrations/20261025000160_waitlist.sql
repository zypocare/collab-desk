-- The pre-launch waitlist. Until Meta approves Instagram sign-in for everyone and the Play Store app is out,
-- the website asks creators, brands and agencies to join a waitlist instead of signing up. Each person gets
-- their place in line and a referral link; every friend who joins moves them up. A creator can ask for the
-- link name they want (name.miracleapp.live), held for them until launch. On launch day the admin invites
-- people in batches; when someone signs up with the same email, the waitlist notes it.

create table if not exists public.waitlist (
  id bigint generated always as identity primary key,
  email text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('creator', 'brand', 'agency')),
  name text not null default '' check (char_length(name) <= 80),
  instagram text not null default '' check (char_length(instagram) <= 60),
  city text not null default '' check (char_length(city) <= 60),
  company text not null default '' check (char_length(company) <= 100),
  website text not null default '' check (char_length(website) <= 200),
  niche text not null default '' check (char_length(niche) <= 60),
  followers text not null default '' check (char_length(followers) <= 30),
  link text check (link is null or link ~ '^[a-z0-9-]{3,30}$'),
  ref_code text not null unique,
  referred_by text,
  source text not null default '' check (char_length(source) <= 120),
  ip text not null default '',
  created_at timestamptz not null default now(),
  invited_at timestamptz,
  joined_at timestamptz,
  note text not null default ''
);
create unique index if not exists waitlist_link_uq on public.waitlist (link) where link is not null;
create index if not exists waitlist_referred_idx on public.waitlist (referred_by);
create index if not exists waitlist_ip_idx on public.waitlist (ip, created_at);
alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;

-- Place in line among the same role: earlier joiners first, each friend who joined moves you up two days.
create or replace function private.waitlist_place(p_id bigint)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with w as (select x.*, (select count(*) from public.waitlist r where r.referred_by = x.ref_code) as refs from public.waitlist x),
  me as (select * from w where id = p_id)
  select jsonb_build_object(
    'position', 1 + (select count(*) from w where w.role = me.role and w.joined_at is null and w.id <> me.id
                     and (w.created_at - make_interval(days => 2 * w.refs::int)) < (me.created_at - make_interval(days => 2 * me.refs::int))),
    'total', (select count(*) from w where w.role = me.role),
    'referrals', me.refs, 'ref_code', me.ref_code, 'role', me.role, 'link', me.link, 'name', me.name)
  from me;
$$;
revoke execute on function private.waitlist_place(bigint) from public, anon, authenticated;

-- Join (or update your details). Anyone may call it; a few a day from one address.
create or replace function public.waitlist_join(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p ->> 'email', '')));
  v_role text := coalesce(nullif(p ->> 'role', ''), 'creator');
  v_link text := nullif(lower(regexp_replace(btrim(coalesce(p ->> 'link', '')), '[^A-Za-z0-9-]', '', 'g')), '');
  v_ref text := nullif(upper(btrim(coalesce(p ->> 'ref', ''))), '');
  v_ip text := coalesce(private.client_ip(), '');
  v_id bigint;
  v_new boolean := false;
  v_code text;
  v_link_note text := '';
  w public.waitlist;
begin
  -- A hidden field people never see: bots fill it in.
  if coalesce(p ->> 'website_url', '') <> '' then return jsonb_build_object('ok', true, 'position', 1, 'total', 1); end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 160 then raise exception 'Type a full email address.'; end if;
  if v_role not in ('creator', 'brand', 'agency') then raise exception 'Pick creator, brand or agency.'; end if;
  if v_ip <> '' and (select count(*) from public.waitlist where ip = v_ip and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'Lots of sign-ups from this network just now. Try again in an hour.';
  end if;
  -- The link name she'd like: free if no creator has it and nobody else on the list asked first.
  if v_link is not null then
    if char_length(v_link) < 3 or char_length(v_link) > 30 then
      v_link_note := 'Link names are 3 to 30 letters, numbers or hyphens.'; v_link := null;
    elsif exists (select 1 from public.creator_settings s where s.slug = v_link)
       or exists (select 1 from public.waitlist x where x.link = v_link and x.email <> v_email)
       or v_link in ('www', 'app', 'admin', 'api', 'brand', 'brands', 'help', 'mail', 'support', 'creators', 'demo', 'miracle') then
      v_link_note := v_link || '.miracleapp.live is taken. Pick another one any time before launch.'; v_link := null;
    end if;
  end if;
  select * into w from public.waitlist where email = v_email;
  if w.id is null then
    loop
      v_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 7));
      exit when not exists (select 1 from public.waitlist where ref_code = v_code);
    end loop;
    insert into public.waitlist (email, role, name, instagram, city, company, website, niche, followers, link, ref_code, referred_by, source, ip)
    values (v_email, v_role, left(btrim(coalesce(p ->> 'name', '')), 80), left(regexp_replace(btrim(coalesce(p ->> 'instagram', '')), '^@', ''), 60),
      left(btrim(coalesce(p ->> 'city', '')), 60), left(btrim(coalesce(p ->> 'company', '')), 100), left(btrim(coalesce(p ->> 'site', '')), 200),
      left(btrim(coalesce(p ->> 'niche', '')), 60), left(btrim(coalesce(p ->> 'followers', '')), 30), v_link, v_code,
      case when v_ref is not null and exists (select 1 from public.waitlist r where r.ref_code = v_ref) then v_ref end,
      left(btrim(coalesce(p ->> 'source', '')), 120), v_ip)
    returning id into v_id;
    v_new := true;
  else
    update public.waitlist set
      role = v_role,
      name = coalesce(nullif(left(btrim(coalesce(p ->> 'name', '')), 80), ''), name),
      instagram = coalesce(nullif(left(regexp_replace(btrim(coalesce(p ->> 'instagram', '')), '^@', ''), 60), ''), instagram),
      city = coalesce(nullif(left(btrim(coalesce(p ->> 'city', '')), 60), ''), city),
      company = coalesce(nullif(left(btrim(coalesce(p ->> 'company', '')), 100), ''), company),
      website = coalesce(nullif(left(btrim(coalesce(p ->> 'site', '')), 200), ''), website),
      niche = coalesce(nullif(left(btrim(coalesce(p ->> 'niche', '')), 60), ''), niche),
      followers = coalesce(nullif(left(btrim(coalesce(p ->> 'followers', '')), 30), ''), followers),
      link = coalesce(v_link, link)
    where id = w.id;
    v_id := w.id;
  end if;
  if v_new then
    insert into public.outbox (creator_id, kind, to_email, payload)
    select null, 'waitlist_welcome', v_email, private.waitlist_place(v_id) || jsonb_build_object('app', true);
  end if;
  return private.waitlist_place(v_id) || jsonb_build_object('ok', true, 'new', v_new, 'link_note', v_link_note);
end;
$$;
revoke execute on function public.waitlist_join(jsonb) from public;
grant execute on function public.waitlist_join(jsonb) to anon, authenticated;

-- Where you are, by your referral code (the page remembers it on your device).
create or replace function public.waitlist_status(p_code text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select private.waitlist_place(w.id) from public.waitlist w where w.ref_code = upper(btrim(coalesce(p_code, '')));
$$;
revoke execute on function public.waitlist_status(text) from public;
grant execute on function public.waitlist_status(text) to anon, authenticated;

-- When someone on the list signs up, note it (that's how launch-day invites are tracked).
create or replace function private.waitlist_signed_up()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.waitlist set joined_at = coalesce(joined_at, now()) where email = lower(coalesce(new.email, ''));
  return new;
end;
$$;
revoke execute on function private.waitlist_signed_up() from public, anon, authenticated;
drop trigger if exists waitlist_signed_up on auth.users;
create trigger waitlist_signed_up after insert on auth.users for each row execute function private.waitlist_signed_up();

-- Admin: the list, with counts and the top referrers; and marking people invited.
create or replace function public.admin_waitlist(p_role text default null, p_q text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  return jsonb_build_object(
    'counts', (select jsonb_build_object('total', count(*), 'creator', count(*) filter (where role = 'creator'), 'brand', count(*) filter (where role = 'brand'),
        'agency', count(*) filter (where role = 'agency'), 'invited', count(*) filter (where invited_at is not null), 'joined', count(*) filter (where joined_at is not null),
        'today', count(*) filter (where created_at > date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),
        'week', count(*) filter (where created_at > now() - interval '7 days'), 'referred', count(*) filter (where referred_by is not null)) from public.waitlist),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d) from (
        select (created_at at time zone 'Asia/Kolkata')::date as d, count(*) as n from public.waitlist where created_at > now() - interval '60 days' group by 1) x), '[]'::jsonb),
    'top_referrers', coalesce((select jsonb_agg(jsonb_build_object('email', w.email, 'name', w.name, 'role', w.role, 'referrals', x.n) order by x.n desc) from (
        select referred_by, count(*) as n from public.waitlist where referred_by is not null group by 1 order by 2 desc limit 10) x join public.waitlist w on w.ref_code = x.referred_by), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(to_jsonb(w) - 'ip' || jsonb_build_object('referrals', (select count(*) from public.waitlist r where r.referred_by = w.ref_code),
          'position', (private.waitlist_place(w.id) ->> 'position')::int) order by w.created_at desc)
      from public.waitlist w
      where (p_role is null or w.role = p_role)
        and (coalesce(p_q, '') = '' or w.email ilike '%' || p_q || '%' or w.name ilike '%' || p_q || '%' or w.instagram ilike '%' || p_q || '%'
             or w.company ilike '%' || p_q || '%' or w.city ilike '%' || p_q || '%')), '[]'::jsonb));
end;
$$;

create or replace function public.admin_waitlist_mark(p_ids bigint[], p_invited boolean, p_note text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  perform private.admin_check();
  update public.waitlist set invited_at = case when p_invited then coalesce(invited_at, now()) end,
    note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note)
  where id = any (p_ids);
  perform private.admin_log(case when p_invited then 'waitlist_invited' else 'waitlist_uninvited' end, 'waitlist', array_to_string(p_ids, ','), cardinality(p_ids) || ' people', null, null, coalesce(p_note, ''));
  return public.admin_waitlist();
end;
$$;
revoke execute on function public.admin_waitlist(text, text), public.admin_waitlist_mark(bigint[], boolean, text) from public, anon;
grant execute on function public.admin_waitlist(text, text), public.admin_waitlist_mark(bigint[], boolean, text) to authenticated;
