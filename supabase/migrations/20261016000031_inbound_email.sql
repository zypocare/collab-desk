-- Brand emails forwarded by her Gmail script: each one is handled once.
create table public.inbound_emails (
  msg_id     text primary key,
  sender     text not null default '',
  subject    text not null default '',
  collab_id  uuid references public.collabs(id) on delete set null,
  action     text not null default '' check (action in ('', 'new_request', 'message', 'skipped')),
  created_at timestamptz not null default now()
);
alter table public.inbound_emails enable row level security;
create policy "creator reads inbound emails" on public.inbound_emails for select to authenticated using (public.is_creator());
