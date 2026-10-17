-- When a quote is accepted, the collab matches it: the content becomes what the quote lists (the
-- brand may have asked for 2 Stories and agreed to 1 Static post) and the fee becomes the quoted
-- total (in rupees). Content already ticked off as done is never touched.
create or replace function public.quote_accepted_sync()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  it jsonb;
  pos integer := 0;
begin
  if not (new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted')) then return null; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) x where coalesce((x ->> 'qty')::int, 0) > 0)
     and not exists (select 1 from public.deliverables d where d.collab_id = new.collab_id and d.done) then
    delete from public.deliverables where collab_id = new.collab_id;
    for it in select * from jsonb_array_elements(new.items) loop
      if coalesce((it ->> 'qty')::int, 0) > 0 and coalesce(btrim(it ->> 'kind'), '') <> '' then
        insert into public.deliverables (collab_id, kind, qty, position)
        values (new.collab_id, left(it ->> 'kind', 40), least(50, (it ->> 'qty')::int), pos);
        pos := pos + 1;
      end if;
    end loop;
  end if;
  update public.collabs set fee = round(new.total * coalesce(nullif(new.inr_rate, 0), 1))
  where id = new.collab_id and type <> 'barter' and new.total > 0;
  return null;
end;
$$;
drop trigger if exists zz_quote_accepted_sync on public.quotes;
create trigger zz_quote_accepted_sync after insert or update of status on public.quotes
  for each row execute function public.quote_accepted_sync();
