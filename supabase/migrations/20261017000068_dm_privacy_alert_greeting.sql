-- Instagram DMs: only possible collabs are kept (the webhook drops everything else). Two ways to
-- clear what isn't a collab: "Not a collab" on a chat wipes its messages and the person's details,
-- keeping only the mark (so their later messages stay out); and a one-tap clean-up of chats saved
-- before this change. Also: a personal greeting on her phone alerts ("Hey Nivy! ...").

alter table public.creator_settings
  add column if not exists alert_name text not null default '' check (char_length(alert_name) <= 30),
  add column if not exists alert_line text not null default '' check (char_length(alert_line) <= 80);

create or replace function public.ig_not_collab(p_igsid text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_creator() then raise exception 'Only the creator can do this.'; end if;
  delete from public.ig_dms where igsid = p_igsid;
  update public.ig_threads
     set collab_flag = 'no', collab_hint = '', username = '', name = '', picture = '', last_text = '', unread = 0, collab_id = null
   where igsid = p_igsid;
end;
$$;
revoke execute on function public.ig_not_collab(text) from public, anon;
grant execute on function public.ig_not_collab(text) to authenticated;

-- Chats saved before only collabs were kept: delete their messages and details. Returns how many.
create or replace function public.ig_forget_non_collab()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not public.is_creator() then raise exception 'Only the creator can do this.'; end if;
  select count(*) into v_n from public.ig_threads
   where collab_id is null and (collab_flag = '' or (collab_flag = 'no' and username <> ''));
  delete from public.ig_dms d using public.ig_threads t
   where d.igsid = t.igsid and t.collab_id is null and t.collab_flag not in ('likely', 'maybe');
  delete from public.ig_threads where collab_id is null and collab_flag = '';
  update public.ig_threads set username = '', name = '', picture = '', last_text = '', collab_hint = '', unread = 0
   where collab_id is null and collab_flag = 'no';
  return v_n;
end;
$$;
revoke execute on function public.ig_forget_non_collab() from public, anon;
grant execute on function public.ig_forget_non_collab() to authenticated;
