-- Her birthday (day and month only: no year is asked or kept). Today's top card turns into a birthday card the day
-- before until midnight on the day (in the app), and on the day a personal email and a phone notification wish her,
-- once a year, with her year on Miracle: collabs done, brands, and what she earned since her last birthday.
alter table public.creator_settings
  add column if not exists birth_day smallint,
  add column if not exists birth_month smallint,
  add column if not exists birthday_wished_year smallint;
alter table public.creator_settings drop constraint if exists creator_settings_birthday_check;
alter table public.creator_settings add constraint creator_settings_birthday_check check (
  (birth_day is null and birth_month is null)
  or (birth_month between 1 and 12 and birth_day between 1 and case when birth_month = 2 then 29 when birth_month in (4, 6, 9, 11) then 30 else 31 end));

-- Every morning at 9 India time: today's birthdays get their wish (29 February birthdays on the 28th in other years).
create or replace function private.birthday_wishes()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_year smallint := extract(year from v_today)::smallint;
  v_leap boolean := (v_year % 4 = 0 and v_year % 100 <> 0) or v_year % 400 = 0;
  r record;
  n integer := 0;
begin
  for r in
    select s.id, s.creator_email, s.display_name,
      (select count(*) from public.collabs c where c.creator_id = s.id and c.stage in ('live', 'wrapped')
         and coalesce(c.wrapped_at, c.updated_at) >= v_today - 365) as collabs,
      (select count(distinct c.brand_id) from public.collabs c where c.creator_id = s.id and c.stage in ('live', 'wrapped')
         and coalesce(c.wrapped_at, c.updated_at) >= v_today - 365) as brands,
      (select coalesce(sum(c.pay_received), 0) from public.collabs c where c.creator_id = s.id
         and c.paid_on >= v_today - 365) as earned
    from public.creator_settings s
    where s.status = 'active' and coalesce(s.creator_email, '') <> ''
      and coalesce(s.birthday_wished_year, 0) < v_year
      and (
        (s.birth_month = extract(month from v_today) and s.birth_day = extract(day from v_today))
        or (not v_leap and s.birth_month = 2 and s.birth_day = 29 and extract(month from v_today) = 2 and extract(day from v_today) = 28)
      )
  loop
    insert into public.outbox (creator_id, kind, to_email, payload)
    values (r.id, 'birthday', r.creator_email, jsonb_build_object(
      'name', r.display_name, 'year', v_year, 'collabs', r.collabs, 'brands', r.brands, 'earned', r.earned));
    update public.creator_settings set birthday_wished_year = v_year where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function private.birthday_wishes() from public, anon, authenticated;
select cron.unschedule('birthday-wishes') where exists (select 1 from cron.job where jobname = 'birthday-wishes');
select cron.schedule('birthday-wishes', '30 3 * * *', $$select private.birthday_wishes()$$);
