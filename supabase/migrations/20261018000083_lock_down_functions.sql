-- Security advisor clean-up.
--
-- 1. Functions without a fixed search_path get an empty one (their bodies use only built-ins and
--    schema-qualified names).
-- 2. SECURITY DEFINER functions are callable by anyone who can reach /rest/v1/rpc. Logged-out
--    visitors (anon) keep only what the public pages and links use; trigger functions and
--    database-internal helpers are callable by nobody from the API.
-- 3. New functions in public are no longer executable by anon by default. A function a
--    logged-out page needs must say so: grant execute on function ... to anon;

alter function public.collabs_clear_ack_note() set search_path = '';
alter function public.collabs_reset_post_alert() set search_path = '';
alter function public.creator_settings_guard() set search_path = '';
alter function public.stage_label(public.collab_stage) set search_path = '';
alter function public.pay_label(public.pay_status) set search_path = '';
alter function public.fy_label(date) set search_path = '';
alter function public.usage_days(text) set search_path = '';
alter function public.clean_brief(jsonb) set search_path = '';
alter function public.money_text(numeric, text) set search_path = '';
alter function private.kick_outbox() set search_path = '';
alter function private.ai_day() set search_path = '';

do $$
declare
  -- What the logged-out pages call: the brand page (/), action links (/a), brief forms, file
  -- links, short links (/go), insights links, invoices, reports, reviews, tracking (/t),
  -- the book-again offer, the DM webhook's AI ticket, and the storage policies for shared files.
  keep_anon text[] := array[
    'public_page', 'public_insights', 'page_extras', 'ask_question', 'rebook_offer',
    'action_info', 'action_pick', 'action_run', 'draft_comment_add', 'draft_comment_delete',
    'brief_form_info', 'brief_form_submit', 'files_info', 'file_downloaded', 'link_go',
    'insight_link_open', 'public_invoice', 'invoice_claim_paid', 'public_report',
    'review_info', 'review_submit', 'public_track', 'ai_take_ticket',
    'is_delivery_file', 'is_draft_file'];
  -- Used only inside other database functions (or by the server with the service key).
  internal text[] := array[
    'availability', 'barter_slots_used', 'brief_missing', 'is_away', 'rate_value',
    'usage_ext_price', 'week_open', 'team_copy_emails', 'my_brand_id'];
  r record;
  had_auth boolean;
begin
  for r in
    select p.oid, p.oid::regprocedure as sig, p.proname, p.prorettype = 'trigger'::regtype as trg
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
  loop
    if r.trg or r.proname = any(internal) then
      execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    elsif not r.proname = any(keep_anon) then
      -- Signed-in only: keep whatever signed-in users had (it may have come through PUBLIC).
      had_auth := has_function_privilege('authenticated', r.oid, 'execute');
      execute format('revoke execute on function %s from public, anon', r.sig);
      if had_auth then
        execute format('grant execute on function %s to authenticated', r.sig);
      end if;
    end if;
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;
