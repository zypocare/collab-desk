-- Insights, more for brands:
--  * A link per brand: she sees when they open it (and gets a phone alert), and picks which sections it shows.
--  * Monthly snapshots, so brands see the trend over months, not just the last 30 days.

create table if not exists public.insight_links (
  token          text primary key default encode(extensions.gen_random_bytes(12), 'hex'),
  label          text not null check (char_length(btrim(label)) between 1 and 80),
  hide           text[] not null default '{}',
  active         boolean not null default true,
  views          integer not null default 0,
  last_viewed_at timestamptz,
  notified_at    timestamptz,
  created_at     timestamptz not null default now()
);
alter table public.insight_links enable row level security;
create policy "creator manages insight links" on public.insight_links for all to authenticated
  using (public.is_creator()) with check (public.is_creator());

-- A brand opened their link: count it, tell her (at most every 30 minutes per link), and say what to show.
create or replace function public.insight_link_open(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  l public.insight_links;
  s public.creator_settings;
begin
  update public.insight_links
     set views = views + 1, last_viewed_at = now()
   where token = p_token and active
  returning * into l;
  if l.token is null then return null; end if;
  if l.notified_at is null or l.notified_at < now() - interval '30 minutes' then
    select * into s from public.creator_settings where id = 1;
    insert into public.outbox (kind, to_email, payload)
    values ('insights_viewed', s.creator_email, jsonb_build_object('label', l.label, 'views', l.views));
    update public.insight_links set notified_at = now() where token = l.token;
  end if;
  return jsonb_build_object('label', l.label, 'hide', to_jsonb(l.hide));
end;
$$;
grant execute on function public.insight_link_open(text) to anon, authenticated;

create table if not exists public.ig_monthly (
  month        date primary key,
  followers    integer,
  reach        integer,
  views        integer,
  engaged      integer,
  interactions integer,
  er           numeric,
  reels_er     numeric,
  updated_at   timestamptz not null default now()
);
alter table public.ig_monthly enable row level security;
create policy "creator reads monthly" on public.ig_monthly for select to authenticated using (public.is_creator());

-- Same as before (Stories switch and her own Story numbers), plus the last 6 months.
create or replace function public.public_insights()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when not s.show_insights or not a.connected then null else jsonb_build_object(
    'display_name', s.display_name, 'handle', s.handle, 'niche', s.niche, 'city', s.city,
    'username', a.username, 'profile_picture_url', a.profile_picture_url,
    'followers', a.followers, 'media_count', a.media_count,
    'engagement_rate', a.engagement_rate, 'avg_views', a.avg_views, 'avg_reach', a.avg_reach,
    'demographics', a.demographics,
    'insights', case
      when not s.insights_stories then coalesce(a.insights, '{}'::jsonb) #- '{formats,stories}'
      when a.insights ? 'formats' and (s.story_stats ?| array['avg_views', 'avg_reach', 'avg_interactions']) then
        jsonb_set(a.insights, '{formats,stories}',
          coalesce(a.insights #> '{formats,stories}', '{"posts": 0}'::jsonb)
          || jsonb_strip_nulls(jsonb_build_object(
               'avg_views', s.story_stats -> 'avg_views',
               'avg_reach', s.story_stats -> 'avg_reach',
               'avg_interactions', s.story_stats -> 'avg_interactions'))
          || '{"manual": true}'::jsonb)
      else a.insights end,
    'updated_at', a.last_sync_at,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('day', h.day, 'followers', h.followers) order by h.day)
      from public.ig_followers_history h where h.day >= current_date - 90), '[]'::jsonb),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object('month', m.month, 'followers', m.followers, 'reach', m.reach, 'views', m.views,
        'engaged', m.engaged, 'er', m.er, 'reels_er', m.reels_er) order by m.month)
      from (select * from public.ig_monthly order by month desc limit 6) m), '[]'::jsonb),
    'top', coalesce((
      select jsonb_agg(t) from (
        select jsonb_build_object('permalink', m.permalink, 'thumbnail_url', m.thumbnail_url, 'media_type', m.media_type,
          'product_type', m.product_type, 'views', m.views, 'reach', m.reach, 'interactions', m.interactions,
          'likes', m.likes, 'comments', m.comments, 'posted_at', m.posted_at) t
        from (select * from public.ig_media where product_type <> 'STORY' order by posted_at desc limit 30) m
        order by coalesce(m.views, m.reach, m.interactions, m.likes, 0) desc
        limit 6) x), '[]'::jsonb)
  ) end
  from public.creator_settings s, public.ig_account a
  where s.id = 1 and a.id = 1;
$$;
grant execute on function public.public_insights() to anon, authenticated;
