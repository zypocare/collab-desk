// "Send a test notification" from My page: only the creator can call it.
// The app's own server jobs (with the cron secret) can also send her one message of their own.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin, cronAllowed } from '../_shared/admin.ts';
import { pushToCreator, type Push } from '../_shared/push.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (cronAllowed(req)) {
    const m = (await req.json().catch(() => ({}))) as Partial<Push>;
    if (!m.title || !m.body) return reply({ error: 'title and body are needed' }, 400);
    return reply(await pushToCreator(admin(), { title: String(m.title).slice(0, 80), body: String(m.body).slice(0, 240), url: m.url || '/studio', tag: m.tag, nameOnly: true }));
  }
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: isCreator } = await asUser.rpc('is_creator');
  if (isCreator !== true) return reply({ error: 'Only the creator can do this.' }, 403);
  return reply(await pushToCreator(admin(), { title: 'Notifications are on', body: "You'll get new requests, messages and payments here.", url: '/studio' }));
});
