-- Sync Brand-side creator engagement rate with the Creator's public profile engagement rate.
-- On the creator's public profile (<ProfileEngagement />), engagement rate is computed from
-- 30-day Instagram Insights: (accounts_engaged / reach) * 100, rounded to 1 decimal place
-- (e.g. 10.9%). Previously private.creator_card() returned ig_account.engagement_rate
-- (follower-based, e.g. 1.8%), causing a mismatch between what creators and brands see.

create or replace function private.creator_card(p_id integer)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'slug', s.slug,
    'name', s.display_name,
    'niche', s.niche,
    'city', s.city,
    'handle', s.handle,
    'accepting', s.accepting,
    'kinds', to_jsonb(s.offered_kinds),
    'languages', to_jsonb(s.content_languages),
    'photo', case when a.connected then nullif(a.profile_picture_url, '') end,
    'followers', case when a.connected then a.followers end,
    'engagement', case when a.connected then coalesce(
      case
        when (a.insights -> 'totals' ->> 'reach') ~ '^\d+$'
         and (a.insights -> 'totals' ->> 'accounts_engaged') ~ '^\d+$'
         and (a.insights -> 'totals' ->> 'reach')::numeric > 0
         and (a.insights -> 'totals' ->> 'accounts_engaged')::numeric >= 0
         and (a.insights -> 'totals' ->> 'accounts_engaged')::numeric <= (a.insights -> 'totals' ->> 'reach')::numeric
        then round(
          ((a.insights -> 'totals' ->> 'accounts_engaged')::numeric * 100.0)
          / (a.insights -> 'totals' ->> 'reach')::numeric,
          1
        )
      end,
      a.engagement_rate
    ) end,
    'avg_views', case when a.connected then a.avg_views end,
    'trust', private.creator_trust(s.id),
    'health', case when a.connected and a.health ? 'checks' then a.health end
  )
  from public.creator_settings s
  left join public.ig_account a on a.id = s.id
  where s.id = p_id;
$$;
revoke execute on function private.creator_card(integer) from public, anon, authenticated;
