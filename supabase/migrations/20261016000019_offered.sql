-- Content types she offers. Brands only see (and can only request) the ones switched on.
alter table public.creator_settings
  add column offered_kinds text[] not null default '{Reel,Story,"Static post",Carousel,"YouTube Short","UGC video"}';

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
    'offered', to_jsonb(s.offered_kinds),
    'rates', case when s.show_rates then s.rates else null end,
    'availability', case when s.show_availability then public.availability() else null end,
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'description', k.description, 'items', k.items,
        'price', k.price, 'badge', k.badge) order by k.position, k.created_at)
      from public.packages k where k.active
    ), '[]'::jsonb),
    'barter', jsonb_build_object(
      'mode', s.barter_mode,
      'min_value', s.barter_min_value,
      'reply_time', s.barter_reply_time,
      'slots_left', case when s.barter_monthly_cap > 0 then greatest(0, s.barter_monthly_cap - public.barter_slots_used()) else null end),
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

create or replace function public.submit_request(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  s public.creator_settings;
  me public.profiles;
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
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if public.is_creator() then
    raise exception 'The creator account cannot send requests.';
  end if;

  select * into s from public.creator_settings where id = 1;
  first_name := split_part(s.display_name, ' ', 1);
  if not s.accepting then
    raise exception '% is fully booked right now and not taking new requests.', s.display_name;
  end if;

  select * into me from public.profiles where id = auth.uid();
  if me.brand_id is null then
    raise exception 'Add your brand details first.';
  end if;
  select * into b from public.brands where id = me.brand_id;

  select count(*) into recent
  from public.collabs
  where brand_id = me.brand_id and source = 'brand_page' and created_at > now() - interval '1 day';
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
  if v_type <> 'paid' and btrim(coalesce(p ->> 'product', '')) = '' then
    raise exception 'Tell us which product you will send.';
  end if;

  -- One of her packages? Its price is the fee unless the brand offered more.
  if nullif(p ->> 'package_id', '') is not null then
    select * into pk from public.packages where id = (p ->> 'package_id')::uuid and active;
    if pk.id is null then
      raise exception 'That package is no longer available. Please choose the content you need.';
    end if;
    v_type := 'paid';
  end if;
  v_fee := greatest(0, coalesce(nullif(p ->> 'fee', '')::numeric, 0));
  if pk.id is not null then
    v_fee := greatest(v_fee, pk.price);
  end if;

  -- Barter rules.
  v_value := greatest(0, coalesce(nullif(p ->> 'product_value', '')::numeric, 0));
  if v_type = 'barter' and s.barter_mode = 'closed' then
    raise exception '% is taking paid collaborations only right now. Choose Paid, or Paid + product.', first_name;
  end if;
  if v_type = 'barter' and s.barter_mode = 'selective' and s.barter_min_value > 0 and v_value < s.barter_min_value then
    raise exception 'Barter collaborations start at products worth ₹%. Add a fee (Paid + product) to send this request.',
      to_char(s.barter_min_value, 'FM99,99,99,999');
  end if;

  insert into public.collabs (
    brand_id, source, contact_name, contact_email, contact_phone, type, fee, product, product_value,
    usage, brief, brief_details, preferred_live, note_for_brand, package_name, created_by)
  values (
    me.brand_id, 'brand_page', me.full_name, me.email, me.phone, v_type,
    case when v_type = 'barter' then 0 else v_fee end,
    case when v_type = 'paid' then '' else left(btrim(p ->> 'product'), 200) end,
    case when v_type = 'paid' then 0 else v_value end,
    left(coalesce(nullif(p ->> 'usage', ''), 'Organic only'), 60),
    left(coalesce(p ->> 'brief', ''), 4000),
    public.clean_brief(p -> 'brief_details'),
    nullif(p ->> 'preferred_live', '')::date,
    case when v_type = 'barter'
      then format('Thanks for reaching out! %s reviews paid collaborations first, so barter requests usually get a reply within %s.', first_name, s.barter_reply_time)
      else format('Thanks for reaching out! %s will review your request and reply within %s.', first_name, s.reply_time) end,
    coalesce(pk.name, ''),
    auth.uid())
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

  insert into public.outbox (kind, to_email, payload) values
  ('request_received_brand', me.email, jsonb_build_object(
     'code', v_code, 'brand', b.name, 'contact', me.full_name, 'deliverables', deliv_text)),
  ('request_received_creator', s.creator_email, jsonb_build_object(
     'code', v_code, 'brand', b.name, 'contact', me.full_name, 'email', me.email, 'phone', me.phone,
     'type', v_type, 'fee', (select fee from public.collabs where id = v_id),
     'product', (select product from public.collabs where id = v_id),
     'deliverables', deliv_text, 'package', coalesce(pk.name, ''), 'brief', left(coalesce(p ->> 'brief', ''), 600)));

  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;
