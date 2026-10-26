// Growth Autopilot (migration 163), once a day (9 AM India) from the database cron job, or "Find now" in the admin
// panel. Finds Indian creators who show a business email on a public page, opens that page to see the email there
// itself (anything it can't confirm is dropped), writes a short personal invitation for each, and queues them:
// waiting for approval in the panel, or approved straight away in "auto" mode. private.growth_send_due sends them
// in working hours, a few minutes apart.
//
// * With GROWTH_ANTHROPIC_API_KEY set (Miracle's monthly API credit; nothing else uses this key), Claude Opus 5.5
//   searches the web through the Message Batches API: no time limit and half price. This call hands the search
//   over and answers at once; ?collect=1 (every 5 minutes while one is pending, migration 166) picks up what
//   Claude found. Only one search runs at a time, so repeated clicks never pay twice.
// * Without the key, Gemini with Google Search runs inside this call, within the platform's time limit.
//   ?dry=1   (Gemini) find and write, save nothing
//   ?site=   where the AI lives (local testing)
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.110.0';
import { admin, cronAllowed, todayIST } from '../_shared/admin.ts';

const CLAUDE_KEY = Deno.env.get('GROWTH_ANTHROPIC_API_KEY') ?? '';
const CLAUDE_MODEL = 'claude-opus-5-5';
// Batch list prices, for the panel's running total: half of $4 / $20 per million tokens; web search $10 per 1,000.
const PRICE = { input: 2 / 1e6, output: 10 / 1e6, search: 10 / 1000 };
type Spend = { input: number; output: number; searches: number };

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
type Found = { name: string; handle: string; email: string; email_source: string; website: string; niche: string; city: string; followers: number | null; why: string };
type Settings = { on: boolean; mode: 'approve' | 'auto'; daily: number; niches: string[]; cities: string[]; min_followers: number; max_followers: number; offer: string };
type Db = ReturnType<typeof admin>;
type Run = { id: number; at: string; batch_id: string | null; request: Anthropic.Messages.MessageCreateParamsNonStreaming | null; cost_usd: number | string; asked: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';
  const site = String(url.searchParams.get('site') || Deno.env.get('APP_URL') || 'https://app.miracleapp.live').replace(/\/$/, '');
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

  // An admin stops a Claude search that seems stuck: the batch is cancelled and the run closed.
  const cancel = Number(url.searchParams.get('cancel'));
  if (manual && cancel > 0) {
    const { data: run } = await db.from('growth_runs').select('id, batch_id, finished_at').eq('id', cancel).maybeSingle();
    if (!run || (run as { finished_at: string | null }).finished_at) return reply({ error: 'That search has already finished.' }, 404);
    const batch = (run as { batch_id: string | null }).batch_id;
    let note = '';
    if (batch && CLAUDE_KEY) await claude().messages.batches.cancel(batch).catch((e) => (note = ` (${claudeError(e)})`));
    await db.from('growth_runs').update({ error: `cancelled by an admin${note}`, finished_at: new Date().toISOString() }).eq('id', cancel);
    return reply({ cancelled: true });
  }

  // Claude's batches that have finished: read, check, write, queue (in the background; the job doesn't wait).
  if (url.searchParams.get('collect') === '1') {
    background(collect(db, site));
    return reply({ collecting: true }, 202);
  }

  const ctx = await context(db);
  if ('error' in ctx) return reply({ error: ctx.error }, 500);
  if (!ctx.s.on && !manual && !dry) return reply({ skipped: 'the Growth Autopilot is off' });
  if (!ctx.want) return reply({ skipped: ctx.waiting ? `${ctx.waiting} still waiting for approval` : 'today is done' });

  if (CLAUDE_KEY && !dry) {
    // One search at a time: a click while Claude is still searching doesn't start (or pay for) another.
    const { data: pending } = await db.from('growth_runs').select('id, at').eq('engine', 'claude').not('batch_id', 'is', null).is('finished_at', null).order('at').limit(1);
    const p = (pending ?? [])[0] as { id: number; at: string } | undefined;
    if (p) return reply({ skipped: `A search is already running (started ${Math.max(1, Math.round((Date.now() - Date.parse(p.at)) / 60000))} minutes ago). Its creators appear here when Claude finishes.`, run: p.id });
    const { data: run, error } = await db.from('growth_runs').insert({ engine: 'claude', manual }).select('id').single();
    if (error || !run) return reply({ error: error?.message ?? 'Could not start the search.' }, 500);
    const id = (run as { id: number }).id;
    const request = claudeRequest(ctx.s, Math.min(10, ctx.want + 2), [...ctx.seenHandle]);
    try {
      const batch = await claude().messages.batches.create({ requests: [{ custom_id: `run-${id}`, params: request }] });
      await db.from('growth_runs').update({ batch_id: batch.id, request }).eq('id', id);
      return reply({ started: true, run: id, engine: 'claude', batch: true }, 202);
    } catch (e) {
      const why = claudeError(e);
      await db.from('growth_runs').update({ error: why, finished_at: new Date().toISOString() }).eq('id', id);
      return reply({ error: why }, 502);
    }
  }

  // Gemini (no Claude key): searched here and now, within the time limit, in the background.
  const started = Date.now();
  const { data: run } = dry ? { data: null } : await db.from('growth_runs').insert({ engine: 'gemini', manual }).select('id').single();
  const runId = (run as { id: number } | null)?.id ?? null;
  const job = geminiSearch(db, site, ctx, started, dry, runId);
  if (dry) return reply(await job);
  if (background(job)) return reply({ started: true, run: runId, engine: 'gemini' }, 202);
  return reply(await job);
});

