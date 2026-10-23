-- Rights and partnership ads: how a brand may use a creator's content, where, until when, and the
-- partnership-ad code she gives them; plus the exclusivity she agreed to. Her Rights page lists them all,
-- counts down to each end date and flags deals that clash with an exclusivity.

alter table public.collabs add column if not exists ad_how text not null default '';
alter table public.collabs drop constraint if exists collabs_ad_how_check;
-- partnership: Meta partnership ads with her ad code · access: ads run from her handle · repost: their page only
alter table public.collabs add constraint collabs_ad_how_check check (ad_how in ('', 'partnership', 'access', 'repost'));
alter table public.collabs add column if not exists ad_code text not null default '';
alter table public.collabs add column if not exists ad_code_at timestamptz;
alter table public.collabs add column if not exists territory text not null default 'India';
-- What she can't promote during the exclusivity (a category or named competitors); the days come from the quote.
alter table public.collabs add column if not exists excl_scope text not null default '';
alter table public.collabs drop constraint if exists collabs_rights_text_check;
alter table public.collabs add constraint collabs_rights_text_check
  check (char_length(ad_code) <= 200 and char_length(territory) <= 80 and char_length(excl_scope) <= 120) not valid;

-- The brand's view of the rights on one of its collabs (any of its team's logins).
create or replace function public.brand_rights(p_code text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'usage', c.usage, 'live_date', c.live_date, 'ends', c.usage_ends, 'ad_how', c.ad_how,
    'ad_code', c.ad_code, 'ad_code_at', c.ad_code_at, 'territory', c.territory, 'excl_scope', c.excl_scope,
    'excl_days', (select q.exclusivity_days from public.quotes q where q.collab_id = c.id and q.status = 'accepted' order by q.version desc limit 1))
  from public.collabs c
  where upper(c.code) = upper(p_code) and public.brand_owner() is not null
    and exists (select 1 from public.brand_members bm where bm.brand_id = c.brand_id and bm.profile_id in (select private.team_logins(public.brand_owner())))
  limit 1;
$$;
revoke execute on function public.brand_rights(text) from public, anon;
grant execute on function public.brand_rights(text) to authenticated;

-- She shares her code: the brand hears about it in the collab's history.
create or replace function private.ad_code_shared()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.ad_code <> '' and new.ad_code is distinct from old.ad_code then
    new.ad_code_at := now();
    insert into public.collab_events (creator_id, collab_id, kind, text, visible_to_brand)
    values (new.creator_id, new.id, 'note', 'Partnership ad code shared: use it in Meta Ads Manager to run the ads from the creator''s post', true);
  end if;
  return new;
end;
$$;
drop trigger if exists collabs_ad_code_shared on public.collabs;
create trigger collabs_ad_code_shared before update of ad_code on public.collabs for each row execute function private.ad_code_shared();
