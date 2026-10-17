// Pulls her YouTube videos and Shorts. Called daily by the database cron job (shared secret),
// or by the creator from the studio ("Sync now").
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin, cronAllowed } from '../_shared/admin.ts';
import { runYoutube } from '../_shared/ytsync.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!cronAllowed(req)) {
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: isCreator } = await asUser.rpc('is_creator');
    if (isCreator !== true) return reply({ error: 'Only the creator can do this.' }, 403);
  }
  try {
    return reply(await runYoutube(admin()));
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
