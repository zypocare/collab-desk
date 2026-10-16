-- What a collab cost her (props, travel, editor…), so she sees what she actually kept.
create table public.collab_expenses (
  id         uuid primary key default gen_random_uuid(),
  collab_id  uuid not null references public.collabs(id) on delete cascade,
  label      text not null check (char_length(btrim(label)) between 1 and 80),
  category   text not null default 'other' check (category in ('props', 'travel', 'editor', 'shoot', 'other')),
  amount     numeric(12,2) not null check (amount >= 0),
  spent_on   date not null default current_date,
  created_at timestamptz not null default now()
);
create index collab_expenses_collab_idx on public.collab_expenses (collab_id);
alter table public.collab_expenses enable row level security;
create policy "creator manages expenses" on public.collab_expenses
  for all to authenticated using (public.is_creator()) with check (public.is_creator());
