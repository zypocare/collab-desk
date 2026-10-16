-- Batch actions: "Send reminders" for several collabs at once. Each collab gets the reminder that
-- fits where it is: an unpaid invoice -> payment reminder, an open quote -> quote reminder,
-- a draft waiting for review -> draft reminder. Nothing is sent twice within a day.

create or replace function public.send_reminders(p_ids uuid[])
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  c record;
  inv public.invoices;
  q public.quotes;
  d public.drafts;
  n_pay integer := 0;
  n_quote integer := 0;
  n_draft integer := 0;
  n_skip integer := 0;
begin
  if not public.is_creator() then
    raise exception 'Only the creator can send reminders.';
  end if;
  select * into s from public.creator_settings where id = 1;

  for c in
    select x.*, b.name as brand_name from public.collabs x join public.brands b on b.id = x.brand_id
    where x.id = any(p_ids)
  loop
    inv := null; q := null; d := null;
    select * into inv from public.invoices
    where collab_id = c.id and status in ('sent', 'partly_paid') order by due_date nulls last limit 1;
    if inv.id is null then
      select * into q from public.quotes where collab_id = c.id and status = 'sent' order by version desc limit 1;
      if q.id is null then
        select * into d from public.drafts where collab_id = c.id and status = 'pending' order by round desc limit 1;
      end if;
    end if;

    if inv.id is not null and coalesce(inv.last_reminded_at, '-infinity') < now() - interval '1 day'
       and (c.contact_email <> '' or coalesce(inv.send_to, '') <> '') then
      insert into public.outbox (kind, to_email, payload)
      select 'payment_reminder', e, jsonb_build_object(
        'code', c.code, 'number', inv.number, 'contact', c.contact_name, 'due', inv.due_date,
        'days_late', coalesce(current_date - inv.due_date, 0),
        'due_amount', greatest(0, inv.payable - inv.amount_received),
        'link', rtrim(s.site_url, '/') || '/invoice/' || inv.public_token)
      from (select distinct btrim(e) as e from unnest(array[c.contact_email, inv.send_to]) e where btrim(coalesce(e, '')) <> '') r;
      update public.invoices set last_reminded_at = now() where id = inv.id;
      insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
      values (c.id, auth.uid(), 'reminder', format('Payment reminder sent for %s', inv.number), true);
      n_pay := n_pay + 1;
    elsif q.id is not null and coalesce(q.nudged_at, '-infinity') < now() - interval '1 day' and c.contact_email <> '' then
      insert into public.outbox (kind, to_email, payload) values ('quote_nudge', c.contact_email, jsonb_build_object(
        'code', c.code, 'brand', c.brand_name, 'contact', c.contact_name, 'total', q.total));
      update public.quotes set nudged_at = now() where id = q.id;
      insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
      values (c.id, auth.uid(), 'reminder', format('Reminder sent about quote v%s', q.version), true);
      n_quote := n_quote + 1;
    elsif d.id is not null and coalesce(d.nudged_at, '-infinity') < now() - interval '1 day' and c.contact_email <> '' then
      insert into public.outbox (kind, to_email, payload) values ('draft_nudge', c.contact_email, jsonb_build_object(
        'code', c.code, 'brand', c.brand_name, 'contact', c.contact_name, 'round', d.round));
      update public.drafts set nudged_at = now() where id = d.id;
      insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
      values (c.id, auth.uid(), 'reminder', format('Reminder sent about draft %s', d.round), true);
      n_draft := n_draft + 1;
    else
      n_skip := n_skip + 1;
    end if;
  end loop;

  return jsonb_build_object('payment', n_pay, 'quote', n_quote, 'draft', n_draft, 'skipped', n_skip);
end;
$$;
revoke execute on function public.send_reminders(uuid[]) from anon;
