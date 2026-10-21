-- Miracle for many creators, part 13: one brand login across creators.
-- A brand's company row belongs to one creator, and a login can belong to companies of several
-- creators. Which company it works as now follows the page it is on (the x-creator address), so a
-- request sent on one creator's page always goes to that creator, and each creator only ever sees
-- what was sent to them. Brands also get a dashboard across all their creators, and a Discover list
-- of creators who choose to be listed.

-- 1. The company a login works as, for the creator whose page this is ---------------------------------
-- The last one picked (profiles.brand_id) when it belongs to this creator, else the first it joined.
create or replace function public.my_brand_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select p.brand_id from public.profiles p join public.brands b on b.id = p.brand_id
      where p.id = auth.uid() and b.creator_id = private.page_creator()),
    (select m.brand_id from public.brand_members m join public.brands b on b.id = m.brand_id
      where m.profile_id = auth.uid() and b.creator_id = private.page_creator()
      order by m.created_at limit 1));
$$;

-- 2. A collab's company must be the same creator's company ---------------------------------------------
create or replace function private.collab_brand_same_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.brands b where b.id = new.brand_id and b.creator_id = new.creator_id) then
    raise exception 'That brand belongs to another creator.';
  end if;
  return new;
end;
$$;
drop trigger if exists "1_brand_same_creator" on public.collabs;
create trigger "1_brand_same_creator" before insert or update of brand_id, creator_id on public.collabs
  for each row execute function private.collab_brand_same_creator();
revoke execute on function private.collab_brand_same_creator() from public, anon, authenticated;

-- 3. Switching company: only among this creator's companies ---------------------------------------------
create or replace function public.switch_brand(p_brand uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.brand_members m join public.brands b on b.id = m.brand_id
                 where m.profile_id = auth.uid() and m.brand_id = p_brand and b.creator_id = private.page_creator()) then
    raise exception 'You do not manage that brand.';
  end if;
  update public.profiles set brand_id = p_brand where id = auth.uid();
  return public.my_account();
end;
$$;
revoke execute on function public.switch_brand(uuid) from anon;

