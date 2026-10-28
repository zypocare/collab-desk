-- A collab a marketing or PR agency sent on a brand's behalf: the brand is who the content is for (brand_id), and the
-- agency that wrote, negotiates and often pays is kept here, shown as "via <agency>" on the collab.
alter table public.collabs add column if not exists via_agency text not null default '';
