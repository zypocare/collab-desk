-- The studio loads every collab newest-first (order by received_on desc).
create index if not exists collabs_received_on_idx on public.collabs (received_on desc);
