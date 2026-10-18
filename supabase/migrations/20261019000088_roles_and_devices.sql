-- Release 4: team roles enforced by the database, and her signed-in devices.
--
-- Roles: owner (her), manager (everything except team and sign-in email), assistant (collabs and
-- messages, no invoices or payments), accountant (money and payments, no brand conversations).
-- Devices: the sessions on her own account, with sign-out from anywhere, and an email when a new
-- browser or phone signs in.

-- ---------------------------------------------------------------- Roles
alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check check (role in ('manager', 'assistant', 'accountant'));

create or replace function public.team_role()
returns text language sql stable security definer set search_path = '' as $$
  select case when public.is_owner() then 'owner'
    else (select role from public.team_members where email = lower(coalesce(auth.jwt() ->> 'email', ''))) end;
$$;
revoke execute on function public.team_role() from public, anon;
grant execute on function public.team_role() to authenticated, service_role;

-- Invoices: owner, manager and accountant see and record payments; only owner and manager issue.
drop policy if exists "creator manages invoices" on public.invoices;
drop policy if exists "money team reads invoices" on public.invoices;
drop policy if exists "money team updates invoices" on public.invoices;
drop policy if exists "sellers add invoices" on public.invoices;
drop policy if exists "sellers delete invoices" on public.invoices;
create policy "money team reads invoices" on public.invoices for select to authenticated
  using ((select public.team_role()) in ('owner', 'manager', 'accountant'));
create policy "money team updates invoices" on public.invoices for update to authenticated
  using ((select public.team_role()) in ('owner', 'manager', 'accountant'))
  with check ((select public.team_role()) in ('owner', 'manager', 'accountant'));
create policy "sellers add invoices" on public.invoices for insert to authenticated
  with check ((select public.team_role()) in ('owner', 'manager'));
create policy "sellers delete invoices" on public.invoices for delete to authenticated
  using ((select public.team_role()) in ('owner', 'manager'));

-- Bank alerts, barter TDS and expenses: the money team only.
drop policy if exists "creator manages bank alerts" on public.bank_alerts;
drop policy if exists "money team manages bank alerts" on public.bank_alerts;
create policy "money team manages bank alerts" on public.bank_alerts for all to authenticated
  using ((select public.team_role()) in ('owner', 'manager', 'accountant'))
  with check ((select public.team_role()) in ('owner', 'manager', 'accountant'));
drop policy if exists "creator manages barter tds" on public.barter_tds;
drop policy if exists "money team manages barter tds" on public.barter_tds;
create policy "money team manages barter tds" on public.barter_tds for all to authenticated
  using ((select public.team_role()) in ('owner', 'manager', 'accountant'))
  with check ((select public.team_role()) in ('owner', 'manager', 'accountant'));
drop policy if exists "creator manages expenses" on public.collab_expenses;
drop policy if exists "money team manages expenses" on public.collab_expenses;
create policy "money team manages expenses" on public.collab_expenses for all to authenticated
  using ((select public.team_role()) in ('owner', 'manager', 'accountant'))
  with check ((select public.team_role()) in ('owner', 'manager', 'accountant'));

-- Quotes: the whole team reads them; only owner and manager write or send them.
drop policy if exists "creator manages quotes" on public.quotes;
drop policy if exists "team reads quotes" on public.quotes;
drop policy if exists "sellers write quotes" on public.quotes;
create policy "team reads quotes" on public.quotes for select to authenticated using ((select public.is_creator()));
create policy "sellers write quotes" on public.quotes for all to authenticated
  using ((select public.team_role()) in ('owner', 'manager'))
  with check ((select public.team_role()) in ('owner', 'manager'));

-- Settings: the whole team reads them; owner and manager change them (sign-in email: owner, as before).
drop policy if exists "creator manages settings" on public.creator_settings;
drop policy if exists "team reads settings" on public.creator_settings;
drop policy if exists "sellers change settings" on public.creator_settings;
create policy "team reads settings" on public.creator_settings for select to authenticated using ((select public.is_creator()));
create policy "sellers change settings" on public.creator_settings for all to authenticated
  using ((select public.team_role()) in ('owner', 'manager'))
  with check ((select public.team_role()) in ('owner', 'manager'));

-- Messages to brands: not the accountant.
drop policy if exists "creator sends messages" on public.collab_messages;
create policy "creator sends messages" on public.collab_messages for insert to authenticated
  with check ((select public.team_role()) in ('owner', 'manager', 'assistant') and sender = 'creator');

-- Collabs: an accountant only records payments; an assistant doesn't change fees or payments.
create or replace function private.collab_role_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r text := public.team_role();
  pay constant text[] := array['pay_status', 'pay_received', 'paid_on', 'pay_due', 'invoice_no', 'invoiced_on', 'updated_at', 'wrapped_at', 'stage'];
  money constant text[] := array['fee', 'pay_status', 'pay_received', 'paid_on', 'pay_due', 'invoice_no', 'invoiced_on', 'counter_fee', 'usage_ext_price', 'loyalty_pct'];
