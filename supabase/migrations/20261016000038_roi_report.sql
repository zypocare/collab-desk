-- Results report as an ROI report: what the brand invested, and today's numbers for the collab's posts
-- (the report itself is a snapshot from 7 days after posting).
create or replace function public.public_report(p_token text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select r.data || jsonb_build_object(
    'created_at', r.created_at,
    'type', c.type,
    'invested', case when c.type = 'barter' then 0 else coalesce(nullif(c.pay_received, 0), c.fee) end,
    'product_value', case when c.type = 'paid' then 0 else c.product_value end,
    'usage', c.usage,
    'now', (
      select jsonb_build_object(
        'views', sum(m.views), 'reach', sum(m.reach), 'likes', sum(m.likes), 'comments', sum(m.comments),
        'saves', sum(m.saves), 'shares', sum(m.shares),
        'interactions', sum(coalesce(m.interactions, coalesce(m.likes, 0) + coalesce(m.comments, 0))),
        'updated_at', max(m.insights_at))
      from public.collab_posts p join public.ig_media m on m.id = p.media_id
      where p.collab_id = c.id))
  from public.brand_reports r join public.collabs c on c.id = r.collab_id
  where r.public_token = p_token and length(p_token) >= 24;
$$;
grant execute on function public.public_report(text) to anon, authenticated;
