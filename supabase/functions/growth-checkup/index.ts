import { POSTING_MEDIA_LIMIT } from '../_shared/postingTime.ts';
// The growth check-up, made on the server. Every morning it makes a new one for each creator whose
// last check-up is two weeks old (or who never had one) and has enough reels, then tells her by phone
// alert and email. She can also ask for one now from Grow ("Run it again").
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin, cronAllowed } from '../_shared/admin.ts';
import { activeCreators, creatorOfCaller, settingsOf, type Settings } from '../_shared/creators.ts';
import { analyse, isReel, type Ai, type Media } from '../_shared/growth.ts';
import { reportProblem } from '../_shared/problems.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-creator',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const DAY = 864e5;
type Db = ReturnType<typeof admin>;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
  const db = admin();

  // The creator herself, from Grow.
  if (!cronAllowed(req)) {
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: ok } = await asUser.rpc('is_creator');
    const id = ok === true ? await creatorOfCaller(req) : null;
    if (!id) return reply({ error: 'Only the creator can do this.' }, 403);
    // Once an hour is plenty.
    const { data: last } = await db.from('growth_checkups').select('created_at').eq('creator_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (last && Date.now() - Date.parse(last.created_at) < 3600e3) return reply({ error: 'Your check-up is fresh. Run it again in an hour.' }, 429);
    const s = await settingsOf(db, id);
    if (!s) return reply({ error: 'No settings.' }, 500);
    try {
      return reply(await checkupFor(db, s, false));
    } catch (e) {
      return reply({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  // The daily run: everyone due, one after another (the AI server takes one at a time comfortably).
  const out: Record<string, unknown>[] = [];
  for (const s of await activeCreators(db)) {
    try {
      const { data: last } = await db.from('growth_checkups').select('created_at').eq('creator_id', s.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (last && Date.now() - Date.parse(last.created_at) < 14 * DAY - 3600e3) continue;
      out.push({ creator: s.id, ...(await checkupFor(db, s, true)) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.push({ creator: s.id, error: msg });
      await reportProblem(db, 'jobs', `growth-checkup: ${msg}`, String(s.id));
    }
  }
  return reply({ ran: out });
});

async function checkupFor(db: Db, s: Settings, auto: boolean) {
  const [acct, media, hist, prev] = await Promise.all([
    db.from('ig_account').select('connected, followers, demographics').eq('id', s.id).maybeSingle(),
    db.from('ig_media').select('id, caption, media_type, product_type, permalink, posted_at, views, reach, likes, saves, shares, avg_watch_ms').eq('creator_id', s.id).order('posted_at', { ascending: false }).limit(POSTING_MEDIA_LIMIT),
    db.from('ig_followers_history').select('day, followers').eq('creator_id', s.id).order('day', { ascending: true }).limit(120),
    db.from('growth_checkups').select('done').eq('creator_id', s.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const a = acct.data as { connected?: boolean; followers?: number | null; demographics?: Record<string, Record<string, number>> } | null;
  if (!a?.connected) return { skipped: 'Instagram not connected' };
  const list = (media.data ?? []) as Media[];
  const reels = list.filter(isReel).filter((m) => (m.views ?? 0) > 0);
  if (reels.length < 6) return { skipped: 'fewer than 6 reels with views' };

  const ai = await readCaptions(db, s, reels);
  if (!ai) throw new Error("The AI couldn't read the captions this time.");
  const data = analyse({
    media: list,
    hist: (hist.data ?? []) as { day: string; followers: number }[],
    ai,
    city: String(s.city ?? ''),
    languages: (s.content_languages as string[] | null) ?? [],
    followers: a.followers ?? null,
    demographics: a.demographics ?? {},
  });
  // Actions she ticked off carry over; some count as done from what she does.
  const done: Record<string, boolean> = { ...((prev.data as { done?: Record<string, boolean> } | null)?.done ?? {}) };
  if (s.grow_mode === 'auto' || data.mix.perWeek >= 3) done.cadence = true;
  const { data: row, error } = await db.from('growth_checkups').insert({ creator_id: s.id, data, done, auto }).select('id').single();
  if (error) throw error;
  // Made by itself: tell her (a phone alert and an email). When she asked for it, she's looking already.
  if (auto) {
    await db.from('outbox').insert({
      creator_id: s.id,
      kind: 'checkup_ready',
      to_email: '',
      payload: { verdict: data.verdict, count: data.findings.length, biggest: data.findings[0]?.title ?? '', first: !prev.data },
    });
  }
  return { id: (row as { id: string }).id, findings: data.findings.length };
}

/** The AI groups her captions into topics and says who her content is for (single-use pass). */
async function readCaptions(db: Db, s: Settings, reels: Media[]): Promise<Ai | null> {
  const site = String(s.site_url || 'https://app.miracleapp.live').replace(/\/$/, '');
  const ticket = crypto.randomUUID() + crypto.randomUUID();
  const { error } = await db.from('ai_tickets').insert({ creator_id: s.id, token: ticket, kind: 'checkup' });
  if (error) return null;
  const r = await fetch(`${site}/api/ai/checkup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ai-ticket': ticket, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
    body: JSON.stringify({
      niche: s.niche ?? '',
      city: s.city ?? '',
      languages: s.content_languages ?? [],
      reels: reels.slice(0, 40).map((m) => ({ id: m.id, caption: String(m.caption ?? '').replace(/\s+/g, ' ').slice(0, 120), views: m.views ?? 0 })),
    }),
  }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as (Ai & { error?: string }) | null;
  if (!j || j.error || !Array.isArray(j.topics)) return null;
  return j;
}