begin
  if r = 'accountant' then
    if (to_jsonb(new) - pay) is distinct from (to_jsonb(old) - pay)
       or (new.stage is distinct from old.stage and not (old.stage = 'live' and new.stage = 'wrapped')) then
      raise exception 'As the accountant you can record payments; ask the owner or a manager to change anything else.';
    end if;
  elsif r = 'assistant' then
    if exists (select 1 from unnest(money) k where to_jsonb(new) -> k is distinct from to_jsonb(old) -> k) then
      raise exception 'As an assistant you can''t change fees or payments; ask the owner or a manager.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists collab_role_guard on public.collabs;
create trigger collab_role_guard before update on public.collabs
  for each row execute function private.collab_role_guard();

-- Deleting a brand: owner and manager.
create or replace function public.delete_brand(p_brand uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_issued int;
  v_collabs int;
begin
  if coalesce(public.team_role(), '') not in ('owner', 'manager') then
    raise exception 'Only the owner or a manager can delete a brand';
  end if;
  select name into v_name from public.brands where id = p_brand;
  if v_name is null then
    raise exception 'Brand not found';
  end if;
  select count(*) into v_issued
  from public.invoices i join public.collabs c on c.id = i.collab_id
  where c.brand_id = p_brand and i.status not in ('draft', 'cancelled');
  if v_issued > 0 then
    raise exception 'invoices_issued:%', v_issued;
  end if;
  select count(*) into v_collabs from public.collabs where brand_id = p_brand;
  update public.collabs set referred_by = null where referred_by = p_brand;
  delete from public.collabs where brand_id = p_brand;
  delete from public.brands where id = p_brand;
  return jsonb_build_object('name', v_name, 'collabs', v_collabs);
end;
$$;
revoke all on function public.delete_brand(uuid) from public, anon;
grant execute on function public.delete_brand(uuid) to authenticated;

-- ---------------------------------------------------------------- Devices
-- Her own sessions: browser, when it was last used, and which one this is.
create or replace function public.my_sessions()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'created_at', s.created_at,
    'last_at', greatest(s.created_at, s.updated_at, s.refreshed_at::timestamptz),
    'agent', coalesce(s.user_agent, ''),
    'ip', coalesce(host(s.ip), ''),
    'current', s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
  ) order by greatest(s.created_at, s.updated_at, s.refreshed_at::timestamptz) desc), '[]'::jsonb)
  from auth.sessions s
  where s.user_id = auth.uid() and (s.not_after is null or s.not_after > now());
$$;
revoke execute on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated, service_role;

-- Sign out one of her own devices (it can't refresh any more; it stops within the hour).
create or replace function public.end_session(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_id::text = coalesce(auth.jwt() ->> 'session_id', '') then
    raise exception 'Use Sign out to sign out of this device.';
  end if;
  delete from auth.sessions where id = p_id and user_id = auth.uid();
  return found;
end $$;
revoke execute on function public.end_session(uuid) from public, anon;
grant execute on function public.end_session(uuid) to authenticated, service_role;

-- Browsers and phones each account has signed in from (to spot a new one).
create table if not exists private.known_devices (
  user_id uuid not null,
  agent_key text not null,
  first_at timestamptz not null default now(),
  primary key (user_id, agent_key)
);

-- A sign-in from a browser this account hasn't used before: email her (team accounts too).
create or replace function private.session_new_device()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  k text := md5(regexp_replace(coalesce(new.user_agent, ''), '[0-9.]+', '', 'g'));
  seen_any boolean;
  em text;
  s public.creator_settings;
begin
  select exists (select 1 from private.known_devices where user_id = new.user_id) into seen_any;
  insert into private.known_devices (user_id, agent_key) values (new.user_id, k) on conflict do nothing;
  if not found or not seen_any then return new; end if;
  select email into em from auth.users where id = new.user_id;
  select * into s from public.creator_settings where id = 1;
  -- Only studio accounts (her and her team), not brands.
  if lower(em) = lower(s.creator_email) or exists (select 1 from public.team_members where email = lower(em)) then
    insert into public.outbox (kind, to_email, payload)
    values ('new_device', em, jsonb_build_object('agent', left(coalesce(new.user_agent, ''), 300), 'ip', coalesce(host(new.ip), ''), 'at', now(), 'link', rtrim(s.site_url, '/') || '/studio/settings?s=account'));
  end if;
  return new;
exception when others then
  return new; -- never block a sign-in
end $$;
drop trigger if exists collab_desk_new_device on auth.sessions;
create trigger collab_desk_new_device after insert on auth.sessions
  for each row execute function private.session_new_device();

-- Devices already signed in count as known (no email for them).
insert into private.known_devices (user_id, agent_key)
select distinct user_id, md5(regexp_replace(coalesce(user_agent, ''), '[0-9.]+', '', 'g')) from auth.sessions
on conflict do nothing;

-- The welcome email says which role they were given.
create or replace function public.team_member_welcome()
returns trigger language plpgsql security definer set search_path = 'public' as $function$
declare
  s public.creator_settings;
begin
  select * into s from public.creator_settings where id = 1;
  insert into public.outbox (kind, to_email, payload)
  values ('team_added', new.email, jsonb_build_object('name', coalesce(new.name, ''), 'role', new.role, 'link', rtrim(s.site_url, '/') || '/login'));
  return null;
end;
$function$;
revoke execute on function public.team_member_welcome() from public, anon, authenticated;
