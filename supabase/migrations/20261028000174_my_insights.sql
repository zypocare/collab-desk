-- A creator's own insights, all of them, for the Insights screen in her app (Grow > All your insights). The same
-- numbers brands see on her /insights page (public_insights), but for her account whatever she shows brands: it works
-- with "show insights to brands" off, and keeps the story numbers she may hide from them.
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
        limit 6) x), '[]'::jsonb)
  ) end
  from public.creator_settings s, public.ig_account a
  where s.id = public.current_creator() and a.id = s.id;
$$;
revoke execute on function public.my_insights() from public, anon;
grant execute on function public.my_insights() to authenticated;
