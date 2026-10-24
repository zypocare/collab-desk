-- Client workspaces. A brand login can now work for several brand teams (an agency's staff for each of
-- its clients) and pick which one it is working in. Until now a login's companies were simply every
-- company it was a member of, and a team's companies were its members' companies pooled: one person in
-- two client teams would have shown each client the other's companies. Now every membership belongs to
-- one team, and everything a login sees or does is limited to the team it's working in.
--
-- * brand_members.owner: the team a membership belongs to.
-- * brand_active_team: the team each login last picked; brand_owner() uses it while the login is still
--   in that team, else the team it joined first, else its own.
-- * brand_workspaces() lists the teams a login is in, with what needs attention in each (the agency's
--   view across clients, only ever of teams it belongs to); brand_use_workspace() switches.
-- * Joining a team gives that team's companies and no longer pours the joiner's own companies into it.

-- 1. Which team each membership belongs to (filled from the one team each login could be in so far).
alter table public.brand_members add column if not exists owner uuid references auth.users (id) on delete cascade;
update public.brand_members m set owner = coalesce(
    (select t.owner from public.brand_team_members t where t.profile_id = m.profile_id and t.joined_at is not null order by t.joined_at limit 1),
    m.profile_id)
where m.owner is null;
alter table public.brand_members alter column owner set not null;
create index if not exists brand_members_owner_idx on public.brand_members (owner, brand_id);
-- A membership added without a team goes into the team that login is working in.
create or replace function private.brand_member_owner()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.owner is null then new.owner := private.owner_of(new.profile_id); end if;
  return new;
end;
$$;
drop trigger if exists brand_member_owner on public.brand_members;
create trigger brand_member_owner before insert on public.brand_members for each row execute function private.brand_member_owner();

-- 2. The team each login is working in.
create table if not exists public.brand_active_team (
  profile_id uuid primary key references auth.users (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  set_at timestamptz not null default now()
);
alter table public.brand_active_team enable row level security;
revoke all on public.brand_active_team from anon, authenticated;

-- Every team a login works in: its own, and each one it has joined.
create or replace function private.teams_of(p_profile uuid)
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select p_profile where p_profile is not null
  union
  select m.owner from public.brand_team_members m where m.profile_id = p_profile and m.joined_at is not null;
$$;
create or replace function private.my_teams()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select private.teams_of(auth.uid());
$$;
revoke execute on function private.teams_of(uuid) from public, anon, authenticated;
revoke execute on function private.my_teams() from public, anon, authenticated;

-- The team a login works in: the one it picked (while it's still in it), else the one it joined first,
-- else its own.
create or replace function private.owner_of(p_profile uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select a.owner from public.brand_active_team a where a.profile_id = p_profile and a.owner in (select private.teams_of(p_profile))),
    (select m.owner from public.brand_team_members m where m.profile_id = p_profile and m.joined_at is not null order by m.joined_at limit 1),
    p_profile);
$$;
revoke execute on function private.owner_of(uuid) from public, anon, authenticated;
create or replace function public.brand_owner()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select private.owner_of(auth.uid());
$$;
grant execute on function public.brand_owner() to authenticated;

-- 3. A company one teammate gets is the whole team's (that team only).
create or replace function private.team_share_brand()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  insert into public.brand_members (profile_id, brand_id, owner)
  select l, new.brand_id, new.owner from private.team_logins(new.owner) l
  where l is distinct from new.profile_id
  on conflict (profile_id, brand_id) do update set owner = excluded.owner;
  return new;
end;
$$;

-- 4. Joining, inviting, leaving and removing work on one team at a time.
create or replace function public.team_join()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_owner uuid;
  n integer := 0;
begin
  if auth.uid() is null or public.is_creator() then return null; end if;
  -- Every team this email was invited to (an agency's staff can work for several clients).
  for v_owner in
    update public.brand_team_members m set profile_id = auth.uid(), joined_at = now()
    where lower(m.email) = public.jwt_email() and m.profile_id is null and m.owner <> auth.uid()
    returning m.owner
  loop
    -- The team's companies, in that team. The joiner's own companies stay in their own workspace.
    insert into public.brand_members (profile_id, brand_id, owner)
    select distinct auth.uid(), m.brand_id, v_owner from public.brand_members m where m.owner = v_owner
    on conflict (profile_id, brand_id) do update set owner = excluded.owner;
    n := n + 1;
  end loop;
  -- joined: how many teams were joined just now (the app reloads their companies when it's more than 0).
  return jsonb_build_object('owner', public.brand_owner(), 'role', private.team_role(), 'joined', n);
end;
$$;

create or replace function public.team_invite(p_email text, p_name text default '', p_role text default 'member')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_owner uuid := public.brand_owner();
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
  if v_email = lower(coalesce((select u.email from auth.users u where u.id = v_owner), '')) then raise exception 'That''s already the team''s Admin.'; end if;
  if (select count(*) from public.brand_team_members where owner = v_owner) >= 30 then
    raise exception 'A team holds up to 30 people.';
  end if;
  -- The company the invitation is sent from (any of the team's).
  select x.* into b from public.brand_members m join public.brands x on x.id = m.brand_id
  where m.owner = v_owner order by m.created_at limit 1;
  if b.id is null then
    raise exception 'Add your company details first.';
  end if;
  insert into public.brand_teams (owner) values (v_owner) on conflict do nothing;
  insert into public.brand_team_members (owner, email, name, role, invited_by)
  values (v_owner, v_email, left(btrim(coalesce(p_name, '')), 80), p_role, coalesce(nullif(me.full_name, ''), me.email))
  on conflict (owner, email) do update set role = excluded.role, name = coalesce(nullif(excluded.name, ''), brand_team_members.name);
  -- Already on Miracle: they join now and get this team's companies (other teams they're in are untouched).
  select p.id into v_existing from public.profiles p where lower(p.email) = v_email;
  if v_existing is not null and v_existing <> v_owner then
    update public.brand_team_members set profile_id = v_existing, joined_at = coalesce(joined_at, now()) where owner = v_owner and email = v_email;
    insert into public.brand_members (profile_id, brand_id, owner)
    select distinct v_existing, m.brand_id, v_owner from public.brand_members m where m.owner = v_owner
    on conflict (profile_id, brand_id) do update set owner = excluded.owner;
  end if;
  insert into public.outbox (creator_id, kind, to_email, payload) values (b.creator_id, 'brand_invite', v_email, jsonb_build_object(
    'brand', b.name, 'name', btrim(coalesce(p_name, '')), 'by', coalesce(nullif(me.full_name, ''), me.email)));
  return public.team_get();
end;
$$;

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
  delete from public.brand_members where profile_id = auth.uid() and owner = v_owner;
  delete from public.brand_team_members where owner = v_owner and profile_id = auth.uid();
  delete from public.brand_active_team where profile_id = auth.uid();
  -- Phone alerts stop only when this was the last team.
  if not exists (select 1 from public.brand_team_members where profile_id = auth.uid() and joined_at is not null) then
    delete from public.brand_push_subscriptions where user_id = auth.uid();
  end if;
  return public.my_account();
end;
$$;

create or replace function public.team_remove(p_email text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  m public.brand_team_members;
  v_owner uuid := public.brand_owner();
begin
  if private.team_role() <> 'admin' then raise exception 'Only an Admin can remove people.'; end if;
  delete from public.brand_team_members where owner = v_owner and email = lower(btrim(p_email)) returning * into m;
  -- They lose this team's companies (their own, and other teams', stay), except requests sent with their email.
  if m.profile_id is not null and m.profile_id <> auth.uid() then
    delete from public.brand_members x
    where x.profile_id = m.profile_id and x.owner = v_owner
      and not exists (select 1 from public.collabs k where k.brand_id = x.brand_id and lower(k.contact_email) = lower(m.email));
    delete from public.brand_active_team where profile_id = m.profile_id and owner = v_owner;
  end if;
  return public.team_get();
end;
$$;

-- 5. The company picked for a creator's page counts only while it's in the team being worked in.
create or replace function public.my_brand_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select p.brand_id from public.profiles p join public.brands b on b.id = p.brand_id
      where p.id = auth.uid() and b.creator_id = private.page_creator()
        and exists (select 1 from public.brand_members m where m.profile_id = auth.uid() and m.brand_id = p.brand_id and m.owner = (select public.brand_owner()))),
    (select m.brand_id from public.brand_members m join public.brands b on b.id = m.brand_id
      where m.profile_id = auth.uid() and m.owner = (select public.brand_owner()) and b.creator_id = private.page_creator()
      order by m.created_at limit 1));
$$;

-- 6. The workspaces a login can switch between, with what needs attention in each.
create or replace function public.brand_workspaces()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with t as (
    select o as owner from private.my_teams() o
    -- Its own workspace only when it has something in it (a company profile or a company).
    where o <> auth.uid() or exists (select 1 from public.brand_profiles f where f.owner = auth.uid())
       or exists (select 1 from public.brand_members m where m.profile_id = auth.uid() and m.owner = auth.uid())
  ),
  k as (
    select t.owner, c.id, c.stage from t
    join public.brand_members m on m.owner = t.owner and m.profile_id = auth.uid()
    join public.collabs c on c.brand_id = m.brand_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'owner', t.owner,
      'name', coalesce(nullif((select f.name from public.brand_profiles f where f.owner = t.owner), ''),
                       (select b.name from public.brand_members m join public.brands b on b.id = m.brand_id where m.owner = t.owner order by m.created_at limit 1),
                       (select u.email from auth.users u where u.id = t.owner)),
      'current', t.owner = public.brand_owner(),
      'own', t.owner = auth.uid(),
      'role', case when t.owner = auth.uid() then 'admin'
                   else (select m.role from public.brand_team_members m where m.owner = t.owner and m.profile_id = auth.uid()) end,
      'companies', (select count(distinct m.brand_id) from public.brand_members m where m.owner = t.owner and m.profile_id = auth.uid()),
      'open', (select count(*) from k where k.owner = t.owner and k.stage not in ('wrapped', 'declined', 'cancelled')),
      'waiting', (select count(*) from k where k.owner = t.owner and (
          exists (select 1 from public.quotes q where q.collab_id = k.id and q.status = 'sent'
                  and q.version = (select max(q2.version) from public.quotes q2 where q2.collab_id = k.id))
          or exists (select 1 from public.drafts d where d.collab_id = k.id and d.status = 'pending'))),
      'approvals', (select count(*) from public.brand_approvals a where a.owner = t.owner and a.status = 'pending'),
      'to_pay', (select coalesce(sum(greatest(0, i.payable - i.amount_received)), 0) from public.invoices i
                 where i.collab_id in (select k.id from k where k.owner = t.owner) and i.status in ('sent', 'partly_paid')))
    order by (t.owner = auth.uid()) desc, lower(coalesce((select f.name from public.brand_profiles f where f.owner = t.owner), ''))), '[]'::jsonb)
  from t
  where auth.uid() is not null and not public.is_creator();
