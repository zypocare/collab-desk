// Pitch autopilot, once a day (8:30 AM India) for each creator from the database cron job, or when she taps "Find
// brands now". Up to 10 new brands a day: found by Gemini with Google Search, checked on their own
// website for a public business email (brands without one are left out), a pitch written for each,
// and queued to go out between 10 AM and 6 PM, one at a time (private.pitch_send_due sends them).
// "approve": each waits for her tap; "auto": they go out on their own. A brand is never pitched twice.
//   ?dry=1        find and write, save nothing, send nothing
//   ?site=<url>   where the AI lives (local testing)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin, cronAllowed, todayIST } from '../_shared/admin.ts';
import { activeCreators, creatorOfCaller, settingsOf, type Settings } from '../_shared/creators.ts';
import { pushToCreator } from '../_shared/push.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-creator' };
type Brand = { name: string; website: string; instagram: string; category: string; why: string };
type Found = Brand & { email: string; domain: string };

const norm = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
const domainOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';
  const siteParam = url.searchParams.get('site') ?? '';
  const db = admin();

  // The creator herself ("Find brands now"): only for the creator she is signed in for.
  if (!cronAllowed(req)) {
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: ok } = await asUser.rpc('is_creator');
    const id = ok === true ? await creatorOfCaller(req) : null;
    if (!id) return reply({ error: 'Only the creator can do this.' }, 403);
    const s = await settingsOf(db, id);
    if (!s) return reply({ error: 'No settings.' }, 500);
    const r = await findFor(db, s, { manual: true, dry, siteParam });
    return reply(r.body, r.status);
  }

  // The cron job for one creator (sent by the run below; the cron secret makes the id trustworthy).
  const body = await req.json().catch(() => ({}));
  const one = Number(body?.creator);
  if (Number.isInteger(one) && one > 0) {
    const s = await settingsOf(db, one);
    if (!s) return reply({ error: 'No settings.' }, 404);
    const r = await findFor(db, s, { manual: false, dry, siteParam });
    return reply(r.body, r.status);
  }

  // The daily cron job: one run per active creator with the autopilot on, side by side, each as its own
  // call so every creator gets the full time limit. One creator failing doesn't stop the others.
  const creators = (await activeCreators(db)).filter((c) => c.pitch_auto || dry);
  const self = `${Deno.env.get('SUPABASE_URL')}/functions/v1/pitch-finder${url.search}`;
  const results = await Promise.all(creators.map(async (c) => {
    try {
      const r = await fetch(self, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cron-secret': req.headers.get('x-cron-secret') ?? '' },
        body: JSON.stringify({ creator: c.id }),
      });
      const out = await r.json().catch(() => ({ error: `status ${r.status}` }));
      if (!r.ok) console.error(`pitch-finder: creator ${c.id} failed`, out);
      return { creator: c.id, ...out };
    } catch (e) {
      console.error(`pitch-finder: creator ${c.id} failed`, e);
      return { creator: c.id, error: e instanceof Error ? e.message : String(e) };
    }
  }));
  return reply({ creators: results });
});

