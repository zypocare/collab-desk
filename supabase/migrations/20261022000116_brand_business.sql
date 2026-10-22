-- Brand side, phase 3: the Business section.
-- Teams with roles and an approval limit, and four views across every creator a brand works with:
-- money (invoices, GST, TDS), content (posts and usage rights), calendar (go-lives and drafts) and
-- shipping (products for gifting). All of it reads only collabs of companies this login belongs to.

-- 1. Teams -------------------------------------------------------------------------------------------------
-- A team is its owner's login: the pools, campaigns and autopilots of migrations 114-115 belong to it.
create table if not exists public.brand_teams (
  owner uuid primary key references auth.users (id) on delete cascade,
  approval_on boolean not null default false,
  approval_limit numeric(12, 2) not null default 50000 check (approval_limit >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.brand_team_members (
  owner uuid not null references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'member' check (role in ('admin', 'approver', 'finance', 'member')),
  profile_id uuid references auth.users (id) on delete set null,
  invited_by text not null default '',
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (owner, email)
);
create index if not exists brand_team_members_profile_idx on public.brand_team_members (profile_id);

alter table public.brand_teams enable row level security;
alter table public.brand_team_members enable row level security;

-- The team this login works in: the one it joined, else its own.
create or replace function public.brand_owner()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select m.owner from public.brand_team_members m where m.profile_id = auth.uid() and m.joined_at is not null order by m.joined_at limit 1),
    auth.uid());
$$;
grant execute on function public.brand_owner() to authenticated;

drop policy if exists "brand reads own team" on public.brand_teams;
create policy "brand reads own team" on public.brand_teams for select to authenticated using (owner = (select public.brand_owner()));
drop policy if exists "brand reads own team members" on public.brand_team_members;
create policy "brand reads own team members" on public.brand_team_members for select to authenticated using (owner = (select public.brand_owner()));

-- The team a given login belongs to, and everyone in it.
create or replace function private.owner_of(p_profile uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select m.owner from public.brand_team_members m where m.profile_id = p_profile and m.joined_at is not null order by m.joined_at limit 1),
    p_profile);
$$;
create or replace function private.team_logins(p_owner uuid)
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select p_owner
  union
  select m.profile_id from public.brand_team_members m where m.owner = p_owner and m.joined_at is not null and m.profile_id is not null;
$$;
-- The signed-in login's role: the owner is the Admin.
create or replace function private.team_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select case when public.brand_owner() = auth.uid() then 'admin'
    else coalesce((select m.role from public.brand_team_members m where m.owner = public.brand_owner() and m.profile_id = auth.uid()), 'member') end;
$$;
revoke execute on function private.owner_of(uuid) from public, anon, authenticated;
revoke execute on function private.team_logins(uuid) from public, anon, authenticated;
revoke execute on function private.team_role() from public, anon, authenticated;

-- A company one teammate gets (a new creator, a copied company) is the whole team's.
create or replace function private.team_share_brand()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  insert into public.brand_members (profile_id, brand_id)
  select l, new.brand_id from private.team_logins(private.owner_of(new.profile_id)) l
  where l is distinct from new.profile_id
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists "team_share" on public.brand_members;
create trigger "team_share" after insert on public.brand_members for each row execute function private.team_share_brand();
revoke execute on function private.team_share_brand() from public, anon, authenticated;

-- 2. Approvals -----------------------------------------------------------------------------------------------
create table if not exists public.brand_approvals (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  collab_id uuid not null references public.collabs (id) on delete cascade,
  total numeric(12, 2) not null,
  requested_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists brand_approvals_pending on public.brand_approvals (quote_id) where status = 'pending';
alter table public.brand_approvals enable row level security;
drop policy if exists "brand reads own approvals" on public.brand_approvals;
create policy "brand reads own approvals" on public.brand_approvals for select to authenticated using (owner = (select public.brand_owner()));

-- Whether the signed-in login may accept a quote of this size.
create or replace function private.may_accept(p_total numeric)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select not t.approval_on or coalesce(p_total, 0) <= t.approval_limit or private.team_role() in ('admin', 'approver')
    from public.brand_teams t where t.owner = public.brand_owner()), true);
$$;
revoke execute on function private.may_accept(numeric) from public, anon, authenticated;

