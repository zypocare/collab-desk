-- "Your month in review": each month's review (the facts and the AI's write-up) is kept so it
-- opens instantly and isn't rewritten every time. On the 1st at 9 am she gets a phone alert.

create table if not exists public.month_reviews (
  month      text primary key check (month ~ '^\d{4}-\d{2}$'),
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.month_reviews enable row level security;
drop policy if exists "creator manages month reviews" on public.month_reviews;
create policy "creator manages month reviews" on public.month_reviews for all to authenticated using (public.is_creator()) with check (public.is_creator());
revoke all on public.month_reviews from anon;
grant select, insert, update, delete on public.month_reviews to authenticated;

create or replace function private.month_review_alert()
returns void
language sql security definer
set search_path = public
as $$
  insert into public.outbox (kind, to_email, payload)
  select 'month_summary', '', jsonb_build_object(
    'month', to_char((now() at time zone 'Asia/Kolkata') - interval '1 month', 'YYYY-MM'),
    'label', trim(to_char((now() at time zone 'Asia/Kolkata') - interval '1 month', 'Month')));
$$;

select cron.unschedule('month-review') where exists (select 1 from cron.job where jobname = 'month-review');
-- 03:30 UTC = 9:00 am in India, on the 1st.
select cron.schedule('month-review', '30 3 1 * *', $$select private.month_review_alert()$$);
