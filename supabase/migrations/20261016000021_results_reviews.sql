-- Proof on her page: results from past collabs (real views and reach) and short brand reviews.
-- Reviews are asked for by email when a collab wraps (one-tap link, no sign-in); 4 and 5 star
-- reviews show automatically, and she can hide or show any of them.

alter table public.creator_settings add column show_results boolean not null default true;

create table public.brand_reviews (
  id         uuid primary key default gen_random_uuid(),
  collab_id  uuid not null unique references public.collabs(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  body       text not null default '' check (char_length(body) <= 300),
  name       text not null default '',
  shown      boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.brand_reviews enable row level security;
create policy "creator manages reviews" on public.brand_reviews
  for all to authenticated using (public.is_creator()) with check (public.is_creator());

-- Links can now also be for leaving a review (ref = the collab).
alter table private.action_links drop constraint if exists action_links_kind_check;
alter table private.action_links add constraint action_links_kind_check check (kind in ('quote', 'draft', 'review'));

create or replace function private.outbox_add_action()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ref uuid;
  v_kind text;
  v_token text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if new.kind = 'quote_sent' then
    v_kind := 'quote';
    select q.id into v_ref from public.quotes q join public.collabs c on c.id = q.collab_id
    where c.code = new.payload ->> 'code' and q.status = 'sent' order by q.version desc limit 1;
  elsif new.kind = 'draft_ready' then
    v_kind := 'draft';
    select d.id into v_ref from public.drafts d join public.collabs c on c.id = d.collab_id
    where c.code = new.payload ->> 'code' and d.status = 'pending' order by d.round desc limit 1;
  elsif new.kind = 'review_request' then
    v_kind := 'review';
    select c.id into v_ref from public.collabs c where c.code = new.payload ->> 'code';
  end if;
  if v_ref is not null then
    insert into private.action_links (token, kind, ref_id, email, expires_at)
    values (v_token, v_kind, v_ref, new.to_email, now() + case when v_kind = 'review' then interval '60 days' else interval '30 days' end);
    new.payload := new.payload || jsonb_build_object('action', v_token);
  end if;
  return new;
end;
$$;
drop trigger if exists outbox_add_action on public.outbox;
create trigger outbox_add_action
  before insert on public.outbox
  for each row when (new.kind in ('quote_sent', 'draft_ready', 'review_request'))
  execute function private.outbox_add_action();

-- When a collab wraps, ask the brand for a review (once).
create or replace function public.collabs_ask_review()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  b public.brands;
begin
  if new.stage = 'wrapped' and old.stage is distinct from 'wrapped' and new.contact_email <> ''
     and not exists (select 1 from public.brand_reviews where collab_id = new.id)
     and not exists (select 1 from public.outbox where kind = 'review_request' and payload ->> 'code' = new.code) then
    select * into b from public.brands where id = new.brand_id;
    insert into public.outbox (kind, to_email, payload)
    values ('review_request', new.contact_email, jsonb_build_object('code', new.code, 'brand', b.name, 'contact', new.contact_name));
  end if;
  return null;
end;
$$;
create trigger collabs_ask_review
  after update of stage on public.collabs
  for each row execute function public.collabs_ask_review();

-- Review link: what it's for, and leaving the review.
create or replace function public.review_info(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  a private.action_links;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  select * into a from private.action_links where token = p_token and kind = 'review';
  if a.token is null then return jsonb_build_object('state', 'missing'); end if;
  select * into c from public.collabs where id = a.ref_id;
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = 1;
  return jsonb_build_object(
    'state', case when a.used_at is not null or exists (select 1 from public.brand_reviews where collab_id = c.id) then 'used'
                  when a.expires_at < now() then 'expired' else 'open' end,
    'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'creator', s.display_name);
end;
$$;
grant execute on function public.review_info(text) to anon, authenticated;

create or replace function public.review_submit(p_token text, p_rating integer, p_body text, p_name text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  a private.action_links;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
begin
  select * into a from private.action_links where token = p_token and kind = 'review' for update;
  if a.token is null then raise exception 'This link is not valid.'; end if;
  if a.used_at is not null then raise exception 'Thanks, your review is already in.'; end if;
  if a.expires_at < now() then raise exception 'This link has expired.'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Choose 1 to 5 stars.'; end if;
  select * into c from public.collabs where id = a.ref_id;
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = 1;

  insert into public.brand_reviews (collab_id, rating, body, name, shown)
  values (c.id, p_rating, left(btrim(coalesce(p_body, '')), 300), left(coalesce(nullif(btrim(p_name), ''), c.contact_name), 80), p_rating >= 4)
  on conflict (collab_id) do nothing;
  update private.action_links set used_at = now() where token = p_token;
  insert into public.collab_events (collab_id, kind, text) values (c.id, 'review', format('%s left a %s-star review', b.name, p_rating));
  insert into public.outbox (kind, to_email, payload) values ('review_received', s.creator_email,
    jsonb_build_object('code', c.code, 'brand', b.name, 'rating', p_rating, 'body', left(btrim(coalesce(p_body, '')), 300)));
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.review_submit(text, integer, text, text) to anon, authenticated;

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
