-- Pitching brands: a wishlist of brands she'd like to work with, a pitch email sent from her own
-- email account, and up to two polite follow-ups (5 and 12 days later) until the brand replies.

create table if not exists public.pitches (
  id             uuid primary key default gen_random_uuid(),
  brand_name     text not null,
  instagram      text not null default '',
  category       text not null default '',
  contact_name   text not null default '',
  email          text not null default '',
  subject        text not null default '',
  body           text not null default '',
  status         text not null default 'idea' check (status in ('idea', 'sent', 'replied', 'won', 'not_now')),
  auto_follow    boolean not null default true,
  followups      integer not null default 0,
  sent_at        timestamptz,
  next_follow_on date,
  replied_at     timestamptz,
  collab_id      uuid references public.collabs(id) on delete set null,
  notes          text not null default '',
  created_at     timestamptz not null default now()
);
alter table public.pitches enable row level security;
drop policy if exists "creator manages pitches" on public.pitches;
create policy "creator manages pitches" on public.pitches for all to authenticated
  using (public.is_creator()) with check (public.is_creator());

create or replace function public.send_pitch(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  p public.pitches;
  s public.creator_settings;
begin
  if not public.is_creator() then raise exception 'Not allowed.'; end if;
  select * into p from public.pitches where id = p_id;
  if p.id is null then raise exception 'Pitch not found.'; end if;
  if coalesce(btrim(p.email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Add the brand''s email first.'; end if;
  if btrim(p.subject) = '' or btrim(p.body) = '' then raise exception 'Write the subject and the message first.'; end if;
  if p.status = 'sent' and p.sent_at > now() - interval '1 day' then raise exception 'Already sent today.'; end if;
  select * into s from public.creator_settings where id = 1;
  insert into public.outbox (kind, to_email, payload) values ('pitch', p.email, jsonb_build_object(
    'subject', p.subject, 'body', p.body, 'name', s.display_name, 'contact', p.contact_name, 'brand', p.brand_name));
  update public.pitches set status = 'sent', sent_at = now(), followups = 0, next_follow_on = current_date + 5 where id = p.id;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.send_pitch(uuid) to authenticated;

-- Daily: a short follow-up for pitches with no reply (two at most, then it stops).
create or replace function private.pitch_followups()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  p public.pitches;
  s public.creator_settings;
  link text;
  n integer := 0;
begin
  select * into s from public.creator_settings where id = 1;
  link := rtrim(s.site_url, '/');
  for p in select * from public.pitches
           where status = 'sent' and auto_follow and followups < 2 and next_follow_on <= current_date and email <> '' loop
    insert into public.outbox (kind, to_email, payload) values ('pitch_follow', p.email, jsonb_build_object(
      'subject', 'Re: ' || p.subject, 'name', s.display_name, 'contact', p.contact_name, 'brand', p.brand_name,
      'round', p.followups + 1, 'link', link));
    update public.pitches set followups = followups + 1, next_follow_on = current_date + 7 where id = p.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function private.pitch_followups() from public;
select cron.unschedule('pitch-followups') where exists (select 1 from cron.job where jobname = 'pitch-followups');
select cron.schedule('pitch-followups', '30 4 * * *', $$select private.pitch_followups()$$);
