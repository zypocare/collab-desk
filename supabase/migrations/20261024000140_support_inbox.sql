-- Support mail goes to Miracle's support inbox (support@miracleapp.live), not to the admins' own emails.

create or replace function private.support_inbox()
returns text
language sql immutable
set search_path = ''
as $$ select 'support@miracleapp.live'::text $$;
revoke execute on function private.support_inbox() from public, anon, authenticated;

create or replace function private.support_tell_team(p_ticket public.support_tickets, p_body text, p_new boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.outbox (creator_id, kind, to_email, payload)
  values (null, case when p_new then 'support_new' else 'support_user_reply' end, private.support_inbox(), jsonb_build_object(
    'number', p_ticket.number, 'subject', p_ticket.subject, 'category', p_ticket.category, 'side', p_ticket.side,
    'name', p_ticket.name, 'email', p_ticket.email, 'body', left(coalesce(p_body, ''), 1500), 'id', p_ticket.id,
    'urgent', p_ticket.priority = 'urgent', 'app', true));
end;
$$;
revoke execute on function private.support_tell_team(public.support_tickets, text, boolean) from public, anon, authenticated;
