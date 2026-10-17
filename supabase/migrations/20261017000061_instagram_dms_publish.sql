-- Instagram DMs in the app, and posting approved Reels to Instagram at a set time.
-- Both use her existing Instagram connection, once she allows the two extra permissions
-- (instagram_business_manage_messages, instagram_business_content_publish).

alter table public.ig_token add column if not exists permissions text not null default '';

-- ---------- DMs (arrive through the webhook; she replies from the app) ----------
create table if not exists public.ig_threads (
  igsid      text primary key,             -- the other person's id for her account
  username   text not null default '',
  name       text not null default '',
  picture    text not null default '',
  last_text  text not null default '',
  last_at    timestamptz,
  last_from_them_at timestamptz,          -- replies are allowed for 24 hours after their last message
  unread     integer not null default 0,
  collab_id  uuid references public.collabs(id) on delete set null
);
create table if not exists public.ig_dms (
  mid        text primary key,
  igsid      text not null references public.ig_threads(igsid) on delete cascade,
  from_me    boolean not null default false,
  text       text not null default '',
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists ig_dms_thread_idx on public.ig_dms (igsid, created_at);
alter table public.ig_threads enable row level security;
alter table public.ig_dms enable row level security;
drop policy if exists "creator reads ig threads" on public.ig_threads;
create policy "creator reads ig threads" on public.ig_threads for all to authenticated using (public.is_creator()) with check (public.is_creator());
drop policy if exists "creator reads ig dms" on public.ig_dms;
create policy "creator reads ig dms" on public.ig_dms for select to authenticated using (public.is_creator());
alter publication supabase_realtime add table public.ig_dms;

-- ---------- Scheduled posts ----------
create table if not exists public.scheduled_posts (
  id            uuid primary key default gen_random_uuid(),
  collab_id     uuid not null references public.collabs(id) on delete cascade,
  draft_id      uuid references public.drafts(id) on delete set null,
  file_path     text not null,
  file_type     text not null default '',
  caption       text not null default '',
  collaborators text[] not null default '{}',
  publish_at    timestamptz not null,
  status        text not null default 'scheduled' check (status in ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  container_id  text,
  ig_media_id   text,
  permalink     text not null default '',
  error         text not null default '',
  created_at    timestamptz not null default now()
);
alter table public.scheduled_posts enable row level security;
drop policy if exists "creator manages scheduled posts" on public.scheduled_posts;
create policy "creator manages scheduled posts" on public.scheduled_posts for all to authenticated
  using (public.is_creator()) with check (public.is_creator());

-- Every 5 minutes: publish what's due (the function checks; nothing happens when nothing is due).
create or replace function private.publish_due()
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.scheduled_posts where status in ('scheduled', 'publishing') and publish_at <= now() + interval '2 minutes') then
    perform private.call_function('instagram-publish');
  end if;
end;
$$;
select cron.unschedule('instagram-publish') where exists (select 1 from cron.job where jobname = 'instagram-publish');
select cron.schedule('instagram-publish', '*/5 * * * *', $$select private.publish_due()$$);

-- Which optional Instagram permissions she allowed (the token itself stays private).
create or replace function public.ig_permissions()
returns text
language sql stable security definer
set search_path = public
as $$
  select case when public.is_creator() then coalesce((select permissions from public.ig_token where id = 1), '') else '' end;
$$;
grant execute on function public.ig_permissions() to authenticated;
