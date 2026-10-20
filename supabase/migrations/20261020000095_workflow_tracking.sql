-- Collaboration lifecycle and one production record for each promised piece of content.
alter table public.collabs
  add column lifecycle_reason text not null default '' check (length(lifecycle_reason) <= 600),
  add column resume_on date,
  add column resume_stage public.collab_stage,
  add column paused_at timestamptz,
  add column cancelled_at timestamptz;

create or replace function public.stage_label(s public.collab_stage)
returns text language sql immutable set search_path = '' as $$
  select case s
    when 'request' then 'Request received' when 'negotiating' then 'In discussion'
    when 'confirmed' then 'Terms agreed' when 'creating' then 'Content in production'
    when 'live' then 'Live on Instagram' when 'wrapped' then 'Wrapped up'
    when 'declined' then 'Not going ahead' when 'paused' then 'Paused'
    when 'cancelled' then 'Cancelled' end;
$$;

create or replace function private.collab_lifecycle_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.stage is not distinct from old.stage then return new; end if;
  if new.stage in ('paused', 'cancelled') then
    if btrim(new.lifecycle_reason) = '' then raise exception 'Add a reason before pausing or cancelling.'; end if;
    if old.stage in ('wrapped', 'declined', 'cancelled') then raise exception 'Reopen this collaboration before changing its lifecycle.'; end if;
    new.resume_stage := case when old.stage = 'paused' then old.resume_stage else old.stage end;
    if new.stage = 'paused' then
      new.paused_at := now();
      if new.resume_on < (now() at time zone 'Asia/Kolkata')::date then raise exception 'The review date cannot be in the past.'; end if;
    else
      new.cancelled_at := now();
      new.resume_on := null;
    end if;
  elsif old.stage in ('paused', 'cancelled') then
    if new.stage is distinct from coalesce(old.resume_stage, 'request'::public.collab_stage) then
      raise exception 'Resume at the previous stage first.';
    end if;
    new.resume_on := null;
    new.paused_at := null;
    new.cancelled_at := null;
    new.resume_stage := null;
    new.lifecycle_reason := '';
  end if;
  -- Settlement is separate from production; paid content cannot wrap while pieces remain open.
  if new.stage = 'wrapped' and exists (select 1 from public.deliverables d where d.collab_id = new.id and not d.done) then
    if old.stage = 'live' and new.pay_status = 'paid' and old.pay_status is distinct from 'paid' then
      new.stage := old.stage;
    else raise exception 'Finish every deliverable before wrapping this collaboration.';
    end if;
  end if;
  return new;
end;
$$;
create trigger a_collab_lifecycle before update on public.collabs
  for each row execute function private.collab_lifecycle_guard();

create table public.deliverable_items (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  collab_id uuid not null references public.collabs(id) on delete cascade,
  position integer not null check (position > 0),
  status text not null default 'planned' check (status in ('planned', 'creating', 'in_review', 'approved', 'published', 'delivered')),
  due_date date,
  assigned_to text not null default '' check (length(assigned_to) <= 120),
  draft_id uuid references public.drafts(id) on delete set null,
  media_id text references public.ig_media(id) on delete set null,
  completed_at timestamptz,
  unique (deliverable_id, position)
);
create index deliverable_items_collab_idx on public.deliverable_items(collab_id);
create index deliverable_items_draft_idx on public.deliverable_items(draft_id);
create index deliverable_items_media_idx on public.deliverable_items(media_id);
create unique index deliverable_items_post_once_idx on public.deliverable_items(collab_id, media_id) where media_id is not null;
alter table public.deliverable_items enable row level security;
create policy "production team reads items" on public.deliverable_items for select to authenticated
  using ((select public.team_role()) in ('owner', 'manager', 'assistant'));
create policy "production team updates items" on public.deliverable_items for update to authenticated
  using ((select public.team_role()) in ('owner', 'manager', 'assistant'))
  with check ((select public.team_role()) in ('owner', 'manager', 'assistant'));
