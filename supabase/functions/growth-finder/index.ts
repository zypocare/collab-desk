// Growth Autopilot (migration 163), once a day (9 AM India) from the database cron job, or "Find now" in the admin
// panel. Finds Indian creators who show a business email on a public page (Gemini with Google Search), opens
// that page to see the email there itself (anything it can't confirm is dropped), writes a short personal
// invitation for each, and queues them: waiting for approval in the panel, or approved straight away in "auto"
// mode. private.growth_send_due sends them in working hours, a few minutes apart.
//   ?dry=1   find and write, save nothing
//   ?site=   where the AI lives (local testing)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin, cronAllowed, todayIST } from '../_shared/admin.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
type Found = { name: string; handle: string; email: string; email_source: string; website: string; niche: string; city: string; followers: number | null; why: string };
type Settings = { on: boolean; mode: 'approve' | 'auto'; daily: number; niches: string[]; cities: string[]; min_followers: number; max_followers: number; offer: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';
  const db = admin();

  // "Find now" in the admin panel: only a Miracle admin.
  const manual = !cronAllowed(req);
  if (manual) {
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: ok } = await asUser.rpc('is_app_admin');
    if (ok !== true) return reply({ error: 'Only Miracle admins can do this.' }, 403);
  }

  const { data: g } = await db.from('growth_settings').select('*').eq('id', 1).single();
  const s = g as Settings | null;
  if (!s) return reply({ error: 'No settings.' }, 500);
  if (!s.on && !manual && !dry) return reply({ skipped: 'the Growth Autopilot is off' });

  const today = todayIST();
  const { data: leads } = await db.from('growth_leads').select('email, handle, status, found_on');
  const all = leads ?? [];
  // Never more than a day's worth waiting or found today.
  const waiting = all.filter((l) => l.status === 'ready').length;
  const foundToday = all.filter((l) => l.found_on === today).length;
  const want = Math.max(0, s.daily - Math.max(waiting, foundToday));
  if (!want) return reply({ skipped: waiting ? `${waiting} still waiting for approval` : 'today is done' });

  // Everyone already known: found before, said no, or already on Miracle (or its waitlist).
  const [{ data: sup }, { data: creators }, { data: wl }] = await Promise.all([
    db.from('growth_suppress').select('email'),
    db.from('creator_settings').select('creator_email, handle'),
    db.from('waitlist').select('email, instagram'),
  ]);
  const seenEmail = new Set([...all.map((l) => l.email), ...(sup ?? []).map((x) => x.email), ...(creators ?? []).map((c) => c.creator_email ?? ''), ...(wl ?? []).map((w) => w.email ?? '')].map((e) => String(e).toLowerCase()).filter(Boolean));
  const seenHandle = new Set([...all.map((l) => l.handle), ...(creators ?? []).map((c) => c.handle ?? ''), ...(wl ?? []).map((w) => w.instagram ?? '')].map((h) => String(h).replace(/^@+/, '').toLowerCase()).filter(Boolean));

  const site = String(url.searchParams.get('site') || Deno.env.get('APP_URL') || 'https://app.miracleapp.live').replace(/\/$/, '');
  const started = Date.now();
  const found: Found[] = [];
  const exclude = [...seenHandle].slice(-300);
  let asked = 0, confirmed = 0, lastErr: unknown = null;
  for (let round = 0; round < 3 && found.length < want && Date.now() - started < 80_000; round++) {
    const r = await ai<{ creators?: Found[]; error?: string }>(db, site, 'growthscout', {
      count: Math.min(20, want - found.length + 8), niches: s.niches, cities: s.cities, min_followers: s.min_followers, max_followers: s.max_followers, exclude,
    });
    if (!r?.creators?.length) {
      lastErr = r;
      break;
    }
    asked += r.creators.length;
    const fresh = r.creators.filter((c) => {
      const ok = !seenEmail.has(c.email) && !(c.handle && seenHandle.has(c.handle)) && !BAD.test(c.email);
      seenEmail.add(c.email);
      if (c.handle) {
        seenHandle.add(c.handle);
        exclude.push(c.handle);
      }
      return ok;
    });
    // The email must really be on the page given (or their own site): six pages at a time.
    for (let i = 0; i < fresh.length && found.length < want; i += 6) {
      const checked = await Promise.all(fresh.slice(i, i + 6).map(async (c) => ({ c, src: await seenOn(c) })));
      for (const { c, src } of checked) {
        if (src && found.length < want) {
          confirmed++;
          found.push({ ...c, email_source: src });
        }
      }
    }
  }
  if (!found.length && !asked) return reply({ error: 'No creators came back from the search.', detail: lastErr }, 502);

  // An email for each, written five at a time.
  const written = await Promise.all(found.map((c, k) => new Promise((r) => setTimeout(r, Math.floor(k / 5) * 1500)).then(() =>
    ai<{ subject: string; body: string }>(db, site, 'growthmail', { name: c.name, handle: c.handle, niche: c.niche, city: c.city, about_them: c.why, offer: s.offer }))));
  const slots = sendTimes(found.length);
  const rows = found.map((c, k) => {
    const w = written[k] as { subject?: string; body?: string } | null;
    const first = c.name.split(' ')[0] || 'there';
    return {
      name: c.name, handle: c.handle, email: c.email, website: c.website, source_url: c.email_source, niche: c.niche, city: c.city, followers: c.followers, why: c.why,
      subject: w?.subject?.trim() || `your brand deals, simpler`,
      body: w?.body?.trim() ||
        `Hi ${first},\n\nI came across your ${c.niche || ''} content${c.city ? ` from ${c.city}` : ''} and loved it.\n\nMiracle is a free tool for creators: a brand page with your rates and live Instagram numbers, quotes brands accept online, GST-ready invoices with a UPI QR, and reminders that chase late payments for you. Brands pay you directly; we never take a cut.${s.offer ? `\n\n${s.offer}` : ''}\n\nWould you like to try it?`,
      status: s.mode === 'auto' ? 'approved' : 'ready', found_on: today, send_after: slots[k],
    };
  });
  if (dry) return reply({ dry: true, want, asked, confirmed, seconds: Math.round((Date.now() - started) / 1000), rows });
  if (rows.length) {
    const { error } = await db.from('growth_leads').insert(rows);
    if (error) return reply({ error: error.message }, 500);
  }
  return reply({ added: rows.length, asked, confirmed, ...(rows.length ? {} : { skipped: 'none of the emails found could be confirmed on a public page' }), creators: rows.map((r) => `${r.name} <${r.email}>`) });
});

