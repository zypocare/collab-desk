-- Miracle for many creators, part 11: the admin panel. One place to see every creator and brand,
-- how Miracle is doing, and the sign-ups waiting for approval. Only Miracle admins can read it.

-- Totals across Miracle.
create or replace function public.admin_overview()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_app_admin() then
    raise exception 'Only Miracle admins can see this.';
  end if;
  return jsonb_build_object(
    'creators', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.creator_settings group by status) x),
    'brands', (select count(*) from public.brands),
    'brand_logins', (select count(distinct m.profile_id) from public.brand_members m),
    'collabs', (select count(*) from public.collabs),
    'collabs_this_month', (select count(*) from public.collabs where created_at >= v_month),
    'paid_total', (select coalesce(sum(total), 0) from public.invoices where status = 'paid'),
    'paid_this_month', (select coalesce(sum(total), 0) from public.invoices where status = 'paid' and paid_on >= v_month),
    'emails_today', (select count(*) from public.outbox where created_at >= now() - interval '1 day' and status = 'sent'),
    'emails_failed', (select count(*) from public.outbox where status = 'failed' and created_at >= now() - interval '7 days'),
    'pending', (select count(*) from public.creator_settings where status = 'pending')
  );
end;
$$;
revoke execute on function public.admin_overview() from anon;

-- Every creator, with what they have done on Miracle.
create or replace function public.admin_creators()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Only Miracle admins can see this.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.display_name, 'handle', s.handle, 'niche', s.niche,
      'city', s.city, 'email', s.creator_email, 'note', s.request_note, 'status', s.status, 'requested_at', s.requested_at,
      'approved_at', s.approved_at, 'created_at', s.created_at,
      'collabs', (select count(*) from public.collabs c where c.creator_id = s.id),
      'brands', (select count(*) from public.brands b where b.creator_id = s.id),
      'paid', (select coalesce(sum(i.total), 0) from public.invoices i where i.creator_id = s.id and i.status = 'paid'),
      'team', (select count(*) from public.team_members t where t.creator_id = s.id),
      'instagram', exists (select 1 from public.ig_token g where g.id = s.id),
      'last_active', greatest(
        (select max(u.last_sign_in_at) from auth.users u where lower(u.email) = lower(s.creator_email)),
        (select max(t.last_seen_at) from public.team_members t where t.creator_id = s.id)))
      order by (s.status = 'pending') desc, s.requested_at desc nulls last, s.id)
    from public.creator_settings s), '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_creators() from anon;

-- Every brand across all creators (newest activity first), optionally filtered by name.
create or replace function public.admin_brands(p_search text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.is_app_admin() then
    raise exception 'Only Miracle admins can see this.';
  end if;
  return coalesce((
    select jsonb_agg(x order by x ->> 'last_collab' desc nulls last, x ->> 'name')
    from (
      select jsonb_build_object('id', b.id, 'name', b.name, 'category', b.category, 'instagram', b.instagram, 'website', b.website,
        'creator', jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.display_name),
        'collabs', (select count(*) from public.collabs c where c.brand_id = b.id),
        'paid', (select coalesce(sum(i.total), 0) from public.invoices i join public.collabs c on c.id = i.collab_id where c.brand_id = b.id and i.status = 'paid'),
        'logins', (select count(*) from public.brand_members m where m.brand_id = b.id),
        'last_collab', (select max(c.created_at) from public.collabs c where c.brand_id = b.id),
        'created_at', b.created_at) as x
      from public.brands b join public.creator_settings s on s.id = b.creator_id
      where v_q is null or b.name ilike '%' || v_q || '%' or s.slug ilike '%' || v_q || '%'
      limit 500
    ) t), '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_brands(text) from anon;

-- Is the signed-in person an admin (the app shows the panel's link only to them).
grant execute on function public.is_app_admin() to authenticated;