grant select, update on public.deliverable_items to authenticated;
grant all on public.deliverable_items to service_role;

-- Preserve existing completed work. Future posts only complete the piece they are linked to.
insert into public.deliverable_items(deliverable_id, collab_id, position, status, completed_at)
select d.id, d.collab_id, n,
  case when d.done then case when d.kind in ('UGC video', 'Shoot') then 'delivered' else 'published' end else 'planned' end,
  case when d.done then now() end
from public.deliverables d cross join lateral generate_series(1, d.qty) n;

create or replace function private.deliverable_item_guard()
returns trigger language plpgsql set search_path = '' as $$
declare d public.deliverables; c public.collabs;
begin
  select * into d from public.deliverables where id = new.deliverable_id for update;
  if not found or new.collab_id <> d.collab_id then raise exception 'This item must belong to its deliverable.'; end if;
  if tg_op = 'UPDATE' and (new.deliverable_id <> old.deliverable_id or new.collab_id <> old.collab_id or new.position <> old.position) then
    raise exception 'The item identity cannot be changed.';
  end if;
  select * into c from public.collabs where id = new.collab_id;
  if c.stage in ('paused', 'cancelled') and tg_op = 'UPDATE'
     and (new.status is distinct from old.status or new.media_id is distinct from old.media_id or new.draft_id is distinct from old.draft_id) then
    raise exception 'Resume this collaboration before updating production progress.';
  end if;
  if new.draft_id is not null and not exists (select 1 from public.drafts where id = new.draft_id and collab_id = new.collab_id) then
    raise exception 'Choose a draft from this collaboration.';
  end if;
  if new.media_id is not null and not exists (select 1 from public.collab_posts where media_id = new.media_id and collab_id = new.collab_id) then
    raise exception 'Link the post to this collaboration first.';
  end if;
  if new.status in ('published', 'delivered') then
    new.completed_at := case when tg_op = 'UPDATE' and old.status in ('published', 'delivered') then old.completed_at else now() end;
  else new.completed_at := null; end if;
  return new;
end;
$$;
create trigger deliverable_item_guard before insert or update on public.deliverable_items
  for each row execute function private.deliverable_item_guard();

create or replace function private.deliverable_items_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.qty < old.qty and exists (
    select 1 from public.deliverable_items where deliverable_id = new.id and position > new.qty
      and (status <> 'planned' or draft_id is not null or media_id is not null)
  ) then raise exception 'Keep the quantity for work already started. Clear its progress before removing it.'; end if;
  delete from public.deliverable_items where deliverable_id = new.id and position > new.qty;
  insert into public.deliverable_items(deliverable_id, collab_id, position)
    select new.id, new.collab_id, n from generate_series(1, new.qty) n on conflict (deliverable_id, position) do nothing;
  return null;
end;
$$;
create trigger deliverable_items_sync after insert or update of qty on public.deliverables
  for each row execute function private.deliverable_items_sync();

create or replace function private.deliverable_items_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare parent uuid := coalesce(new.deliverable_id, old.deliverable_id); cid uuid := coalesce(new.collab_id, old.collab_id);
begin
  update public.deliverables d set done = (
    (select count(*) from public.deliverable_items x where x.deliverable_id = d.id) = d.qty
    and not exists (select 1 from public.deliverable_items x where x.deliverable_id = d.id and x.status not in ('published', 'delivered'))
  ) where d.id = parent;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.collab_events(collab_id, actor, kind, text, visible_to_brand)
    select cid, auth.uid(), 'deliverable', d.kind || ' ' || new.position || ': ' || replace(new.status, '_', ' '), true
    from public.deliverables d where d.id = parent;
  end if;
  return null;
end;
$$;
create trigger deliverable_items_progress after insert or update or delete on public.deliverable_items
  for each row execute function private.deliverable_items_progress();

