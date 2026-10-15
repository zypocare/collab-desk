// Finishes "Connect Instagram": swaps the one-time code for a 60-day token, stores it on the server,
// then runs the first sync. Also handles "Disconnect". Only the signed-in creator may call it.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin } from '../_shared/admin.ts';
import { ig } from '../_shared/instagram.ts';
import { runSync } from '../_shared/igsync.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: isCreator } = await asUser.rpc('is_creator');
  if (isCreator !== true) return reply({ error: 'Only the creator can connect Instagram.' }, 403);

  const { action, code, redirect_uri } = await req.json().catch(() => ({}));
  const db = admin();

  if (action === 'disconnect') {
    await db.from('ig_token').delete().eq('id', 1);
    await db.from('ig_account').update({ connected: false, last_error: '' }).eq('id', 1);
    return reply({ ok: true });
  }

  if (!ig.configured) return reply({ error: 'Instagram is not set up on the server yet (INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET). See docs/SETUP.md.' }, 400);
  if (!code || !redirect_uri) return reply({ error: 'Missing sign-in code.' }, 400);

  try {
    const t = await ig.exchangeCode(String(code), String(redirect_uri));
    await db.from('ig_token').upsert({ id: 1, access_token: t.token, obtained_at: new Date().toISOString(), expires_at: new Date(Date.now() + t.expiresIn * 1000).toISOString() });
    const summary = await runSync(db);
    return reply({ ok: true, summary });
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