-- Accepting a quote: as before, unless it's over the team's approval limit.
create or replace function public.respond_quote(p_quote uuid, p_accept boolean, p_name text default '', p_note text default '', p_option integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.collabs;
  me public.profiles;
  v_total numeric;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select x.* into c from public.collabs x join public.quotes q on q.collab_id = x.id where q.id = p_quote;
  if c.id is null or public.my_brand_id() is null or c.brand_id <> public.my_brand_id() then
    raise exception 'Quote not found.';
  end if;
  select * into me from public.profiles where id = auth.uid();
  -- Over the team's approval limit: it goes to an Admin or Approver instead of being accepted.
  if p_accept then
    select q.total into v_total from public.quotes q where q.id = p_quote;
    if not private.may_accept(v_total) then
      insert into public.brand_approvals (owner, quote_id, collab_id, total, requested_by)
      values (public.brand_owner(), p_quote, c.id, v_total, auth.uid())
      on conflict do nothing;
      return jsonb_build_object('approval', true);
    end if;
  end if;
  -- The steps that follow work for the collab's creator.
  perform private.act_for(c.creator_id);
  if p_accept then perform private.quote_pick(p_quote, p_option); end if;
  return private.quote_response(p_quote, p_accept, coalesce(nullif(btrim(p_name), ''), me.full_name), p_note, me.email, auth.uid());
end;
$$;

-- An Admin or Approver decides: approving accepts the quote and signs with their own name.
create or replace function public.approval_decide(p_id uuid, p_approve boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  a public.brand_approvals;
  k public.collabs;
  me public.profiles;
begin
  if private.team_role() not in ('admin', 'approver') then
    raise exception 'Only an Admin or Approver can decide this.';
  end if;
  select * into a from public.brand_approvals where id = p_id and owner = public.brand_owner() and status = 'pending';
  if a.id is null then
    raise exception 'That has already been decided.';
  end if;
  if p_approve then
    select * into k from public.collabs where id = a.collab_id;
    select * into me from public.profiles where id = auth.uid();
    perform private.act_for(k.creator_id);
    update public.profiles set brand_id = k.brand_id where id = auth.uid();
    perform public.respond_quote(a.quote_id, true, coalesce(nullif(me.full_name, ''), me.email), '', null);
    perform private.act_for(null);
  end if;
  update public.brand_approvals set status = case when p_approve then 'approved' else 'declined' end, decided_by = auth.uid(), decided_at = now()
  where id = a.id;
  return public.team_get();
end;
$$;

-- 3. The team page ---------------------------------------------------------------------------------------------
create or replace function public.team_get()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'role', private.team_role(),
    'owner', jsonb_build_object('email', (select u.email from auth.users u where u.id = public.brand_owner()),
      'name', (select p.full_name from public.profiles p where p.id = public.brand_owner()), 'you', public.brand_owner() = auth.uid()),
    'approval_on', coalesce((select t.approval_on from public.brand_teams t where t.owner = public.brand_owner()), false),
    'approval_limit', coalesce((select t.approval_limit from public.brand_teams t where t.owner = public.brand_owner()), 50000),
    'members', coalesce((select jsonb_agg(jsonb_build_object('email', m.email, 'name', coalesce(nullif(p.full_name, ''), m.name), 'role', m.role,
        'joined', m.joined_at is not null, 'you', m.profile_id = auth.uid()) order by m.invited_at)
      from public.brand_team_members m left join public.profiles p on p.id = m.profile_id
      where m.owner = public.brand_owner()), '[]'::jsonb),
    'approvals', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'total', a.total, 'code', k.code, 'slug', s.slug,
        'creator', s.display_name, 'by', coalesce(nullif(p.full_name, ''), p.email), 'at', a.created_at,
        'campaign', (select c.name from public.campaign_creators x join public.brand_campaigns c on c.id = x.campaign_id where x.collab_id = k.id limit 1))
        order by a.created_at)
      from public.brand_approvals a join public.collabs k on k.id = a.collab_id join public.creator_settings s on s.id = k.creator_id
      left join public.profiles p on p.id = a.requested_by
      where a.owner = public.brand_owner() and a.status = 'pending'), '[]'::jsonb))
  where auth.uid() is not null;
$$;

create or replace function public.team_invite(p_email text, p_name text default '', p_role text default 'member')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  me public.profiles;
  b public.brands;
  v_existing uuid;
