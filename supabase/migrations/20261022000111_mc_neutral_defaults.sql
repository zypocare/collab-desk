-- Miracle for many creators, part 12: a new creator starts with nothing of Niveditha's. The app was
-- written for one creator and some of her details stood in as defaults; those become neutral here.
-- Rows that already exist keep their values (only the defaults for new rows change).

-- Her niche used to be the starting niche of every new row.
alter table public.creator_settings alter column niche set default '';

-- The evening slot of the fun nudges: what she does to switch off (yoga, the gym, a walk, dance
-- class). Empty means a plain stretch break. Niveditha's stays yoga, as before.
alter table public.creator_settings
  add column if not exists fun_hobby text not null default '' check (char_length(fun_hobby) <= 40);
update public.creator_settings set fun_hobby = 'yoga' where id = 1 and fun_hobby = '';