-- 4. Adding or editing the company on this creator's page -----------------------------------------------
create or replace function public.register_brand(p_name text, p_instagram text, p_website text, p_category text, p_full_name text, p_phone text, p_new boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    select count(*) into v_count from public.brand_members where profile_id = auth.uid();
    if v_count >= 25 then
      raise exception 'One login can manage up to 25 brands.';
    end if;
    -- A new brand belongs to the creator whose page it signs up on.
    insert into public.brands (creator_id, name, instagram, website, category)
    values (private.page_creator(), p_name, left(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', ''), 60),
            left(btrim(coalesce(p_website, '')), 200), left(coalesce(nullif(p_category, ''), 'Other'), 40))
    returning id into v_brand;
    insert into public.brand_members (profile_id, brand_id) values (auth.uid(), v_brand) on conflict do nothing;
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
$$;
revoke execute on function public.register_brand(text, text, text, text, text, text, boolean) from anon;

-- 5. First request to a new creator: copy a company this login already has --------------------------------
create or replace function public.copy_brand(p_from uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
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
  select b.* into f from public.brands b join public.brand_members m on m.brand_id = b.id and m.profile_id = auth.uid()
  where b.id = p_from;
  if f.id is null then
    raise exception 'You do not manage that brand.';
  end if;
  if f.creator_id = v_creator then
    update public.profiles set brand_id = f.id where id = auth.uid();
    return public.my_account();
  end if;
  if (select count(*) from public.brand_members where profile_id = auth.uid()) >= 25 then
    raise exception 'One login can manage up to 25 brands.';
  end if;
  insert into public.brands (creator_id, name, instagram, website, category, gstin, billing_address, state, accounts_email, country, currency)
  values (v_creator, f.name, f.instagram, f.website, f.category, f.gstin, f.billing_address, f.state, f.accounts_email, f.country, f.currency)
  returning id into v_brand;
  insert into public.brand_members (profile_id, brand_id) values (auth.uid(), v_brand) on conflict do nothing;
  update public.profiles set brand_id = v_brand where id = auth.uid();
  return public.my_account();
end;
$$;
revoke execute on function public.copy_brand(uuid) from public, anon;
grant execute on function public.copy_brand(uuid) to authenticated;

-- 6. Sending a request: as this page's company, to this page's creator ------------------------------------
create or replace function public.submit_request(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  me public.profiles;
  v_my uuid := public.my_brand_id();
  b public.brands;
  v_type public.collab_type;
  v_value numeric;
  v_id uuid;
  v_code text;
  d jsonb;
  pos integer := 0;
  recent integer;
  deliv_text text;
  first_name text;
  pk public.packages;
  v_fee numeric;
  v_kind text;
  v_low boolean := false;
  v_lang text := '';
  l text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    raise exception 'The creator account cannot send requests.';
  end if;

  -- The request goes to the creator the brand belongs to (no brand yet: the page's creator).
  select * into me from public.profiles where id = auth.uid();
  select * into b from public.brands where id = v_my;
  select * into s from public.creator_settings where id = coalesce(b.creator_id, private.page_creator());
  first_name := split_part(s.display_name, ' ', 1);
  if not s.accepting then
    raise exception '% is fully booked right now and not taking new requests.', s.display_name;
  end if;

  if v_my is null then
    raise exception 'Add your brand details first.';
  end if;
  perform private.act_for(s.id);

  select count(*) into recent
  from public.collabs
  where brand_id = v_my and source = 'brand_page' and created_at > now() - interval '1 day';
  if recent >= 5 then
    raise exception 'You have sent 5 requests today. Please try again tomorrow.';
  end if;

  begin
    v_type := coalesce(nullif(p ->> 'type', ''), 'paid')::public.collab_type;
  exception when others then
    raise exception 'Choose a type of collaboration.';
  end;

  if jsonb_typeof(p -> 'deliverables') is distinct from 'array' then
    raise exception 'Choose at least one deliverable.';
  end if;
  -- Only content types she has switched on.
  if exists (
    select 1 from jsonb_array_elements(p -> 'deliverables') x
    where coalesce(nullif(x ->> 'qty', '')::integer, 0) > 0 and not (btrim(x ->> 'kind') = any(s.offered_kinds))
  ) then
    raise exception '% isn''t offering some of that content right now. Please choose from the options shown.', first_name;
  end if;
  -- Barter can be a product they send, or an experience (a stay, a meal, an event, a service).
  v_kind := case when p ->> 'barter_kind' = 'experience' then 'experience' else 'product' end;
  if v_type <> 'paid' and btrim(coalesce(p ->> 'product', '')) = '' then
    raise exception '%', case when v_kind = 'experience' then 'Tell us what you are offering (the stay, meal or event).' else 'Tell us which product you will send.' end;
  end if;

  -- One of her packages? Its price is the fee unless the brand offered more.
  if nullif(p ->> 'package_id', '') is not null then
    select * into pk from public.packages where id = (p ->> 'package_id')::uuid and creator_id = s.id and active;
    if pk.id is null then
      raise exception 'That package is no longer available. Please choose the content you need.';
    end if;
    v_type := 'paid';
  end if;
  v_fee := greatest(0, coalesce(nullif(p ->> 'fee', '')::numeric, 0));
  if pk.id is not null then
    v_fee := greatest(v_fee, pk.price);
  end if;

  -- Content language: one or more of the languages she creates in ("Kannada", or "English + Kannada").
  if jsonb_typeof(p -> 'content_language') = 'array' then
    for l in select btrim(x) from jsonb_array_elements_text(p -> 'content_language') x loop
      if l <> '' then
        if not (l = any(s.content_languages)) then
          raise exception '% doesn''t create content in % right now. Please choose from the languages shown.', first_name, l;
        end if;
        v_lang := v_lang || case when v_lang = '' then '' else ' + ' end || l;
      end if;
    end loop;
  end if;

  -- Barter rules.
  v_value := greatest(0, coalesce(nullif(p ->> 'product_value', '')::numeric, 0));
  if v_type = 'barter' and s.barter_mode = 'closed' then
    raise exception '% is taking paid collaborations only right now. Choose Paid, or Paid + product.', first_name;
  end if;
  -- Below her barter minimum: still accepted, reviewed last (the brand was told on the form).
  v_low := v_type = 'barter' and s.barter_min_value > 0 and v_value < s.barter_min_value;

  insert into public.collabs (
    brand_id, source, contact_name, contact_email, contact_phone, type, fee, product, product_value,
    usage, brief, brief_details, preferred_live, note_for_brand, package_name, created_by, barter_kind, content_language)
  values (
    v_my, 'brand_page', me.full_name, me.email, me.phone, v_type,
    case when v_type = 'barter' then 0 else v_fee end,
    case when v_type = 'paid' then '' else left(btrim(p ->> 'product'), 200) end,
    case when v_type = 'paid' then 0 else v_value end,
    left(coalesce(nullif(p ->> 'usage', ''), 'Organic only'), 60),
    left(coalesce(p ->> 'brief', ''), 4000),
    public.clean_brief(p -> 'brief_details'),
    nullif(p ->> 'preferred_live', '')::date,
    case when v_low
      then format('Thanks for reaching out! %s reviews paid collaborations first, and barter offers below ₹%s are reviewed last, so a reply may take longer than %s. Adding a fee gets a faster answer.', first_name, to_char(s.barter_min_value, 'FM99,99,99,999'), s.barter_reply_time)
      when v_type = 'barter'
      then format('Thanks for reaching out! %s reviews paid collaborations first, so barter requests usually get a reply within %s.', first_name, s.barter_reply_time)
      else format('Thanks for reaching out! %s will review your request and reply within %s.', first_name, s.reply_time) end,
    coalesce(pk.name, ''),
    auth.uid(),
    case when v_type = 'paid' then 'product' else v_kind end,
    left(v_lang, 60))
  returning id, code into v_id, v_code;

  for d in select * from jsonb_array_elements(p -> 'deliverables') loop
    if coalesce(nullif(d ->> 'qty', '')::integer, 0) > 0 and btrim(coalesce(d ->> 'kind', '')) <> '' then
      insert into public.deliverables (collab_id, kind, qty, position)
      values (v_id, left(btrim(d ->> 'kind'), 40), least(50, (d ->> 'qty')::integer), pos);
      pos := pos + 1;
    end if;
  end loop;
  if pos = 0 then
    raise exception 'Choose at least one deliverable.';
  end if;

  select string_agg(qty || ' × ' || kind, ', ' order by position) into deliv_text
  from public.deliverables where collab_id = v_id;

  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (v_id, auth.uid(), 'stage', 'Request received', true);

  insert into public.outbox (creator_id, kind, to_email, payload) values
  (s.id, 'request_received_brand', me.email, jsonb_build_object(
     'code', v_code, 'brand', b.name, 'contact', me.full_name, 'deliverables', deliv_text)),
  (s.id, 'request_received_creator', s.creator_email, jsonb_build_object(
     'code', v_code, 'brand', b.name, 'contact', me.full_name, 'email', me.email, 'phone', me.phone,
     'type', v_type, 'fee', (select fee from public.collabs where id = v_id),
     'product', (select product from public.collabs where id = v_id),
     'deliverables', deliv_text, 'package', coalesce(pk.name, ''), 'brief', left(coalesce(p ->> 'brief', ''), 600), 'language', v_lang));

  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;

-- 7. A request link: which company and which creator's address it lives on ------------------------------
create or replace function public.request_place(p_code text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('brand_id', c.brand_id, 'slug', s.slug)
  from public.collabs c
  join public.brand_members m on m.brand_id = c.brand_id and m.profile_id = auth.uid()
  join public.creator_settings s on s.id = c.creator_id
  where upper(c.code) = upper(btrim(p_code))
  limit 1
$$;
revoke execute on function public.request_place(text) from public, anon;
grant execute on function public.request_place(text) to authenticated;

-- 8. Creators can choose to be listed for brands to discover -----------------------------------------------
alter table public.creator_settings add column if not exists listed boolean not null default false;

-- What a brand sees about a creator it works with or can discover (public page facts only).
create or replace function private.creator_card(p_id integer)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.display_name, 'niche', s.niche, 'city', s.city,
    'accepting', s.accepting,
    'photo', case when a.connected then nullif(a.profile_picture_url, '') end,
    'followers', case when a.connected then a.followers end,
    'engagement', case when a.connected then a.engagement_rate end)
  from public.creator_settings s left join public.ig_account a on a.id = s.id
  where s.id = p_id;
$$;
revoke execute on function private.creator_card(integer) from public, anon, authenticated;

-- 9. The account: the company for this page, and every creator this login works with --------------------
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
    return jsonb_build_object('role', 'creator', 'email', v_email, 'creator_id', public.current_creator(),
      'slug', (select s.slug from public.creator_settings s where s.id = public.current_creator()));
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
    insert into public.brand_members (profile_id, brand_id)
    select distinct auth.uid(), c.brand_id from public.collabs c where lower(c.contact_email) = v_email
    on conflict do nothing;
  end if;

  v_brand := public.my_brand_id();
  if v_brand is not null and p.brand_id is distinct from v_brand then
    update public.profiles set brand_id = v_brand where id = auth.uid() returning * into p;
  elsif p.brand_id is null then
    update public.profiles set brand_id = (
      select m.brand_id from public.brand_members m where m.profile_id = auth.uid() order by m.created_at limit 1)
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
      where m.profile_id = auth.uid() and x.creator_id = v_page), '[]'::jsonb),
    -- Companies this login has with other creators, to reuse on a first request here.
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object('id', y.id, 'name', y.name) order by lower(y.name))
      from (select distinct on (lower(x.name)) x.id, x.name
            from public.brand_members m join public.brands x on x.id = m.brand_id
            where m.profile_id = auth.uid() and x.creator_id is distinct from v_page
            order by lower(x.name), m.created_at desc) y), '[]'::jsonb),
    -- Every creator this login works with (the creator switcher).
    'creators', coalesce((
      select jsonb_agg(private.creator_card(s.id) || jsonb_build_object(
          'current', s.id = v_page,
          'open', (select count(*) from public.collabs c join public.brand_members m on m.brand_id = c.brand_id and m.profile_id = auth.uid()
                   where c.creator_id = s.id and c.stage not in ('wrapped', 'declined', 'cancelled')),
          'waiting', (select count(*) from public.collabs c join public.brand_members m on m.brand_id = c.brand_id and m.profile_id = auth.uid()
                      where c.creator_id = s.id and (
                        exists (select 1 from public.quotes q where q.collab_id = c.id and q.status = 'sent'
                                and q.version = (select max(q2.version) from public.quotes q2 where q2.collab_id = c.id))
                        or exists (select 1 from public.drafts d where d.collab_id = c.id and d.status = 'pending'))))
        order by lower(s.display_name))
      from public.creator_settings s
      where s.status = 'active' and exists (
        select 1 from public.brand_members m join public.brands x on x.id = m.brand_id
        where m.profile_id = auth.uid() and x.creator_id = s.id)), '[]'::jsonb)
  );
