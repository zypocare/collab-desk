-- Tracking links for collabs she adds herself (from DMs, WhatsApp, calls): every collab gets a private
-- link the brand can open without signing in to see where things stand. She can email it (and switch
-- on status emails) or copy it into a DM. Signing in with the contact email unlocks everything else.

alter table public.collabs
  add column track_token text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  add column track_sent_at timestamptz;
create unique index collabs_track_token_idx on public.collabs (track_token);

-- What the tracking page shows (no money details beyond the agreed fee, no internal notes).
create or replace function public.public_track(p_token text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id, 'code', c.code, 'stage', c.stage, 'stage_label', public.stage_label(c.stage),
    'type', c.type, 'fee', c.fee, 'product', c.product, 'product_value', c.product_value, 'usage', c.usage,
    'brief', '', 'preferred_live', c.preferred_live, 'received_on', c.received_on,
    'draft_date', c.draft_date, 'live_date', c.live_date, 'live_time', c.live_time,
    'pay_status', c.pay_status, 'invoice_no', c.invoice_no, 'pay_due', c.pay_due, 'paid_on', c.paid_on,
    'note_for_brand', c.note_for_brand, 'contact_name', c.contact_name, 'contact_email', c.contact_email,
    'created_at', c.created_at, 'product_date', c.product_date, 'shipped_at', c.shipped_at,
    'product_received_at', c.product_received_at, 'usage_ends', c.usage_ends, 'files_sent_at', c.files_sent_at,
    'brand', b.name,
    'deliverables', (select coalesce(jsonb_agg(jsonb_build_object('kind', d.kind, 'qty', d.qty, 'done', d.done) order by d.position), '[]'::jsonb)
                     from public.deliverables d where d.collab_id = c.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'text', e.text) order by e.at desc), '[]'::jsonb)
               from (select * from public.collab_events e where e.collab_id = c.id and e.visible_to_brand order by e.at desc limit 12) e),
    'quotes', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'status', q.status, 'total', q.total, 'responded_at', q.responded_at,
                 'version', q.version, 'items', q.items, 'usage', q.usage, 'advance_pct', q.advance_pct, 'pay_days', q.pay_days,
                 'revision_rounds', q.revision_rounds, 'exclusivity_days', q.exclusivity_days, 'accepted_name', q.accepted_name) order by q.version desc), '[]'::jsonb)
               from public.quotes q where q.collab_id = c.id and q.status in ('sent', 'accepted', 'changes')),
    'drafts', (select coalesce(jsonb_agg(jsonb_build_object('id', dr.id, 'round', dr.round, 'status', dr.status, 'submitted_at', dr.submitted_at,
                 'responded_at', dr.responded_at) order by dr.round desc), '[]'::jsonb)
               from public.drafts dr where dr.collab_id = c.id),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object('number', i.number, 'kind', i.kind, 'total', i.total, 'payable', i.payable,
                 'status', i.status, 'issue_date', i.issue_date, 'due_date', i.due_date, 'token', i.public_token, 'claimed', i.claim_at is not null)
                 order by i.issue_date desc), '[]'::jsonb)
                 from public.invoices i where i.collab_id = c.id and i.status not in ('draft', 'cancelled')),
    'files', '[]'::jsonb,
    'report_token', (select r.public_token from public.brand_reports r where r.collab_id = c.id and r.status = 'sent' order by r.created_at desc limit 1),
    'results', (select jsonb_build_object('views', sum(m.views), 'reach', sum(m.reach),
                  'interactions', sum(coalesce(m.interactions, coalesce(m.likes, 0) + coalesce(m.comments, 0))), 'posts', count(*))
                from public.collab_posts p join public.ig_media m on m.id = p.media_id where p.collab_id = c.id))
  from public.collabs c join public.brands b on b.id = c.brand_id
  where c.track_token = p_token and length(p_token) >= 24 and c.stage <> 'declined';
$$;
grant execute on function public.public_track(text) to anon, authenticated;

-- Email the brand their tracking link (one collab or several). Optionally switch on status emails.
create or replace function public.send_track_links(p_ids uuid[], p_notify boolean default true)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c record;
  n integer := 0;
  skipped integer := 0;
begin
  if not public.is_creator() then raise exception 'Only the creator can do this.'; end if;
  for c in
    select x.*, b.name as brand_name from public.collabs x join public.brands b on b.id = x.brand_id
    where x.id = any(p_ids) and x.stage <> 'declined'
  loop
    if coalesce(c.contact_email, '') = '' then
      skipped := skipped + 1;
      continue;
    end if;
    update public.collabs set track_sent_at = now(), notify_brand = notify_brand or p_notify where id = c.id;
    insert into public.outbox (kind, to_email, payload) values ('track_invite', c.contact_email, jsonb_build_object(
      'code', c.code, 'brand', c.brand_name, 'contact', c.contact_name, 'token', c.track_token, 'stage', public.stage_label(c.stage),
      'deliverables', (select string_agg(qty || ' × ' || kind, ', ' order by position) from public.deliverables where collab_id = c.id)));
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'note', 'Tracking link sent to the brand.', true);
    n := n + 1;
  end loop;
  return jsonb_build_object('sent', n, 'no_email', skipped);
end;
$$;
revoke execute on function public.send_track_links(uuid[], boolean) from anon;