/** One creator's run: brands found, pitches written and queued, her alert sent. */
async function findFor(db: ReturnType<typeof admin>, s: Settings, opt: { manual: boolean; dry: boolean; siteParam: string }): Promise<{ status: number; body: unknown }> {
  const { manual, dry } = opt;
  const result = (body: unknown, status = 200) => ({ status, body });
  if (!s.pitch_auto && !manual && !dry) return result({ skipped: 'autopilot is off' });

  const today = todayIST();
  const { data: all } = await db.from('pitches').select('brand_name, instagram, email, website, status, approved, found_on').eq('creator_id', s.id);
  const pitches = all ?? [];
  // Never more than her daily number waiting: what's still waiting and what was found today count.
  const waiting = pitches.filter((p) => p.status === 'ready' && !p.approved && s.pitch_mode === 'approve').length;
  const foundToday = pitches.filter((p) => p.found_on === today).length;
  const want = Math.max(0, (s.pitch_daily ?? 10) - Math.max(waiting, foundToday));
  if (!want) return result({ skipped: waiting ? `${waiting} still waiting for you` : 'today is done' });

  // Everything already known, so nothing comes back twice.
  const { data: brands } = await db.from('brands').select('name, instagram, website').eq('creator_id', s.id);
  const seenName = new Set([...pitches.map((p) => norm(p.brand_name)), ...(brands ?? []).map((b) => norm(b.name))].filter(Boolean));
  const seenIg = new Set([...pitches.map((p) => norm(p.instagram)), ...(brands ?? []).map((b) => norm(b.instagram ?? ''))].filter(Boolean));
  const seenDomain = new Set(
    [...pitches.map((p) => domainOf(p.website || '') || (p.email ?? '').split('@')[1] || ''), ...(brands ?? []).map((b) => domainOf(b.website ?? ''))]
      .filter((d) => d && !/gmail|yahoo|outlook|hotmail/.test(d))
  );

  const { data: ig } = await db.from('ig_account').select('followers, avg_views, username').eq('id', s.id).maybeSingle();
  const { data: done } = await db.from('collabs').select('stage, brand:brands(name, category)').eq('creator_id', s.id).in('stage', ['live', 'wrapped']).limit(60);
  const pastBrands = [...new Set((done ?? []).map((c) => (c.brand as unknown as { name: string } | null)?.name).filter(Boolean))] as string[];
  const pastCats = [...new Set((done ?? []).map((c) => (c.brand as unknown as { category: string } | null)?.category).filter(Boolean))] as string[];
  const site = String(opt.siteParam || s.site_url || 'https://collab-desk.zypocare.workers.dev').replace(/\/$/, '');
  const page = String(s.site_url || site).replace(/\/$/, '');
  const creator = {
    name: s.display_name, handle: s.handle, niche: s.niche, city: s.city, languages: s.content_languages,
    followers: ig?.followers ?? s.followers, avg_views: ig?.avg_views ?? null, engagement: s.engagement,
    worked_with: pastBrands.slice(0, 12), categories_that_paid: pastCats.slice(0, 8),
  };

  // 1 and 2. Brands (the AI), then a public business email on each brand's own website. When too
  // few pass, ask again for fresh ones (up to three rounds, inside the time limit).
  const started = Date.now();
  const exclude = [...new Set([...pitches.map((p) => p.brand_name), ...(brands ?? []).map((b) => b.name)])];
  const found: Found[] = [];
  let scoutedN = 0, freshN = 0, lastErr: unknown = null;
  for (let round = 0; round < 3 && found.length < want && Date.now() - started < 70_000; round++) {
    const scouted = await ai<{ brands?: Brand[]; error?: string }>(db, s.id, site, 'scout', { count: Math.min(20, want - found.length + 8), creator, exclude: exclude.slice(-200) });
    if (!scouted?.brands?.length) {
      lastErr = scouted;
      break;
    }
    scoutedN += scouted.brands.length;
    const fresh = scouted.brands.filter((b) => {
      const d = domainOf(b.website);
      const ok = d && !seenName.has(norm(b.name)) && !(b.instagram && seenIg.has(norm(b.instagram))) && !seenDomain.has(d);
      // Whatever came up is not offered again in the next round.
      exclude.push(b.name);
      seenName.add(norm(b.name));
      if (d) seenDomain.add(d);
      return ok;
    });
    freshN += fresh.length;
    for (let i = 0; i < fresh.length && found.length < want; i += 6) {
      const batch = await Promise.all(fresh.slice(i, i + 6).map(async (b) => ({ ...b, domain: domainOf(b.website), email: await siteEmail(b.website) })));
      for (const b of batch) if (b.email && found.length < want && !found.some((f) => f.domain === b.domain)) found.push(b);
    }
  }
  if (!found.length && !scoutedN) return result({ error: 'No brands came back from the search.', detail: lastErr }, 502);

  // 3. A pitch for each (Gemini first), queued through the day.
  const slots = sendTimes(found.length);
  // Written five at a time, so a run from the app finishes well inside the time limit.
  const written = await Promise.all(found.map((b, k) => new Promise<unknown>((r) => setTimeout(r, Math.floor(k / 5) * 1500)).then(() => write(b))));
  async function write(b: Found) {
    return await ai<{ subject: string; body: string }>(db, s.id, site, 'pitch', {
      brand: b.name, brand_instagram: b.instagram, category: b.category, contact: '', why_they_fit: b.why,
      creator: s.display_name, handle: s.handle, niche: s.niche, city: s.city, followers: creator.followers,
      engagement: s.engagement, page_link: page, past_brands: pastBrands.slice(0, 5),
    });
  }
  const rows = [];
  for (const [k, b] of found.entries()) {
    const w = written[k] as { subject: string; body: string } | null;
    const subject = w?.subject?.trim() || `Content idea for ${b.name}`;
    const body =
      (w?.body?.trim() ||
        `Hi there,\n\nI'm ${s.display_name} (@${s.handle}), a ${s.niche || 'content'} creator from ${s.city || 'India'}. I love what ${b.name} is doing and would really enjoy creating content for you.\n\nMy rates, past work and live Instagram numbers are all here: ${page}\n\nWould you be open to a quick chat?\n\nThanks,\n${s.display_name}`) +
      `\n\nNot the right fit right now? Just reply "no" and I won't write again.`;
    rows.push({
      creator_id: s.id, brand_name: b.name, instagram: b.instagram, category: b.category, email: b.email, website: b.website, subject, body,
      status: 'ready', source: 'autopilot', fit_note: b.why, found_on: today, approved: s.pitch_mode === 'auto', send_after: slots[k], auto_follow: true,
    });
  }
  if (dry) return result({ dry: true, want, scouted: scoutedN, fresh: freshN, found: rows.length, seconds: Math.round((Date.now() - started) / 1000), rows });
  if (rows.length) {
    const { error } = await db.from('pitches').insert(rows);
    if (error) return result({ error: error.message }, 500);
    await pushToCreator(db, s.id, {
      title: s.pitch_mode === 'auto' ? `${rows.length} new brand${rows.length === 1 ? '' : 's'} will be pitched today` : `${rows.length} new brand${rows.length === 1 ? '' : 's'} to pitch`,
      body: s.pitch_mode === 'auto' ? `${rows.slice(0, 3).map((r) => r.brand_name).join(', ')}${rows.length > 3 ? ' and more' : ''}. They go out from 10 AM.` : `${rows.slice(0, 3).map((r) => r.brand_name).join(', ')}${rows.length > 3 ? ' and more' : ''}. Approve the ones you like.`,
      url: '/studio/pitches',
      tag: 'pitch-autopilot',
      kind: 'pitches_found',
    });
  }
  return result({ added: rows.length, scouted: scoutedN, fresh: freshN, ...(rows.length ? {} : { skipped: 'none of the brands found today show a public email on their website' }), brands: rows.map((r) => `${r.brand_name} <${r.email}>`) });
}

