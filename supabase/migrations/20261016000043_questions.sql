-- Questions before a request: a brand asks from her page (no sign-in), it lands on her Today page,
-- she answers by email from the studio, or turns it into a request.

create table public.brand_questions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '',
  email       text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  brand       text not null default '',
  body        text not null check (char_length(btrim(body)) between 3 and 2000),
  created_at  timestamptz not null default now(),
  answer      text not null default '',
  answered_at timestamptz,
  closed      boolean not null default false
);
create index brand_questions_open_idx on public.brand_questions (created_at desc) where not closed;
alter table public.brand_questions enable row level security;
create policy "creator manages questions" on public.brand_questions
  for all to authenticated using (public.is_creator()) with check (public.is_creator());

create or replace function public.ask_question(p_name text, p_email text, p_brand text, p_body text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  s public.creator_settings;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Type your email so we can reply.'; end if;
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
grant execute on function public.ask_question(text, text, text, text) to anon, authenticated;

create or replace function public.answer_question(p_id uuid, p_answer text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  q public.brand_questions;
begin
  if not public.is_creator() then raise exception 'Only the creator can answer.'; end if;
  if char_length(btrim(coalesce(p_answer, ''))) < 2 then raise exception 'Type your answer.'; end if;
  update public.brand_questions set answer = left(btrim(p_answer), 4000), answered_at = now(), closed = true
  where id = p_id returning * into q;
  insert into public.outbox (kind, to_email, payload) values ('question_answer', q.email, jsonb_build_object(
    'name', q.name, 'brand', q.brand, 'question', left(q.body, 600), 'answer', q.answer));
end;
$$;
revoke execute on function public.answer_question(uuid, text) from anon;