$$;
revoke execute on function public.brand_workspaces() from public, anon;
grant execute on function public.brand_workspaces() to authenticated;

create or replace function public.brand_use_workspace(p_owner uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_creator() then raise exception 'Sign in to your brand first.'; end if;
  if p_owner is null or p_owner not in (select private.my_teams()) then raise exception 'You''re not on that team.'; end if;
  insert into public.brand_active_team (profile_id, owner) values (auth.uid(), p_owner)
  on conflict (profile_id) do update set owner = excluded.owner, set_at = now();
  -- The company picked for each creator's page must be one of this team's.
  update public.profiles p set brand_id = null
  where p.id = auth.uid() and p.brand_id is not null
    and not exists (select 1 from public.brand_members m where m.profile_id = auth.uid() and m.brand_id = p.brand_id and m.owner = p_owner);
  return public.brand_workspaces();
end;
$$;
revoke execute on function public.brand_use_workspace(uuid) from public, anon;
grant execute on function public.brand_use_workspace(uuid) to authenticated;

-- 7. Everything else that reads a login's companies: only those of the team it's working in.
CREATE OR REPLACE FUNCTION private.ai_brand_owner()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select o.owner from (select public.brand_owner() as owner) o
  where o.owner is not null and not public.is_creator()
    and exists (select 1 from public.brand_members bm where bm.owner = o.owner);
$function$;

CREATE OR REPLACE FUNCTION private.autopilot_do(i brand_autopilot_items, p_action text, p_body text, p_auto boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  k public.collabs;
  v_body text := coalesce(nullif(btrim(p_body), ''), i.body);
  v_signer text;
begin
  if i.kind = 'invite' then
    perform private.watch_invite(i);
    return;
  end if;
  if i.kind = 'watch' then return; end if;
  if i.collab_id is not null then
    select * into k from public.collabs where id = i.collab_id;
    if not exists (select 1 from public.brand_members m where m.brand_id = k.brand_id and m.owner = i.owner) then
      raise exception 'Not found.';
    end if;
    perform private.act_for(k.creator_id);
    update public.profiles set brand_id = k.brand_id where id = i.owner;
  end if;
  if i.kind = 'followup' then
    perform private.brand_nudge(i.owner, i.collab_id, v_body, p_auto);
  elsif i.kind = 'draft' then
    if p_action = 'alt' or i.payload ->> 'action' = 'approve' then
      perform public.respond_draft(i.ref::uuid, true, '');
    else
      perform public.respond_draft(i.ref::uuid, false, v_body);
    end if;
  elsif i.kind = 'negotiate' then
    select coalesce(nullif(btrim(signer), ''), (select p.full_name from public.profiles p where p.id = i.owner), '') into v_signer
    from public.brand_autopilots where owner = i.owner;
    if i.payload ->> 'action' = 'accept' then
      if not private.may_accept((i.payload ->> 'total')::numeric) then
        raise exception 'Over your approval limit: an Admin or Approver has to accept this one.';
      end if;
      perform public.respond_quote(i.ref::uuid, true, coalesce(v_signer, ''), '', null);
    elsif i.payload ->> 'action' = 'counter' then
      perform public.respond_quote(i.ref::uuid, false, '', v_body, null);
    end if;
  elsif i.kind = 'rebook' then
    perform private.rebook_send(i.collab_id);
  end if;
  perform private.act_for(null);
end;
$function$;

CREATE OR REPLACE FUNCTION private.brand_autopilots_for(p_owner uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  st public.brand_autopilots;
  r record;
  v_checks jsonb;
  v_first text;
  v_fee numeric;
  v_total numeric;
  v_median numeric;
  v_sug jsonb;
begin
  select * into st from public.brand_autopilots where owner = p_owner;
  if st.owner is null then return; end if;
  perform private.as_brand(p_owner);

  -- Shortlist: campaigns sent in the last two weeks, with creators who'd fit and weren't asked.
  if st.shortlist <> 'off' then
    for r in select c.* from public.brand_campaigns c where c.owner = p_owner and c.status = 'sent' and c.sent_at > now() - interval '14 days' loop
      if not exists (select 1 from public.brand_autopilot_items x where x.owner = p_owner and x.kind = 'shortlist' and x.campaign_id = r.id and x.created_at > now() - interval '7 days') then
        v_sug := public.shortlist_for(r.id, null, st.shortlist_max);
        if jsonb_array_length(v_sug) > 0 then
          perform private.autopilot_add(p_owner, 'shortlist', r.id, null, to_char(now(), 'IYYY-IW'),
            format('%s creator%s fit %s', jsonb_array_length(v_sug), case when jsonb_array_length(v_sug) = 1 then '' else 's' end, r.name),
            '', jsonb_build_object('creators', v_sug), st.shortlist);
        end if;
      end if;
    end loop;
  end if;

  -- Follow-up: requests from this login's campaigns that went quiet.
  if st.followup <> 'off' then
    for r in
      select k.*, s.display_name as cname, c.name as campaign, c.id as campaign_id,
        case
          when k.stage = 'request' and not exists (select 1 from public.quotes q where q.collab_id = k.id)
               and k.created_at < now() - make_interval(days => st.followup_days) then 'quote'
          when k.stage in ('confirmed', 'creating') and k.draft_date < current_date
               and not exists (select 1 from public.drafts d where d.collab_id = k.id) then 'draft'
          when k.stage = 'creating' and k.live_date < current_date then 'post'
        end as late
      from public.campaign_creators x
      join public.brand_campaigns c on c.id = x.campaign_id and c.owner = p_owner
      join public.collabs k on k.id = x.collab_id
      join public.creator_settings s on s.id = k.creator_id
    loop
      continue when r.late is null;
      -- At most one nudge a week for each request.
      continue when exists (select 1 from public.brand_autopilot_items x where x.owner = p_owner and x.kind = 'followup' and x.collab_id = r.id and x.created_at > now() - interval '7 days');
      v_first := split_part(r.cname, ' ', 1);
      perform private.autopilot_add(p_owner, 'followup', r.campaign_id, r.id, r.late || ':' || to_char(now(), 'YYYY-MM-DD'),
        case r.late when 'quote' then format('Nudge %s about the quote', v_first)
                    when 'draft' then format('Nudge %s about the draft (due %s)', v_first, to_char(r.draft_date, 'DD Mon'))
                    else format('Ask %s when the post goes live', v_first) end,
        case r.late when 'quote' then format('Hi %s! Just checking in on our %s brief. Would love your quote when you get a moment. Thanks!', v_first, r.campaign)
                    when 'draft' then format('Hi %s! Hope the shoot went well. Could you share the draft when it''s ready? It was due on %s. Thanks!', v_first, to_char(r.draft_date, 'DD Mon'))
                    else format('Hi %s! Just checking: is the post going live soon? It was planned for %s. Thanks!', v_first, to_char(r.live_date, 'DD Mon')) end,
        jsonb_build_object('late', r.late), st.followup);
    end loop;
  end if;

  -- Draft checker: drafts waiting for this login's answer, on any of its collabs.
  if st.draftcheck <> 'off' then
    for r in
      select d.id as draft_id, k.id as collab_id, s.display_name as cname,
        (select x.campaign_id from public.campaign_creators x where x.collab_id = k.id limit 1) as campaign_id
      from public.drafts d
      join public.collabs k on k.id = d.collab_id
      join public.creator_settings s on s.id = k.creator_id
      where d.status = 'pending'
        and exists (select 1 from public.brand_members m where m.brand_id = k.brand_id and m.owner = p_owner)
    loop
      v_checks := private.draft_checks(r.draft_id);
      v_first := split_part(r.cname, ' ', 1);
      perform private.autopilot_add(p_owner, 'draft', r.campaign_id, r.collab_id, r.draft_id::text,
        case when (v_checks ->> 'missing')::int = 0 then format('%s''s draft passes every check', v_first)
             else format('%s thing%s missing in %s''s draft', v_checks ->> 'missing', case when (v_checks ->> 'missing')::int = 1 then '' else 's' end, v_first) end,
        v_checks ->> 'message',
        jsonb_build_object('checks', v_checks -> 'checks', 'action', case when (v_checks ->> 'missing')::int = 0 then 'approve' else 'changes' end),
        -- Auto only approves drafts that pass every check; anything missing waits for an OK.
        case when st.draftcheck = 'auto' and (v_checks ->> 'missing')::int = 0 then 'auto' else 'ask' end);
    end loop;
  end if;

  -- Negotiator: campaign quotes waiting for an answer, against the budget per creator.
  if st.negotiate <> 'off' then
    for r in
      select k.id as collab_id, c.id as campaign_id, c.brief, s.display_name as cname, q.id as quote_id, q.total
      from public.campaign_creators x
      join public.brand_campaigns c on c.id = x.campaign_id and c.owner = p_owner
      join public.collabs k on k.id = x.collab_id
      join public.creator_settings s on s.id = k.creator_id
      join public.quotes q on q.collab_id = k.id and q.status = 'sent'
        and q.version = (select max(q2.version) from public.quotes q2 where q2.collab_id = k.id)
    loop
      v_fee := coalesce(nullif(r.brief ->> 'fee', '')::numeric, 0);
      continue when v_fee <= 0;
      v_total := r.total;
      v_first := split_part(r.cname, ' ', 1);
      if v_total <= v_fee then
        perform private.autopilot_add(p_owner, 'negotiate', r.campaign_id, r.collab_id, r.quote_id::text,
          format('Accept %s''s quote: ₹%s', v_first, to_char(v_total, 'FM99,99,99,990')),
          format('Within your ₹%s budget per creator.', to_char(v_fee, 'FM99,99,99,990')),
          jsonb_build_object('action', 'accept', 'total', v_total, 'budget', v_fee), st.negotiate);
      elsif v_total <= v_fee * (1 + st.negotiate_over / 100.0) then
        perform private.autopilot_add(p_owner, 'negotiate', r.campaign_id, r.collab_id, r.quote_id::text,
          format('Ask %s to come down to ₹%s', v_first, to_char(v_fee, 'FM99,99,99,990')),
          format('Thanks for the quote, %s! Our budget for this is ₹%s. Could you do it for that?', v_first, to_char(v_fee, 'FM99,99,99,990')),
          jsonb_build_object('action', 'counter', 'total', v_total, 'budget', v_fee), st.negotiate);
      else
        perform private.autopilot_add(p_owner, 'negotiate', r.campaign_id, r.collab_id, r.quote_id::text,
          format('%s''s quote is %s%% over your budget', v_first, round((v_total / v_fee - 1) * 100)),
          format('₹%s against your ₹%s budget per creator. Your call.', to_char(v_total, 'FM99,99,99,990'), to_char(v_fee, 'FM99,99,99,990')),
          jsonb_build_object('action', 'review', 'total', v_total, 'budget', v_fee), 'ask');
      end if;
    end loop;
  end if;

  -- Rebook: finished collabs whose cost per 1,000 views beat this login's usual.
  if st.rebook <> 'off' then
    with done as (
      select k.id, k.fee, k.creator_id, k.wrapped_at,
        (select sum(m.views) from public.collab_posts p join public.ig_media m on m.id = p.media_id where p.collab_id = k.id) as views
      from public.collabs k
      where k.stage = 'wrapped' and k.fee > 0
        and exists (select 1 from public.brand_members m where m.brand_id = k.brand_id and m.owner = p_owner)
    )
    select percentile_cont(0.5) within group (order by fee / views * 1000) into v_median from done where views > 0;
    for r in
      select k.id, k.fee, s.display_name as cname, s.slug, k.code,
        k.fee / v.views * 1000 as cpk
      from public.collabs k
      join public.creator_settings s on s.id = k.creator_id and s.status = 'active' and s.accepting
      cross join lateral (select sum(m.views) as views from public.collab_posts p join public.ig_media m on m.id = p.media_id where p.collab_id = k.id) v
      where k.stage = 'wrapped' and k.fee > 0 and v.views > 0 and k.wrapped_at > now() - interval '30 days'
        and exists (select 1 from public.brand_members m where m.brand_id = k.brand_id and m.owner = p_owner)
    loop
      continue when v_median is not null and r.cpk > v_median;
      v_first := split_part(r.cname, ' ', 1);
      perform private.autopilot_add(p_owner, 'rebook', null, r.id, 'rebook',
        format('Book %s again', v_first),
        format('₹%s per 1,000 views on %s%s. Sends the same brief again.', to_char(r.cpk, 'FM99,99,990'), r.code,
          case when v_median is not null and r.cpk < v_median then ', better than your usual' else '' end),
        jsonb_build_object('cpk', r.cpk, 'code', r.code, 'slug', r.slug), st.rebook);
    end loop;
  end if;

  perform private.act_for(null);
end;
$function$;

CREATE OR REPLACE FUNCTION private.brand_can_reach(p_creator integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.creator_settings s
    where s.id = p_creator and s.status = 'active' and (
      s.listed or exists (
        select 1 from public.brand_members m join public.brands b on b.id = m.brand_id
        where m.profile_id = auth.uid() and m.owner = (select public.brand_owner()) and b.creator_id = s.id)));
$function$;

CREATE OR REPLACE FUNCTION private.brand_keys(p_brand uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select array_remove(array[
      case when char_length(btrim(coalesce(b.gstin, ''))) = 15 then 'g:' || upper(btrim(b.gstin)) end,
      case when nullif(btrim(coalesce(b.website, '')), '') is not null
        then 'w:' || lower(regexp_replace(regexp_replace(btrim(b.website), '^[a-z]+://', '', 'i'), '^www\.|[/?#].*$', '', 'gi')) end,
      'b:' || b.id::text
    ] || coalesce((select array_agg(distinct 'o:' || m.owner::text) from public.brand_members m where m.brand_id = b.id), '{}'), null)
  from public.brands b where b.id = p_brand;
$function$;

CREATE OR REPLACE FUNCTION private.brand_knows(p_owner uuid, p_creator integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.collabs k join public.brand_members m on m.brand_id = k.brand_id
                 where m.owner = p_owner and k.creator_id = p_creator);
$function$;

CREATE OR REPLACE FUNCTION private.brand_pay_record(p_brand uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with keys as (select unnest(private.brand_keys(p_brand)) as k),
  same as (
    select b.id from public.brands b
    where b.id = p_brand or exists (select 1 from unnest(private.brand_keys(b.id)) bk join keys on keys.k = bk
                                    where bk not like 'b:%')
  ),
  inv as (
    select i.id, i.creator_id, i.issue_date, i.due_date, i.paid_on, i.status,
      exists (select 1 from public.bank_alerts a where a.invoice_id = i.id) as by_bank,
      exists (select 1 from public.payment_demands d where d.invoice_id = i.id and (i.paid_on is null or d.sent_at::date <= i.paid_on)) as demanded
    from public.invoices i join public.collabs c on c.id = i.collab_id
    where c.brand_id in (select id from same) and i.status in ('sent', 'partly_paid', 'paid')
      and i.issue_date >= current_date - 365
  ),
  paid as (select * from inv where status = 'paid' and paid_on is not null),
  late as (select * from inv where status <> 'paid' and coalesce(due_date, issue_date + 30) < current_date)
  select jsonb_build_object(
    'invoices', (select count(*) from paid),
    'on_time', (select count(*) from paid where paid_on <= coalesce(due_date, issue_date + 30)),
    'by_bank', (select count(*) from paid where by_bank),
    'after_demand', (select count(*) from paid where demanded),
    'late_now', (select count(*) from late),
    'creators', (select count(distinct creator_id) from inv),
    -- Days from the invoice to the money, counting invoices still unpaid past their date as at least today.
    'avg_days', (select round(avg(d)) from (
        select (paid_on - issue_date) as d from paid
        union all select (current_date - issue_date) from late) x),
    'gstin', (select nullif(upper(btrim(coalesce(b.gstin, ''))), '') from public.brands b where b.id = p_brand),
    'profile_gstin', (select nullif(upper(btrim(coalesce(p.gstin, ''))), '') from public.brand_members m
                      join public.brand_profiles p on p.owner = m.owner where m.brand_id = p_brand limit 1),
    'instagram', (select g.username from public.brand_members m join public.brand_ig g on g.owner = m.owner
                  where m.brand_id = p_brand order by g.connected_at limit 1)
  );
$function$;

CREATE OR REPLACE FUNCTION private.company_collabs(p_owner uuid)
 RETURNS SETOF collabs
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct c.* from public.collabs c
  join public.brand_members m on m.brand_id = c.brand_id
  where m.owner = p_owner;
$function$;

CREATE OR REPLACE FUNCTION private.company_of_brand(p_brand uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.owner from public.brand_members m where m.brand_id = p_brand order by m.created_at limit 1;
$function$;

CREATE OR REPLACE FUNCTION private.erase_closed()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    delete from public.brand_members m where m.brand_id in (select y.brand_id from public.brand_members y where y.owner = f.owner)
      and m.owner = f.owner;
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
$function$;

CREATE OR REPLACE FUNCTION private.my_collabs()
 RETURNS SETOF collabs
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select k.* from public.collabs k
  where exists (select 1 from public.brand_members m where m.brand_id = k.brand_id and m.profile_id = auth.uid() and m.owner = (select public.brand_owner()));
$function$;

CREATE OR REPLACE FUNCTION public.brand_dashboard()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with mine as (
    select distinct c.* from public.collabs c
    join public.brand_members m on m.brand_id = c.brand_id and m.profile_id = auth.uid() and m.owner = (select public.brand_owner())
  ), month as (
    select date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date as d0, (now() at time zone 'Asia/Kolkata')::date as today
  )
  select jsonb_build_object(
    'name', (select x.name from public.profiles p join public.brands x on x.id = p.brand_id where p.id = auth.uid()),
    'open', (select count(*) from mine where stage not in ('wrapped', 'declined', 'cancelled')),
    'spent_month', (select coalesce(sum(i.payable), 0) from public.invoices i join mine c on c.id = i.collab_id, month
                    where i.status = 'paid' and i.paid_on >= month.d0),
    'to_pay', (select coalesce(sum(i.payable), 0) from public.invoices i join mine c on c.id = i.collab_id
               where i.status in ('sent', 'partly_paid')),
    'waiting', coalesce((
      select jsonb_agg(w.obj order by w.at desc) from (
        select q.created_at as at, jsonb_build_object('kind', 'quote', 'code', c.code, 'slug', s.slug, 'creator', s.display_name,
          'amount', q.total, 'currency', q.currency) as obj
        from mine c join public.quotes q on q.collab_id = c.id join public.creator_settings s on s.id = c.creator_id
        where q.status = 'sent' and q.version = (select max(q2.version) from public.quotes q2 where q2.collab_id = c.id)
        union all
        select d.submitted_at, jsonb_build_object('kind', 'draft', 'code', c.code, 'slug', s.slug, 'creator', s.display_name,
          'round', d.round, 'live_date', c.live_date)
        from mine c join public.drafts d on d.collab_id = c.id join public.creator_settings s on s.id = c.creator_id
        where d.status = 'pending'
      ) w), '[]'::jsonb),
    'live_soon', coalesce((
      select jsonb_agg(jsonb_build_object('code', c.code, 'slug', s.slug, 'creator', s.display_name, 'live_date', c.live_date) order by c.live_date)
      from mine c join public.creator_settings s on s.id = c.creator_id, month
      where c.live_date between month.today and month.today + 7 and c.stage not in ('live', 'wrapped', 'declined', 'cancelled')), '[]'::jsonb),
    'creators', coalesce((
      select jsonb_agg(private.creator_card(s.id) || jsonb_build_object(
          'open', (select count(*) from mine c where c.creator_id = s.id and c.stage not in ('wrapped', 'declined', 'cancelled')),
          'done', (select count(*) from mine c where c.creator_id = s.id and c.stage = 'wrapped'),
          'waiting', (select count(*) from mine c where c.creator_id = s.id and (
                        exists (select 1 from public.quotes q where q.collab_id = c.id and q.status = 'sent'
                                and q.version = (select max(q2.version) from public.quotes q2 where q2.collab_id = c.id))
                        or exists (select 1 from public.drafts d where d.collab_id = c.id and d.status = 'pending'))))
        order by lower(s.display_name))
      from public.creator_settings s
      where s.status = 'active' and exists (
        select 1 from public.brand_members m join public.brands x on x.id = m.brand_id
        where m.profile_id = auth.uid() and m.owner = (select public.brand_owner()) and x.creator_id = s.id)), '[]'::jsonb)
  )
  where auth.uid() is not null;
$function$;

CREATE OR REPLACE FUNCTION public.brand_from_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  f public.brand_profiles;
  v_creator integer := private.page_creator();
  v_brand uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    raise exception 'The creator account cannot be used as a brand.';
  end if;
  if v_creator is null then
    raise exception 'Open the creator''s page you want to work with first.';
  end if;
  select * into f from public.brand_profiles where owner = auth.uid();
  if f.owner is null then
    raise exception 'Add your brand details first.';
  end if;
  select b.id into v_brand from public.brands b join public.brand_members m on m.brand_id = b.id and m.profile_id = auth.uid() and m.owner = (select public.brand_owner())
  where b.creator_id = v_creator and lower(b.name) = lower(f.name) limit 1;
  if v_brand is null then
    if (select count(*) from public.brand_members where profile_id = auth.uid() and owner = (select public.brand_owner())) >= 25 then
      raise exception 'One login can manage up to 25 brands.';
    end if;
    insert into public.brands (creator_id, name, instagram, website, category, gstin)
    values (v_creator, f.name, f.instagram, f.website, f.category, f.gstin)
    returning id into v_brand;
    insert into public.brand_members (profile_id, brand_id, owner) values (auth.uid(), v_brand, public.brand_owner()) on conflict do nothing;
  end if;
  update public.profiles set brand_id = v_brand where id = auth.uid();
  return public.my_account();
end;
$function$;

CREATE OR REPLACE FUNCTION public.brand_invite(p_email text, p_name text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  me public.profiles;
  b public.brands;
  existing uuid;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or public.my_brand_id() is null then raise exception 'Sign in to your brand first.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Type a full email address.'; end if;
  if v_email = lower(me.email) then raise exception 'That''s you.'; end if;
  if (select count(*) from public.brand_invites where brand_id = public.my_brand_id()) >= 20 then raise exception 'That''s a lot of people. Remove someone first.'; end if;
  select * into b from public.brands where id = public.my_brand_id();

  insert into public.brand_invites (brand_id, email, name, invited_by)
  values (b.id, v_email, left(btrim(coalesce(p_name, '')), 80), coalesce(nullif(me.full_name, ''), me.email))
  on conflict (brand_id, email) do update set name = excluded.name;
  -- Already has a login: add them now.
  select id into existing from public.profiles where lower(email) = v_email;
  if existing is not null then
    insert into public.brand_members (profile_id, brand_id, owner) values (existing, b.id, coalesce(private.company_of_brand(b.id), public.brand_owner())) on conflict do nothing;
  end if;

  insert into public.outbox (creator_id, kind, to_email, payload) values (b.creator_id, 'brand_invite', v_email, jsonb_build_object(
    'brand', b.name, 'name', btrim(coalesce(p_name, '')), 'by', coalesce(nullif(me.full_name, ''), me.email)));
end;
$function$;

CREATE OR REPLACE FUNCTION public.brand_orders_import(p_rows jsonb, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid := public.brand_owner();
  r jsonb;
  v_code text;
  v_collab uuid;
  n integer := 0;
  m integer := 0;
  v_unmatched text[] := '{}';
begin
  if v_owner is null or public.is_creator() then raise exception 'Only a brand can import orders'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 20000 then raise exception 'Up to 20,000 orders at a time'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    continue when btrim(coalesce(r ->> 'ref', '')) = '';
    v_code := upper(btrim(coalesce(r ->> 'code', '')));
    v_collab := null;
    if v_code <> '' then
      select l.collab_id into v_collab
      from public.collab_links l join public.collabs c on c.id = l.collab_id
      join public.brand_members bm on bm.brand_id = c.brand_id
      where bm.owner = v_owner and upper(btrim(l.promo_code)) = v_code
      order by c.created_at desc limit 1;
      if v_collab is null and not v_code = any (v_unmatched) and cardinality(v_unmatched) < 20 then v_unmatched := v_unmatched || v_code; end if;
    end if;
    insert into public.brand_orders (owner, order_ref, ordered_on, amount, code, collab_id, source)
    values (v_owner, left(btrim(r ->> 'ref'), 80),
      case when coalesce(r ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}' then left(r ->> 'date', 10)::date end,
      greatest(0, coalesce(nullif(regexp_replace(coalesce(r ->> 'amount', ''), '[^0-9.]', '', 'g'), '')::numeric, 0)),
      left(v_code, 60), v_collab, case when p_source in ('shopify', 'woocommerce') then p_source else 'csv' end)
    on conflict (owner, order_ref) do update set amount = excluded.amount, code = excluded.code, collab_id = excluded.collab_id, ordered_on = excluded.ordered_on;
    n := n + 1;
    if v_collab is not null then m := m + 1; end if;
  end loop;
  -- Each code's totals, from every order imported so far.
  update public.collab_links l set sales = t.orders, revenue = t.revenue, sales_by = 'brand', sales_at = now(),
    sales_note = 'Imported from ' || case p_source when 'shopify' then 'Shopify' when 'woocommerce' then 'WooCommerce' else 'a CSV' end
  from (select o.collab_id, count(*)::integer as orders, sum(o.amount) as revenue from public.brand_orders o
        where o.owner = v_owner and o.collab_id is not null group by o.collab_id) t
  where l.collab_id = t.collab_id;
  return jsonb_build_object('imported', n, 'matched', m, 'unmatched_codes', to_jsonb(v_unmatched));
end;
$function$;

CREATE OR REPLACE FUNCTION public.brand_rights(p_code text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'usage', c.usage, 'live_date', c.live_date, 'ends', c.usage_ends, 'ad_how', c.ad_how,
    'ad_code', c.ad_code, 'ad_code_at', c.ad_code_at, 'territory', c.territory, 'excl_scope', c.excl_scope,
    'excl_days', (select q.exclusivity_days from public.quotes q where q.collab_id = c.id and q.status = 'accepted' order by q.version desc limit 1))
  from public.collabs c
  where upper(c.code) = upper(p_code) and public.brand_owner() is not null
    and exists (select 1 from public.brand_members bm where bm.brand_id = c.brand_id and bm.owner = public.brand_owner())
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.brand_sales(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with mine as (
    select l.collab_id, l.promo_code, l.clicks, l.sales, l.revenue, c.code, c.fee, c.stage, c.creator_id, b.name as brand_name, s.display_name
    from public.collab_links l
    join public.collabs c on c.id = l.collab_id
    join public.brands b on b.id = c.brand_id
    join public.creator_settings s on s.id = c.creator_id
    where public.brand_owner() is not null and not public.is_creator()
      and exists (select 1 from public.brand_members bm where bm.brand_id = c.brand_id and bm.owner = public.brand_owner())
  ),
  dated as (
    select m.collab_id,
      count(o.id) filter (where o.ordered_on between p_from and p_to)::integer as orders,
      coalesce(sum(o.amount) filter (where o.ordered_on between p_from and p_to), 0) as revenue,
      count(o.id) filter (where o.ordered_on is not null)::integer as with_date
    from mine m left join public.brand_orders o on o.collab_id = m.collab_id and o.owner = public.brand_owner()
    group by m.collab_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'collab', m.code, 'creator', m.display_name, 'creator_id', m.creator_id, 'brand', m.brand_name, 'code', m.promo_code, 'clicks', m.clicks,
      'orders', case when p_from is null or p_to is null then coalesce(m.sales, 0) else d.orders end,
      'revenue', case when p_from is null or p_to is null then coalesce(m.revenue, 0) else d.revenue end,
      'undated', case when p_from is null or p_to is null then 0 else greatest(0, coalesce(m.sales, 0) - d.with_date) end,
      'fee', coalesce(m.fee, 0), 'stage', m.stage)
    order by case when p_from is null or p_to is null then coalesce(m.revenue, 0) else d.revenue end desc), '[]'::jsonb)
  from mine m join dated d on d.collab_id = m.collab_id;
$function$;

CREATE OR REPLACE FUNCTION public.brand_verified(p_brand uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('username', g.username, 'name', g.name, 'picture', g.picture, 'followers', g.followers)
  from public.brands b
  join public.brand_members m on m.brand_id = b.id
  join public.brand_ig g on g.owner = m.owner
  where b.id = p_brand and public.is_creator() and b.creator_id = public.current_creator()
  order by g.connected_at
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.campaign_respond(p_quotes uuid[], p_accept boolean, p_note text DEFAULT ''::text, p_name text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_q uuid;
  k public.collabs;
  v_done integer := 0;
  v_failed jsonb := '[]'::jsonb;
  v_r jsonb;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if not p_accept and btrim(coalesce(p_note, '')) = '' then
    raise exception 'Say what you''d like changed.';
  end if;
  foreach v_q in array coalesce(p_quotes, '{}') loop
    begin
      select x.* into k from public.collabs x join public.quotes q on q.collab_id = x.id
      where q.id = v_q and exists (select 1 from public.brand_members m where m.brand_id = x.brand_id and m.profile_id = auth.uid() and m.owner = (select public.brand_owner()));
      if k.id is null then
        raise exception 'Quote not found.';
      end if;
      perform private.act_for(k.creator_id);
      update public.profiles set brand_id = k.brand_id where id = auth.uid();
      v_r := public.respond_quote(v_q, p_accept, coalesce(p_name, ''), coalesce(p_note, ''), null);
      if v_r ? 'approval' then
        v_failed := v_failed || jsonb_build_object('quote', v_q, 'error', 'Over your approval limit: sent to your approvers.');
      else
        v_done := v_done + 1;
      end if;
    exception when others then
      v_failed := v_failed || jsonb_build_object('quote', v_q, 'error', left(sqlerrm, 200));
    end;
  end loop;
  perform private.act_for(null);
  return jsonb_build_object('done', v_done, 'failed', v_failed);
end;
$function$;

CREATE OR REPLACE FUNCTION public.campaign_save(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_pool uuid := nullif(p ->> 'pool_id', '')::uuid;
  v_from uuid;
begin
  if auth.uid() is null or public.is_creator() then
    raise exception 'Sign in with your brand email first.';
  end if;
  if v_name = '' or char_length(v_name) > 80 then
    raise exception 'Give the campaign a name (up to 80 letters).';
  end if;
  if v_pool is not null and not exists (select 1 from public.brand_pools where id = v_pool and owner = public.brand_owner()) then
    v_pool := null;
  end if;
  -- Sent as the company in use (else the first this login has).
  v_from := coalesce(public.my_brand_id(),
    (select m.brand_id from public.brand_members m where m.profile_id = auth.uid() and m.owner = (select public.brand_owner()) order by m.created_at limit 1));
  if v_from is null and not exists (select 1 from public.brand_profiles where owner = auth.uid()) then
    raise exception 'Add your company details first.';
  end if;
  if v_id is null then
    if (select count(*) from public.brand_campaigns where owner = public.brand_owner() and created_at > now() - interval '1 day') >= 20 then
      raise exception 'That''s 20 campaigns today. Please try again tomorrow.';
    end if;
    insert into public.brand_campaigns (owner, name, pool_id, brand_from, brief, budget_total)
    values (public.brand_owner(), v_name, v_pool, v_from, coalesce(p -> 'brief', '{}'), greatest(0, coalesce(nullif(p ->> 'budget_total', '')::numeric, 0)))
    returning id into v_id;
  else
    update public.brand_campaigns set name = v_name, pool_id = v_pool,
      brief = coalesce(p -> 'brief', brief), budget_total = greatest(0, coalesce(nullif(p ->> 'budget_total', '')::numeric, budget_total))
    where id = v_id and owner = public.brand_owner();
    if not found then raise exception 'Campaign not found.'; end if;
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.copy_brand(p_from uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  f public.brands;
  v_creator integer := private.page_creator();
  v_brand uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    raise exception 'The creator account cannot be used as a brand.';
  end if;
  if v_creator is null then
    raise exception 'Open the creator''s page you want to work with first.';
  end if;
  select b.* into f from public.brands b join public.brand_members m on m.brand_id = b.id and m.profile_id = auth.uid() and m.owner = (select public.brand_owner())
  where b.id = p_from;
  if f.id is null then
    raise exception 'You do not manage that brand.';
  end if;
  if f.creator_id = v_creator then
    update public.profiles set brand_id = f.id where id = auth.uid();
    return public.my_account();
  end if;
  if (select count(*) from public.brand_members where profile_id = auth.uid() and owner = (select public.brand_owner())) >= 25 then
    raise exception 'One login can manage up to 25 brands.';
  end if;
  insert into public.brands (creator_id, name, instagram, website, category, gstin, billing_address, state, accounts_email, country, currency)
  values (v_creator, f.name, f.instagram, f.website, f.category, f.gstin, f.billing_address, f.state, f.accounts_email, f.country, f.currency)
  returning id into v_brand;
  insert into public.brand_members (profile_id, brand_id, owner) values (auth.uid(), v_brand, public.brand_owner()) on conflict do nothing;
  update public.profiles set brand_id = v_brand where id = auth.uid();
  return public.my_account();
end;
$function$;

CREATE OR REPLACE FUNCTION public.draft_check(p_draft uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select private.draft_checks(d.id)
  from public.drafts d join public.collabs c on c.id = d.collab_id
  where d.id = p_draft and exists (select 1 from public.brand_members m where m.brand_id = c.brand_id and m.profile_id = auth.uid() and m.owner = (select public.brand_owner()));
$function$;

CREATE OR REPLACE FUNCTION public.is_my_collab(p_collab uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.collabs c join public.brand_members m on m.brand_id = c.brand_id
    where c.id = p_collab and m.profile_id = auth.uid() and m.owner = (select public.brand_owner()));
$function$;

CREATE OR REPLACE FUNCTION public.merge_brands(p_from uuid, p_into uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_from public.brands;
  v_into public.brands;
  v_collabs int;
  v_notes public.brand_private;
begin
  if not public.is_creator() then
    raise exception 'Only the creator can merge brands';
  end if;
  if p_from is null or p_into is null or p_from = p_into then
    raise exception 'Pick two different brands';
  end if;
  select * into v_from from public.brands where id = p_from and creator_id = public.current_creator() for update;
  select * into v_into from public.brands where id = p_into and creator_id = public.current_creator() for update;
  if v_from.id is null or v_into.id is null then
    raise exception 'Brand not found';
  end if;

  update public.collabs set brand_id = p_into where brand_id = p_from;
  get diagnostics v_collabs = row_count;
  update public.collabs set referred_by = p_into where referred_by = p_from and creator_id = public.current_creator();
  update public.retainers set brand_id = p_into where brand_id = p_from;
  update public.desk_chunks set brand_id = p_into where brand_id = p_from;

  -- Brand logins and invites: the people who sign in for the duplicate now see the kept brand.
  update public.profiles set brand_id = p_into where brand_id = p_from;
  insert into public.brand_members (profile_id, brand_id, created_at, owner)
    select profile_id, p_into, created_at, owner from public.brand_members where brand_id = p_from
    on conflict do nothing;
  delete from public.brand_members where brand_id = p_from;
  insert into public.brand_invites (brand_id, email, name, invited_by, created_at)
    select p_into, email, name, invited_by, created_at from public.brand_invites where brand_id = p_from
    on conflict do nothing;
  delete from public.brand_invites where brand_id = p_from;

  -- Barter TDS per year: keep the kept brand's record when both have one.
  insert into public.barter_tds (brand_id, fy, status, reminded_at, updated_at)
    select p_into, fy, status, reminded_at, updated_at from public.barter_tds where brand_id = p_from
    on conflict (brand_id, fy) do nothing;
  delete from public.barter_tds where brand_id = p_from;

  -- Private notes: join them, and keep competitors from both.
  select * into v_notes from public.brand_private where brand_id = p_from;
  if v_notes.brand_id is not null then
    insert into public.brand_private (brand_id, notes, competitors)
      values (p_into, v_notes.notes, v_notes.competitors)
      on conflict (brand_id) do update set
        notes = case when excluded.notes = '' then brand_private.notes
                     when brand_private.notes = '' then excluded.notes
                     else brand_private.notes || E'\n\n' || excluded.notes end,
        competitors = (select coalesce(array_agg(distinct x), '{}') from unnest(brand_private.competitors || excluded.competitors) as x);
  end if;

  -- Fill in what the kept brand is missing from the duplicate.
  update public.brands set
    instagram = case when instagram = '' then v_from.instagram else instagram end,
    website = case when website = '' then v_from.website else website end,
    category = case when category in ('', 'Other') and v_from.category not in ('', 'Other') then v_from.category else category end
  where id = p_into;

  delete from public.brands where id = p_from;
  return jsonb_build_object('from', v_from.name, 'into', v_into.name, 'collabs', v_collabs);
end;
$function$;

CREATE OR REPLACE FUNCTION public.my_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.profiles;
  b public.brands;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_page integer := private.page_creator();
  v_brand uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  if public.is_creator() then
    return (select jsonb_build_object('role', 'creator', 'email', v_email, 'creator_id', s.id,
      'slug', case when s.slug_chosen then s.slug end,
      'needs_link', not s.slug_chosen and lower(s.creator_email) = v_email,
      'name', s.display_name, 'handle', s.handle)
      from public.creator_settings s where s.id = public.current_creator());
  end if;

  -- Asked to join as a creator and not approved yet (or declined): they see where their request stands.
  if exists (select 1 from public.creator_settings s where lower(s.creator_email) = v_email and s.status in ('pending', 'declined')) then
    return jsonb_build_object('role', 'pending', 'email', v_email, 'request', public.my_creator_request());
  end if;

  select * into p from public.profiles where id = auth.uid();
  if p.id is null then
    insert into public.profiles (id, email) values (auth.uid(), v_email) returning * into p;
  end if;

  -- Requests sent with this email join their company, on every creator.
  if v_email <> '' then
    -- Into the team that already has that company, if this login is in it; else the one it's working in.
    insert into public.brand_members (profile_id, brand_id, owner)
    select distinct on (c.brand_id) auth.uid(), c.brand_id,
      coalesce((select x.owner from public.brand_members x where x.brand_id = c.brand_id and x.owner in (select private.my_teams()) limit 1), public.brand_owner())
    from public.collabs c where lower(c.contact_email) = v_email
    on conflict do nothing;
  end if;

  v_brand := public.my_brand_id();
  if v_brand is not null and p.brand_id is distinct from v_brand then
    update public.profiles set brand_id = v_brand where id = auth.uid() returning * into p;
  elsif p.brand_id is null then
    update public.profiles set brand_id = (
      select m.brand_id from public.brand_members m where m.profile_id = auth.uid() and m.owner = (select public.brand_owner()) order by m.created_at limit 1)
    where id = auth.uid() returning * into p;
  end if;

  select * into b from public.brands where id = v_brand;

  return jsonb_build_object(
    'role', 'brand',
    'email', p.email,
    'full_name', p.full_name,
    'phone', p.phone,
    'brand', case when b.id is null then null else jsonb_build_object(
      'id', b.id, 'name', b.name, 'instagram', b.instagram, 'website', b.website, 'category', b.category) end,
    -- This creator's companies (the company switcher).
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by lower(x.name))
      from public.brand_members m join public.brands x on x.id = m.brand_id
      where m.profile_id = auth.uid() and m.owner = (select public.brand_owner()) and x.creator_id = v_page), '[]'::jsonb),
    -- Companies this login has with other creators, to reuse on a first request here.
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object('id', y.id, 'name', y.name) order by lower(y.name))
      from (select distinct on (lower(x.name)) x.id, x.name
            from public.brand_members m join public.brands x on x.id = m.brand_id
            where m.profile_id = auth.uid() and m.owner = (select public.brand_owner()) and x.creator_id is distinct from v_page
            order by lower(x.name), m.created_at desc) y), '[]'::jsonb),
    -- The company given at sign-up (before any creator).
    'profile', (select jsonb_build_object('name', f.name, 'category', f.category, 'website', f.website, 'instagram', f.instagram,
        'role', f.role, 'city', f.city, 'goals', to_jsonb(f.goals), 'legal_name', f.legal_name, 'gstin', f.gstin)
      from public.brand_profiles f where f.owner = auth.uid()),
    -- Every creator this login works with (the creator switcher).
    'creators', coalesce((
      select jsonb_agg(private.creator_card(s.id) || jsonb_build_object(
          'current', s.id = v_page,
          'open', (select count(*) from public.collabs c join public.brand_members m on m.brand_id = c.brand_id and m.profile_id = auth.uid() and m.owner = (select public.brand_owner())
                   where c.creator_id = s.id and c.stage not in ('wrapped', 'declined', 'cancelled')),
          'waiting', (select count(*) from public.collabs c join public.brand_members m on m.brand_id = c.brand_id and m.profile_id = auth.uid() and m.owner = (select public.brand_owner())
                      where c.creator_id = s.id and (
                        exists (select 1 from public.quotes q where q.collab_id = c.id and q.status = 'sent'
                                and q.version = (select max(q2.version) from public.quotes q2 where q2.collab_id = c.id))
                        or exists (select 1 from public.drafts d where d.collab_id = c.id and d.status = 'pending'))))
        order by lower(s.display_name))
      from public.creator_settings s
      where s.status = 'active' and s.slug_chosen and exists (
        select 1 from public.brand_members m join public.brands x on x.id = m.brand_id
        where m.profile_id = auth.uid() and m.owner = (select public.brand_owner()) and x.creator_id = s.id)), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.profiles_join_invites()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.brand_members (profile_id, brand_id, owner)
  select new.id, i.brand_id, coalesce(private.company_of_brand(i.brand_id), new.id) from public.brand_invites i where i.email = lower(new.email)
  on conflict do nothing;
  if new.brand_id is null then
    update public.profiles set brand_id = (select i.brand_id from public.brand_invites i where i.email = lower(new.email) order by i.created_at limit 1)
    where id = new.id;
  end if;
  if coalesce(btrim(new.full_name), '') = '' then
    update public.profiles set full_name = coalesce((select nullif(btrim(i.name), '') from public.brand_invites i where i.email = lower(new.email) order by i.created_at limit 1), '')
    where id = new.id;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_brand(p_name text, p_instagram text, p_website text, p_category text, p_full_name text, p_phone text, p_new boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_brand uuid;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    raise exception 'The creator account cannot be used as a brand.';
  end if;

  p_name := btrim(coalesce(p_name, ''));
  p_full_name := btrim(coalesce(p_full_name, ''));
  if p_name = '' or char_length(p_name) > 120 then
    raise exception 'Add your brand name.';
  end if;
  if p_full_name = '' then
    raise exception 'Add your name so we know who to reply to.';
  end if;

  -- The company this login works as on this creator's page (a different creator's company is not edited here).
  v_brand := public.my_brand_id();
  if private.page_creator() is null then
    raise exception 'Open the creator''s page you want to work with first.';
  end if;

  if v_brand is null or p_new then
    select count(*) into v_count from public.brand_members where profile_id = auth.uid() and owner = (select public.brand_owner());
    if v_count >= 25 then
      raise exception 'One login can manage up to 25 brands.';
    end if;
    -- A new brand belongs to the creator whose page it signs up on.
    insert into public.brands (creator_id, name, instagram, website, category)
    values (private.page_creator(), p_name, left(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', ''), 60),
            left(btrim(coalesce(p_website, '')), 200), left(coalesce(nullif(p_category, ''), 'Other'), 40))
    returning id into v_brand;
    insert into public.brand_members (profile_id, brand_id, owner) values (auth.uid(), v_brand, public.brand_owner()) on conflict do nothing;
  else
    update public.brands
    set name = p_name,
        instagram = left(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', ''), 60),
        website = left(btrim(coalesce(p_website, '')), 200),
        category = left(coalesce(nullif(p_category, ''), 'Other'), 40)
    where id = v_brand;
  end if;

  update public.profiles
  set brand_id = v_brand,
      full_name = left(p_full_name, 120),
      phone = left(btrim(coalesce(p_phone, '')), 30)
  where id = auth.uid();

  return public.my_account();
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_brand(p_code text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.brand_id
  from public.collabs c
  join public.brand_members m on m.brand_id = c.brand_id and m.profile_id = auth.uid() and m.owner = (select public.brand_owner())
  where upper(c.code) = upper(btrim(p_code))
  limit 1
$function$;

CREATE OR REPLACE FUNCTION public.request_place(p_code text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('brand_id', c.brand_id, 'slug', s.slug)
  from public.collabs c
  join public.brand_members m on m.brand_id = c.brand_id and m.profile_id = auth.uid() and m.owner = (select public.brand_owner())
  join public.creator_settings s on s.id = c.creator_id
  where upper(c.code) = upper(btrim(p_code))
  limit 1
$function$;

CREATE OR REPLACE FUNCTION public.send_campaign(p_campaign uuid, p_creators integer[] DEFAULT '{}'::integer[], p_handles text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.brand_campaigns;
  f public.brands;
  s public.creator_settings;
  v_id integer;
  v_h text;
  v_brand uuid;
  v_p jsonb;
  v_res jsonb;
  v_sent integer;
begin
  select * into c from public.brand_campaigns where id = p_campaign and owner = public.brand_owner();
  if c.id is null then
    raise exception 'Campaign not found.';
  end if;
  if public.is_creator() then
    raise exception 'The creator account cannot send requests.';
  end if;
  select * into f from public.brands b where b.id = c.brand_from
    and exists (select 1 from public.brand_members m where m.brand_id = b.id and m.profile_id = auth.uid() and m.owner = (select public.brand_owner()));
  -- Signed up at app.miracleapp.live without a creator yet: the company given at sign-up.
  if f.id is null then
    select gen_random_uuid(), x.name, x.instagram, x.website, x.category, x.gstin
      into f.id, f.name, f.instagram, f.website, f.category, f.gstin
    from public.brand_profiles x where x.owner = auth.uid();
    f.billing_address := '';
    f.state := '';
    f.accounts_email := '';
    f.country := 'India';
    f.currency := 'INR';
  end if;
  if f.id is null then
    raise exception 'Add your company details first.';
  end if;
  select count(*) into v_sent from public.campaign_creators x join public.brand_campaigns y on y.id = x.campaign_id
  where y.owner = public.brand_owner() and x.status = 'sent' and x.created_at > now() - interval '1 day';
  if v_sent + coalesce(cardinality(p_creators), 0) > 40 then
    raise exception 'Campaigns can reach up to 40 creators a day. Send to fewer, or try again tomorrow.';
  end if;

  foreach v_id in array coalesce(p_creators, '{}') loop
    if exists (select 1 from public.campaign_creators where campaign_id = c.id and creator_id = v_id and status = 'sent') then
      continue;
    end if;
    begin
      if not private.brand_can_reach(v_id) then
        raise exception 'This creator isn''t listed for brands.';
      end if;
      select * into s from public.creator_settings where id = v_id;
      perform private.act_for(v_id);
      -- This login's company for this creator, else a copy of the campaign's company.
      select m.brand_id into v_brand from public.brand_members m join public.brands b on b.id = m.brand_id
      where m.profile_id = auth.uid() and m.owner = (select public.brand_owner()) and b.creator_id = v_id
      order by (lower(b.name) = lower(f.name)) desc, m.created_at limit 1;
      if v_brand is null then
        insert into public.brands (creator_id, name, instagram, website, category, gstin, billing_address, state, accounts_email, country, currency)
        values (v_id, f.name, f.instagram, f.website, f.category, f.gstin, f.billing_address, f.state, f.accounts_email, f.country, f.currency)
        returning id into v_brand;
        insert into public.brand_members (profile_id, brand_id, owner) values (auth.uid(), v_brand, public.brand_owner()) on conflict do nothing;
      end if;
      update public.profiles set brand_id = v_brand where id = auth.uid();
      -- Only what this creator makes, in the languages they create in.
      v_p := c.brief - 'package_id' || jsonb_build_object(
        'deliverables', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(coalesce(c.brief -> 'deliverables', '[]'::jsonb)) x
                         where btrim(x ->> 'kind') = any(s.offered_kinds) and coalesce(nullif(x ->> 'qty', '')::integer, 0) > 0),
        'content_language', (select coalesce(jsonb_agg(l), '[]'::jsonb) from jsonb_array_elements_text(
                               case when jsonb_typeof(c.brief -> 'content_language') = 'array' then c.brief -> 'content_language' else '[]'::jsonb end) l
                             where l = any(s.content_languages)));
      if jsonb_array_length(v_p -> 'deliverables') = 0 then
        raise exception '% doesn''t make the content in this brief.', split_part(s.display_name, ' ', 1);
      end if;
      v_res := public.submit_request(v_p);
      insert into public.campaign_creators (campaign_id, creator_id, collab_id, status, note)
      values (c.id, v_id, (v_res ->> 'id')::uuid, 'sent', '')
      on conflict (campaign_id, creator_id) where creator_id is not null
      do update set collab_id = excluded.collab_id, status = 'sent', note = '', created_at = now();
    exception when others then
      insert into public.campaign_creators (campaign_id, creator_id, status, note)
      values (c.id, v_id, 'failed', left(sqlerrm, 200))
      on conflict (campaign_id, creator_id) where creator_id is not null
      do update set status = 'failed', note = left(sqlerrm, 200);
    end;
  end loop;
  perform private.act_for(null);

  foreach v_h in array coalesce(p_handles, '{}') loop
    v_h := private.clean_handle(v_h);
    continue when v_h = '';
    insert into public.campaign_creators (campaign_id, handle, status) values (c.id, v_h, 'invited')
    on conflict (campaign_id, handle) where creator_id is null do nothing;
  end loop;

  update public.brand_campaigns set status = 'sent', sent_at = coalesce(sent_at, now()) where id = c.id;
  return public.campaign_board(c.id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.shortlist_for(p_campaign uuid DEFAULT NULL::uuid, p_brief jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_brief jsonb := p_brief;
  v_cat text;
  v_out jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  if p_campaign is not null then
    select coalesce(v_brief, c.brief), b.category into v_brief, v_cat
    from public.brand_campaigns c left join public.brands b on b.id = c.brand_from
    where c.id = p_campaign and c.owner = public.brand_owner();
    if v_brief is null then return '[]'::jsonb; end if;
  end if;
  v_brief := coalesce(v_brief, '{}'::jsonb);
  if v_cat is null then
    select b.category into v_cat from public.brands b where b.id = public.my_brand_id();
  end if;
  with want as (
    select btrim(x ->> 'kind') as kind, coalesce(nullif(x ->> 'qty', '')::integer, 0) as qty
    from jsonb_array_elements(case when jsonb_typeof(v_brief -> 'deliverables') = 'array' then v_brief -> 'deliverables' else '[]'::jsonb end) x
    where coalesce(nullif(x ->> 'qty', '')::integer, 0) > 0
  ), cand as (
    select s.*, a.engagement_rate as eng, a.followers as fol,
      (select count(*) from want w where w.kind = any(s.offered_kinds)) as kinds_ok,
      (select count(*) from want) as kinds_all,
      exists (select 1 from public.collabs k join public.brand_members m on m.brand_id = k.brand_id and m.profile_id = auth.uid() and m.owner = (select public.brand_owner())
              where k.creator_id = s.id and k.stage in ('live', 'wrapped')) as worked,
      case when s.show_rates and (select count(*) from want) > 0 and not exists (select 1 from want w where not (s.rates ? w.kind))
        then (select sum(w.qty * (s.rates ->> w.kind)::numeric) from want w) end as est
    from public.creator_settings s left join public.ig_account a on a.id = s.id and a.connected
    where s.status = 'active' and s.accepting and private.brand_can_reach(s.id)
      and (p_campaign is null or not exists (select 1 from public.campaign_creators x where x.campaign_id = p_campaign and x.creator_id = s.id))
  ), scored as (
    select c.id,
      least(100, greatest(0,
        case when c.kinds_all = 0 then 10 when c.kinds_ok = c.kinds_all then 25 else 10 end
        + case when coalesce(v_cat, '') <> '' and c.niche ilike '%' || v_cat || '%' then 30 else 0 end
        + case when c.eng >= 3 then 15 when c.eng >= 1.5 then 8 else 0 end
        + case when c.worked then 15 else 0 end
        + case when c.est is null or coalesce((v_brief ->> 'fee')::numeric, 0) = 0 then 0
               when c.est <= (v_brief ->> 'fee')::numeric then 15
               when c.est > (v_brief ->> 'fee')::numeric * 1.3 then -10 else 0 end
        + case when c.fol is not null then 5 else 0 end
        + case when jsonb_typeof(v_brief -> 'content_language') = 'array' and jsonb_array_length(v_brief -> 'content_language') > 0
                 and exists (select 1 from jsonb_array_elements_text(v_brief -> 'content_language') l where l = any(c.content_languages)) then 5 else 0 end)) as score,
      array_remove(array[
        case when coalesce(v_cat, '') <> '' and c.niche ilike '%' || v_cat || '%' then 'fits your niche' end,
        case when c.kinds_all > 0 and c.kinds_ok = c.kinds_all then 'makes this content' when c.kinds_ok > 0 then 'makes some of this content' end,
        case when c.worked then 'worked with you before' end,
        case when c.eng >= 3 then 'strong engagement' end,
        case when c.est is not null and coalesce((v_brief ->> 'fee')::numeric, 0) > 0 and c.est <= (v_brief ->> 'fee')::numeric then 'within your budget' end
      ], null) as why
    from cand c
    where c.kinds_all = 0 or c.kinds_ok > 0
  )
  select coalesce(jsonb_agg(private.creator_card(x.id) || jsonb_build_object('score', x.score, 'why', to_jsonb(x.why)) order by x.score desc, x.id), '[]'::jsonb)
  into v_out
  from (select * from scored order by score desc, id limit greatest(1, least(coalesce(p_limit, 8), 20))) x;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION public.support_create(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_creator integer := public.current_creator();
  v_brand uuid;
  v_side text;
  v_subject text := btrim(coalesce(p ->> 'subject', ''));
  v_body text := btrim(coalesce(p ->> 'body', ''));
  v_cat text := coalesce(nullif(p ->> 'category', ''), 'other');
  t public.support_tickets;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if char_length(v_subject) < 3 then raise exception 'Say in a few words what it''s about.'; end if;
  if char_length(v_body) < 10 then raise exception 'Tell us a little more, so we can help the first time.'; end if;
  if v_cat not in ('collabs', 'money', 'instagram', 'account', 'bug', 'idea', 'brand', 'other') then v_cat := 'other'; end if;
  if (select count(*) from public.support_tickets where user_id = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'LIMIT:support:That''s 5 tickets today. Add to one of your open tickets instead.';
  end if;
  if v_creator is not null and public.team_role() is not null then
    v_side := 'creator';
  else
    v_creator := null;
    v_brand := coalesce(public.my_brand_id(), (select m.brand_id from public.brand_members m where m.profile_id = v_uid and m.owner = (select public.brand_owner()) order by m.created_at limit 1));
    v_side := case when v_brand is not null or exists (select 1 from public.brand_profiles where owner = v_uid) then 'brand' else 'other' end;
  end if;
  insert into public.support_tickets (user_id, email, name, side, creator_id, brand_id, category, subject, device, tried, status, team_unread)
  values (v_uid, public.jwt_email(), left(btrim(coalesce(p ->> 'name', '')), 120), v_side, v_creator, v_brand, v_cat, left(v_subject, 140),
    case when jsonb_typeof(p -> 'device') = 'object' then p -> 'device' else '{}' end,
    case when jsonb_typeof(p -> 'tried') = 'object' then p -> 'tried' else '{}' end, 'open', true)
  returning * into t;
  insert into public.support_messages (ticket_id, from_team, author, body, files)
  values (t.id, false, t.name, left(v_body, 5000), private.support_files(p -> 'files'));
  perform private.support_tell_team(t, v_body, true);
  return private.support_ticket_json(t.id, false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.switch_brand(p_brand uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.brand_members m join public.brands b on b.id = m.brand_id
                 where m.profile_id = auth.uid() and m.owner = (select public.brand_owner()) and m.brand_id = p_brand and b.creator_id = private.page_creator()) then
    raise exception 'You do not manage that brand.';
  end if;
  update public.profiles set brand_id = p_brand where id = auth.uid();
  return public.my_account();
end;
$function$;
