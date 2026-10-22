-- Leaving Miracle: download everything, leave a brand's team, delete a creator page or a brand company,
-- and bring it back within 30 days. After 30 days a daily job erases it for good. Invoices are copied
-- aside first and kept as long as Indian tax law needs; a deleted creator's link is held for 90 days.

-- 1. Where an account stands --------------------------------------------------------------------------------------
alter table public.creator_settings drop constraint if exists creator_settings_status_check;
alter table public.creator_settings add constraint creator_settings_status_check
  check (status in ('pending', 'active', 'paused', 'declined', 'deleted', 'closed'));
alter table public.creator_settings add column if not exists closing_at timestamptz;
alter table public.creator_settings add column if not exists erase_after timestamptz;

-- The owner of a deleted (or closed) studio still signs in to it, to download it or bring it back. Their
-- team doesn't.
create or replace function public.my_creators()
returns setof integer
language sql stable security definer
set search_path = public
as $$
  select s.id from public.creator_settings s
  where public.jwt_email() <> '' and lower(s.creator_email) = public.jwt_email() and s.status in ('active', 'paused', 'deleted', 'closed')
  union
  select t.creator_id from public.team_members t join public.creator_settings s on s.id = t.creator_id
  where public.jwt_email() <> '' and t.email = public.jwt_email() and s.status in ('active', 'paused');
$$;

alter table public.brand_profiles add column if not exists closing_at timestamptz;
alter table public.brand_profiles add column if not exists erase_after timestamptz;

-- A deleted creator's link: nobody else can take it for 90 days.
create table if not exists public.held_slugs (
  slug text primary key,
  until timestamptz not null
);
alter table public.held_slugs enable row level security;
revoke all on public.held_slugs from anon, authenticated;

create or replace function private.slug_not_held()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.slug is not null and (tg_op = 'INSERT' or new.slug is distinct from old.slug)
     and exists (select 1 from public.held_slugs h where h.slug = new.slug and h.until > now()) then
    raise exception 'That link is taken. Try another.';
  end if;
  return new;
end;
$$;
revoke execute on function private.slug_not_held() from public, anon, authenticated;
drop trigger if exists slug_not_held on public.creator_settings;
create trigger slug_not_held before insert or update of slug on public.creator_settings
  for each row execute function private.slug_not_held();

