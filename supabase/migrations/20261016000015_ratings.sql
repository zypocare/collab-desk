-- Private brand ratings (only the creator sees them). They feed the priority score.
alter table public.brand_private
  add column rate_pay   smallint check (rate_pay between 1 and 5),
  add column rate_brief smallint check (rate_brief between 1 and 5),
  add column rate_again smallint check (rate_again between 1 and 5),
  add column rated_at   timestamptz;
