-- Her Reels engagement both ways, for the insights pages (hers in the app and the brands' /insights page): her own Reels
-- and her collab Reels, each over the last 10. Worked out live from her posts, so a post linked to a collab moves at once.

create or replace function public.public_insights()
returns jsonb
language sql
stable security definer
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
      from public.ig_followers_history h where h.creator_id = s.id and h.day >= current_date - 90), '[]'::jsonb),
    'top', coalesce((
      select jsonb_agg(t) from (
        select jsonb_build_object('permalink', m.permalink, 'thumbnail_url', m.thumbnail_url, 'media_type', m.media_type,
          'product_type', m.product_type, 'views', m.views, 'reach', m.reach, 'interactions', m.interactions,
          'likes', m.likes, 'comments', m.comments, 'posted_at', m.posted_at) t
        from (select * from public.ig_media where creator_id = s.id and product_type <> 'STORY' order by posted_at desc limit 30) m
        order by coalesce(m.views, m.reach, m.interactions, m.likes, 0) desc
        limit 6) x), '[]'::jsonb),
    -- Engagement on her last 10 Reels of each kind: her own, and collab posts (linked to a collab, or #ad / #collab
    -- in the caption's first line). Average interactions per Reel over her followers, Reels 3+ days old.
    'reels_split', (
      select jsonb_build_object(
        'own', jsonb_build_object('posts', count(*) filter (where not k.collab and k.n <= 10),
          'avg_interactions', round(avg(k.inter) filter (where not k.collab and k.n <= 10)),
          'er', case when a.followers > 0 then round(avg(k.inter) filter (where not k.collab and k.n <= 10) / a.followers * 100, 2) end),
        'collab', jsonb_build_object('posts', count(*) filter (where k.collab and k.n <= 10),
          'avg_interactions', round(avg(k.inter) filter (where k.collab and k.n <= 10)),
          'er', case when a.followers > 0 then round(avg(k.inter) filter (where k.collab and k.n <= 10) / a.followers * 100, 2) end))
      from (
        select r.inter, r.collab, row_number() over (partition by r.collab order by r.posted_at desc) as n
        from (
          select m.posted_at, coalesce(m.interactions, m.likes + m.comments)::numeric as inter,
            (exists (select 1 from public.collab_posts p where p.media_id = m.id)
              or split_part(coalesce(m.caption, ''), E'\n', 1) ~* '#(ad|collab|sponsored|paidpartnership|partner)([^a-z]|$)') as collab
          from public.ig_media m
          where m.creator_id = s.id and m.product_type <> 'STORY' and (m.product_type = 'REELS' or m.media_type = 'VIDEO')
            and m.posted_at < now() - interval '3 days' and coalesce(m.interactions, m.likes + m.comments) is not null
        ) r
      ) k)
  ) end
  from public.creator_settings s, public.ig_account a
  where s.id = private.page_creator() and a.id = s.id;
$$;

create or replace function public.my_insights()
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select case when not a.connected then null else jsonb_build_object(
    'display_name', s.display_name, 'handle', s.handle, 'niche', s.niche, 'city', s.city,
    'username', a.username, 'profile_picture_url', a.profile_picture_url,
    'followers', a.followers, 'media_count', a.media_count,
    'engagement_rate', a.engagement_rate, 'avg_views', a.avg_views, 'avg_reach', a.avg_reach,
    'demographics', a.demographics,
    'insights', case
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
      from public.ig_followers_history h where h.creator_id = s.id and h.day >= current_date - 90), '[]'::jsonb),
    'top', coalesce((
      select jsonb_agg(t) from (
        select jsonb_build_object('permalink', m.permalink, 'thumbnail_url', m.thumbnail_url, 'media_type', m.media_type,
          'product_type', m.product_type, 'views', m.views, 'reach', m.reach, 'interactions', m.interactions,
          'likes', m.likes, 'comments', m.comments, 'posted_at', m.posted_at) t
        from (select * from public.ig_media where creator_id = s.id and product_type <> 'STORY' order by posted_at desc limit 30) m
        order by coalesce(m.views, m.reach, m.interactions, m.likes, 0) desc
        limit 6) x), '[]'::jsonb),
    -- Engagement on her last 10 Reels of each kind: her own, and collab posts (linked to a collab, or #ad / #collab
    -- in the caption's first line). Average interactions per Reel over her followers, Reels 3+ days old.
    'reels_split', (
      select jsonb_build_object(
        'own', jsonb_build_object('posts', count(*) filter (where not k.collab and k.n <= 10),
          'avg_interactions', round(avg(k.inter) filter (where not k.collab and k.n <= 10)),
          'er', case when a.followers > 0 then round(avg(k.inter) filter (where not k.collab and k.n <= 10) / a.followers * 100, 2) end),
        'collab', jsonb_build_object('posts', count(*) filter (where k.collab and k.n <= 10),
          'avg_interactions', round(avg(k.inter) filter (where k.collab and k.n <= 10)),
          'er', case when a.followers > 0 then round(avg(k.inter) filter (where k.collab and k.n <= 10) / a.followers * 100, 2) end))
      from (
        select r.inter, r.collab, row_number() over (partition by r.collab order by r.posted_at desc) as n
        from (
          select m.posted_at, coalesce(m.interactions, m.likes + m.comments)::numeric as inter,
            (exists (select 1 from public.collab_posts p where p.media_id = m.id)
              or split_part(coalesce(m.caption, ''), E'\n', 1) ~* '#(ad|collab|sponsored|paidpartnership|partner)([^a-z]|$)') as collab
          from public.ig_media m
          where m.creator_id = s.id and m.product_type <> 'STORY' and (m.product_type = 'REELS' or m.media_type = 'VIDEO')
            and m.posted_at < now() - interval '3 days' and coalesce(m.interactions, m.likes + m.comments) is not null
        ) r
      ) k)
  ) end
  from public.creator_settings s, public.ig_account a
  where s.id = public.current_creator() and a.id = s.id;
$$;
