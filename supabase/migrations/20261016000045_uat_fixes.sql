-- UAT fixes.
-- 1. A signed-in brand can comment on a draft (pinned to a moment) from their request page, not only
--    from the email link.
create or replace function public.draft_comment_add_member(p_draft uuid, p_at numeric, p_body text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  d public.drafts;
  v_id bigint;
  v_name text;
begin
  select * into d from public.drafts where id = p_draft;
  if d.id is null or not public.is_my_collab(d.collab_id) then raise exception 'Draft not found.'; end if;
  if d.status <> 'pending' then raise exception 'This draft has already been answered.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 then raise exception 'Type your comment.'; end if;
  if (select count(*) from public.draft_comments where draft_id = d.id) >= 60 then raise exception 'That is a lot of comments. Send them now, then add more on the next round.'; end if;
  select coalesce(nullif(full_name, ''), email) into v_name from public.profiles where id = auth.uid();
  insert into public.draft_comments (draft_id, at_seconds, body, author, name)
  values (d.id, case when p_at is null then null else greatest(0, least(p_at, 36000)) end, left(btrim(p_body), 1000), 'brand', left(coalesce(v_name, ''), 80))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'name', v_name);
end;
$$;
revoke execute on function public.draft_comment_add_member(uuid, numeric, text) from anon;

create or replace function public.draft_comment_delete_member(p_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  delete from public.draft_comments c using public.drafts d
  where c.id = p_id and c.draft_id = d.id and d.status = 'pending' and c.author = 'brand' and public.is_my_collab(d.collab_id);
end;
$$;
revoke execute on function public.draft_comment_delete_member(bigint) from anon;

-- 2. The results report counts the agreed fee as invested (not only what has been paid so far).
create or replace function public.public_report(p_token text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select r.data || jsonb_build_object(
    'created_at', r.created_at,
    'type', c.type,
    'invested', case when c.type = 'barter' then 0 else greatest(c.fee, c.pay_received) end,
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

-- 3. The automatic "Thanks for reaching out! … will reply within …" note only belongs to a new request:
--    it is cleared once the collab moves on (her own notes are left alone).
create or replace function public.collabs_clear_ack_note()
returns trigger
language plpgsql
as $$
begin
  if new.stage <> 'request' and old.stage = 'request' and new.note_for_brand like 'Thanks for reaching out!%' then
    new.note_for_brand := '';
  end if;
  return new;
end;
$$;
drop trigger if exists collabs_clear_ack_note on public.collabs;
create trigger collabs_clear_ack_note
  before update of stage on public.collabs
  for each row execute function public.collabs_clear_ack_note();

update public.collabs set note_for_brand = ''
where stage <> 'request' and note_for_brand like 'Thanks for reaching out!%';

-- 4. "1 days" → "1 day" in her saved reply times (brands see these words).
update public.creator_settings
set reply_time = regexp_replace(reply_time, '^1 (day|hour|week)s\M', '1 \1', 'i'),
    barter_reply_time = regexp_replace(barter_reply_time, '^1 (day|hour|week)s\M', '1 \1', 'i')
where id = 1;
update public.collabs set note_for_brand = replace(note_for_brand, 'within 1 days', 'within 1 day') where note_for_brand like '%within 1 days%';
