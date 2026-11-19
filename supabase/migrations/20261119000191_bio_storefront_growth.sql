-- Daily-Use Creator Bio Storefront (0% fee direct UPI QR checkout + storefront orders)
-- Extends page_links so creators can sell digital drops, 1:1 calls, and affiliate picks directly on
-- their Miracle bio link page with zero platform commission, plus tracks incoming UPI orders.

-- 1. Upgrade page_links with storefront fields ------------------------------------------------------------
alter table public.page_links
  add column if not exists kind text not null default 'link',
  add column if not exists subtitle text not null default '',
  add column if not exists price_inr integer not null default 0,
  add column if not exists badge text not null default '';

alter table public.page_links drop constraint if exists page_links_kind_check;
alter table public.page_links add constraint page_links_kind_check
  check (kind in ('link', 'product', 'call', 'affiliate'));

alter table public.page_links drop constraint if exists page_links_price_inr_check;
alter table public.page_links add constraint page_links_price_inr_check
  check (price_inr >= 0 and price_inr <= 500000);

alter table public.page_links drop constraint if exists page_links_subtitle_check;
alter table public.page_links add constraint page_links_subtitle_check
  check (char_length(subtitle) <= 120);

alter table public.page_links drop constraint if exists page_links_badge_check;
alter table public.page_links add constraint page_links_badge_check
  check (char_length(badge) <= 24);

-- 2. Storefront Orders (Direct UPI checkout submissions from followers / brands) -------------------------
create table if not exists public.storefront_orders (
  id uuid primary key default gen_random_uuid(),
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  link_id uuid not null references public.page_links (id) on delete cascade,
  item_title text not null,
  item_kind text not null default 'product',
  amount_inr integer not null check (amount_inr >= 0),
  buyer_name text not null check (char_length(btrim(buyer_name)) between 1 and 80),
  buyer_contact text not null check (char_length(btrim(buyer_contact)) between 3 and 120),
  upi_ref text not null default '' check (char_length(upi_ref) <= 60),
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'fulfilled')),
  created_at timestamptz not null default now()
);

create index if not exists storefront_orders_creator_idx
  on public.storefront_orders (creator_id, created_at desc);

alter table public.storefront_orders enable row level security;

drop trigger if exists "0_fill_creator" on public.storefront_orders;
create trigger "0_fill_creator" before insert on public.storefront_orders
  for each row execute function private.fill_creator();

drop trigger if exists "0_keep_creator" on public.storefront_orders;
create trigger "0_keep_creator" before update of creator_id on public.storefront_orders
  for each row execute function private.keep_creator();

drop policy if exists "page team manages storefront orders" on public.storefront_orders;
create policy "page team manages storefront orders" on public.storefront_orders
  for all to authenticated
  using (creator_id = (select public.current_creator()) and (select public.team_role()) in ('owner', 'manager', 'assistant'))
  with check (creator_id = (select public.current_creator()) and (select public.team_role()) in ('owner', 'manager', 'assistant'));

-- Public RPC: submit a 0%-fee UPI storefront order from the creator's bio page ---------------------------
create or replace function public.storefront_order_create(
  p_link_id uuid,
  p_buyer_name text,
  p_buyer_contact text,
  p_upi_ref text default '',
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cid integer := private.page_creator();
  v_item public.page_links%rowtype;
  v_name text := btrim(coalesce(p_buyer_name, ''));
  v_contact text := btrim(coalesce(p_buyer_contact, ''));
  v_ref text := btrim(coalesce(p_upi_ref, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_id uuid;
begin
  if v_cid is null then
    raise exception 'Creator page not found.';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'Enter your name.';
  end if;
  if char_length(v_contact) < 3 or char_length(v_contact) > 120 then
    raise exception 'Enter your email or WhatsApp number.';
  end if;

  select * into v_item
  from public.page_links
  where id = p_link_id and creator_id = v_cid and active = true;

  if not found then
    raise exception 'This storefront item is no longer available.';
  end if;

  insert into public.storefront_orders (
    creator_id, link_id, item_title, item_kind, amount_inr, buyer_name, buyer_contact, upi_ref, note
  ) values (
    v_cid, v_item.id, v_item.title, v_item.kind, v_item.price_inr,
    v_name, v_contact, left(v_ref, 60), left(v_note, 300)
  )
  returning id into v_id;

  update public.page_links set clicks = clicks + 1 where id = v_item.id;

  return jsonb_build_object(
    'id', v_id,
    'delivery_url', v_item.url,
    'title', v_item.title
  );
end;
$$;

revoke execute on function public.storefront_order_create(uuid, text, text, text, text) from public;
grant execute on function public.storefront_order_create(uuid, text, text, text, text) to anon, authenticated;

-- 3. Update page_extras() to expose storefront fields & creator UPI ID (only when paid items exist) ------
create or replace function public.page_extras()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'content_languages', to_jsonb(s.content_languages),
    'instant_booking', s.instant_booking,
    'weeks', case when s.instant_booking then public.availability() else null end,
    'away_until', case when public.is_away() then s.away_until end,
    'demand_factor', public.demand_factor(),
    'bio', nullif(btrim(s.bio), ''),
    'links', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'title', l.title,
          'url', l.url,
          'kind', l.kind,
          'subtitle', nullif(btrim(l.subtitle), ''),
          'price_inr', l.price_inr,
          'badge', nullif(btrim(l.badge), '')
        ) order by l.position, l.created_at
      )
      from public.page_links l
      where l.creator_id = s.id and l.active
    ), '[]'::jsonb),
    'upi_id', case
      when exists (select 1 from public.page_links l where l.creator_id = s.id and l.active and l.price_inr > 0)
      then nullif(btrim(s.upi_id), '')
      else null
    end,
    'fan_list', case when s.fan_list_on then jsonb_build_object('pitch', nullif(btrim(s.fan_list_pitch), '')) else null end,
    'cases', coalesce((select jsonb_agg(jsonb_build_object('id', cs.id, 'brand', b.name, 'title', cs.title, 'summary', cs.summary,
        'goal', cs.goal, 'made', cs.made, 'results', cs.results, 'highlights', cs.highlights, 'quote', cs.quote, 'quote_by', cs.quote_by,
        'published_at', cs.published_at,
        'post', (select m.permalink from public.collab_posts cp join public.ig_media m on m.id = cp.media_id where cp.collab_id = cs.collab_id order by m.posted_at limit 1))
      order by cs.published_at desc)
      from public.case_studies cs join public.collabs k on k.id = cs.collab_id join public.brands b on b.id = k.brand_id
      where cs.creator_id = s.id and cs.status = 'published'), '[]'::jsonb),
    'white_label', private.plan_has('creator', s.id::text, 'white_label')
  )
  from public.creator_settings s
  where s.id = private.page_creator();
$$;