create or replace function public.slug_free(p_slug text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select lower(btrim(coalesce(p_slug, ''))) ~ '^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$'
    and lower(btrim(p_slug)) !~ '^new-'
    and lower(btrim(p_slug)) not in ('www', 'app', 'api', 'admin', 'mail', 'email', 'studio', 'brand', 'brands', 'help', 'support',
                                     'blog', 'status', 'miracle', 'docs', 'login', 'signup', 'static', 'cdn', 'assets', 'test', 'dev', 'staging')
    and not exists (select 1 from public.creator_settings s where s.slug = lower(btrim(p_slug)))
    and not exists (select 1 from public.held_slugs h where h.slug = lower(btrim(p_slug)) and h.until > now());
$$;
grant execute on function public.slug_free(text) to anon, authenticated;

-- Invoices outlive the account they were issued from (GST and income tax records).
create table if not exists public.kept_invoices (
  id uuid primary key default gen_random_uuid(),
  creator_id integer not null,
  creator_email text not null default '',
  number text not null,
  issue_date date,
  keep_until date not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.kept_invoices enable row level security;
revoke all on public.kept_invoices from anon, authenticated;

-- 2. Emails from Miracle itself (not from a creator) -----------------------------------------------------------------
-- They have no creator: the payload says "app": true.
alter table public.outbox alter column creator_id drop not null;

create or replace function private.fill_creator()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  j jsonb;
  c integer;
begin
  if new.creator_id is not null then
    return new;
  end if;
  j := to_jsonb(new);
  if tg_table_name = 'outbox' and coalesce(j -> 'payload' ->> 'app', '') = 'true' then
    return new;
  end if;
  if j ->> 'collab_id' is not null then
    select x.creator_id into c from public.collabs x where x.id = (j ->> 'collab_id')::uuid;
  end if;
  if c is null and j ->> 'brand_id' is not null then
    select x.creator_id into c from public.brands x where x.id = (j ->> 'brand_id')::uuid;
  end if;
  if c is null and j ->> 'draft_id' is not null then
    select x.creator_id into c from public.drafts x where x.id = (j ->> 'draft_id')::uuid;
  end if;
  if c is null and j ->> 'deliverable_id' is not null then
    select x.creator_id into c from public.deliverables x where x.id = (j ->> 'deliverable_id')::uuid;
  end if;
  if c is null and j ->> 'invoice_id' is not null then
    select x.creator_id into c from public.invoices x where x.id = (j ->> 'invoice_id')::uuid;
  end if;
  if c is null and j -> 'payload' ->> 'collab_id' is not null then
    select x.creator_id into c from public.collabs x where x.id::text = j -> 'payload' ->> 'collab_id';
  end if;
  if c is null and j -> 'payload' ->> 'code' is not null then
    select x.creator_id into c from public.collabs x where x.code = j -> 'payload' ->> 'code';
  end if;
  if c is null then
    c := public.current_creator();
  end if;
  if c is null then
    select min(s.id) into c from public.creator_settings s having count(*) = 1;
  end if;
  if c is null then
    raise exception 'Can''t tell which creator this % row belongs to.', tg_table_name;
  end if;
  new.creator_id := c;
  return new;
end;
$$;

-- 3. What deleting would touch ------------------------------------------------------------------------------------
-- The company the signed-in brand login belongs to: its owner, and every collab its logins have.
create or replace function private.company_collabs(p_owner uuid)
returns setof public.collabs
language sql stable security definer
set search_path = public
as $$
  select distinct c.* from public.collabs c
  join public.brand_members m on m.brand_id = c.brand_id
  where m.profile_id in (select private.team_logins(p_owner));
$$;
revoke execute on function private.company_collabs(uuid) from public, anon, authenticated;

create or replace function public.my_delete_check()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  f public.brand_profiles;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    select * into s from public.creator_settings where id = public.current_creator();
    return jsonb_build_object(
      'kind', 'creator',
      'owner', public.is_owner(),
      'confirm', coalesce(case when s.slug_chosen then s.slug end, s.display_name),
      'running', coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'name', b.name, 'stage', c.stage, 'stage_label', public.stage_label(c.stage),
          'fee', c.fee, 'live_date', c.live_date) order by c.received_on)
        from public.collabs c join public.brands b on b.id = c.brand_id
        where c.creator_id = s.id and c.stage not in ('wrapped', 'declined', 'cancelled')), '[]'::jsonb),
      'owed', coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'name', b.name, 'number', i.number,
          'amount', greatest(i.payable - coalesce(i.amount_received, 0), 0)) order by i.issue_date)
        from public.invoices i join public.collabs c on c.id = i.collab_id join public.brands b on b.id = c.brand_id
        where i.creator_id = s.id and i.status::text in ('sent', 'partly_paid')), '[]'::jsonb));
  end if;
  v_owner := public.brand_owner();
  select * into f from public.brand_profiles where owner = v_owner;
  return jsonb_build_object(
    'kind', 'brand',
    'owner', v_owner = auth.uid(),
    -- Brands from before sign-up existed have no company profile: their brand's name.
    'confirm', coalesce(f.name, (select b.name from public.profiles p join public.brands b on b.id = p.brand_id where p.id = v_owner), ''),
    'team', (select count(*) from public.brand_team_members m where m.owner = v_owner and m.joined_at is not null),
    'running', coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'name', s2.display_name, 'stage', c.stage,
          'stage_label', public.stage_label(c.stage), 'fee', c.fee) order by c.received_on)
        from private.company_collabs(v_owner) c join public.creator_settings s2 on s2.id = c.creator_id
        where c.stage not in ('wrapped', 'declined', 'cancelled')), '[]'::jsonb),
    'unpaid', coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'name', s2.display_name, 'number', i.number,
          'amount', greatest(i.payable - coalesce(i.amount_received, 0), 0)) order by i.issue_date)
        from public.invoices i join private.company_collabs(v_owner) c on c.id = i.collab_id join public.creator_settings s2 on s2.id = c.creator_id
        where i.status::text in ('sent', 'partly_paid')), '[]'::jsonb));
end;
$$;
revoke execute on function public.my_delete_check() from public, anon;
grant execute on function public.my_delete_check() to authenticated;

