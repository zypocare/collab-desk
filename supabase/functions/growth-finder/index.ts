// Growth Autopilot (migration 163), once a day (9 AM India) from the database cron job, or "Find now" in the admin
// panel. Finds Indian creators who show a business email on a public page (Claude with web search when
// GROWTH_ANTHROPIC_API_KEY is set, a key used for nothing else; otherwise Gemini with Google Search), opens
// that page to see the email there itself (anything it can't confirm is dropped), writes a short personal
// invitation for each, and queues them: waiting for approval in the panel, or approved straight away in "auto"
// mode. private.growth_send_due sends them in working hours, a few minutes apart.
//   ?dry=1   find and write, save nothing
//   ?site=   where the AI lives (local testing)
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.110.0';
import { admin, cronAllowed, todayIST } from '../_shared/admin.ts';

// Claude for the search, when its key is set (Miracle's monthly API credit; nothing else uses this key).
const CLAUDE_KEY = Deno.env.get('GROWTH_ANTHROPIC_API_KEY') ?? '';
const CLAUDE_MODEL = 'claude-opus-5-5';
// List prices, for the panel's running total: $4 / $20 per million tokens, web search $10 per 1,000.
const PRICE = { input: 4 / 1e6, output: 20 / 1e6, search: 10 / 1000 };
type Spend = { input: number; output: number; searches: number };

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
  const engine = CLAUDE_KEY ? 'claude' : 'gemini';
  const spend: Spend = { input: 0, output: 0, searches: 0 };
  const usd = () => Math.round((spend.input * PRICE.input + spend.output * PRICE.output + spend.searches * PRICE.search) * 100) / 100;
  // Every run is kept, so the panel can show what it found and what it cost.
  const log = async (added: number, error = '') => {
    if (dry) return;
    await db.from('growth_runs').insert({ engine, manual, added, asked, confirmed, cost_usd: engine === 'claude' ? usd() : 0, seconds: Math.round((Date.now() - started) / 1000), error: error.slice(0, 300) });
  };
  // Small searches (a Google search for a few creators answers in well under a minute), as many rounds as fit:
  // the whole run must finish inside the function's time limit.
  for (let round = 0; round < 5 && found.length < want; round++) {
    const left = 105_000 - (Date.now() - started);
    if (left < 25_000) break;
    const ask = { count: Math.min(8, want - found.length + 3), niches: s.niches, cities: s.cities, min_followers: s.min_followers, max_followers: s.max_followers, exclude };
    const r = CLAUDE_KEY
      ? await claudeScout(ask, Math.min(100_000, left), spend)
      : await ai<{ creators?: Found[]; error?: string }>(db, site, 'growthscout', ask, Math.min(75_000, left));
    if (!r?.creators?.length) {
      lastErr = r;
      // One more try after a failed round, then stop.
      if (round > 0 || !r?.error || /Not allowed|needs Gemini/.test(r.error)) break;
      continue;
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
  if (!found.length && !asked) {
    const why = (lastErr as { error?: string } | null)?.error ?? 'no answer';
    await log(0, why);
    return reply({ error: `No creators came back from the search: ${why}`, detail: lastErr, engine, cost_usd: usd() }, 502);
  }

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
  if (dry) return reply({ dry: true, want, asked, confirmed, engine, cost_usd: usd(), seconds: Math.round((Date.now() - started) / 1000), rows });
  if (rows.length) {
    const { error } = await db.from('growth_leads').insert(rows);
    if (error) {
      await log(0, error.message);
      return reply({ error: error.message }, 500);
    }
  }
  await log(rows.length, rows.length ? '' : 'none of the emails found could be confirmed on a public page');
  return reply({ added: rows.length, asked, confirmed, engine, cost_usd: usd(), ...(rows.length ? {} : { skipped: 'none of the emails found could be confirmed on a public page' }), creators: rows.map((r) => `${r.name} <${r.email}>`) });
});

/** The AI job with a single-use pass (no creator: the free Gemini allowance, nothing counted against anyone).
 * When it doesn't answer, { error } says why (the pass, a timeout, or the AI's own message). */
async function ai<T>(db: ReturnType<typeof admin>, site: string, kind: string, payload: Record<string, unknown>, wait = 60_000): Promise<(T & { error?: string }) | null> {
  const ticket = crypto.randomUUID() + crypto.randomUUID();
  const { error } = await db.from('ai_tickets').insert({ token: ticket, kind });
  if (error) return { error: `couldn't make the AI pass: ${error.message}` } as T & { error: string };
  const t0 = Date.now();
  let r: Response;
  try {
    r = await fetch(`${site}/api/ai/${kind}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ai-ticket': ticket, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(wait),
    });
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === 'TimeoutError';
    return { error: timedOut ? `the AI took longer than ${Math.round(wait / 1000)} seconds` : `couldn't reach the AI (${e instanceof Error ? e.message : String(e)})` } as T & { error: string };
  }
  const text = await r.text().catch(() => '');
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return { error: `the AI answered ${r.status} after ${Math.round((Date.now() - t0) / 1000)} seconds: ${text.replace(/\s+/g, ' ').slice(0, 160)}` } as T & { error: string };
  }
}

