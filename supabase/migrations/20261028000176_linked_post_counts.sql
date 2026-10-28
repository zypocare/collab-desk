-- A post she links to a collab herself counts as one of its deliverables. It's attached to a free item of its kind
-- (a Reel to a Reel, a carousel to a Carousel, an image to a Static post, a Story to a Story), and when there's no free
-- one the deliverable is added, or its quantity goes up: what she posted is what was delivered. (DesiClans: the deal
-- went in as 1 Reel by mistake; she linked 2 Reels and a carousel, and the collab still said 1 Reel.) Posts the app
-- matched on its own (by date or caption) don't change the deliverables.
create or replace function private.attach_post(p_collab uuid, p_media text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.ig_media;
  v_kind text;
  v_deliv uuid;
  v_item uuid;
begin
  -- Already one of this collab's items.
  if exists (select 1 from public.deliverable_items x where x.collab_id = p_collab and x.media_id = p_media) then return; end if;
  select * into m from public.ig_media where id = p_media;
  if not found then return; end if;
  v_kind := case
    when m.product_type = 'STORY' then 'Story'
    when m.product_type = 'REELS' or m.media_type = 'VIDEO' then 'Reel'
    when m.media_type = 'CAROUSEL_ALBUM' then 'Carousel'
    else 'Static post' end;
  select d.id into v_deliv from public.deliverables d where d.collab_id = p_collab and d.kind = v_kind order by d.position limit 1 for update;
  if v_deliv is null then
    insert into public.deliverables (collab_id, kind, qty, position, creator_id)
    values (p_collab, v_kind, 1, coalesce((select max(position) + 1 from public.deliverables where collab_id = p_collab), 0),
            (select creator_id from public.collabs where id = p_collab))
    returning id into v_deliv;
  end if;
  select x.id into v_item from public.deliverable_items x where x.deliverable_id = v_deliv and x.media_id is null order by x.position limit 1;
  if v_item is null then
    -- One more of that kind (the quantity trigger adds its item).
    update public.deliverables set qty = qty + 1 where id = v_deliv;
    select x.id into v_item from public.deliverable_items x where x.deliverable_id = v_deliv and x.media_id is null order by x.position desc limit 1;
  end if;
  if v_item is not null then
    update public.deliverable_items set media_id = p_media, status = case when status = 'delivered' then status else 'published' end where id = v_item;
  end if;
end;
$$;
revoke all on function private.attach_post(uuid, text) from public, anon, authenticated;

create or replace function private.collab_post_to_item()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.matched_by = 'manual' then perform private.attach_post(new.collab_id, new.media_id); end if;
  return null;
end;
$$;
revoke all on function private.collab_post_to_item() from public, anon, authenticated;

drop trigger if exists collab_post_to_item on public.collab_posts;
create trigger collab_post_to_item after insert on public.collab_posts
  for each row execute function private.collab_post_to_item();

-- The posts she linked before this: counted the same way, oldest first.
do $$
declare r record;
begin
  for r in
    select p.collab_id, p.media_id from public.collab_posts p join public.ig_media m on m.id = p.media_id
    where p.matched_by = 'manual'
    order by m.posted_at
  loop
    perform private.attach_post(r.collab_id, r.media_id);
  end loop;
end $$;
