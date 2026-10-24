-- Audience health and brand safety. The nightly Instagram sync works it out from a creator's own numbers
-- (real reach, engagement for her size, steady growth, audience in India) and an AI read of her recent
-- captions, and keeps it with her Instagram account. She sees it in Grow; brands see it in Discover, on
-- her applications to their briefs and on their requests with her. Nobody can edit it.

alter table public.ig_account add column if not exists health jsonb not null default '{}';

-- The card brands see (Discover, applications, the brand's creators) now carries it.
create or replace function private.creator_card(p_id integer)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.display_name, 'niche', s.niche, 'city', s.city,
    'handle', s.handle, 'accepting', s.accepting, 'kinds', to_jsonb(s.offered_kinds), 'languages', to_jsonb(s.content_languages),
    'photo', case when a.connected then nullif(a.profile_picture_url, '') end,
    'followers', case when a.connected then a.followers end,
    'engagement', case when a.connected then a.engagement_rate end,
    'avg_views', case when a.connected then a.avg_views end,
    'trust', private.creator_trust(s.id),
    'health', case when a.connected and a.health ? 'checks' then a.health end)
  from public.creator_settings s left join public.ig_account a on a.id = s.id
  where s.id = p_id;
$$;
revoke execute on function private.creator_card(integer) from public, anon, authenticated;

-- One creator's check, for a brand that may reach her (she's listed, or they already work together),
-- and for her and her team. With no creator given: the creator whose address the page is on.
create or replace function public.creator_health(p_creator integer default null)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when a.connected and a.health ? 'checks' then a.health else jsonb_build_object('connected', coalesce(a.connected, false)) end
  from public.creator_settings s left join public.ig_account a on a.id = s.id
  where s.id = coalesce(p_creator, private.page_creator())
    and auth.uid() is not null
    and (private.brand_can_reach(s.id) or s.id = public.current_creator());
$$;
revoke execute on function public.creator_health(integer) from public, anon;
grant execute on function public.creator_health(integer) to authenticated;
