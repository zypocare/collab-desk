-- Brief to Reel script: the AI's ready-to-shoot script for a collab (hooks, scenes, must-says,
-- caption), kept on the collab so she can open it on the shoot day. Its scenes also become the
-- shot list. Only she sees it (collabs are already hers alone).
alter table public.collabs
  add column if not exists script jsonb check (script is null or jsonb_typeof(script) = 'object');
