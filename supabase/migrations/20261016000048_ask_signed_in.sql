-- Questions from her page now need a sign-in (a 6-digit code to their email), so the reply address is
-- always a real, checked email: the one they signed in with, whatever the form sends.

create or replace function public.ask_question(p_name text, p_email text, p_brand text, p_body text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  s public.creator_settings;
begin
  if auth.uid() is null or v_email = '' then raise exception 'Sign in with your email first, so the reply reaches you.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 3 then raise exception 'Type your question.'; end if;
  -- Keep it to real questions: a few per email a day, and a limit overall.
  if (select count(*) from public.brand_questions where email = v_email and created_at > now() - interval '1 day') >= 3 then
    raise exception 'You''ve sent a few questions today. You''ll get a reply by email soon.';
  end if;
  if (select count(*) from public.brand_questions where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Lots of questions right now. Please try again in a little while.';
  end if;
  select * into s from public.creator_settings where id = 1;
  insert into public.brand_questions (name, email, brand, body)
  values (left(btrim(coalesce(p_name, '')), 80), v_email, left(btrim(coalesce(p_brand, '')), 80), left(btrim(p_body), 2000));
  insert into public.outbox (kind, to_email, payload) values ('question_received', s.creator_email, jsonb_build_object(
    'name', btrim(coalesce(p_name, '')), 'email', v_email, 'brand', btrim(coalesce(p_brand, '')), 'body', left(btrim(p_body), 600)));
end;
$$;
revoke execute on function public.ask_question(text, text, text, text) from anon;
grant execute on function public.ask_question(text, text, text, text) to authenticated;