-- 4. Delete, bring back, leave ------------------------------------------------------------------------------------
create or replace function public.account_delete(p_confirm text, p_cancel boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  f public.brand_profiles;
  v_running integer;
  c record;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;

  -- A creator's page: only the owner of the studio.
  if public.is_creator() then
    if not public.is_owner() then
      raise exception 'Only the owner of this studio can delete it.';
    end if;
    select * into s from public.creator_settings where id = public.current_creator();
    if lower(btrim(coalesce(p_confirm, ''))) <> lower(btrim(coalesce(case when s.slug_chosen then s.slug end, s.display_name))) then
      raise exception 'Type % to confirm.', coalesce(case when s.slug_chosen then s.slug end, s.display_name);
    end if;
    select count(*) into v_running from public.collabs where creator_id = s.id and stage not in ('wrapped', 'declined', 'cancelled');
    if v_running > 0 and not coalesce(p_cancel, false) then
      raise exception 'Finish or cancel your % running collab% first.', v_running, case when v_running = 1 then '' else 's' end;
    end if;
    for c in
      select k.id, k.code, k.contact_name, k.contact_email, b.name as brand from public.collabs k join public.brands b on b.id = k.brand_id
      where k.creator_id = s.id and k.stage not in ('wrapped', 'declined', 'cancelled')
    loop
      update public.collabs set stage = 'cancelled', lifecycle_reason = s.display_name || ' closed their Miracle page.' where id = c.id;
      if coalesce(btrim(c.contact_email), '') <> '' then
        insert into public.outbox (creator_id, kind, to_email, payload)
        values (s.id, 'collab_closed', c.contact_email, jsonb_build_object('code', c.code, 'brand', c.brand, 'contact', c.contact_name, 'why', 'creator_left'));
      end if;
    end loop;
    update public.creator_settings set status = 'deleted', closing_at = now(), erase_after = now() + interval '30 days' where id = s.id;
    -- Straight away: Instagram is disconnected and the phones stop getting alerts.
    delete from public.ig_token where id = s.id;
    update public.ig_account set connected = false where id = s.id;
    delete from public.push_subscriptions where creator_id = s.id;
    return public.account_closing();
  end if;

  -- A brand's company: only its owner.
  if public.brand_owner() <> auth.uid() then
    raise exception 'Only the owner can delete the company. You can leave the team instead.';
  end if;
  select * into f from public.brand_profiles where owner = auth.uid();
  if f.owner is null then
    -- A brand from before sign-up existed: its company is its brand.
    perform set_config('app.no_signup_check', 'on', true);
    insert into public.brand_profiles (owner, name)
    select auth.uid(), b.name from public.profiles p join public.brands b on b.id = p.brand_id where p.id = auth.uid()
    returning * into f;
    if f.owner is null then
      raise exception 'There''s no company to delete.';
    end if;
  end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(btrim(f.name)) then
    raise exception 'Type % to confirm.', f.name;
  end if;
  select count(*) into v_running from private.company_collabs(f.owner) where stage not in ('wrapped', 'declined', 'cancelled');
  if v_running > 0 and not coalesce(p_cancel, false) then
    raise exception 'Finish or cancel your % running request% first.', v_running, case when v_running = 1 then '' else 's' end;
  end if;
  for c in
    select k.id, k.code, k.creator_id from private.company_collabs(f.owner) k where k.stage not in ('wrapped', 'declined', 'cancelled')
  loop
    update public.collabs set stage = 'cancelled', lifecycle_reason = f.name || ' closed their Miracle account.' where id = c.id;
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (c.creator_id, 'collab_closed_creator', '', jsonb_build_object('code', c.code, 'brand', f.name, 'why', 'brand_left'));
  end loop;
  update public.brand_campaigns set open = false where owner = f.owner and open;
  delete from public.brand_push_subscriptions where user_id in (select private.team_logins(f.owner));
  update public.brand_profiles set closing_at = now(), erase_after = now() + interval '30 days' where owner = f.owner;
  return public.account_closing();
end;
$$;
revoke execute on function public.account_delete(text, boolean) from public, anon;
grant execute on function public.account_delete(text, boolean) to authenticated;

-- Is this account on its way out (deleted and waiting, or closed by Miracle)? null when it isn't.
create or replace function public.account_closing()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  f public.brand_profiles;
begin
  if auth.uid() is null then
    return null;
  end if;
  if public.is_creator() then
    select * into s from public.creator_settings where id = public.current_creator();
    if s.status = 'deleted' then
      return jsonb_build_object('kind', 'creator', 'state', 'deleting', 'name', s.display_name, 'erase_after', s.erase_after, 'owner', public.is_owner());
    elsif s.status = 'closed' then
      return jsonb_build_object('kind', 'creator', 'state', 'closed', 'name', s.display_name, 'owner', public.is_owner());
    end if;
    return null;
  end if;
  select * into f from public.brand_profiles where owner = public.brand_owner();
  if f.owner is null then
    return null;
  end if;
  if f.closing_at is not null then
    return jsonb_build_object('kind', 'brand', 'state', 'deleting', 'name', f.name, 'erase_after', f.erase_after, 'owner', f.owner = auth.uid());
  end if;
  return null;
end;
$$;
revoke execute on function public.account_closing() from public, anon;
grant execute on function public.account_closing() to authenticated;

create or replace function public.account_restore()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    if not public.is_owner() then
      raise exception 'Only the owner can bring the studio back.';
    end if;
    update public.creator_settings set status = 'active', closing_at = null, erase_after = null
    where id = public.current_creator() and status = 'deleted' and erase_after > now();
    return public.account_closing();
  end if;
  update public.brand_profiles set closing_at = null, erase_after = null
  where owner = auth.uid() and closing_at is not null and erase_after > now();
  if not found and public.brand_owner() <> auth.uid() then
    raise exception 'Only the owner can bring the company back.';
  end if;
  return public.account_closing();
end;
$$;
revoke execute on function public.account_restore() from public, anon;
grant execute on function public.account_restore() to authenticated;

-- Someone on a brand's team leaves it (the owner can't: they delete the company or hand it over).
create or replace function public.team_leave()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid := public.brand_owner();
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if v_owner = auth.uid() then
    raise exception 'You own this company. Hand it to someone on the team first, or delete the company.';
  end if;
  delete from public.brand_members x
  where x.profile_id = auth.uid()
    and x.brand_id in (select y.brand_id from public.brand_members y where y.profile_id = v_owner);
  delete from public.brand_team_members where owner = v_owner and profile_id = auth.uid();
  delete from public.brand_push_subscriptions where user_id = auth.uid();
  return public.my_account();
