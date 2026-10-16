-- WhatsApp hand-off: her optional WhatsApp number for brands (click-to-chat links, free).
alter table public.creator_settings add column whatsapp text not null default '';

create or replace function public.public_page()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'app_name', s.app_name,
    'display_name', s.display_name,
    'handle', s.handle,
    'niche', s.niche,
    'city', s.city,
    'followers', s.followers,
    'engagement', s.engagement,
    'reply_time', s.reply_time,
    'accepting', s.accepting,
    'offered', to_jsonb(s.offered_kinds),
    'whatsapp', nullif(regexp_replace(s.whatsapp, '\D', '', 'g'), ''),
    'rates', case when s.show_rates then s.rates else null end,
    'results', case when s.show_results then coalesce((
      select jsonb_agg(r order by (r ->> 'views')::bigint desc nulls last)
      from (
        select distinct on (c.id) jsonb_build_object(
          'brand', b.name, 'views', m.views, 'reach', m.reach, 'likes', m.likes, 'kind', m.product_type,
          'permalink', m.permalink, 'thumbnail', m.thumbnail_url, 'posted_at', m.posted_at) as r
        from public.collab_posts p
        join public.ig_media m on m.id = p.media_id
        join public.collabs c on c.id = p.collab_id
        join public.brands b on b.id = c.brand_id
        where c.stage in ('live', 'wrapped') and coalesce(m.views, m.reach, 0) > 0
        order by c.id, m.views desc nulls last
        limit 40
      ) t
    ), '[]'::jsonb) else '[]'::jsonb end,
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object('rating', v.rating, 'text', v.body, 'name', v.name, 'brand', b.name) order by v.created_at desc)
      from (select * from public.brand_reviews where shown order by created_at desc limit 8) v
      join public.collabs c on c.id = v.collab_id join public.brands b on b.id = c.brand_id
    ), '[]'::jsonb),
    'availability', case when s.show_availability then public.availability() else null end,
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'description', k.description, 'items', k.items,
        'price', k.price, 'badge', k.badge) order by k.position, k.created_at)
      from public.packages k where k.active
    ), '[]'::jsonb),
    'barter', jsonb_build_object(
      'mode', s.barter_mode,
      'min_value', s.barter_min_value,
      'reply_time', s.barter_reply_time,
      'slots_left', case when s.barter_monthly_cap > 0 then greatest(0, s.barter_monthly_cap - public.barter_slots_used()) else null end),
    'worked_with', coalesce((
      select jsonb_agg(w.name order by w.name)
      from (
        select distinct b.name
        from public.collabs c join public.brands b on b.id = c.brand_id
        where c.stage in ('live', 'wrapped')
        limit 24
      ) w
    ), '[]'::jsonb),
    'instagram', case when a.connected then jsonb_build_object(
      'username', a.username, 'followers', a.followers, 'engagement_rate', a.engagement_rate,
      'avg_views', a.avg_views, 'avg_reach', a.avg_reach, 'demographics', a.demographics,
      'profile_picture_url', a.profile_picture_url, 'updated_at', a.last_sync_at) else null end
  )
  from public.creator_settings s, public.ig_account a
  where s.id = 1 and a.id = 1;
$$;
