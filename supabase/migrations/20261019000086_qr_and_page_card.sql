-- Release 1: branded QR codes (each its own short link with a scan count) and the picture
-- WhatsApp/Instagram show when her link is shared.

-- ---------------------------------------------------------------- QR codes
create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique default lower(substr(md5(gen_random_uuid()::text), 1, 7)),
  name text not null default 'My QR code',
  dest text not null default 'page' check (dest in ('page', 'request')),
  style jsonb not null default '{}'::jsonb,
  scans integer not null default 0,
  last_scan_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.qr_codes enable row level security;
drop policy if exists "creator manages qr codes" on public.qr_codes;
create policy "creator manages qr codes" on public.qr_codes for all to authenticated
  using ((select public.is_creator())) with check ((select public.is_creator()));

-- Requests that came from a scan.
alter table public.collabs add column if not exists qr_id uuid references public.qr_codes (id) on delete set null;
create index if not exists collabs_qr_id_idx on public.collabs (qr_id);

-- A scan: count it and say where to go ('/' or '/brand/new'), or null for an unknown code.
create or replace function public.qr_go(p_slug text)
returns text language sql security definer set search_path = '' as $$
  update public.qr_codes set scans = scans + 1, last_scan_at = now()
  where slug = lower(btrim(p_slug))
  returning case dest when 'request' then '/brand/new' else '/' end;
$$;
revoke execute on function public.qr_go(text) from public;
grant execute on function public.qr_go(text) to anon, authenticated, service_role;

-- After a brand sends a request from a scanned code, the request remembers which code it was.
create or replace function public.qr_attach(p_code text, p_slug text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  q uuid;
begin
  select id into q from public.qr_codes where slug = lower(btrim(p_slug));
  if q is null then return false; end if;
  update public.collabs set qr_id = q
  where code = p_code and brand_id = public.my_brand_id() and qr_id is null
    and created_at > now() - interval '1 day';
  return found;
end $$;
revoke execute on function public.qr_attach(text, text) from public, anon;
grant execute on function public.qr_attach(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------- Link preview card
-- The studio draws the card (her name and numbers) and uploads it; v changes the address so
-- WhatsApp fetches the new one, sig says which numbers it shows.
alter table public.creator_settings add column if not exists page_card_v bigint not null default 0;
alter table public.creator_settings add column if not exists page_card_sig text not null default '';

create or replace function public.page_card()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('v', page_card_v) from public.creator_settings where id = 1;
$$;
revoke execute on function public.page_card() from public;
grant execute on function public.page_card() to anon, authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cards', 'cards', true, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "creator manages cards" on storage.objects;
create policy "creator manages cards" on storage.objects for all to authenticated
  using (bucket_id = 'cards' and (select public.is_creator()))
  with check (bucket_id = 'cards' and (select public.is_creator()));