/** Claude with web search (and web fetch, to open a page and see the email on it). A long search can pause
 * part-way (pause_turn): the turn is handed back and it carries on, inside the time given. */
async function claudeScout(p: { count: number; niches: string[]; cities: string[]; min_followers: number; max_followers: number; exclude: string[] }, wait: number, spend: Spend): Promise<{ creators?: Found[]; error?: string }> {
  const client = new Anthropic({ apiKey: CLAUDE_KEY, maxRetries: 1 });
  const deadline = Date.now() + wait;
  const system = `You find Indian Instagram creators for Miracle to invite. Miracle is a free tool for creators' brand deals: a rate-card page brands book from, quotes, invoices and payment reminders.
Use web search to find real, active creators, then open the page that shows their email to check it is really there.
Who counts:
- posts about ${p.niches.length ? p.niches.join(', ') : 'fashion, beauty, food, travel, lifestyle or fitness'}${p.cities.length ? `, based in or around ${p.cities.join(', ')}` : ', anywhere in India'};
- roughly ${p.min_followers.toLocaleString('en-IN')} to ${p.max_followers.toLocaleString('en-IN')} Instagram followers (micro and mid creators, not celebrities);
- does brand collaborations, and publishes a business or collaboration email on a public web page you opened yourself: their own website, a media kit, a link-in-bio page, a creator directory or an article. An email that only appears inside Instagram does not count.
Never include anyone in the exclude list. Never invent a person, a handle or an email: only what you saw on a page. Fewer real creators are better than more guesses.
When you are done, reply with ONLY a JSON array and nothing else. Each item: {"name", "handle" (Instagram, without @), "email" (exactly as published), "email_source" (the https:// page where you saw the email, not instagram.com), "website" (their own site or link page, or ""), "niche", "city", "followers" (a number, your best estimate), "why" (one line under 18 words about their content)}.`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: `Find ${p.count} creators.\nExclude (already known): ${p.exclude.slice(-300).join(', ') || 'none'}` },
  ];
  try {
    for (let turn = 0; turn < 4; turn++) {
      const left = deadline - Date.now();
      if (left < 15_000) return { error: 'Claude ran out of time while searching' };
      // fallbacks "default": if Claude Opus 5.5 declines, Anthropic's recommended model answers instead.
      const params = {
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system,
        tools: [
          { type: 'web_search_20260209', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'IN' } },
          { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 12 },
        ],
        messages,
      } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
      const r = await client.beta.messages.create(params, { timeout: left });
      const u = r.usage as { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null; server_tool_use?: { web_search_requests?: number } | null };
      spend.input += u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      spend.output += u.output_tokens;
      spend.searches += u.server_tool_use?.web_search_requests ?? 0;
      if (r.stop_reason === 'refusal') return { error: 'Claude declined the search' };
      if (r.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: r.content as Anthropic.Beta.BetaContentBlockParam[] });
        continue;
      }
      // Web search answers come in several text blocks (with citations): joined exactly as written.
      const text = r.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      // The JSON array is the last thing it says (any notes come before it).
      const from = text.search(/\[\s*\{/), z = text.lastIndexOf(']');
      let raw: Record<string, unknown>[] = [];
      try {
        raw = from >= 0 && z > from ? (JSON.parse(text.slice(from, z + 1)) as Record<string, unknown>[]) : [];
      } catch {
        raw = [];
      }
      const creators = raw
        .map((x) => ({
          name: String(x.name ?? '').trim().slice(0, 80),
          handle: String(x.handle ?? '').replace(/^@+/, '').trim().toLowerCase().slice(0, 30),
          email: String(x.email ?? '').trim().toLowerCase().slice(0, 120),
          email_source: String(x.email_source ?? '').trim().slice(0, 300),
          website: String(x.website ?? '').trim().slice(0, 300),
          niche: String(x.niche ?? '').trim().slice(0, 60),
          city: String(x.city ?? '').trim().slice(0, 60),
          followers: Math.round(Number(x.followers) || 0) || null,
          why: String(x.why ?? '').trim().slice(0, 160),
        }))
        .filter((x) => x.name && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(x.email));
      return creators.length ? { creators } : { error: `Claude found no creators with a public email this time${text ? `: ${text.replace(/\s+/g, ' ').slice(0, 140)}` : ''}` };
    }
    return { error: 'Claude kept searching without an answer' };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { error: 'the Claude key was refused: check GROWTH_ANTHROPIC_API_KEY' };
    if (e instanceof Anthropic.RateLimitError) return { error: 'Claude is busy or the credit is used up (rate limited); try again later' };
    if (e instanceof Anthropic.APIConnectionTimeoutError) return { error: 'Claude took too long to answer' };
    if (e instanceof Anthropic.APIError) return { error: `Claude: ${e.message}`.slice(0, 300) };
    return { error: `Claude: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) };
  }
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