/** The AI job through a single-use pass (no keys leave the server), charged to this creator. */
async function ai<T>(db: ReturnType<typeof admin>, creator: number, site: string, kind: string, payload: Record<string, unknown>): Promise<T | null> {
  const ticket = crypto.randomUUID() + crypto.randomUUID();
  const { error } = await db.from('ai_tickets').insert({ creator_id: creator, token: ticket, kind });
  if (error) return null;
  const r = await fetch(`${site}/api/ai/${kind}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ai-ticket': ticket, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90_000),
  }).catch(() => null);
  return ((await r?.json().catch(() => null)) as T | null) ?? null;
}

/** Today's send times: from 10 AM (or now, if later) every 45 minutes until 6 PM, then tomorrow. */
function sendTimes(n: number) {
  const out: string[] = [];
  const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3);
  let t = new Date(Math.max(Date.now() + 10 * 60e3, Date.parse(`${todayIST()}T10:00:00+05:30`)));
  for (let i = 0; i < n; i++) {
    if (ist(t).getUTCHours() >= 18) t = new Date(Date.parse(`${todayIST(1)}T10:00:00+05:30`));
    out.push(t.toISOString());
    t = new Date(t.getTime() + 45 * 60e3);
  }
  return out;
}

// ---------- a public business email from the brand's own website ----------
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BAD = /(\.(png|jpe?g|gif|webp|svg|css|js)$)|example\.|sentry|wixpress|domain\.com|email\.com|yourname|@2x|noreply|no-reply|donotreply|privacy|legal|grievance|careers|jobs|hr@|recruit|admission|returns?@|refund|orders?@|invest|ir@|compliance|accounts@|billing|resv\./i;
const GOOD = ['collab', 'influenc', 'creator', 'partner', 'marketing', 'pr@', 'brand', 'social', 'media', 'hello', 'contact', 'info', 'care', 'support'];

async function siteEmail(website: string): Promise<string> {
  const base = (() => {
    try {
      const u = new URL(website);
      return `${u.protocol}//${u.host}`;
    } catch {
      return '';
    }
  })();
  if (!base) return '';
  const domain = domainOf(base);
  const home = await get(base);
  if (!home) return '';
  const links = [...home.matchAll(/href=["']([^"'#]+)["']/gi)]
    .map((m) => m[1])
    .filter((h) => /contact|collab|partner|influenc|creator|about/i.test(h))
    .map((h) => (h.startsWith('http') ? h : `${base}${h.startsWith('/') ? '' : '/'}${h}`))
    .filter((h) => domainOf(h) === domain);
  const extra = [...new Set([...links, `${base}/pages/contact`, `${base}/contact`, `${base}/contact-us`])].slice(0, 4);
  const pages = [home, ...(await Promise.all(extra.map(get)))].filter(Boolean) as string[];
  const emails = new Set<string>();
  for (const html of pages) {
    for (const m of html.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) emails.add(cfDecode(m[1]));
    for (const m of html.replace(/&#64;|\[at\]|\(at\)/gi, '@').matchAll(EMAIL)) emails.add(m[0]);
  }
  const ok = [...emails].map((e) => e.toLowerCase().replace(/^mailto:/, '')).filter((e) => !BAD.test(e));
  // Their own domain first, then the most collab-like address.
  const score = (e: string) => (e.endsWith('@' + domain) || e.endsWith('.' + domain) ? 100 : /gmail|yahoo|outlook/.test(e) ? 10 : 0) + (20 - Math.min(20, GOOD.findIndex((g) => e.includes(g)) >>> 0));
  return ok.sort((a, b) => score(b) - score(a))[0] ?? '';
}
async function get(u: string): Promise<string> {
  try {
    const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Miracle/1.0; +creator pitch)', accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(7000) });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('html')) return '';
    return (await r.text()).slice(0, 800_000);
  } catch {
    return '';
  }
}
function cfDecode(hex: string) {
  const k = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k);
  return out;
}
