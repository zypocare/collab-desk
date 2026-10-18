-- Release 5: drafts brands can't post early.
-- Her phone makes a light preview of each draft (720p, "DRAFT · for <brand>" burned in). Brands only
-- get the preview; the clean file opens for them once the collab is paid, or when she releases it.

alter table public.drafts add column if not exists preview_path text;
alter table public.drafts add column if not exists preview_type text not null default '';
alter table public.drafts add column if not exists released_at timestamptz;

-- Which draft files a link may open: the preview, or the clean file when there's no preview or it was released.
create or replace function public.is_draft_file(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.drafts d
    where d.preview_path = p_name or (d.file_path = p_name and (d.preview_path is null or d.released_at is not null))
  );
$$;
grant execute on function public.is_draft_file(text) to anon, authenticated, service_role;

-- Paid in full: the clean files of that collab's drafts open for the brand.
create or replace function private.release_drafts_on_paid()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.pay_status = 'paid' and old.pay_status is distinct from 'paid' then
    update public.drafts set released_at = now() where collab_id = new.id and preview_path is not null and released_at is null;
  end if;
  return new;
end $$;
drop trigger if exists release_drafts_on_paid on public.collabs;
create trigger release_drafts_on_paid after update of pay_status on public.collabs
  for each row execute function private.release_drafts_on_paid();

-- The action page (links in emails) shows the preview too.
CREATE OR REPLACE FUNCTION public.action_info(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a private.action_links;
  c public.collabs;
  b public.brands;
  s public.creator_settings;
  q public.quotes;
  d public.drafts;
  v_state text;
begin
  select * into a from private.action_links where token = p_token;
  if a.token is null or a.kind not in ('quote', 'draft', 'counter') then
    return jsonb_build_object('state', 'missing');
  end if;
  select * into s from public.creator_settings where id = 1;
  if a.kind = 'quote' then
    select * into q from public.quotes where id = a.ref_id;
    select * into c from public.collabs where id = q.collab_id;
  elsif a.kind = 'draft' then
    select * into d from public.drafts where id = a.ref_id;
    select * into c from public.collabs where id = d.collab_id;
  else
    select * into c from public.collabs where id = a.ref_id;
  end if;
  select * into b from public.brands where id = c.brand_id;

  v_state := case
    when a.used_at is not null then 'used'
    when a.expires_at < now() then 'expired'
    when a.kind = 'quote' and q.status <> 'sent' then 'closed'
    when a.kind = 'quote' and q.valid_until is not null and q.valid_until < current_date then 'expired'
    when a.kind = 'draft' and d.status <> 'pending' then 'closed'
    when a.kind = 'counter' and (c.counter_status <> 'sent' or c.stage <> 'request' or c.type <> 'barter') then 'closed'
    else 'open' end;

  return jsonb_build_object(
    'state', v_state, 'kind', a.kind, 'code', c.code, 'brand', b.name, 'contact', c.contact_name,
    'creator', s.display_name,
    'quote', case when a.kind = 'quote' then jsonb_build_object(
      'version', q.version, 'items', q.items, 'usage', q.usage, 'usage_fee', q.usage_fee, 'discount', q.discount,
      'total', q.total, 'currency', q.currency, 'advance_pct', q.advance_pct, 'pay_days', q.pay_days, 'revision_rounds', q.revision_rounds,
      'exclusivity_days', q.exclusivity_days, 'valid_until', q.valid_until, 'notes', q.notes, 'options', q.options) end,
    'draft', case when a.kind = 'draft' then jsonb_build_object(
      'round', d.round, 'link', d.link, 'caption', d.caption, 'note', d.note, 'file_path', case when d.preview_path is not null and d.released_at is null then d.preview_path else d.file_path end, 'file_type', case when d.preview_path is not null and d.released_at is null then d.preview_type else d.file_type end,
      'comments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.at_seconds, 'body', x.body, 'name', x.name) order by x.at_seconds nulls last, x.id)
                            from public.draft_comments x where x.draft_id = d.id), '[]'::jsonb)) end,
    'counter', case when a.kind = 'counter' then jsonb_build_object(
      'fee', c.counter_fee, 'product', c.product, 'reply_time', s.barter_reply_time,
      'deliverables', (select string_agg(qty || ' × ' || kind, ', ' order by position) from public.deliverables where collab_id = c.id)) end);
end;
$function$;
