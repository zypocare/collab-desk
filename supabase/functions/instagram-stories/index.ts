// Saves Story numbers before Instagram drops them (24 hours). Called every 2 hours by the database
// cron job (shared secret) for every creator who connected Instagram, or by a creator from the studio.
import { admin, cronAllowed } from '../_shared/admin.ts';
import { creatorOfCaller } from '../_shared/creators.ts';
import { connectedCreators, runStorySync } from '../_shared/igsync.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-creator, x-cron-secret' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();

  // The timed run: each creator in turn; one creator's failure doesn't stop the others.
  if (cronAllowed(req)) {
    try {
      const creators: Record<number, unknown> = {};
      for (const creator of await connectedCreators(db)) {
        creators[creator] = await runStorySync(db, creator).catch((e) => {
          console.error(`[instagram-stories] creator ${creator}`, e);
          return { error: errText(e) };
        });
      }
      return reply({ creators });
    } catch (e) {
      return reply({ error: errText(e) }, 500);
    }
  }

  const creator = await creatorOfCaller(req);
  if (!creator) return reply({ error: 'Only the creator can do this.' }, 403);
  try {
    return reply(await runStorySync(db, creator));
  } catch (e) {
    return reply({ error: errText(e) }, 500);
  }
});