end;
$$;
revoke execute on function public.team_leave() from public, anon;
grant execute on function public.team_leave() to authenticated;

-- 5. A brand's data, for its download -----------------------------------------------------------------------------
create or replace function public.brand_export()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_owner uuid := public.brand_owner();
begin
  if auth.uid() is null or public.is_creator() then
    raise exception 'Please sign in as a brand first.';
  end if;
  if private.team_role() not in ('admin', 'finance') then
    raise exception 'Ask an Admin on your team to download the company''s data.';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'company', (select to_jsonb(f) - 'owner' from public.brand_profiles f where f.owner = v_owner),
    'team', coalesce((select jsonb_agg(jsonb_build_object('email', m.email, 'name', m.name, 'role', m.role, 'joined_at', m.joined_at))
      from public.brand_team_members m where m.owner = v_owner), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object(
        'code', c.code, 'creator', s.display_name, 'brand', b.name, 'stage', c.stage, 'type', c.type, 'fee', c.fee,
        'received_on', c.received_on, 'live_date', c.live_date, 'contact', c.contact_name, 'email', c.contact_email,
        'deliverables', (select string_agg(d.qty || ' × ' || d.kind, ', ' order by d.position) from public.deliverables d where d.collab_id = c.id),
        'quotes', coalesce((select jsonb_agg(jsonb_build_object('version', q.version, 'status', q.status, 'total', q.total, 'items', q.items) order by q.version)
          from public.quotes q where q.collab_id = c.id), '[]'::jsonb),
        'invoices', coalesce((select jsonb_agg(jsonb_build_object('number', i.number, 'kind', i.kind, 'issue_date', i.issue_date, 'due_date', i.due_date,
            'subtotal', i.subtotal, 'cgst', i.cgst, 'sgst', i.sgst, 'igst', i.igst, 'total', i.total, 'tds', i.tds_amount, 'payable', i.payable,
            'received', i.amount_received, 'paid_on', i.paid_on, 'status', i.status) order by i.issue_date)
          from public.invoices i where i.collab_id = c.id and i.status::text <> 'draft'), '[]'::jsonb),
        'messages', coalesce((select jsonb_agg(jsonb_build_object('at', m.created_at, 'from', m.sender, 'text', m.body) order by m.created_at)
          from public.collab_messages m where m.collab_id = c.id), '[]'::jsonb)
      ) order by c.received_on)
      from private.company_collabs(v_owner) c
      join public.brands b on b.id = c.brand_id
      join public.creator_settings s on s.id = c.creator_id), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object('name', k.name, 'status', k.status, 'open', k.open, 'budget', k.budget_total,
        'brief', k.brief, 'created_at', k.created_at,
        'applications', coalesce((select jsonb_agg(jsonb_build_object('creator', s.display_name, 'rate', a.rate, 'note', a.note, 'status', a.status, 'at', a.created_at))
          from public.campaign_applications a join public.creator_settings s on s.id = a.creator_id where a.campaign_id = k.id), '[]'::jsonb)
      ) order by k.created_at) from public.brand_campaigns k where k.owner = v_owner), '[]'::jsonb),
    'ratings', coalesce((select jsonb_agg(jsonb_build_object('creator', s.display_name, 'on_time', r.on_time, 'quality', r.quality, 'results', r.results, 'note', r.note))
      from public.brand_creator_ratings r join public.creator_settings s on s.id = r.creator_id where r.owner = v_owner), '[]'::jsonb),
    'pools', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'creators', coalesce((select jsonb_agg(coalesce(s.display_name, pm.handle))
        from public.brand_pool_members pm left join public.creator_settings s on s.id = pm.creator_id where pm.pool_id = p.id), '[]'::jsonb)))
      from public.brand_pools p where p.owner = v_owner), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.brand_export() from public, anon;
