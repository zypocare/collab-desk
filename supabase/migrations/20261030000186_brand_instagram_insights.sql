-- A brand's own Instagram, synced like a creator's (brand-ig-sync): recent posts with their figures, the
-- last 30 days, averages per format, follower history and the audience. For the brand's profile, Insights
-- and Grow pages.
alter table public.brand_ig
  add column if not exists media jsonb not null default '[]'::jsonb,
  add column if not exists history jsonb not null default '[]'::jsonb,
  add column if not exists insights jsonb not null default '{}'::jsonb,
  add column if not exists demographics jsonb not null default '{}'::jsonb,
  add column if not exists demographics_at timestamptz,
  add column if not exists engagement_rate numeric,
  add column if not exists last_error text not null default '';

-- Who may ask for a fresh sync: anyone on a brand's team (the team's owner is whose account it is).
create or replace function public.brand_sync_owner()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select public.brand_owner() where auth.uid() is not null and not public.is_creator();
$$;
revoke execute on function public.brand_sync_owner() from public, anon;
grant execute on function public.brand_sync_owner() to authenticated;

-- What the brand's team sees: the account as before, plus the synced numbers.
create or replace function public.brand_ig_get()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('username', g.username, 'name', g.name, 'picture', g.picture, 'followers', g.followers,
    'media_count', g.media_count, 'connected_at', g.connected_at, 'synced_at', g.synced_at,
    'media', g.media, 'history', g.history, 'insights', g.insights, 'demographics', g.demographics,
    'engagement_rate', g.engagement_rate, 'last_error', g.last_error)
  from public.brand_ig g where g.owner = public.brand_owner() and auth.uid() is not null;
$$;
revoke execute on function public.brand_ig_get() from public, anon;
grant execute on function public.brand_ig_get() to authenticated;

-- Every night, after the creators' sync.
select cron.schedule('brand-ig-sync', '45 0 * * *', $$select private.call_function('brand-ig-sync')$$);