/** Keep a job running after the answer has gone (the platform waits for it, up to its time limit). */
function background(job: Promise<unknown>) {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (!rt) return false;
  rt.waitUntil(job);
  return true;
}

/** Today's numbers and everyone already known (found before, said no, or already on Miracle or its waitlist). */
async function context(db: Db) {
  const { data: g } = await db.from('growth_settings').select('*').eq('id', 1).single();
  const s = g as Settings | null;
  if (!s) return { error: 'No settings.' };
  const today = todayIST();
  const [{ data: leads }, { data: sup }, { data: creators }, { data: wl }] = await Promise.all([
    db.from('growth_leads').select('email, handle, status, found_on'),
    db.from('growth_suppress').select('email'),
    db.from('creator_settings').select('creator_email, handle'),
    db.from('waitlist').select('email, instagram'),
  ]);
  const all = leads ?? [];
  // Never more than a day's worth waiting or found today.
  const waiting = all.filter((l) => l.status === 'ready').length;
  const foundToday = all.filter((l) => l.found_on === today).length;
  const want = Math.max(0, s.daily - Math.max(waiting, foundToday));
  const seenEmail = new Set([...all.map((l) => l.email), ...(sup ?? []).map((x) => x.email), ...(creators ?? []).map((c) => c.creator_email ?? ''), ...(wl ?? []).map((w) => w.email ?? '')].map((e) => String(e).toLowerCase()).filter(Boolean));
  const seenHandle = new Set([...all.map((l) => l.handle), ...(creators ?? []).map((c) => c.handle ?? ''), ...(wl ?? []).map((w) => w.instagram ?? '')].map((h) => String(h).replace(/^@+/, '').toLowerCase()).filter(Boolean));
  return { s, today, want, waiting, seenEmail, seenHandle };
}
type Ctx = Exclude<Awaited<ReturnType<typeof context>>, { error: string }>;

// ---------- Claude, through the Message Batches API ----------
const claude = () => new Anthropic({ apiKey: CLAUDE_KEY, maxRetries: 1 });

/** The search Claude runs: web search to find creators, web fetch to open the page and see the email on it. */
function claudeRequest(s: Settings, count: number, known: string[]): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const system = `You find Indian Instagram creators for Miracle to invite. Miracle is a free tool for creators' brand deals: a rate-card page brands book from, quotes, invoices and payment reminders.
Use web search to find real, active creators, then open the page that shows their email (web fetch) to check it is really there.
Who counts:
- posts about ${s.niches.length ? s.niches.join(', ') : 'fashion, beauty, food, travel, lifestyle or fitness'}${s.cities.length ? `, based in or around ${s.cities.join(', ')}` : ', anywhere in India'};
- roughly ${s.min_followers.toLocaleString('en-IN')} to ${s.max_followers.toLocaleString('en-IN')} Instagram followers (micro and mid creators, not celebrities);
- does brand collaborations, and publishes a business or collaboration email on a public web page you opened: their own website, a media kit, a link-in-bio page, a creator directory or an article. An email that only appears inside Instagram does not count.
Never include anyone in the exclude list. Never invent a person, a handle or an email: only what you saw on a page. Fewer real creators are better than more guesses.
When you are done, reply with ONLY a JSON array and nothing else. Each item: {"name", "handle" (Instagram, without @), "email" (exactly as published), "email_source" (the https:// page where you saw the email, not instagram.com), "website" (their own site or link page, or ""), "niche", "city", "followers" (a number, your best estimate), "why" (one line under 18 words about their content)}.`;
  return {
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    output_config: { effort: 'medium' },
    system,
    tools: [
      { type: 'web_search_20260209', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'IN' } },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 12 },
    ],
    messages: [{ role: 'user', content: `Find ${count} creators.\nExclude (already known): ${known.slice(-300).join(', ') || 'none'}` }],
  } as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming;
}

