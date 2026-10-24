-- Case studies: a finished collab told as a short story (the goal, what was made, the results with the real
-- numbers), drafted by AI from the results report, edited by the creator, and published on her page only once
-- the brand approves it (with an optional line from them). Editing a published one sends it back to the brand.

create table if not exists public.case_studies (
  id uuid primary key default gen_random_uuid(),
  creator_id integer not null references public.creator_settings (id) on delete cascade,
  collab_id uuid not null unique references public.collabs (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  summary text not null default '' check (char_length(summary) <= 300),
  goal text not null default '' check (char_length(goal) <= 600),
  made text not null default '' check (char_length(made) <= 600),
  results text not null default '' check (char_length(results) <= 600),
  highlights jsonb not null default '[]',
  quote text not null default '' check (char_length(quote) <= 300),
  quote_by text not null default '' check (char_length(quote_by) <= 120),
  status text not null default 'draft' check (status in ('draft', 'asked', 'published', 'declined')),
  brand_note text not null default '' check (char_length(brand_note) <= 500),
  asked_at timestamptz,
  answered_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists case_studies_creator_idx on public.case_studies (creator_id, status);
alter table public.case_studies enable row level security;
revoke all on public.case_studies from anon, authenticated;

-- Her team's collab (owner or manager), live or finished.
create or replace function private.case_collab(p_collab uuid)
returns public.collabs
language plpgsql stable security definer
set search_path = public
as $$
declare
  c public.collabs;
begin
  select * into c from public.collabs where id = p_collab and creator_id = public.current_creator();
  if c.id is null or public.team_role() not in ('owner', 'manager') then raise exception 'Collab not found.'; end if;
  if c.stage not in ('live', 'wrapped') then raise exception 'A case study comes once the post is live.'; end if;
  return c;
end;
$$;
revoke execute on function private.case_collab(uuid) from public, anon, authenticated;

create or replace function public.case_study_get(p_collab uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select to_jsonb(cs) from public.case_studies cs
  where cs.collab_id = p_collab and cs.creator_id = public.current_creator() and public.team_role() is not null;
$$;

-- Save her draft. Changing a case study the brand already saw sends it back to draft (it's asked again).
create or replace function public.case_study_save(p_collab uuid, p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs := private.case_collab(p_collab);
  cs public.case_studies;
  v_hl jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('label', left(x ->> 'label', 40), 'value', left(x ->> 'value', 30))), '[]') into v_hl
  from (select x from jsonb_array_elements(case when jsonb_typeof(p -> 'highlights') = 'array' then p -> 'highlights' else '[]' end) x limit 6) t
  where coalesce(x ->> 'label', '') <> '' and coalesce(x ->> 'value', '') <> '';
  insert into public.case_studies (creator_id, collab_id, title, summary, goal, made, results, highlights)
  values (c.creator_id, c.id, left(btrim(coalesce(p ->> 'title', '')), 120), left(btrim(coalesce(p ->> 'summary', '')), 300),
    left(btrim(coalesce(p ->> 'goal', '')), 600), left(btrim(coalesce(p ->> 'made', '')), 600), left(btrim(coalesce(p ->> 'results', '')), 600), v_hl)
  on conflict (collab_id) do update set title = excluded.title, summary = excluded.summary, goal = excluded.goal, made = excluded.made,
    results = excluded.results, highlights = excluded.highlights, updated_at = now(),
    status = case when (public.case_studies.title, public.case_studies.summary, public.case_studies.goal, public.case_studies.made, public.case_studies.results, public.case_studies.highlights)
                       is distinct from (excluded.title, excluded.summary, excluded.goal, excluded.made, excluded.results, excluded.highlights)
                  then 'draft' else public.case_studies.status end,
    published_at = case when (public.case_studies.title, public.case_studies.summary, public.case_studies.goal, public.case_studies.made, public.case_studies.results, public.case_studies.highlights)
                       is distinct from (excluded.title, excluded.summary, excluded.goal, excluded.made, excluded.results, excluded.highlights)
                  then null else public.case_studies.published_at end
  returning * into cs;
  if char_length(cs.title) < 3 then raise exception 'Give it a title.'; end if;
  return to_jsonb(cs);
end;
$$;

-- Ask the brand to approve it (by email, and on their request page).
create or replace function public.case_study_ask(p_collab uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs := private.case_collab(p_collab);
  cs public.case_studies;
  v_name text;
begin
  select * into cs from public.case_studies where collab_id = c.id;
  if cs.id is null or char_length(cs.title) < 3 or char_length(cs.summary) < 10 then raise exception 'Write the case study first.'; end if;
  if cs.status = 'published' then raise exception 'It''s already on your page.'; end if;
  if btrim(c.contact_email) = '' then raise exception 'Add the brand''s email on the collab first.'; end if;
  if cs.asked_at > now() - interval '1 day' and cs.status = 'asked' then raise exception 'You asked them today. Give them a day.'; end if;
  update public.case_studies set status = 'asked', asked_at = now(), brand_note = '' where id = cs.id returning * into cs;
  select display_name into v_name from public.creator_settings where id = c.creator_id;
  insert into public.outbox (creator_id, kind, to_email, payload)
  values (c.creator_id, 'case_study_ask', c.contact_email, jsonb_build_object('code', c.code, 'contact', c.contact_name,
    'brand', (select name from public.brands where id = c.brand_id), 'creator', v_name, 'title', cs.title, 'summary', cs.summary));
  insert into public.collab_events (creator_id, collab_id, kind, text, visible_to_brand)
  values (c.creator_id, c.id, 'note', v_name || ' asked you to approve a case study about this collab.', true);
  return to_jsonb(cs);
end;
$$;

create or replace function public.case_study_delete(p_collab uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs := private.case_collab(p_collab);
begin
  delete from public.case_studies where collab_id = c.id;
end;
$$;

-- The brand: the case study about its collab, once she asked.
create or replace function public.brand_case_study(p_code text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select to_jsonb(cs) - 'creator_id'
  from public.case_studies cs join public.collabs c on c.id = cs.collab_id
  where c.code = upper(btrim(p_code)) and cs.status <> 'draft'
    and public.my_brand_id() is not null and c.brand_id = public.my_brand_id();
$$;

-- The brand approves it (it goes on her page, with their line if they add one) or asks for changes.
create or replace function public.brand_case_study_answer(p_code text, p_ok boolean, p_note text default '', p_quote text default '', p_quote_by text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  cs public.case_studies;
begin
  select * into c from public.collabs where code = upper(btrim(p_code));
  if c.id is null or public.my_brand_id() is null or c.brand_id <> public.my_brand_id() then raise exception 'Not found.'; end if;
  select * into cs from public.case_studies where collab_id = c.id and status = 'asked';
  if cs.id is null then raise exception 'There''s nothing waiting for your OK.'; end if;
  if not p_ok and char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Say what should change.'; end if;
  update public.case_studies set
    status = case when p_ok then 'published' else 'declined' end,
    answered_at = now(), published_at = case when p_ok then now() end,
    brand_note = left(btrim(coalesce(p_note, '')), 500),
    quote = case when p_ok then left(btrim(coalesce(p_quote, '')), 300) else quote end,
    quote_by = case when p_ok then left(btrim(coalesce(p_quote_by, '')), 120) else quote_by end
  where id = cs.id returning * into cs;
  insert into public.outbox (creator_id, kind, to_email, payload)
  values (c.creator_id, 'case_study_answer', '', jsonb_build_object('code', c.code, 'brand', (select name from public.brands where id = c.brand_id),
    'ok', p_ok, 'note', cs.brand_note, 'title', cs.title));
  insert into public.collab_events (creator_id, collab_id, kind, text, visible_to_brand)
  values (c.creator_id, c.id, 'note', case when p_ok then 'The brand approved the case study. It''s on the creator''s page.' else 'The brand asked for changes to the case study: ' || cs.brand_note end, true);
  return to_jsonb(cs) - 'creator_id';
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['case_study_get(uuid)', 'case_study_save(uuid, jsonb)', 'case_study_ask(uuid)', 'case_study_delete(uuid)',
    'brand_case_study(text)', 'brand_case_study_answer(text, boolean, text, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Her page shows the published ones (newest first).
create or replace function public.page_extras()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'content_languages', to_jsonb(s.content_languages),
    'instant_booking', s.instant_booking,
    'weeks', case when s.instant_booking then public.availability() else null end,
    'away_until', case when public.is_away() then s.away_until end,
    'demand_factor', public.demand_factor(),
    'bio', nullif(btrim(s.bio), ''),
    'links', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'url', l.url) order by l.position, l.created_at)
                       from public.page_links l where l.creator_id = s.id and l.active), '[]'::jsonb),
    'fan_list', case when s.fan_list_on then jsonb_build_object('pitch', nullif(btrim(s.fan_list_pitch), '')) else null end,
    'cases', coalesce((select jsonb_agg(jsonb_build_object('id', cs.id, 'brand', b.name, 'title', cs.title, 'summary', cs.summary,
        'goal', cs.goal, 'made', cs.made, 'results', cs.results, 'highlights', cs.highlights, 'quote', cs.quote, 'quote_by', cs.quote_by,
        'published_at', cs.published_at,
        'post', (select m.permalink from public.collab_posts cp join public.ig_media m on m.id = cp.media_id where cp.collab_id = cs.collab_id order by m.posted_at limit 1))
      order by cs.published_at desc)
      from public.case_studies cs join public.collabs k on k.id = cs.collab_id join public.brands b on b.id = k.brand_id
      where cs.creator_id = s.id and cs.status = 'published'), '[]'::jsonb)
  )
  from public.creator_settings s
  where s.id = private.page_creator();
$$;
grant execute on function public.page_extras() to anon, authenticated;