grant execute on function public.brand_export() to authenticated;

-- 6. Erase for good, every night ------------------------------------------------------------------------------------
create or replace function private.erase_closed()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  f public.brand_profiles;
  n integer := 0;
begin
  for s in select * from public.creator_settings where status = 'deleted' and erase_after < now() loop
    insert into public.kept_invoices (creator_id, creator_email, number, issue_date, keep_until, data)
    select s.id, s.creator_email, i.number, i.issue_date, coalesce(i.issue_date, current_date) + interval '8 years',
      to_jsonb(i) || jsonb_build_object('brand', (select b.name from public.collabs c join public.brands b on b.id = c.brand_id where c.id = i.collab_id),
        'creator', s.display_name, 'legal_name', s.legal_name, 'pan', s.pan, 'gstin', s.gstin)
    from public.invoices i where i.creator_id = s.id and i.status::text not in ('draft', 'cancelled');
    if s.slug is not null and s.slug_chosen then
      insert into public.held_slugs (slug, until) values (s.slug, now() + interval '90 days')
      on conflict (slug) do update set until = excluded.until;
    end if;
    -- Every row of the studio goes with it (they all hang off creator_settings).
    delete from public.team_members where creator_id = s.id;
    delete from public.creator_settings where id = s.id;
    -- The sign-in goes too, unless that email also works for a brand.
    delete from auth.users u where lower(u.email) = lower(s.creator_email)
      and not exists (select 1 from public.brand_profiles p where p.owner = u.id)
      and not exists (select 1 from public.brand_members m where m.profile_id = u.id);
    n := n + 1;
  end loop;

  for f in select * from public.brand_profiles where closing_at is not null and erase_after < now() loop
    -- The company's links to the creators' brands go; the creators keep their own records of past collabs.
    delete from public.brand_members m where m.brand_id in (select y.brand_id from public.brand_members y where y.profile_id = f.owner)
      and m.profile_id in (select private.team_logins(f.owner));
    delete from public.brand_campaigns where owner = f.owner;
    delete from public.brand_pools where owner = f.owner;
    delete from public.brand_creator_ratings where owner = f.owner;
    delete from public.brand_autopilots where owner = f.owner;
    delete from public.brand_approvals where owner = f.owner;
    delete from public.brand_ig_token where owner = f.owner;
    delete from public.brand_ig where owner = f.owner;
    delete from public.brand_alert_prefs where user_id in (select private.team_logins(f.owner));
    delete from public.brand_push_subscriptions where user_id in (select private.team_logins(f.owner));
    delete from public.brand_team_members where owner = f.owner;
    delete from public.brand_teams where owner = f.owner;
    delete from public.brand_profiles where owner = f.owner;
    delete from auth.users u where u.id = f.owner
      and not exists (select 1 from public.creator_settings c where lower(c.creator_email) = lower(u.email));
    n := n + 1;
  end loop;

  delete from public.kept_invoices where keep_until < current_date;
  delete from public.held_slugs where until < now();
  return n;
end;
$$;
revoke execute on function private.erase_closed() from public, anon, authenticated;

select cron.unschedule('erase-closed') where exists (select 1 from cron.job where jobname = 'erase-closed');
select cron.schedule('erase-closed', '30 21 * * *', $$select private.erase_closed()$$);

-- A deleted or closed studio takes no new requests and has no public page: page_creator() already only
-- finds active creators. Pitches, digests and other timed jobs only run for active creators too.