/** The AI job with a single-use pass (no creator: the free Gemini allowance, nothing counted against anyone). */
async function ai<T>(db: ReturnType<typeof admin>, site: string, kind: string, payload: Record<string, unknown>): Promise<T | null> {
  const ticket = crypto.randomUUID() + crypto.randomUUID();
  const { error } = await db.from('ai_tickets').insert({ token: ticket, kind });
  if (error) return null;
  const r = await fetch(`${site}/api/ai/${kind}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ai-ticket': ticket, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(100_000),
  }).catch(() => null);
  return ((await r?.json().catch(() => null)) as T | null) ?? null;
}

/** From 10 AM (or now, if later) a few minutes apart: the order they go out in. */
function sendTimes(n: number) {
  const out: string[] = [];
  let t = Math.max(Date.now() + 10 * 60e3, Date.parse(`${todayIST()}T10:00:00+05:30`));
  for (let i = 0; i < n; i++) {
    out.push(new Date(t).toISOString());
    t += 20 * 60e3;
  }
  return out;
}

// ---------- the email, seen on a public page ----------
const BAD = /noreply|no-reply|donotreply|example\.|privacy|legal|grievance|careers|jobs|hr@|support@|help@|abuse@/i;

/** The page the email was seen on: the one the search gave, else their own site. '' when it isn't there. */
async function seenOn(c: Found): Promise<string> {
  const pages = [c.email_source, c.website].map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u) && !/instagram\.com|facebook\.com/i.test(u));
  for (const u of [...new Set(pages)]) {
    const html = await get(u);
    if (html && emailsIn(html).has(c.email)) return u;
  }
  return '';
}
function emailsIn(html: string) {
  const out = new Set<string>();
  for (const m of html.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) out.add(cfDecode(m[1]).toLowerCase());
  for (const m of html.replace(/&#64;|&#x40;|\[at\]|\(at\)|\s+at\s+(?=[a-z0-9-]+\s*(\.|dot))/gi, '@').replace(/\s*(\[dot\]|\(dot\))\s*/gi, '.').matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) out.add(m[0].toLowerCase());
  return out;
}
async function get(u: string): Promise<string> {
  try {
    const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Miracle/1.0; +https://www.miracleapp.live)', accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('html')) return '';
    return (await r.text()).slice(0, 1_000_000);
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
