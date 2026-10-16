// "Send a test notification" from My page: only the creator can call it.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin } from '../_shared/admin.ts';
import { pushToCreator } from '../_shared/push.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: isCreator } = await asUser.rpc('is_creator');
  if (isCreator !== true) return reply({ error: 'Only the creator can do this.' }, 403);
  return reply(await pushToCreator(admin(), { title: 'Notifications are on', body: "You'll get new requests, messages and payments here.", url: '/studio' }));
});