begin
  if public.is_creator() or private.team_role() <> 'admin' then
    raise exception 'Only an Admin can invite people.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Type a full email address.'; end if;
  if p_role not in ('admin', 'approver', 'finance', 'member') then raise exception 'Choose a role.'; end if;
  select * into me from public.profiles where id = auth.uid();
  if v_email = lower(coalesce((select u.email from auth.users u where u.id = public.brand_owner()), '')) then raise exception 'That''s already the team''s Admin.'; end if;
  if (select count(*) from public.brand_team_members where owner = public.brand_owner()) >= 30 then
    raise exception 'A team holds up to 30 people.';
  end if;
  -- The company the invitation is sent from (any of the team's).
  select x.* into b from public.brand_members m join public.brands x on x.id = m.brand_id
  where m.profile_id = public.brand_owner() order by m.created_at limit 1;
  if b.id is null then
    raise exception 'Add your company details first.';
  end if;
  insert into public.brand_teams (owner) values (public.brand_owner()) on conflict do nothing;
  insert into public.brand_team_members (owner, email, name, role, invited_by)
  values (public.brand_owner(), v_email, left(btrim(coalesce(p_name, '')), 80), p_role, coalesce(nullif(me.full_name, ''), me.email))
  on conflict (owner, email) do update set role = excluded.role, name = coalesce(nullif(excluded.name, ''), brand_team_members.name);
  -- Already on Miracle: they join now and get the team's companies.
  select p.id into v_existing from public.profiles p where lower(p.email) = v_email;
  if v_existing is not null and not exists (select 1 from public.brand_team_members m where m.profile_id = v_existing and m.joined_at is not null and m.owner <> public.brand_owner()) then
    update public.brand_team_members set profile_id = v_existing, joined_at = coalesce(joined_at, now()) where owner = public.brand_owner() and email = v_email;
    insert into public.brand_members (profile_id, brand_id)
    select v_existing, m.brand_id from public.brand_members m where m.profile_id = public.brand_owner() on conflict do nothing;
  end if;
  insert into public.outbox (creator_id, kind, to_email, payload) values (b.creator_id, 'brand_invite', v_email, jsonb_build_object(
    'brand', b.name, 'name', btrim(coalesce(p_name, '')), 'by', coalesce(nullif(me.full_name, ''), me.email)));
  return public.team_get();
end;
$$;

create or replace function public.team_set_role(p_email text, p_role text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if private.team_role() <> 'admin' then raise exception 'Only an Admin can change roles.'; end if;
  if p_role not in ('admin', 'approver', 'finance', 'member') then raise exception 'Choose a role.'; end if;
  update public.brand_team_members set role = p_role where owner = public.brand_owner() and email = lower(btrim(p_email));
  return public.team_get();
end;
$$;

create or replace function public.team_remove(p_email text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  m public.brand_team_members;
begin
  if private.team_role() <> 'admin' then raise exception 'Only an Admin can remove people.'; end if;
  delete from public.brand_team_members where owner = public.brand_owner() and email = lower(btrim(p_email)) returning * into m;
  -- They lose the team's companies (they keep any of their own).
  if m.profile_id is not null and m.profile_id <> auth.uid() then
    delete from public.brand_members x
    where x.profile_id = m.profile_id
      and x.brand_id in (select y.brand_id from public.brand_members y where y.profile_id = public.brand_owner())
      and not exists (select 1 from public.collabs k where k.brand_id = x.brand_id and lower(k.contact_email) = lower(m.email));
  end if;
  return public.team_get();
end;
$$;

create or replace function public.team_settings(p_on boolean, p_limit numeric)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if private.team_role() <> 'admin' then raise exception 'Only an Admin can change approvals.'; end if;
  insert into public.brand_teams (owner, approval_on, approval_limit) values (public.brand_owner(), p_on, greatest(0, coalesce(p_limit, 50000)))
  on conflict (owner) do update set approval_on = excluded.approval_on, approval_limit = excluded.approval_limit;
  return public.team_get();
end;
$$;

-- Invited by email and signing in for the first time since: join the team.
create or replace function public.team_join()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null or public.is_creator() then return null; end if;
  if not exists (select 1 from public.brand_team_members m where m.profile_id = auth.uid() and m.joined_at is not null) then
    update public.brand_team_members m set profile_id = auth.uid(), joined_at = now()
    where m.ctid = (select x.ctid from public.brand_team_members x where lower(x.email) = public.jwt_email() and x.profile_id is null
                    order by x.invited_at limit 1)
    returning m.owner into v_owner;
    if v_owner is not null then
      insert into public.brand_members (profile_id, brand_id)
      select auth.uid(), m.brand_id from public.brand_members m where m.profile_id = v_owner on conflict do nothing;
      insert into public.brand_members (profile_id, brand_id)
      select v_owner, m.brand_id from public.brand_members m where m.profile_id = auth.uid() on conflict do nothing;
    end if;
  end if;
  return jsonb_build_object('owner', public.brand_owner(), 'role', private.team_role());
end;
$$;

-- 4. Money, content, calendar, shipping (every collab of this login's companies) ---------------------------------
create or replace function private.my_collabs()
returns setof public.collabs
language sql stable security definer
set search_path = public
as $$
  select k.* from public.collabs k
  where exists (select 1 from public.brand_members m where m.brand_id = k.brand_id and m.profile_id = auth.uid());
$$;
revoke execute on function private.my_collabs() from public, anon, authenticated;

create or replace function public.brand_money()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with inv as (
    select i.*, k.code, s.display_name as creator, s.slug,
      coalesce(i.cgst, 0) + coalesce(i.sgst, 0) + coalesce(i.igst, 0) as gst,
      greatest(0, i.payable - coalesce(i.amount_received, 0)) as due_amount
    from private.my_collabs() k
    join public.invoices i on i.collab_id = k.id and i.status not in ('draft', 'cancelled')
    join public.creator_settings s on s.id = k.creator_id
  ), d as (
    select (now() at time zone 'Asia/Kolkata')::date as today
  ), fy as (
    select make_date(case when extract(month from today) >= 4 then extract(year from today)::int else extract(year from today)::int - 1 end, 4, 1) as fy0, today from d
  )
  select jsonb_build_object(
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('number', inv.number, 'kind', inv.kind, 'code', inv.code, 'creator', inv.creator, 'slug', inv.slug,
        'total', inv.total, 'payable', inv.payable, 'due', inv.due_amount, 'gst', inv.gst, 'tds', inv.tds_amount, 'currency', inv.currency,
        'issue_date', inv.issue_date, 'due_date', inv.due_date, 'status', inv.status, 'paid_on', inv.paid_on, 'token', inv.public_token,
        'claimed', inv.claim_at is not null, 'claim_ref', inv.claim_ref)
      order by (inv.status in ('sent', 'partly_paid')) desc, inv.due_date nulls last, inv.issue_date desc) from inv), '[]'::jsonb),
    'to_pay', (select coalesce(sum(due_amount), 0) from inv where status in ('sent', 'partly_paid') and claim_at is null),
    'to_pay_count', (select count(*) from inv where status in ('sent', 'partly_paid') and claim_at is null),
    'overdue', (select coalesce(sum(due_amount), 0) from inv, d where status in ('sent', 'partly_paid') and claim_at is null and due_date < d.today),
    'paid_month', (select coalesce(sum(payable), 0) from inv, d where status = 'paid' and paid_on >= date_trunc('month', d.today)::date),
    'paid_month_creators', (select count(distinct creator) from inv, d where status = 'paid' and paid_on >= date_trunc('month', d.today)::date),
    'gst_fy', (select coalesce(sum(gst), 0) from inv, fy where status in ('paid', 'partly_paid', 'sent') and issue_date >= fy.fy0),
    'tds_fy', (select coalesce(sum(tds_amount), 0) from inv, fy where status in ('paid', 'partly_paid', 'sent') and issue_date >= fy.fy0))
  where auth.uid() is not null;
$$;

create or replace function public.brand_content()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x.obj order by x.last desc nulls last), '[]'::jsonb)
  from (
    select max(m.posted_at) as last, jsonb_build_object(
      'collab_id', k.id, 'code', k.code, 'slug', s.slug, 'creator', s.display_name, 'usage', k.usage, 'usage_ends', k.usage_ends,
      'usage_ext_status', k.usage_ext_status, 'files', (select count(*) from public.collab_files f where f.collab_id = k.id and k.files_sent_at is not null),
      'posts', coalesce(jsonb_agg(jsonb_build_object('permalink', m.permalink, 'thumb', m.thumbnail_url, 'type', m.media_type, 'product', m.product_type,
        'posted_at', m.posted_at, 'views', m.views, 'likes', m.likes) order by m.posted_at desc) filter (where m.id is not null), '[]'::jsonb)) as obj
    from private.my_collabs() k
    join public.creator_settings s on s.id = k.creator_id
    left join public.collab_posts p on p.collab_id = k.id
    left join public.ig_media m on m.id = p.media_id
    group by k.id, k.code, s.slug, s.display_name, k.usage, k.usage_ends, k.usage_ext_status, k.files_sent_at
    having count(m.id) > 0 or k.files_sent_at is not null
  ) x
  where auth.uid() is not null;