/** Every finished batch: a paused search carries on in a new batch; a finished one is checked, written and queued. */
async function collect(db: Db, site: string) {
  if (!CLAUDE_KEY) return;
  const { data } = await db.from('growth_runs').select('id, at, batch_id, request, cost_usd, asked').eq('engine', 'claude').not('batch_id', 'is', null).is('finished_at', null).order('at');
  for (const run of (data ?? []) as Run[]) {
    const finish = (patch: Record<string, unknown>) => db.from('growth_runs').update({ ...patch, seconds: Math.round((Date.now() - Date.parse(run.at)) / 1000), finished_at: new Date().toISOString() }).eq('id', run.id);
    try {
      const client = claude();
      const batch = await client.messages.batches.retrieve(run.batch_id!);
      // What Claude says, kept on the run for the panel (and to tell a slow search from a stuck one).
      const n = batch.request_counts;
      await db.from('growth_runs').update({
        batch_status: batch.processing_status === 'ended' ? `ended: ${n.succeeded} done, ${n.errored} failed, ${n.expired} expired, ${n.canceled} cancelled` : batch.processing_status === 'canceling' ? 'being cancelled' : 'Claude is still searching',
        checked_at: new Date().toISOString(),
      }).eq('id', run.id);
      if (batch.processing_status !== 'ended') {
        // Batches finish within 24 hours; one still going after that is given up on.
        if (Date.now() - Date.parse(run.at) > 26 * 3600e3) await finish({ error: "Claude didn't finish within a day" });
        continue;
      }
      let message: Anthropic.Messages.Message | null = null;
      let failed = '';
      for await (const r of await client.messages.batches.results(run.batch_id!)) {
        if (r.result.type === 'succeeded') message = r.result.message;
        else failed = r.result.type === 'errored' ? `Claude: ${(r.result.error as { error?: { message?: string } })?.error?.message ?? 'the search failed'}` : `Claude: the search was ${r.result.type}`;
      }
      if (!message) {
        await finish({ error: failed || 'Claude returned nothing' });
        continue;
      }
      const u = message.usage as { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null; server_tool_use?: { web_search_requests?: number } | null };
      const cost = Math.round((Number(run.cost_usd) + (u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)) * PRICE.input + u.output_tokens * PRICE.output + (u.server_tool_use?.web_search_requests ?? 0) * PRICE.search) * 100) / 100;
      // Paused part-way: the same turn carries on in a new batch (the pause_turn pattern).
      if (message.stop_reason === 'pause_turn' && run.request) {
        const request = { ...run.request, messages: [...run.request.messages, { role: 'assistant', content: message.content }] } as Anthropic.Messages.MessageCreateParamsNonStreaming;
        const next = await client.messages.batches.create({ requests: [{ custom_id: `run-${run.id}`, params: request }] });
        await db.from('growth_runs').update({ batch_id: next.id, request, cost_usd: cost }).eq('id', run.id);
        continue;
      }
      if (message.stop_reason === 'refusal') {
        await finish({ cost_usd: cost, error: 'Claude declined the search' });
        continue;
      }
      const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      const creators = parseCreators(text);
      const ctx = await context(db);
      if ('error' in ctx) {
        await finish({ cost_usd: cost, error: ctx.error });
        continue;
      }
      const out = await queue(db, site, ctx, creators, Math.max(ctx.want, 1), 30_000);
      await finish({ cost_usd: cost, asked: creators.length, confirmed: out.confirmed, added: out.added, error: out.error ?? (creators.length ? '' : `Claude found no creators with a public email this time${text ? `: ${text.replace(/\s+/g, ' ').slice(0, 140)}` : ''}`) });
    } catch (e) {
      await finish({ error: claudeError(e) });
    }
  }
}

