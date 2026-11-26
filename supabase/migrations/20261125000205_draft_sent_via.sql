-- Track drafts sent directly on WhatsApp or Instagram DM without requiring a file upload or Drive link,
-- and keep brand outbox emails strictly for Miracle-hosted drafts.

alter table public.drafts
  add column if not exists sent_via text not null default 'miracle'
  check (sent_via in ('miracle', 'whatsapp', 'instagram', 'email', 'other'));

create or replace function public.drafts_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select coalesce(max(round), 0) + 1 into new.round from public.drafts where collab_id = new.collab_id;
  if coalesce(new.sent_via, 'miracle') = 'miracle'
     and btrim(new.link) = ''
     and btrim(new.caption) = ''
     and coalesce(new.file_path, '') = '' then
    raise exception 'Add the draft file, a link to it, or the caption.';
  end if;
  return new;
end;
$$;

create or replace function public.drafts_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
  v_via text := coalesce(new.sent_via, 'miracle');
  v_label text;
begin
  select * into c from public.collabs where id = new.collab_id;
  select * into b from public.brands where id = c.brand_id;

  v_label := case v_via
    when 'whatsapp' then format('Draft round %s sent on WhatsApp', new.round)
    when 'instagram' then format('Draft round %s sent on Instagram DM', new.round)
    when 'email' then format('Draft round %s sent by email', new.round)
    else format('Draft round %s shared for approval', new.round)
  end;

  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (c.id, auth.uid(), 'draft', v_label, true);

  -- Only email the brand when the draft was uploaded/shared via Miracle.
  if v_via = 'miracle' and c.contact_email <> '' then
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (new.creator_id, 'draft_ready', c.contact_email, jsonb_build_object(
      'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'round', new.round, 'note', new.note));
  end if;

  if c.stage in ('confirmed', 'negotiating', 'request') then
    perform set_config('app.quiet', 'on', true);
    update public.collabs set stage = 'creating' where id = c.id;
    perform set_config('app.quiet', 'off', true);
  end if;
  return null;
end;
$$;