$$;

-- Ask to extend paid usage, from the content library (any creator).
create or replace function public.content_extend(p_collab uuid, p_days integer)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  k public.collabs;
begin
  select * into k from private.my_collabs() where id = p_collab;
  if k.id is null then raise exception 'Not found.'; end if;
  perform private.act_for(k.creator_id);
  update public.profiles set brand_id = k.brand_id where id = auth.uid();
  perform public.request_usage_extension(k.code, p_days);
  perform private.act_for(null);
end;
$$;

-- Ask about ad rights (organic-only content), or for a shipping address: a message in the request's chat.
create or replace function public.brand_ask(p_collab uuid, p_what text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  k public.collabs;
  v_first text;
begin
  select * into k from private.my_collabs() where id = p_collab;
  if k.id is null then raise exception 'Not found.'; end if;
  select split_part(s.display_name, ' ', 1) into v_first from public.creator_settings s where s.id = k.creator_id;
  perform private.brand_nudge(auth.uid(), k.id,
    case p_what
      when 'ads' then format('Hi %s! We love how this turned out. Could we use it in paid ads too? What would it cost for 30 days?', v_first)
      when 'address' then format('Hi %s! Could you add your shipping address so we can send the product? Thanks!', v_first)
      else '' end, false);
end;
$$;

create or replace function public.brand_calendar(p_from date, p_to date)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(e.obj order by e.d, e.kind), '[]'::jsonb)
  from (
    select k.live_date as d, 'live' as kind, jsonb_build_object('date', k.live_date, 'kind', 'live', 'code', k.code, 'slug', s.slug, 'creator', s.display_name, 'creator_id', s.id) as obj
    from private.my_collabs() k join public.creator_settings s on s.id = k.creator_id
    where k.live_date between p_from and p_to and k.stage not in ('declined', 'cancelled')
    union all
    select k.draft_date, 'draft', jsonb_build_object('date', k.draft_date, 'kind', 'draft', 'code', k.code, 'slug', s.slug, 'creator', s.display_name, 'creator_id', s.id)
    from private.my_collabs() k join public.creator_settings s on s.id = k.creator_id
    where k.draft_date between p_from and p_to and k.stage in ('confirmed', 'creating')
      and not exists (select 1 from public.drafts d where d.collab_id = k.id and d.status = 'approved')
    union all
    select k.shoot_date, 'shoot', jsonb_build_object('date', k.shoot_date, 'kind', 'shoot', 'code', k.code, 'slug', s.slug, 'creator', s.display_name, 'creator_id', s.id)
    from private.my_collabs() k join public.creator_settings s on s.id = k.creator_id
    where k.shoot_date between p_from and p_to and k.stage in ('confirmed', 'creating')
  ) e
  where auth.uid() is not null and p_to - p_from <= 62;
