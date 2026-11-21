-- Fix duplicate key violation on deliverable_items_post_once_idx when manually linking a post
-- to a collab with multiple deliverables of the same kind (e.g. 3 Stories or 2 Reels).
-- Cause: After migration 000176 added AFTER INSERT trigger `collab_post_to_item` (which runs
-- alphabetically before `post_item_progress`), `collab_post_to_item` attaches `new.media_id` to
-- item #1, and then `post_item_progress` tried to attach the same `new.media_id` to item #2.

create or replace function private.post_item_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare item uuid; target_kind text;
begin
  if tg_op = 'DELETE' then
    update public.deliverable_items set media_id = null, status = 'approved'
      where collab_id = old.collab_id and media_id = old.media_id;
    return null;
  end if;
  if exists (select 1 from public.collabs where id = new.collab_id and stage in ('paused', 'cancelled')) then
    raise exception 'Resume this collaboration before linking a post.';
  end if;
  -- Already attached to a deliverable item (for example by collab_post_to_item on manual links).
  if exists (select 1 from public.deliverable_items where collab_id = new.collab_id and media_id = new.media_id) then
    return null;
  end if;
  select case when m.product_type = 'STORY' then 'Story' when m.product_type = 'REELS' then 'Reel'
    when m.media_type = 'CAROUSEL_ALBUM' then 'Carousel' else 'Static post' end into target_kind
    from public.ig_media m where m.id = new.media_id;
  select x.id into item from public.deliverable_items x join public.deliverables d on d.id = x.deliverable_id
    where x.collab_id = new.collab_id and d.kind = target_kind and x.status not in ('published', 'delivered') and x.media_id is null
    order by x.due_date nulls last, d.position, x.position limit 1 for update of x;
  if item is not null then update public.deliverable_items set status = 'published', media_id = new.media_id where id = item; end if;
  return null;
end;
$$;
