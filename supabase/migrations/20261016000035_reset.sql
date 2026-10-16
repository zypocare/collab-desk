-- "Start fresh": clears test data. Owner only, and only with the word RESET.
-- Removes every collab (with its quotes, drafts, invoices, messages, files, costs, reviews…),
-- every brand, bank credits, queued emails and email links. Keeps her profile, rates, packages,
-- settings, team and Instagram. Optionally removes brand sign-ins too (not hers, not her team's).
-- Uploaded files are removed by the app first (storage can't be cleared from SQL).

create or replace function public.reset_studio_data(p_confirm text, p_brand_logins boolean default true)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  n_collabs integer;
  n_brands integer;
  n_logins integer := 0;
  v_owner text;
begin
  if not public.is_owner() then raise exception 'Only the owner can reset the studio.'; end if;
  if p_confirm is distinct from 'RESET' then raise exception 'Type RESET to confirm.'; end if;
  select lower(creator_email) into v_owner from public.creator_settings where id = 1;

  perform set_config('app.quiet', 'on', true);
  delete from public.bank_alerts where true;
  select count(*) into n_collabs from public.collabs;
  delete from public.collabs where true;
  select count(*) into n_brands from public.brands;
  delete from public.brands where true;
  delete from public.outbox where true;
  delete from public.inbound_emails where true;
  delete from private.action_links where true;

  if p_brand_logins then
    with gone as (
      delete from auth.users u
      where lower(coalesce(u.email, '')) <> v_owner
        and lower(coalesce(u.email, '')) not in (select email from public.team_members)
      returning 1
    ) select count(*) into n_logins from gone;
  end if;
  perform set_config('app.quiet', 'off', true);

  return jsonb_build_object('collabs', n_collabs, 'brands', n_brands, 'logins', n_logins);
end;
$$;
revoke execute on function public.reset_studio_data(text, boolean) from anon;
