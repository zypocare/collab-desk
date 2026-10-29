// A brand's own Instagram numbers (profile, Insights, Grow). Called daily by the database cron job (shared
// secret) for every brand that connected Instagram, or by anyone on the brand's team from the app ("Sync now").
import { admin, cronAllowed } from '../_shared/admin.ts';
import { connectedBrands, runBrandSync } from '../_shared/brandigsync.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-creator, x-cron-secret' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The brand team the signed-in person is on (their team owner), or null for creators and visitors. */
async function teamOfCaller(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/brand_sync_owner`, {
    method: 'POST',
    headers: { authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', 'content-type': 'application/json' },
    body: '{}',
  }).catch(() => null);
  const id = r?.ok ? await r.json().catch(() => null) : null;
  return typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id) ? id : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();

  // The daily run: each brand in turn; one brand's failure doesn't stop the others.
  if (cronAllowed(req)) {
    const brands: Record<string, unknown> = {};
    for (const owner of await connectedBrands(db)) {
      brands[owner] = await runBrandSync(db, owner).catch((e) => {
        console.error(`[brand-ig-sync] ${owner}`, e);
        return { error: errText(e) };
      });
    }
    return reply({ brands });
  }

  const owner = await teamOfCaller(req);
  if (!owner) return reply({ error: 'Only the brand can do this.' }, 403);
  try {
    return reply(await runBrandSync(db, owner));
  } catch (e) {
    return reply({ error: errText(e) }, 500);
  }
});
