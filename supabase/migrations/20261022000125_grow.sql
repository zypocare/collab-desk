-- Grow: real reach for creators. Their own reel plans (from the growth autopilot, a reel check or a
-- collab reel), collab reels with other creators on Miracle (one reel, posted on both accounts), and
-- posting their own reels from the app (not only brand drafts). Miracle never buys followers or likes.

-- 1. Settings ------------------------------------------------------------------------------------------------------
alter table public.creator_settings add column if not exists grow_mode text not null default 'ask';
alter table public.creator_settings drop constraint if exists creator_settings_grow_mode_check;
alter table public.creator_settings add constraint creator_settings_grow_mode_check check (grow_mode in ('ask', 'auto'));
-- Other creators on Miracle can invite her to a collab reel (on unless she turns it off).
alter table public.creator_settings add column if not exists collab_invites boolean not null default true;

-- 2. Her own reels, planned ------------------------------------------------------------------------------------------
create table if not exists public.content_plans (
  id uuid primary key default gen_random_uuid(),
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  why text not null default '' check (char_length(why) <= 300),
  post_at timestamptz,
  -- idea: suggested, not in the Calendar yet · planned: in the Calendar · posted · dropped
  status text not null default 'idea' check (status in ('idea', 'planned', 'posted', 'dropped')),
  source text not null default 'autopilot' check (source in ('autopilot', 'check', 'collab')),
  -- The Monday of the week the autopilot planned it for.
  week date,
  collab_reel_id uuid,
  scheduled_post_id uuid references public.scheduled_posts (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists content_plans_creator_idx on public.content_plans (creator_id, post_at);
alter table public.content_plans enable row level security;
drop policy if exists "creator manages content plans" on public.content_plans;
create policy "creator manages content plans" on public.content_plans for all to authenticated
  using (creator_id = (select public.current_creator()) and (select public.is_creator()))
  with check (creator_id = (select public.current_creator()) and (select public.is_creator()));
grant select, insert, update, delete on public.content_plans to authenticated;
drop trigger if exists "0_fill_creator" on public.content_plans;
create trigger "0_fill_creator" before insert on public.content_plans for each row execute function private.fill_creator();
drop trigger if exists "0_keep_creator" on public.content_plans;
create trigger "0_keep_creator" before update of creator_id on public.content_plans for each row execute function private.keep_creator();

-- 3. Posting her own reels from the app (not tied to a brand collab) ----------------------------------------------------
alter table public.scheduled_posts alter column collab_id drop not null;

-- Her own files live under own/<creator id>/ in the drafts bucket.
create or replace function public.path_creator(p_name text)
returns integer
language plpgsql stable security definer
set search_path = public
as $$
declare
  c integer;
begin
  if (storage.foldername(p_name))[1] = 'own' then
    return ((storage.foldername(p_name))[2])::integer;
  end if;
  select x.creator_id into c from public.collabs x where x.id = ((storage.foldername(p_name))[1])::uuid;
  return c;
exception when others then
  return null;
end;
$$;

-- 4. Collab reels with other creators -------------------------------------------------------------------------------
create table if not exists public.collab_reels (
  id uuid primary key default gen_random_uuid(),
  from_creator integer not null references public.creator_settings (id) on delete cascade,
  to_creator integer not null references public.creator_settings (id) on delete cascade,
  idea text not null check (char_length(idea) between 3 and 400),
  -- Who posts it ('from' or 'to'); the other is added as collaborator.
  poster text not null default 'from' check (poster in ('from', 'to')),
  shoot_by date,
  post_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check (from_creator <> to_creator)
);
create index if not exists collab_reels_to_idx on public.collab_reels (to_creator, status);
create index if not exists collab_reels_from_idx on public.collab_reels (from_creator, created_at desc);
alter table public.collab_reels enable row level security;
revoke all on public.collab_reels from anon, authenticated;

-- A creator as other creators see her (public page facts only).
create or replace function private.peer_card(p_id integer)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('id', s.id, 'name', s.display_name, 'slug', s.slug, 'handle', s.handle, 'niche', s.niche, 'city', s.city,
    'photo', case when a.connected then nullif(a.profile_picture_url, '') end,
    'followers', case when a.connected then a.followers end)
  from public.creator_settings s left join public.ig_account a on a.id = s.id
  where s.id = p_id;
$$;
revoke execute on function private.peer_card(integer) from public, anon, authenticated;

-- Creators to make a collab reel with: on Miracle and listed, open to invites, in her niche (or her city),
-- about her size (a third to three times her followers).
create or replace function public.grow_matches()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  me public.creator_settings;
  v_mine integer;
begin
  if not public.is_creator() then
    raise exception 'Only creators can see this.';
  end if;
  select * into me from public.creator_settings where id = public.current_creator();
  select a.followers into v_mine from public.ig_account a where a.id = me.id and a.connected;
  return coalesce((
    select jsonb_agg(private.peer_card(x.id) || jsonb_build_object('match', x.why) order by x.score desc, x.followers desc nulls last)
    from (
      select s.id, a.followers,
        (case when shared.n > 0 then 2 else 0 end) + (case when lower(s.city) = lower(me.city) and me.city <> '' then 1 else 0 end) as score,
        case when shared.n > 0 then 'niche' else 'city' end as why
      from public.creator_settings s
      left join public.ig_account a on a.id = s.id and a.connected
      cross join lateral (
        select count(*) as n from unnest(string_to_array(lower(s.niche), ',')) t(w)
        where btrim(t.w) <> '' and btrim(t.w) = any (select btrim(u) from unnest(string_to_array(lower(me.niche), ',')) u)
      ) shared
      where s.id <> me.id and s.status = 'active' and s.listed and s.slug_chosen and s.collab_invites
        and (shared.n > 0 or (lower(s.city) = lower(me.city) and me.city <> ''))
        and (v_mine is null or a.followers is null or a.followers between v_mine / 3 and v_mine * 3)
      order by 3 desc, a.followers desc nulls last
      limit 12
    ) x), '[]'::jsonb);
end;
$$;
revoke execute on function public.grow_matches() from public, anon;
grant execute on function public.grow_matches() to authenticated;

create or replace function public.collab_reel_invite(p_to integer, p_idea text, p_poster text, p_shoot date, p_post timestamptz)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_me integer := public.current_creator();
  v_id uuid;
  them public.creator_settings;
  me public.creator_settings;
begin
  if not public.is_creator() or not public.is_owner() then
    raise exception 'Only the creator can invite someone to a collab reel.';
  end if;
  select * into them from public.creator_settings where id = p_to and status = 'active' and listed and collab_invites;
  if them.id is null or p_to = v_me then
    raise exception 'That creator isn''t taking collab invites right now.';
  end if;
  if char_length(btrim(coalesce(p_idea, ''))) < 3 then
    raise exception 'Write the idea in a line.';
  end if;
  if p_post is not null and p_post < now() then
    raise exception 'Pick a posting day in the future.';
  end if;
  if (select count(*) from public.collab_reels where from_creator = v_me and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You''ve sent 5 invites today. Send more tomorrow.';
  end if;
  if exists (select 1 from public.collab_reels where from_creator = v_me and to_creator = p_to and status = 'pending') then
    raise exception '% hasn''t answered your last invite yet.', them.display_name;
  end if;
  select * into me from public.creator_settings where id = v_me;
  insert into public.collab_reels (from_creator, to_creator, idea, poster, shoot_by, post_at)
  values (v_me, p_to, left(btrim(p_idea), 400), case when p_poster = 'to' then 'to' else 'from' end, p_shoot, p_post)
  returning id into v_id;
  insert into public.outbox (creator_id, kind, to_email, payload)
  values (p_to, 'collab_reel_invite', '', jsonb_build_object('from', me.display_name, 'handle', me.handle, 'idea', left(btrim(p_idea), 400),
    'post_at', p_post, 'they_post', p_poster = 'to', 'id', v_id));
  return public.my_collab_reels();
end;
$$;
revoke execute on function public.collab_reel_invite(integer, text, text, date, timestamptz) from public, anon;
grant execute on function public.collab_reel_invite(integer, text, text, date, timestamptz) to authenticated;

create or replace function public.collab_reel_answer(p_id uuid, p_yes boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  r public.collab_reels;
  a public.creator_settings;
  b public.creator_settings;
begin
  if not public.is_creator() or not public.is_owner() then
    raise exception 'Only the creator can answer.';
  end if;
  select * into r from public.collab_reels where id = p_id and to_creator = public.current_creator() and status = 'pending' for update;
  if r.id is null then
    raise exception 'That invite isn''t waiting for you any more.';
  end if;
  update public.collab_reels set status = case when p_yes then 'accepted' else 'declined' end, answered_at = now() where id = r.id;
  select * into a from public.creator_settings where id = r.from_creator;
  select * into b from public.creator_settings where id = r.to_creator;
  if p_yes then
    -- It goes in both Calendars.
    insert into public.content_plans (creator_id, title, why, post_at, status, source, collab_reel_id)
    values (r.from_creator, left('Collab reel with ' || b.display_name || ': ' || r.idea, 160),
        case when r.poster = 'from' then 'You post it with @' || b.handle || ' as collaborator' else b.display_name || ' posts it with you as collaborator' end,
        r.post_at, 'planned', 'collab', r.id),
      (r.to_creator, left('Collab reel with ' || a.display_name || ': ' || r.idea, 160),
        case when r.poster = 'to' then 'You post it with @' || a.handle || ' as collaborator' else a.display_name || ' posts it with you as collaborator' end,
        r.post_at, 'planned', 'collab', r.id);
  end if;
  insert into public.outbox (creator_id, kind, to_email, payload)
  values (r.from_creator, 'collab_reel_answer', '', jsonb_build_object('from', b.display_name, 'yes', p_yes, 'idea', r.idea, 'post_at', r.post_at));
  return public.my_collab_reels();
end;
$$;
revoke execute on function public.collab_reel_answer(uuid, boolean) from public, anon;
grant execute on function public.collab_reel_answer(uuid, boolean) to authenticated;

create or replace function public.collab_reel_cancel(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  update public.collab_reels set status = 'cancelled', answered_at = now()
  where id = p_id and from_creator = public.current_creator() and status = 'pending' and public.is_creator();
  return public.my_collab_reels();
end;
$$;
revoke execute on function public.collab_reel_cancel(uuid) from public, anon;
grant execute on function public.collab_reel_cancel(uuid) to authenticated;

create or replace function public.my_collab_reels()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'idea', r.idea, 'status', r.status, 'shoot_by', r.shoot_by, 'post_at', r.post_at, 'created_at', r.created_at,
      'incoming', r.to_creator = public.current_creator(),
      'i_post', (r.poster = 'from') = (r.from_creator = public.current_creator()),
      'with', private.peer_card(case when r.to_creator = public.current_creator() then r.from_creator else r.to_creator end))
    order by (r.status = 'pending') desc, r.created_at desc), '[]'::jsonb)
  from public.collab_reels r
  where public.is_creator() and (r.from_creator = public.current_creator() or r.to_creator = public.current_creator())
    and (r.status in ('pending', 'accepted') or r.created_at > now() - interval '30 days');
$$;
revoke execute on function public.my_collab_reels() from public, anon;
grant execute on function public.my_collab_reels() to authenticated;
