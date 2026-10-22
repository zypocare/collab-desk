// Pulls the latest Instagram numbers. Called daily by the database cron job (shared secret) for every
// creator who connected Instagram, or by a creator from the studio ("Sync now" / "Make a fresh report").
import { admin, cronAllowed } from '../_shared/admin.ts';
import { creatorOfCaller } from '../_shared/creators.ts';
import { connectedCreators, runSync } from '../_shared/igsync.ts';
import { ensureMessages } from '../_shared/instagram.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-creator, x-cron-secret' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function syncOne(db: ReturnType<typeof admin>, creator: number, reportFor?: string) {
  // Keep her DMs coming to the app (repairs it if Instagram ever drops the subscription).
  const messages = await ensureMessages(db, creator).catch((e) => ({ error: errText(e) }));
  return { ...(await runSync(db, creator, { reportFor })), messages };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();

  // The daily run: each creator in turn; one creator's failure doesn't stop the others.
  if (cronAllowed(req)) {
    try {
      const creators: Record<number, unknown> = {};
      for (const creator of await connectedCreators(db)) {
        creators[creator] = await syncOne(db, creator).catch((e) => {
          console.error(`[instagram-sync] creator ${creator}`, e);
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
  const body = await req.json().catch(() => ({}));
  try {
    return reply(await syncOne(db, creator, typeof body.report_for === 'string' ? body.report_for : undefined));
  } catch (e) {
    return reply({ error: errText(e) }, 500);
  }
});
