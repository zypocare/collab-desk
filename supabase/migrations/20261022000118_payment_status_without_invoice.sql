-- A collab whose invoices were all cancelled (or removed) kept "invoiced" as its payment status, with no
-- invoice behind it. Payments then listed it as due while the totals counted nothing owed. Now the
-- status follows the money received when no invoice is left, and existing collabs are put right.

create or replace function public.sync_collab_payment(p_collab uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  issued integer;
  open_count integer;
  received numeric;
  next_due date;
  last_paid date;
  first_issue date;
  last_number text;
  c public.collabs;
  new_status public.pay_status;
begin
  select count(*), count(*) filter (where status in ('sent', 'partly_paid')),
         -- Money towards her fee (GST is collected for the government, so it doesn't count).
         coalesce(sum((case when status = 'paid' then subtotal else least(subtotal, amount_received + tds_deducted) end) * inr_rate), 0),
         min(due_date) filter (where status in ('sent', 'partly_paid')),
         max(paid_on), min(issue_date)
  into issued, open_count, received, next_due, last_paid, first_issue
  from public.invoices where collab_id = p_collab and status not in ('draft', 'cancelled');

  select * into c from public.collabs where id = p_collab;
  if c.id is null then return; end if;

  if issued = 0 then
    -- No invoice left: "invoiced" has nothing behind it, so the money received decides.
    if c.pay_status = 'invoiced' then
      new_status := case
        when c.fee > 0 and coalesce(c.pay_received, 0) >= c.fee - 1 then 'paid'
        when coalesce(c.pay_received, 0) > 0 then 'advance'
        else 'pending' end;
      perform set_config('app.quiet', 'on', true);
      update public.collabs set
        pay_status = new_status,
        pay_due = null,
        paid_on = case when new_status = 'paid' then coalesce(paid_on, current_date) else null end,
        stage = case when new_status = 'paid' and stage = 'live' then 'wrapped'::public.collab_stage else stage end
      where id = p_collab;
      perform set_config('app.quiet', 'off', true);
    end if;
    return;
  end if;

  select number into last_number from public.invoices
  where collab_id = p_collab and status not in ('draft', 'cancelled') order by sent_at desc nulls last limit 1;

  new_status := case
    when open_count > 0 then 'invoiced'
    when received >= c.fee - 1 then 'paid'
    else 'advance' end;

  perform set_config('app.quiet', 'on', true);
  update public.collabs set
    pay_received = received,
    invoice_no = coalesce(last_number, ''),
    invoiced_on = first_issue,
    pay_due = next_due,
    pay_status = new_status,
    paid_on = case when new_status = 'paid' then coalesce(last_paid, current_date) else null end,
    stage = case when new_status = 'paid' and stage = 'live' then 'wrapped'::public.collab_stage else stage end
  where id = p_collab;
  perform set_config('app.quiet', 'off', true);
end;
$$;

-- An invoice that is deleted outright also re-checks its collab.
create or replace function private.invoice_deleted()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.sync_collab_payment(old.collab_id);
  return null;
end;
$$;
revoke execute on function private.invoice_deleted() from public, anon, authenticated;
drop trigger if exists invoices_after_delete on public.invoices;
create trigger invoices_after_delete after delete on public.invoices for each row execute function private.invoice_deleted();

-- Put right the collabs already left "invoiced" with no invoice.
do $$
declare r record;
begin
  for r in
    select k.id from public.collabs k
    where k.pay_status = 'invoiced'
      and not exists (select 1 from public.invoices i where i.collab_id = k.id and i.status not in ('draft', 'cancelled'))
  loop
    perform public.sync_collab_payment(r.id);
  end loop;
end $$;

-- With no address to go by (local testing), the one approved creator is the page's creator; people still
-- waiting for approval don't count.
create or replace function private.page_creator()
returns integer
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_set text := nullif(current_setting('app.creator', true), '');
  v_slug text := private.header_slug();
begin
  if v_set is not null then
    return v_set::integer;
  end if;
  if v_slug is not null then
    return (select s.id from public.creator_settings s where s.slug = v_slug and s.status = 'active' and s.slug_chosen);
  end if;
  return coalesce(public.current_creator(), (select min(s.id) from public.creator_settings s where s.status = 'active' having count(*) = 1));
end;
$$;
revoke execute on function private.page_creator() from public, anon, authenticated;
