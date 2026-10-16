-- Usage rights expiry: "90 days paid ads" ends 90 days after going live. A week before, the brand
-- is offered an extension at her rate; she approves it and the fee grows by that amount.

alter table public.creator_settings
  add column usage_ext_pct integer not null default 25 check (usage_ext_pct between 0 and 200);

alter table public.collabs
  add column usage_ends date,
  add column usage_notice_at timestamptz,
  add column usage_ext_days integer not null default 0,
  add column usage_ext_price numeric(12,2) not null default 0,
  add column usage_ext_status text not null default '' check (usage_ext_status in ('', 'requested', 'approved', 'declined'));

-- "60 days paid ads" -> 60. Organic and perpetual usage never end.
create or replace function public.usage_days(p_usage text)
returns integer
language sql immutable
as $$
  select case when p_usage ~* 'paid' then nullif(substring(p_usage from '(\d+)\s*day'), '')::integer end;
$$;

create or replace function public.collabs_usage_ends()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.usage is distinct from old.usage or new.live_date is distinct from old.live_date then
    new.usage_ends := case when new.live_date is not null and public.usage_days(new.usage) is not null
                           then new.live_date + public.usage_days(new.usage) end;
    if tg_op = 'UPDATE' and new.usage_ends is distinct from old.usage_ends then
      new.usage_notice_at := null;
    end if;
  end if;
  return new;
end;
$$;
create trigger collabs_usage_ends
  before insert or update on public.collabs
  for each row execute function public.collabs_usage_ends();

-- Fill it in for collabs that are already live.
update public.collabs set usage_ends = live_date + public.usage_days(usage)
where live_date is not null and public.usage_days(usage) is not null;

-- Price of extending by p_days: her % of the fee (or rate card value for barter) per 30 days, rounded to ₹500.
create or replace function public.usage_ext_price(p_collab uuid, p_days integer)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select round(greatest(c.fee, coalesce((
           select sum(coalesce((s.rates ->> d.kind)::numeric, 0) * d.qty) from public.deliverables d where d.collab_id = c.id), 0))
         * s.usage_ext_pct / 100.0 * p_days / 30.0 / 500) * 500
  from public.collabs c, public.creator_settings s
  where c.id = p_collab and s.id = 1;
$$;
revoke execute on function public.usage_ext_price(uuid, integer) from anon;

-- Usage details for one of the signed-in brand's requests, with extension prices.
create or replace function public.usage_info(p_code text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  c public.collabs;
begin
  select * into c from public.collabs where upper(code) = upper(p_code) and brand_id = public.my_brand_id();
  if c.id is null or c.usage_ends is null then
    return null;
  end if;
  return jsonb_build_object(
    'usage', c.usage, 'ends', c.usage_ends,
    'ext_status', c.usage_ext_status, 'ext_days', c.usage_ext_days, 'ext_price', c.usage_ext_price,
    'options', jsonb_build_array(
      jsonb_build_object('days', 30, 'price', public.usage_ext_price(c.id, 30)),
      jsonb_build_object('days', 60, 'price', public.usage_ext_price(c.id, 60)),
      jsonb_build_object('days', 90, 'price', public.usage_ext_price(c.id, 90))));
end;
$$;
revoke execute on function public.usage_info(text) from anon;

create or replace function public.request_usage_extension(p_code text, p_days integer)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
  s public.creator_settings;
  v_price numeric;
begin
  select * into c from public.collabs where upper(code) = upper(p_code) and brand_id = public.my_brand_id();
  if c.id is null or c.usage_ends is null then
    raise exception 'This collaboration has no paid usage to extend.';
  end if;
  if p_days not in (30, 60, 90) then
    raise exception 'Choose 30, 60 or 90 days.';
  end if;
  if c.usage_ext_status = 'requested' then
    raise exception 'You have already asked for an extension. You will hear back soon.';
  end if;
  select * into b from public.brands where id = c.brand_id;
  select * into s from public.creator_settings where id = 1;
  v_price := public.usage_ext_price(c.id, p_days);

  update public.collabs set usage_ext_status = 'requested', usage_ext_days = p_days, usage_ext_price = v_price where id = c.id;
  insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
  values (c.id, auth.uid(), 'usage', format('Asked to extend paid usage by %s days (₹%s)', p_days, to_char(v_price, 'FM99,99,99,999')), true);
  insert into public.outbox (kind, to_email, payload) values ('usage_ext_requested', s.creator_email, jsonb_build_object(
    'code', c.code, 'brand', b.name, 'days', p_days, 'price', v_price, 'ends', c.usage_ends));
end;
$$;
revoke execute on function public.request_usage_extension(text, integer) from anon;

-- She approves or declines. Approving extends the end date and adds the price to the fee.
create or replace function public.respond_usage_extension(p_collab uuid, p_approve boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  b public.brands;
  v_ends date;
begin
  if not public.is_creator() then
    raise exception 'Not allowed.';
  end if;
  select * into c from public.collabs where id = p_collab;
  if c.usage_ext_status <> 'requested' then
    raise exception 'There is no extension request waiting.';
  end if;
  select * into b from public.brands where id = c.brand_id;
  v_ends := greatest(c.usage_ends, current_date) + c.usage_ext_days;

  if p_approve then
    update public.collabs set
      usage_ext_status = 'approved',
      usage_ends = v_ends,
      usage_notice_at = null,
      fee = fee + c.usage_ext_price,
      pay_status = case when pay_status = 'paid' then 'advance'::public.pay_status else pay_status end,
      paid_on = case when pay_status = 'paid' then null else paid_on end
    where id = c.id;
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'usage', format('Paid usage extended to %s', to_char(v_ends, 'DD Mon YYYY')), true);
  else
    update public.collabs set usage_ext_status = 'declined' where id = c.id;
    insert into public.collab_events (collab_id, actor, kind, text, visible_to_brand)
    values (c.id, auth.uid(), 'usage', 'Usage extension not available this time', true);
  end if;

  if c.contact_email <> '' then
    insert into public.outbox (kind, to_email, payload) values ('usage_ext_answer', c.contact_email, jsonb_build_object(
      'code', c.code, 'brand', b.name, 'contact', c.contact_name, 'approved', p_approve,
      'days', c.usage_ext_days, 'price', c.usage_ext_price, 'ends', v_ends));
  end if;
end;
$$;
revoke execute on function public.respond_usage_extension(uuid, boolean) from anon;

-- Daily: a week before paid usage ends, offer the brand an extension.
create or replace function private.usage_watch()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  c record;
  n integer := 0;
begin
  for c in
    select x.*, b.name as brand_name from public.collabs x join public.brands b on b.id = x.brand_id
    where x.usage_ends is not null and x.usage_notice_at is null and x.stage in ('live', 'wrapped')
      and x.usage_ends between current_date and current_date + 7 and x.contact_email <> ''
      and x.usage_ext_status <> 'requested'
  loop
    insert into public.outbox (kind, to_email, payload) values ('usage_ending', c.contact_email, jsonb_build_object(
      'code', c.code, 'brand', c.brand_name, 'contact', c.contact_name, 'usage', c.usage, 'ends', c.usage_ends,
      'price30', public.usage_ext_price(c.id, 30)));
    insert into public.collab_events (collab_id, kind, text, visible_to_brand)
    values (c.id, 'usage', format('Paid usage ends on %s. Extension offered.', to_char(c.usage_ends, 'DD Mon')), true);
    update public.collabs set usage_notice_at = now() where id = c.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

select cron.schedule('usage-watch', '0 4 * * *', $$select private.usage_watch()$$);
