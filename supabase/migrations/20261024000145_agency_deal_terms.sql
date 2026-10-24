-- Agency commission per deal. The roster used the creator's current percentage for every past deal, so
-- changing it rewrote history. Each deal now keeps the percentage it was agreed at: when the agency
-- changes a creator's rate, the paid deals so far are locked at the old one first, a deal is locked when
-- its commission is marked settled, and one deal can be given its own percentage.

create table if not exists public.agency_deal_terms (
  email text not null,
  collab_id uuid not null references public.collabs (id) on delete cascade,
  pct numeric(5, 2) not null check (pct between 0 and 50),
  -- 'rate': locked from the creator's rate at the time; 'deal': set for this deal by hand.
  source text not null default 'rate' check (source in ('rate', 'deal')),
  set_at timestamptz not null default now(),
  primary key (email, collab_id)
);
alter table public.agency_deal_terms enable row level security;
revoke all on public.agency_deal_terms from anon, authenticated;

-- The rate this agency member has for a creator right now (15% until they set one).
create or replace function private.agency_pct(p_email text, p_creator integer)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce((select x.pct from public.agency_splits x where x.email = p_email and x.creator_id = p_creator), 15);
$$;
revoke execute on function private.agency_pct(text, integer) from public, anon, authenticated;

-- Lock every paid deal of a creator that has no term yet at the given percentage.
create or replace function private.agency_lock_deals(p_email text, p_creator integer, p_pct numeric)
returns void
language sql security definer
set search_path = public
as $$
  insert into public.agency_deal_terms (email, collab_id, pct, source)
  select p_email, c.id, p_pct, 'rate'
  from public.collabs c
  where c.creator_id = p_creator and c.pay_status = 'paid' and c.type <> 'barter'
  on conflict (email, collab_id) do nothing;
$$;
revoke execute on function private.agency_lock_deals(text, integer, numeric) from public, anon, authenticated;

create or replace function public.agency_set(p_creator integer, p_pct numeric, p_collab uuid, p_settled boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := public.jwt_email();
begin
  if not exists (select 1 from public.my_creators() m where m = p_creator) then raise exception 'You don''t work for this creator'; end if;
  if p_pct is not null then
    -- Deals paid so far keep the rate they were made at.
    perform private.agency_lock_deals(v_email, p_creator, private.agency_pct(v_email, p_creator));
    insert into public.agency_splits (email, creator_id, pct) values (v_email, p_creator, greatest(0, least(50, p_pct)))
    on conflict (email, creator_id) do update set pct = excluded.pct;
  end if;
  if p_collab is not null then
    if not exists (select 1 from public.collabs c where c.id = p_collab and c.creator_id = p_creator) then raise exception 'Not this creator''s deal'; end if;
    if p_settled then
      insert into public.agency_settled (email, collab_id) values (v_email, p_collab) on conflict do nothing;
      -- A settled commission is final: keep its percentage.
      insert into public.agency_deal_terms (email, collab_id, pct, source) values (v_email, p_collab, private.agency_pct(v_email, p_creator), 'rate')
      on conflict (email, collab_id) do nothing;
    else
      delete from public.agency_settled where email = v_email and collab_id = p_collab;
    end if;
  end if;
end;
$$;
revoke execute on function public.agency_set(integer, numeric, uuid, boolean) from public, anon;
grant execute on function public.agency_set(integer, numeric, uuid, boolean) to authenticated;

-- One deal on its own terms (a special split agreed for that collab).
create or replace function public.agency_deal_pct(p_collab uuid, p_pct numeric)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_creator integer;
begin
  select c.creator_id into v_creator from public.collabs c where c.id = p_collab;
  if v_creator is null or not exists (select 1 from public.my_creators() m where m = v_creator) then raise exception 'Not a deal you manage'; end if;
  if p_pct is null or p_pct < 0 or p_pct > 50 then raise exception 'Commission must be between 0 and 50%%'; end if;
  insert into public.agency_deal_terms (email, collab_id, pct, source) values (public.jwt_email(), p_collab, p_pct, 'deal')
  on conflict (email, collab_id) do update set pct = excluded.pct, source = 'deal', set_at = now();
end;
$$;
revoke execute on function public.agency_deal_pct(uuid, numeric) from public, anon;
grant execute on function public.agency_deal_pct(uuid, numeric) to authenticated;

-- The roster: each deal carries its own percentage (locked, set by hand, or the current rate if still open).
create or replace function public.agency_roster()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with mine as (
    select s.* from public.creator_settings s
    where s.id in (select public.my_creators()) and s.status = 'active'
      and (lower(s.creator_email) = public.jwt_email()
        or exists (select 1 from public.team_members t where t.creator_id = s.id and t.email = public.jwt_email() and t.role in ('owner', 'manager')))
  )
  select coalesce(jsonb_agg(private.creator_card(m.id) || jsonb_build_object(
      'slug', m.slug, 'site_url', m.site_url, 'rates', m.rates, 'show_insights', m.show_insights,
      'pct', private.agency_pct(public.jwt_email(), m.id),
      'open', (select count(*) from public.collabs c where c.creator_id = m.id and c.stage in ('request', 'negotiating', 'confirmed', 'creating')),
      'requests', (select count(*) from public.collabs c where c.creator_id = m.id and c.stage = 'request'),
      'due', (select coalesce(sum(greatest(0, i.payable - i.amount_received)), 0) from public.invoices i where i.creator_id = m.id and i.status in ('sent', 'partly_paid')),
      'week', (select count(*) from public.collabs c where c.creator_id = m.id and c.live_date between current_date and current_date + 7),
      'deals', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'brand', b.name, 'fee', c.fee, 'paid_on', c.paid_on,
          'settled', exists (select 1 from public.agency_settled z where z.email = public.jwt_email() and z.collab_id = c.id),
          'pct', coalesce(t.pct, private.agency_pct(public.jwt_email(), m.id)),
          'term', t.source) order by c.paid_on desc)
        from public.collabs c join public.brands b on b.id = c.brand_id
        left join public.agency_deal_terms t on t.email = public.jwt_email() and t.collab_id = c.id
        where c.creator_id = m.id and c.pay_status = 'paid' and c.paid_on > current_date - 365 and c.type <> 'barter'), '[]'::jsonb))
    order by lower(m.display_name)), '[]'::jsonb)
  from mine m;
$$;
revoke execute on function public.agency_roster() from public, anon;
grant execute on function public.agency_roster() to authenticated;
