-- The engagement figure brands see on a creator's page is now her Reels engagement (her last 12 Reels), the
-- same one Insights leads with, in full (4.34%, not 4%). The nightly sync writes it from now on; this brings
-- every creator who already has it up to date today. Creators without Reels figures keep what they have.
update creator_settings s
set engagement = trim_scale(round((a.insights -> 'formats' -> 'reels' ->> 'er')::numeric, 2))::text || '%'
from ig_account a
where a.id = s.id
  and jsonb_typeof(a.insights -> 'formats' -> 'reels' -> 'er') = 'number'
  and (a.insights -> 'formats' -> 'reels' ->> 'er')::numeric > 0;
