-- Posting time: she picks the hour a collab goes live; 30 minutes before, her phone buzzes with
-- the approved caption ready to copy. Briefs can also carry a promo code.

alter table public.collabs
  add column live_time time,
  add column post_alert_at timestamptz;

create or replace function public.clean_brief(d jsonb)
returns jsonb
language sql immutable
as $$
  select case when d is null or jsonb_typeof(d) <> 'object' then '{}'::jsonb else jsonb_strip_nulls(jsonb_build_object(
    'message',    nullif(left(btrim(d ->> 'message'), 1000), ''),
    'link',       nullif(left(btrim(d ->> 'link'), 300), ''),
    'promo',      nullif(left(btrim(d ->> 'promo'), 120), ''),
    'dos',        nullif(left(btrim(d ->> 'dos'), 1000), ''),
    'donts',      nullif(left(btrim(d ->> 'donts'), 1000), ''),
    'references', nullif(left(btrim(d ->> 'references'), 1000), ''),
    'hashtags',   (select nullif(jsonb_agg(distinct '#' || x), '[]') from (
                     select left(regexp_replace(t, '^#+', ''), 60) x
                     from jsonb_array_elements_text(coalesce(case when jsonb_typeof(d -> 'hashtags') = 'array' then d -> 'hashtags' end, '[]')) t
                     limit 15) h where x <> ''),
    'mentions',   (select nullif(jsonb_agg(distinct '@' || lower(x)), '[]') from (
                     select left(regexp_replace(t, '^@+', ''), 60) x
                     from jsonb_array_elements_text(coalesce(case when jsonb_typeof(d -> 'mentions') = 'array' then d -> 'mentions' end, '[]')) t
                     limit 10) m where x <> '')
  )) end;
$$;

-- A new go-live date or time means a new alert.
create or replace function public.collabs_reset_post_alert()
returns trigger
language plpgsql
as $$
begin
  if new.live_date is distinct from old.live_date or new.live_time is distinct from old.live_time then
    new.post_alert_at := null;
  end if;
  return new;
end;
$$;
create trigger collabs_reset_post_alert
  before update of live_date, live_time on public.collabs
  for each row execute function public.collabs_reset_post_alert();

-- Every 10 minutes: collabs due to go live within the next 30 minutes (India time) and not posted yet.
create or replace function private.post_alerts()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  c record;
  n integer := 0;
begin
  select * into s from public.creator_settings where id = 1;
  for c in
    select x.id, x.code, x.live_date, x.live_time, x.brief_details, b.name as brand_name, b.instagram,
      (select d.caption from public.drafts d where d.collab_id = x.id and d.status = 'approved' order by d.round desc limit 1) as caption,
      (select string_agg(qty || ' × ' || kind, ', ' order by position) from public.deliverables where collab_id = x.id) as deliv
    from public.collabs x join public.brands b on b.id = x.brand_id
    where x.stage in ('confirmed', 'creating') and x.live_time is not null and x.post_alert_at is null
      and x.live_date = (now() at time zone 'Asia/Kolkata')::date
      and (x.live_date + x.live_time) at time zone 'Asia/Kolkata' <= now() + interval '30 minutes'
      and (x.live_date + x.live_time) at time zone 'Asia/Kolkata' > now() - interval '3 hours'
  loop
    insert into public.outbox (kind, to_email, payload) values ('post_now', s.creator_email, jsonb_build_object(
      'code', c.code, 'brand', c.brand_name, 'instagram', c.instagram, 'time', to_char(c.live_time, 'FMHH12:MI AM'),
      'caption', coalesce(c.caption, ''), 'deliverables', c.deliv,
      'promo', c.brief_details ->> 'promo', 'link', c.brief_details ->> 'link'));
    update public.collabs set post_alert_at = now() where id = c.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

select cron.schedule('post-alerts', '*/10 * * * *', $$select private.post_alerts()$$);