function claudeError(e: unknown) {
  if (e instanceof Anthropic.AuthenticationError) return 'the Claude key was refused: check GROWTH_ANTHROPIC_API_KEY';
  if (e instanceof Anthropic.RateLimitError) return 'Claude is busy or the credit is used up (rate limited); try again later';
  if (e instanceof Anthropic.APIError) return `Claude: ${e.message}`.slice(0, 300);
  return `Claude: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
}

/** The JSON array at the end of an answer, as creators with an email that looks right. */
function parseCreators(text: string): Found[] {
  const from = text.search(/\[\s*\{/), z = text.lastIndexOf(']');
  let raw: Record<string, unknown>[] = [];
  try {
    raw = from >= 0 && z > from ? (JSON.parse(text.slice(from, z + 1)) as Record<string, unknown>[]) : [];
  } catch {
    raw = [];
  }
  return raw
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
}

// ---------- after the search, the same for both: check each page, write each email, queue ----------
async function queue(db: Db, site: string, ctx: Ctx, creators: Found[], want: number, writeWait: number, dry = false): Promise<{ added: number; confirmed: number; error?: string; rows?: unknown[] }> {
  const { s, today, seenEmail, seenHandle } = ctx;
  const fresh = creators.filter((c) => {
    const ok = !seenEmail.has(c.email) && !(c.handle && seenHandle.has(c.handle)) && !BAD.test(c.email);
    seenEmail.add(c.email);
    if (c.handle) seenHandle.add(c.handle);
    return ok;
  });
  // The email must really be on the page given (or their own site): every page at once.
  const checked = await Promise.all(fresh.map(async (c) => ({ c, src: await seenOn(c) })));
  const found = checked.filter((x) => x.src).slice(0, want).map((x) => ({ ...x.c, email_source: x.src }));
  if (!found.length) return { added: 0, confirmed: 0, error: creators.length ? `${creators.length} creator${creators.length === 1 ? '' : 's'} found, but none of their emails could be confirmed on a public page` : undefined };
  // An email for each, all at once (the standard email when one isn't back in time).
  const written = await Promise.all(found.map((c) =>
    ai<{ subject: string; body: string }>(db, site, 'growthmail', { name: c.name, handle: c.handle, niche: c.niche, city: c.city, about_them: c.why, offer: s.offer }, writeWait)));
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
  if (dry) return { added: 0, confirmed: found.length, rows };
  const { error } = await db.from('growth_leads').insert(rows);
  if (error) return { added: 0, confirmed: found.length, error: error.message };
  return { added: rows.length, confirmed: found.length };
}

// ---------- Gemini (no Claude key): within the platform's time limit (about 150 seconds) ----------
const TOTAL = 135_000, SEARCH = 85_000;
async function geminiSearch(db: Db, site: string, ctx: Ctx, started: number, dry: boolean, runId: number | null): Promise<Record<string, unknown>> {
  const finish = async (patch: Record<string, unknown>) => {
    if (dry || !runId) return;
    await db.from('growth_runs').update({ ...patch, seconds: Math.round((Date.now() - started) / 1000), finished_at: new Date().toISOString() }).eq('id', runId);
  };
  try {
    const found: Found[] = [];
    const exclude = [...ctx.seenHandle].slice(-300);
    let lastErr: unknown = null;
    for (let round = 0; round < 4 && found.length < ctx.want + 4; round++) {
      const left = SEARCH - (Date.now() - started);
      if (left < 30_000) break;
      const r = await ai<{ creators?: Found[]; error?: string }>(db, site, 'growthscout',
        { count: Math.min(6, ctx.want + 2), niches: ctx.s.niches, cities: ctx.s.cities, min_followers: ctx.s.min_followers, max_followers: ctx.s.max_followers, exclude }, Math.min(65_000, left));
      if (!r?.creators?.length) {
        lastErr = r;
        if (round > 0 || !r?.error || /Not allowed|needs Gemini/.test(r.error)) break;
        continue;
      }
      found.push(...r.creators);
      exclude.push(...r.creators.map((c) => c.handle).filter(Boolean));
    }
    if (!found.length) {
      const why = `no creators came back from the search: ${(lastErr as { error?: string } | null)?.error ?? 'no answer'}`;
      await finish({ error: why });
      return { added: 0, error: why };
    }
    const wait = Math.max(8_000, Math.min(25_000, TOTAL - (Date.now() - started) - 10_000));
    const out = await queue(db, site, ctx, found, ctx.want, wait, dry);
    await finish({ asked: found.length, confirmed: out.confirmed, added: out.added, error: out.error ?? '' });
    return { ...out, asked: found.length, engine: 'gemini' };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await finish({ error: `stopped: ${m}` });
    return { error: m };
  }
}

/** The AI job with a single-use pass (no creator: the free Gemini allowance, nothing counted against anyone).
 * When it doesn't answer, { error } says why (the pass, a timeout, or the AI's own message). */
async function ai<T>(db: Db, site: string, kind: string, payload: Record<string, unknown>, wait = 60_000): Promise<(T & { error?: string }) | null> {
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

/** From 10 AM (or now, if later), 2 minutes apart (the sending job runs every 2 minutes): the order they go out in. */
function sendTimes(n: number) {
  const out: string[] = [];
  let t = Math.max(Date.now() + 2 * 60e3, Date.parse(`${todayIST()}T10:00:00+05:30`));
  for (let i = 0; i < n; i++) {
    out.push(new Date(t).toISOString());
    t += 2 * 60e3;
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
    const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Miracle/1.0; +https://www.miracleapp.live)', accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(6000) });
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
