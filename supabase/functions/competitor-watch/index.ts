// Competitor watch, the brands' sixth autopilot: Mondays 9:00 India for every brand login that has it on (the
// database cron job, with the shared secret), or when a brand taps "Check now". For each, the AI searches
// Google for creators its competitors worked with lately (a single-use pass, no creator's budget), then the
// database adds what creators on Miracle posted, writes the weekly brief and the invites (watch_run_service).
//   ?site=<url>   where the AI lives (local testing)
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { admin, cronAllowed } from '../_shared/admin.ts';
import { pushToBrandUser } from '../_shared/push.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' };
type Due = { owner: string; brands: { name: string; handle: string }[]; category?: string | null };

async function search(db: SupabaseClient, d: Due, site: string) {
  const ticket = crypto.randomUUID() + crypto.randomUUID();
  const { error } = await db.from('ai_tickets').insert({ token: ticket, kind: 'compwatch', owner: d.owner, creator_id: null });
  if (error) return [];
  const r = await fetch(`${site.replace(/\/$/, '')}/api/ai/compwatch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ai-ticket': ticket, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
    body: JSON.stringify({ brands: d.brands, category: d.category ?? '' }),
    signal: AbortSignal.timeout(140_000),
  }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { competitors?: unknown[] } | null;
  return Array.isArray(j?.competitors) ? j!.competitors : [];
}

async function runOne(db: SupabaseClient, d: Due, site: string) {
  const web = await search(db, d, site).catch(() => []);
  const { data, error } = await db.rpc('watch_run_service', { p_owner: d.owner, p_web: web });
  if (error) throw new Error(error.message);
  const res = data as { creators?: number; new?: number; invites?: number; skipped?: string };
  // A phone alert when there's something new to look at.
  if ((res.new ?? 0) > 0) {
    await pushToBrandUser(db, d.owner, {
      title: `Competitor watch: ${res.new} new creator${res.new === 1 ? '' : 's'}`,
      body: res.invites ? `${res.invites} invite${res.invites === 1 ? '' : 's'} ready for your campaign.` : 'See who your competitors worked with this week.',
      url: '/brand/autopilots',
      tag: 'competitor-watch',
    }).catch(() => {});
  }
  return { ...res, web: web.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
  const db = admin();
  const site = new URL(req.url).searchParams.get('site') || Deno.env.get('APP_URL') || 'https://app.miracleapp.live';

  // A brand's "Check now": only its own watch, at most once an hour.
  if (!cronAllowed(req)) {
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: u } = await asUser.auth.getUser();
    const owner = u.user?.id;
    if (!owner) return reply({ error: 'Sign in with your brand email first.' }, 403);
    const { data: st } = await db.from('brand_autopilots').select('watch, watch_brands, watch_checked_at').eq('owner', owner).maybeSingle();
    if (!st || st.watch === 'off' || !(st.watch_brands as unknown[])?.length) return reply({ error: 'Switch on Competitor watch and add a competitor first.' }, 400);
    if (st.watch_checked_at && Date.now() - Date.parse(st.watch_checked_at) < 60 * 60e3) return reply({ error: 'Checked less than an hour ago. Try again later.' }, 429);
    const { data: p } = await db.from('brand_profiles').select('category').eq('owner', owner).maybeSingle();
    try {
      return reply(await runOne(db, { owner, brands: st.watch_brands as Due['brands'], category: p?.category }, site));
    } catch (e) {
      return reply({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  // Monday's run: every brand that's due, one after another (one failing doesn't stop the others).
  const { data: due, error } = await db.rpc('watch_due');
  if (error) return reply({ error: error.message }, 500);
  const out: Record<string, unknown> = {};
  for (const d of (due as Due[]) ?? []) {
    out[d.owner] = await runOne(db, d, site).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  }
  return reply({ brands: out });
});