-- The legacy group flag remains a derived summary, including writes from older clients.
create or replace function private.deliverable_done_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.done := (select count(*) = new.qty and bool_and(status in ('published', 'delivered'))
    from public.deliverable_items where deliverable_id = new.id);
  return new;
end;
$$;
create trigger deliverable_done_guard before update of done on public.deliverables
  for each row execute function private.deliverable_done_guard();

create or replace function private.draft_item_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'changes') then
    update public.deliverable_items set status = case when new.status = 'approved' then 'approved' else 'creating' end
      where draft_id = new.id and status not in ('published', 'delivered');
  end if;
  return null;
end;
$$;
create trigger draft_item_progress after update of status on public.drafts
  for each row execute function private.draft_item_progress();

create or replace function private.production_write_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.collabs where id = new.collab_id and stage in ('paused', 'cancelled')) then
    raise exception 'Resume this collaboration before scheduling or sharing production work.';
  end if;
  return new;
end;
$$;
create trigger production_write_guard before insert on public.drafts
  for each row execute function private.production_write_guard();
create trigger production_write_guard before insert on public.scheduled_posts
  for each row execute function private.production_write_guard();

-- A publisher may have started preparing a remote container just before the pause.
-- Its later database update must never restart the held schedule.
create or replace function private.scheduled_post_lifecycle_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare current_stage public.collab_stage;
begin
  select stage into current_stage from public.collabs where id = new.collab_id;
  if current_stage in ('paused', 'cancelled') and new.status in ('scheduled', 'publishing') then
    new.status := case when current_stage = 'paused' then 'on_hold' else 'cancelled' end;
    new.error := 'Collaboration is ' || current_stage || '. Review the schedule after resuming.';
  end if;
  return new;
end;
$$;
create trigger scheduled_post_lifecycle_guard before update on public.scheduled_posts
  for each row execute function private.scheduled_post_lifecycle_guard();

-- Link one matching piece, never every promised post. Deleting the link reopens that piece.
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
create trigger post_item_progress after insert or delete on public.collab_posts
  for each row execute function private.post_item_progress();

alter table public.scheduled_posts drop constraint scheduled_posts_status_check;
alter table public.scheduled_posts add constraint scheduled_posts_status_check
  check (status in ('scheduled', 'publishing', 'published', 'failed', 'cancelled', 'on_hold'));
create or replace function private.lifecycle_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.stage = old.stage then return null; end if;
  if new.stage in ('paused', 'cancelled') then
    update public.scheduled_posts set status = case when new.stage = 'paused' then 'on_hold' else 'cancelled' end,
      error = case when new.stage = 'paused' then 'Collaboration paused. Review the time and schedule again after resuming.' else 'Collaboration cancelled.' end
      where collab_id = new.id and status in ('scheduled', 'publishing', 'on_hold');
    insert into public.collab_events(collab_id, actor, kind, text, visible_to_brand)
      values (new.id, auth.uid(), 'lifecycle', public.stage_label(new.stage) || ': ' || new.lifecycle_reason ||
        case when new.resume_on is not null then ' (review on ' || new.resume_on || ')' else '' end, true);
  end if;
  return null;
end;
$$;
create trigger lifecycle_after_change after update of stage on public.collabs
  for each row execute function private.lifecycle_after_change();

-- Stop already queued work reminders as well as future cron reminders. Financial records remain.
create or replace function private.hold_work_notice()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('quote_nudge', 'draft_nudge', 'post_reminder', 'payment_reminder', 'track_invite', 'brief_ask')
    and exists (select 1 from public.collabs where code = new.payload->>'code' and stage in ('paused', 'cancelled')) then
    new.status := 'skipped'; new.last_error := 'Collaboration is paused or cancelled.';
  end if;
  return new;
end;
$$;
create trigger hold_work_notice before insert or update of status on public.outbox
  for each row execute function private.hold_work_notice();

alter publication supabase_realtime add table public.deliverable_items;