$$;

create or replace function public.brand_shipping()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('collab_id', k.id, 'code', k.code, 'slug', s.slug, 'creator', s.display_name, 'product', k.product,
      'address_ready', s.ship_address <> '',
      'name', case when s.ship_address <> '' and k.product_received_at is null then coalesce(nullif(s.ship_name, ''), s.display_name) end,
      'address', case when s.ship_address <> '' and k.product_received_at is null then s.ship_address end,
      'phone', case when s.ship_address <> '' and k.product_received_at is null then s.ship_phone end,
      'carrier', k.ship_carrier, 'tracking', k.ship_tracking, 'shipped_at', k.shipped_at, 'received_at', k.product_received_at)
    order by (k.shipped_at is null) desc, k.shipped_at desc nulls last), '[]'::jsonb)
  from private.my_collabs() k join public.creator_settings s on s.id = k.creator_id
  where auth.uid() is not null and k.type <> 'paid' and k.barter_kind = 'product'
    and (k.stage in ('confirmed', 'creating', 'live') or k.product_received_at > now() - interval '30 days');
$$;

-- Mark shipped, from the shipping list (any creator).
create or replace function public.ship_mark(p_collab uuid, p_carrier text, p_tracking text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  k public.collabs;
begin
  select * into k from private.my_collabs() where id = p_collab;
  if k.id is null then raise exception 'Not found.'; end if;
  perform private.act_for(k.creator_id);
  update public.profiles set brand_id = k.brand_id where id = auth.uid();
  perform public.brand_mark_shipped(k.code, p_carrier, p_tracking);
  perform private.act_for(null);
end;
$$;

-- 5. Who may call what ----------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['approval_decide(uuid, boolean)', 'team_get()', 'team_invite(text, text, text)', 'team_set_role(text, text)',
    'team_remove(text)', 'team_settings(boolean, numeric)', 'team_join()', 'brand_money()', 'brand_content()',
    'content_extend(uuid, integer)', 'brand_ask(uuid, text)', 'brand_calendar(date, date)', 'brand_shipping()', 'ship_mark(uuid, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
