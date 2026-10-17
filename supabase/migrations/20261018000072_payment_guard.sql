-- A payment can't be more than the invoice: an extra zero typed into "Amount received" used to be
-- saved and inflated Reports and the tax pack. Checked for every new or changed payment (rows
-- already saved are left as they are).
alter table public.invoices
  add constraint invoices_received_within_total
  check (amount_received + tds_deducted <= total + 1) not valid;
