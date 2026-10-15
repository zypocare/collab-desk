-- Step 4: Instagram account stats, posts, go-live detection and brand reports.

-- The access token: row level security is on with no policies, so the website can never read it.
-- Only the server functions (service role) can.
create table public.ig_token (
  id           smallint primary key default 1 check (id = 1),
  access_token text not null,
  obtained_at  timestamptz not null default now(),
  expires_at   timestamptz
);
alter table public.ig_token enable row level security;
revoke all on public.ig_token from anon, authenticated;

create table public.ig_account (
  id                  smallint primary key default 1 check (id = 1),
  connected           boolean not null default false,
  ig_user_id          text not null default '',
  username            text not null default '',
  name                text not null default '',
  profile_picture_url text not null default '',
  followers           integer,
  follows             integer,
  media_count         integer,
  engagement_rate     numeric(6,2),
  avg_views           integer,
  avg_reach           integer,
  demographics        jsonb not null default '{}',   -- { "age": {"25-34": 4100, ...}, "gender": {...}, "city": {...} }
  token_expires_at    timestamptz,
  last_sync_at        timestamptz,
  last_error          text not null default '',
  updated_at          timestamptz not null default now()
);
insert into public.ig_account default values;

create table public.ig_followers_history (
  day       date primary key,
  followers integer not null
);

create table public.ig_media (
  id            text primary key,
  caption       text not null default '',
  media_type    text not null default '',
  product_type  text not null default '',
  permalink     text not null default '',
  posted_at     timestamptz not null,
  thumbnail_url text not null default '',
  likes         integer,
  comments      integer,
  saves         integer,
  shares        integer,
  reach         integer,
  views         integer,
  interactions  integer,
  insights_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index ig_media_posted_idx on public.ig_media (posted_at desc);

create table public.collab_posts (
  collab_id  uuid not null references public.collabs(id) on delete cascade,
  media_id   text not null references public.ig_media(id) on delete cascade,
  matched_by text not null default 'auto' check (matched_by in ('auto', 'manual')),
  created_at timestamptz not null default now(),
  primary key (collab_id, media_id)
);
create unique index collab_posts_media_once on public.collab_posts (media_id);

create table public.brand_reports (
  id           uuid primary key default gen_random_uuid(),
  collab_id    uuid not null references public.collabs(id) on delete cascade,
  public_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  status       text not null default 'ready' check (status in ('ready', 'sent')),
  data         jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index brand_reports_collab_idx on public.brand_reports (collab_id, created_at desc);

-- How 7-day reports go out: 'review' = she checks and sends, 'auto' = sent straight away, 'off'.
alter table public.creator_settings
  add column report_mode text not null default 'review' check (report_mode in ('review', 'auto', 'off'));

-- Sending a report emails the brand.
create or replace function public.brand_reports_after_write()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  s public.creator_settings;
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status <> 'sent') then
    select * into c from public.collabs where id = new.collab_id;
    select * into s from public.creator_settings where id = 1;
    update public.brand_reports set sent_at = now() where id = new.id and sent_at is null;
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'report', 'Results report shared', true);
    if c.contact_email <> '' then
      insert into public.outbox (kind, to_email, payload)
      values ('brand_report', c.contact_email, jsonb_build_object(
        'code', c.code, 'contact', c.contact_name, 'brand', new.data ->> 'brand',
        'views', new.data -> 'totals' ->> 'views', 'reach', new.data -> 'totals' ->> 'reach',
        'link', rtrim(s.site_url, '/') || '/report/' || new.public_token));
    end if;
  end if;
  return null;
end;
$$;

create trigger brand_reports_after_write
  after insert or update on public.brand_reports
  for each row execute function public.brand_reports_after_write();

-- Public report page (anyone with the link, like the invoice link).
create or replace function public.public_report(p_token text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select r.data || jsonb_build_object('created_at', r.created_at)
  from public.brand_reports r
  where r.public_token = p_token and length(p_token) >= 24;
$$;

-- Public page now includes live Instagram figures and audience.
create or replace function public.public_page()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'app_name', s.app_name,
    'display_name', s.display_name,
    'handle', s.handle,
    'niche', s.niche,
    'city', s.city,
    'followers', s.followers,
    'engagement', s.engagement,
    'reply_time', s.reply_time,
    'accepting', s.accepting,
    'rates', case when s.show_rates then s.rates else null end,
    'worked_with', coalesce((
      select jsonb_agg(w.name order by w.name)
      from (
        select distinct b.name
        from public.collabs c join public.brands b on b.id = c.brand_id
        where c.stage in ('live', 'wrapped')
        limit 24
      ) w
    ), '[]'::jsonb),
    'instagram', case when a.connected then jsonb_build_object(
      'username', a.username, 'followers', a.followers, 'engagement_rate', a.engagement_rate,
      'avg_views', a.avg_views, 'avg_reach', a.avg_reach, 'demographics', a.demographics,
      'profile_picture_url', a.profile_picture_url, 'updated_at', a.last_sync_at) else null end
  )
  from public.creator_settings s, public.ig_account a
  where s.id = 1 and a.id = 1;
$$;

-- Brands see the results reports that were sent to them.
create or replace function public.my_reports()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'token', r.public_token, 'sent_at', r.sent_at) order by r.sent_at desc), '[]'::jsonb)
  from public.brand_reports r join public.collabs c on c.id = r.collab_id
  where r.status = 'sent' and public.my_brand_id() is not null and c.brand_id = public.my_brand_id();
$$;

alter table public.ig_account enable row level security;
alter table public.ig_followers_history enable row level security;
alter table public.ig_media enable row level security;
alter table public.collab_posts enable row level security;
alter table public.brand_reports enable row level security;

create policy "creator reads instagram account" on public.ig_account for select to authenticated using (public.is_creator());
create policy "creator reads follower history" on public.ig_followers_history for select to authenticated using (public.is_creator());
create policy "creator reads posts" on public.ig_media for select to authenticated using (public.is_creator());
create policy "creator manages post links" on public.collab_posts for all to authenticated using (public.is_creator()) with check (public.is_creator());
create policy "creator manages reports" on public.brand_reports for all to authenticated using (public.is_creator()) with check (public.is_creator());

grant execute on function public.public_report(text) to anon, authenticated;
revoke execute on function public.my_reports() from anon;

alter publication supabase_realtime add table public.ig_account, public.collab_posts, public.brand_reports;

-- 06:00 AM India time (00:30 UTC): pull the latest Instagram numbers.
select cron.schedule('instagram-sync', '30 0 * * *', $$select private.call_function('instagram-sync')$$);