end;
$function$;

-- 10. The brand dashboard: everything across every creator this login works with ---------------------------
create or replace function public.brand_dashboard()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with mine as (
    select distinct c.* from public.collabs c
    join public.brand_members m on m.brand_id = c.brand_id and m.profile_id = auth.uid()
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
        where m.profile_id = auth.uid() and x.creator_id = s.id)), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;
revoke execute on function public.brand_dashboard() from public, anon;
grant execute on function public.brand_dashboard() to authenticated;

-- 11. Discover: creators who chose to be listed -------------------------------------------------------------
create or replace function public.discover_creators(p_q text default '', p_niche text default '')
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(private.creator_card(s.id) order by a.followers desc nulls last, lower(s.display_name)), '[]'::jsonb)
  from public.creator_settings s left join public.ig_account a on a.id = s.id and a.connected
  where auth.uid() is not null and s.status = 'active' and s.listed and s.slug is not null
    and (btrim(coalesce(p_q, '')) = '' or s.display_name ilike '%' || btrim(p_q) || '%' or s.niche ilike '%' || btrim(p_q) || '%'
         or s.city ilike '%' || btrim(p_q) || '%' or s.handle ilike '%' || btrim(p_q) || '%')
    and (btrim(coalesce(p_niche, '')) = '' or s.niche ilike '%' || btrim(p_niche) || '%');
$$;
revoke execute on function public.discover_creators(text, text) from public, anon;
grant execute on function public.discover_creators(text, text) to authenticated;
