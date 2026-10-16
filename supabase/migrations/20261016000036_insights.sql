-- Insights brands ask for, straight from Instagram: 30-day reach, views and engaged accounts (with the
-- change from the 30 days before), averages per format, follower growth, audience by country too,
-- and her top content. Shown on a shareable page (/insights) she can turn off.

alter table public.ig_account add column insights jsonb not null default '{}';
alter table public.creator_settings add column show_insights boolean not null default true;

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
    'demographics', a.demographics, 'insights', a.insights, 'updated_at', a.last_sync_at,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('day', h.day, 'followers', h.followers) order by h.day)
      from public.ig_followers_history h where h.day >= current_date - 90), '[]'::jsonb),
    'top', coalesce((
      select jsonb_agg(t) from (
        select jsonb_build_object('permalink', m.permalink, 'thumbnail_url', m.thumbnail_url, 'media_type', m.media_type,
          'product_type', m.product_type, 'views', m.views, 'reach', m.reach, 'interactions', m.interactions,
          'likes', m.likes, 'comments', m.comments, 'posted_at', m.posted_at) t
        from public.ig_media m
        where m.product_type <> 'STORY' and m.posted_at > now() - interval '90 days'
        order by coalesce(m.views, m.reach, m.interactions, 0) desc
        limit 6) x), '[]'::jsonb)
  ) end
  from public.creator_settings s, public.ig_account a
  where s.id = 1 and a.id = 1;
$$;
grant execute on function public.public_insights() to anon, authenticated;
