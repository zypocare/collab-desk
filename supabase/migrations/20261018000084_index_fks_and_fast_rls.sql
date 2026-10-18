-- Speed: indexes for foreign keys that had none, and access rules that check "who is this?"
-- once per query instead of once per row.

create index if not exists bank_alerts_invoice_id_idx on public.bank_alerts (invoice_id);
create index if not exists brand_members_brand_id_idx on public.brand_members (brand_id);
create index if not exists collab_events_actor_idx on public.collab_events (actor);
create index if not exists collabs_created_by_idx on public.collabs (created_by);
create index if not exists ig_threads_collab_id_idx on public.ig_threads (collab_id);
create index if not exists inbound_emails_collab_id_idx on public.inbound_emails (collab_id);
create index if not exists pitches_collab_id_idx on public.pitches (collab_id);
create index if not exists profiles_brand_id_idx on public.profiles (brand_id);
create index if not exists retainers_brand_id_idx on public.retainers (brand_id);
create index if not exists scheduled_posts_collab_id_idx on public.scheduled_posts (collab_id);
create index if not exists scheduled_posts_draft_id_idx on public.scheduled_posts (draft_id);

-- Wrapping a call that doesn't depend on the row in (select ...) lets Postgres run it once
-- for the whole query. Checks that take a row value (is_my_collab(collab_id)) stay as they are.
do $$
declare
  r record;
  fns text := '(is_creator|is_owner|my_brand_id|auth\.uid|auth\.jwt|auth\.email)\(\)';
  q text;
  c text;
  sql text;
begin
  for r in select * from pg_policies where schemaname = 'public' loop
    q := regexp_replace(r.qual, '(?<!SELECT )(public\.)?' || fns, '(select \1\2())', 'g');
    c := regexp_replace(r.with_check, '(?<!SELECT )(public\.)?' || fns, '(select \1\2())', 'g');
    if q is distinct from r.qual or c is distinct from r.with_check then
      sql := format('alter policy %I on public.%I', r.policyname, r.tablename);
      if q is not null then sql := sql || format(' using (%s)', q); end if;
      if c is not null then sql := sql || format(' with check (%s)', c); end if;
      execute sql;
    end if;
  end loop;
end $$;
