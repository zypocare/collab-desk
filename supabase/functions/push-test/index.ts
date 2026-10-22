// "Send a test notification" from My page: only the creator (or her team) can call it, and it goes
// to the devices of the creator they are working for.
// The app's own server jobs (with the cron secret) can also send a creator one message of their own:
// they say which creator in the body ({ creator, title, body, ... }).
import { admin, cronAllowed } from '../_shared/admin.ts';
import { pushToCreator, type Push } from '../_shared/push.ts';
import { activeCreators, creatorOfCaller } from '../_shared/creators.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-creator' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (cronAllowed(req)) {
    const m = (await req.json().catch(() => ({}))) as Partial<Push> & { creator?: number };
    if (!m.title || !m.body) return reply({ error: 'title and body are needed' }, 400);
    const db = admin();
    const creator = await jobCreator(db, m.creator);
    if (!creator) return reply({ error: 'Say which creator (creator) to send it to.' }, 400);
    return reply(await pushToCreator(db, creator, { title: String(m.title).slice(0, 80), body: String(m.body).slice(0, 240), url: m.url || '/studio', tag: m.tag, nameOnly: true }));
  }
  const creator = await creatorOfCaller(req);
  if (!creator) return reply({ error: 'Only the creator can do this.' }, 403);
  return reply(await pushToCreator(admin(), creator, { title: 'Notifications are on', body: "You'll get new requests, messages and payments here.", url: '/studio' }));
});

/** The creator a server job named; with no name and only one active creator, that one. */
async function jobCreator(db: ReturnType<typeof admin>, named: unknown): Promise<number | null> {
  const id = Number(named);
  if (Number.isInteger(id) && id > 0) return id;
  const all = await activeCreators(db).catch(() => []);
  return all.length === 1 ? all[0].id : null;
}
