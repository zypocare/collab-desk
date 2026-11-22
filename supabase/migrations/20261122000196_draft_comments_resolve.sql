-- Add resolved state to draft_comments and an authorized RPC so both Brand and Creator
-- can mark timestamped draft notes resolved or reopened.

alter table public.draft_comments
  add column if not exists resolved boolean not null default false;

create or replace function public.draft_comment_resolve(p_id bigint, p_resolved boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  dc public.draft_comments;
  dr public.drafts;
  c  public.collabs;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  select * into dc from public.draft_comments where id = p_id;
  if not found then
    raise exception 'Comment not found.';
  end if;
  select * into dr from public.drafts where id = dc.draft_id;
  select * into c from public.collabs where id = dr.collab_id;

  if public.is_creator() then
    if c.creator_id <> public.current_creator() then
      raise exception 'Not authorized.';
    end if;
  else
    if not exists (select 1 from private.my_collabs() k where k.id = c.id) then
      raise exception 'Not authorized.';
    end if;
  end if;

  update public.draft_comments
  set resolved = coalesce(p_resolved, true)
  where id = p_id
  returning * into dc;

  return to_jsonb(dc);
end;
$$;
revoke execute on function public.draft_comment_resolve(bigint, boolean) from public, anon;
grant execute on function public.draft_comment_resolve(bigint, boolean) to authenticated;
