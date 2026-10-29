// Growth Autopilot (migration 163), at 9 AM India from the database cron job (when the queue is running low), or
// "Find now" in the admin panel. Finds Indian creators (and, since migration 179, Indian D2C brands that work with
// creators: the settings' audience) who show a business email on a public page, opens that page to
// see the email there itself (anything it can't confirm is dropped), writes a short personal invitation for each, and
// queues them: waiting for approval in the panel, or approved straight away in "auto" mode. private.growth_send_due
// sends them in working hours, two minutes apart, up to the daily number; the rest wait for the next days.
//
// * With GROWTH_ANTHROPIC_API_KEY set (Miracle's monthly API credit; nothing else uses this key), Claude Sonnet 5.5
//   searches the web through the Message Batches API: no time limit and half price. One search is one request for
//   each niche, side by side in the same batch, and Claude writes each creator's subject and opening line as it goes.
//   This call hands the search over and answers at once; ?collect=1 (every 5 minutes while one is pending,
//   migration 166; every minute since 172) picks up what Claude found, a few creators at a time. Only one search runs at a time, so repeated clicks never pay twice.
// * Without the key, Gemini with Google Search runs inside this call, within the platform's time limit.
//   ?dry=1   (Gemini) find and write, save nothing
//   ?site=   where the AI lives (local testing)
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.110.0';
import { admin, cronAllowed, todayIST } from '../_shared/admin.ts';

const CLAUDE_KEY = Deno.env.get('GROWTH_ANTHROPIC_API_KEY') ?? '';
// Sonnet, not Opus: a wide search on Opus cost about $7 for 14 creators queued. Most of a search's cost is the pages
// Claude reads, which are read again at every later step, so pages are also capped (FETCH_TOKENS) and fewer.
const CLAUDE_MODEL = 'claude-sonnet-5-5';
// Batch list prices, for the panel's running total: half of $2 / $10 per million tokens; web search $10 per 1,000.
const PRICE = { input: 1 / 1e6, output: 5 / 1e6, search: 10 / 1000 };
// Each page Claude opens, cut to this many tokens: a contact section, link-in-bio page or media kit fits well inside.
const FETCH_TOKENS = 6000;
// One search: this many creators asked for in each niche, at most this many niches.
const PER_NICHE = 12, MAX_NICHES = 8;
const NICHES = ['fashion', 'beauty', 'food', 'travel', 'lifestyle', 'fitness'];
type Params = Anthropic.Messages.MessageCreateParamsNonStreaming;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
// kind: a creator, or a brand (its name is the brand's, contact the person its page names, if any).
type Found = { kind?: 'creator' | 'brand'; name: string; contact?: string; handle: string; email: string; email_source: string; website: string; niche: string; city: string; followers: number | null; why: string; subject?: string; opening?: string };
type Settings = { on: boolean; mode: 'approve' | 'auto'; daily: number; niches: string[]; cities: string[]; min_followers: number; max_followers: number; offer: string; audience: 'creators' | 'brands' | 'both'; brand_offer: string };
type Db = ReturnType<typeof admin>;
// request: the batch's requests still going, by custom_id (a single request on older runs).
type Run = { id: number; at: string; batch_id: string | null; request: Record<string, Params> | Params | null; cost_usd: number | string; asked: number | null; confirmed: number | null; added: number | null; found: Found[] | null; results_read: boolean; reading: number; read_ids: string[] | null; next_requests: Record<string, Params> | null; note: string | null };

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
  // The morning search skips itself while two days' sending is still waiting; "Find now" stops at a week's worth.
  const enough = ctx.s.daily * (manual ? 7 : 2);
  if (ctx.backlog >= enough) return reply({ skipped: `${ctx.backlog} creators are already waiting to be emailed, about ${Math.round(ctx.backlog / ctx.s.daily)} days of sending. Search again when fewer are waiting.` });

  // Brands are searched only with Claude (Gemini's search is creators only).
  if (!CLAUDE_KEY && ctx.s.audience === 'brands') return reply({ error: 'Finding brands needs Claude (GROWTH_ANTHROPIC_API_KEY). Set the audience to Creators, or add the key.' }, 400);
  if (CLAUDE_KEY && !dry) {
    // One search at a time: a click while Claude is still searching doesn't start (or pay for) another.
    const { data: pending } = await db.from('growth_runs').select('id, at').eq('engine', 'claude').not('batch_id', 'is', null).is('finished_at', null).order('at').limit(1);
    const p = (pending ?? [])[0] as { id: number; at: string } | undefined;
    if (p) return reply({ skipped: `A search is already running (started ${Math.max(1, Math.round((Date.now() - Date.parse(p.at)) / 60000))} minutes ago). Its creators appear here when Claude finishes.`, run: p.id });
    const { data: run, error } = await db.from('growth_runs').insert({ engine: 'claude', manual }).select('id').single();
    if (error || !run) return reply({ error: error?.message ?? 'Could not start the search.' }, 500);
    const id = (run as { id: number }).id;
    const requests = claudeRequests(ctx.s, [...ctx.seenHandle], [...ctx.seenSite]);
    try {
      const batch = await claude().messages.batches.create({ requests: Object.entries(requests).map(([custom_id, params]) => ({ custom_id, params })) });
      await db.from('growth_runs').update({ batch_id: batch.id, request: requests }).eq('id', id);
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
  const [{ data: leads }, { data: sup }, { data: creators }, { data: wl }, { data: brands }] = await Promise.all([
    db.from('growth_leads').select('email, handle, status, found_on, website, kind'),
    db.from('growth_suppress').select('email'),
    db.from('creator_settings').select('creator_email, handle'),
    db.from('waitlist').select('email, instagram'),
    db.from('brand_profiles').select('website, instagram'),
  ]);
  const all = leads ?? [];
  // Creators still to be emailed: waiting for approval, or approved and not sent yet.
  const backlog = all.filter((l) => l.status === 'ready' || l.status === 'approved').length;
  // Gemini searches within the time limit, so it asks for about two days' worth at most.
  const want = Math.max(1, Math.min(s.daily, s.daily * 2 - backlog));
  const seenEmail = new Set([...all.map((l) => l.email), ...(sup ?? []).map((x) => x.email), ...(creators ?? []).map((c) => c.creator_email ?? ''), ...(wl ?? []).map((w) => w.email ?? '')].map((e) => String(e).toLowerCase()).filter(Boolean));
  const seenHandle = new Set([...all.map((l) => l.handle), ...(creators ?? []).map((c) => c.handle ?? ''), ...(wl ?? []).map((w) => w.instagram ?? ''), ...(brands ?? []).map((b) => igHandle(b.instagram ?? ''))].map((h) => String(h).replace(/^@+/, '').toLowerCase()).filter(Boolean));
  // Brands already found or already on Miracle, by their website.
  const seenSite = new Set([...all.filter((l) => l.kind === 'brand').map((l) => l.website ?? ''), ...(brands ?? []).map((b) => b.website ?? '')].map(siteOf).filter(Boolean));
  return { s, today, want, backlog, seenEmail, seenHandle, seenSite };
}
type Ctx = Exclude<Awaited<ReturnType<typeof context>>, { error: string }>;

// ---------- Claude, through the Message Batches API ----------
const claude = () => new Anthropic({ apiKey: CLAUDE_KEY, maxRetries: 1 });

/** One search: a request for each niche, all in the same batch, by custom_id: n0, n1… for creators, b0, b1… for
 * brands. Both: half the niches each way, so a search costs about the same. */
function claudeRequests(s: Settings, known: string[], knownSites: string[]): Record<string, Params> {
  const all = s.niches.length ? s.niches : NICHES;
  const aud = s.audience ?? 'creators';
  const each = aud === 'both' ? Math.ceil(MAX_NICHES / 2) : MAX_NICHES;
  const out: Record<string, Params> = {};
  if (aud !== 'brands') all.slice(0, each).forEach((n, i) => (out[`n${i}`] = claudeRequest(s, n, PER_NICHE, known)));
  if (aud !== 'creators') all.slice(0, each).forEach((n, i) => (out[`b${i}`] = brandRequest(s, n, PER_NICHE, [...known.slice(-150), ...knownSites.slice(-150)])));
  return out;
}

/** The search Claude runs for one category of brands: Indian D2C brands that already work with Instagram creators and
 * publish a business email on their own site. */
function brandRequest(s: Settings, niche: string, count: number, known: string[]): Params {
  const system = `You find Indian brands for Miracle to invite. Miracle is where brands find Indian Instagram creators: live Instagram numbers and rates up front, collab requests in one tap, and every post and invoice tracked in one place. Brands pay creators directly; Miracle takes no commission.
Use web search to find real brands, then open the page on the brand's own website that shows its email (web fetch) to check it is really there.
Who counts:
- an Indian brand that sells online (its own website or D2C store) in the category in the request${s.cities.length ? `, based in or around ${s.cities.join(', ')}` : ', anywhere in India'};
- small or growing (startups and D2C labels), not large listed companies or the Indian arm of a global brand;
- already works with Instagram creators: influencer posts, a creator, ambassador or affiliate programme, or creator collabs on its Instagram;
- publishes a marketing, partnerships, collab, PR or general business email (like hello@, marketing@, collab@) on a page of its own website you opened. Not a customer care, orders, returns, careers or grievance address.
Search widely: different phrasings, sub-categories and Indian cities, so the list isn't only the first results.
Never include a brand in the exclude list (Instagram handles and websites). Never invent a brand, a handle or an email: only what you saw on a page. Fewer real brands are better than more guesses.
For each brand also write the start of a short, warm note from Miracle's founder: a subject and an opening line about something real you saw (a product, a launch, a creator collab). Plain words, no flattery clichés, no emojis, nothing you didn't see.
When you are done, reply with ONLY a JSON array and nothing else. Each item: {"name" (the brand's name), "contact" (the first name of a marketing or partnerships person if the page names one, else ""), "handle" (the brand's Instagram, without @, or ""), "email" (exactly as published), "email_source" (the https:// page of its website where you saw the email), "website" (the brand's own site), "niche" (its category), "city", "why" (one line under 18 words about the brand and its creator work), "subject" (under 8 words, lower case like a note from a person), "opening" (one or two sentences, under 45 words, about the brand)}.`;
  return {
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    output_config: { effort: 'medium' },
    system,
    tools: [
      { type: 'web_search_20260209', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'IN' } },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 12, max_content_tokens: FETCH_TOKENS },
    ],
    messages: [{ role: 'user', content: `Find ${count} brands in ${niche}.\nExclude (already known): ${known.join(', ') || 'none'}` }],
  } as unknown as Params;
}

/** The search Claude runs for one niche: web search to find creators, web fetch to open the page and see the email on it. */
function claudeRequest(s: Settings, niche: string, count: number, known: string[]): Params {
  const system = `You find Indian Instagram creators for Miracle to invite. Miracle is a free tool for creators' brand deals: a rate-card page brands book from, quotes, invoices and payment reminders.
Use web search to find real, active creators, then open the page that shows their email (web fetch) to check it is really there.
Who counts:
- posts mainly about the niche in the request${s.cities.length ? `, based in or around ${s.cities.join(', ')}` : ', anywhere in India'};
- roughly ${s.min_followers.toLocaleString('en-IN')} to ${s.max_followers.toLocaleString('en-IN')} Instagram followers (micro and mid creators, not celebrities);
- does brand collaborations, and publishes a business or collaboration email on a public web page you opened. Look on their own pages first (their website, link-in-bio page or media kit); a creator directory or an article only when their own pages don't show it. An email that only appears inside Instagram does not count.
Search widely: different phrasings, sub-topics of the niche and Indian cities, so the list isn't only the first results.
Never include anyone in the exclude list. Never invent a person, a handle or an email: only what you saw on a page. Fewer real creators are better than more guesses.
For each creator also write the start of a short, warm invitation from Miracle's founder: a subject and an opening line about something real you saw in their content. Plain words, no flattery clichés, no emojis, nothing you didn't see.
When you are done, reply with ONLY a JSON array and nothing else. Each item: {"name" (the name they go by, not a single letter), "handle" (Instagram, without @), "email" (exactly as published), "email_source" (the https:// page where you saw the email, not instagram.com), "website" (their own site or link page, or ""), "niche", "city", "followers" (a number, your best estimate), "why" (one line under 18 words about their content), "subject" (under 8 words, lower case like a note from a person), "opening" (one or two sentences, under 45 words, about their content)}.`;
  return {
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    output_config: { effort: 'medium' },
    system,
    tools: [
      { type: 'web_search_20260209', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'IN' } },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 12, max_content_tokens: FETCH_TOKENS },
    ],
    messages: [{ role: 'user', content: `Find ${count} creators who post about ${niche}.\nExclude (already known): ${known.slice(-300).join(', ') || 'none'}` }],
  } as unknown as Params;
}

/** One small step for the oldest open search, every minute while one is open (migrations 172-173). Waiting: ask
 * Claude how the batch is doing. Ended: read one niche's result per step, keeping only the creators it found (a niche
 * that paused part-way carries on in a new batch once all are read). Then check and queue those creators a few at a
 * time. No step does much: reading all six results, or checking about 60 creators' pages, in one call took more than
 * the server allows, and the call was cut off part-way. */
async function collect(db: Db, site: string) {
  if (!CLAUDE_KEY) return;
  const { data: open } = await db.from('growth_runs').select('id').eq('engine', 'claude').not('batch_id', 'is', null).is('finished_at', null).order('at').limit(1);
  const id = (open ?? [])[0]?.id as number | undefined;
  if (!id) return;
  // One step at a time: a step still going when the next minute's call comes (a slow page, a cold start) keeps it;
  // two at once would read or check the same things and write over each other's progress. The run is read from the
  // claim itself, so it's never older than the step that held it before.
  const now = new Date().toISOString();
  const { data: mine } = await db.from('growth_runs').update({ busy_until: new Date(Date.now() + 3 * 60e3).toISOString() }).eq('id', id).is('finished_at', null).or(`busy_until.is.null,busy_until.lt."${now}"`)
    .select('id, at, batch_id, request, cost_usd, asked, confirmed, added, found, results_read, reading, read_ids, next_requests, note');
  const run = (mine ?? [])[0] as Run | undefined;
  if (!run) return;
  const finish = (patch: Record<string, unknown>) => db.from('growth_runs').update({ ...patch, seconds: Math.round((Date.now() - Date.parse(run.at)) / 1000), finished_at: new Date().toISOString() }).eq('id', run.id);
  try {
    if (run.results_read) return await check(db, site, run, finish);
    const client = claude();
    const batch = await client.messages.batches.retrieve(run.batch_id!);
    const n = batch.request_counts;
    const total = n.processing + n.succeeded + n.errored + n.expired + n.canceled;
    if (batch.processing_status !== 'ended') {
      // What Claude says, kept on the run for the panel (and to tell a slow search from a stuck one).
      await db.from('growth_runs').update({ batch_status: batch.processing_status === 'canceling' ? 'being cancelled' : `Claude is still searching (${n.processing} of ${total} niches going)`, checked_at: now }).eq('id', run.id);
      // Batches finish within 24 hours; one still going after that is given up on.
      if (Date.now() - Date.parse(run.at) > 26 * 3600e3) await finish({ error: "Claude didn't finish within a day" });
      return;
    }
    const asked: Record<string, Params> = run.request && 'messages' in run.request ? { [`run-${run.id}`]: run.request as Params } : (run.request as Record<string, Params> | null) ?? {};
    const readIds = run.read_ids ?? [];
    const next = { ...(run.next_requests ?? {}) };
    // Every niche read: the paused ones carry on together in a new batch, or the creators found are checked.
    if (readIds.length >= total) {
      if (Object.keys(next).length) {
        const more = await client.messages.batches.create({ requests: Object.entries(next).map(([custom_id, params]) => ({ custom_id, params })) });
        await db.from('growth_runs').update({ batch_id: more.id, request: next, next_requests: {}, read_ids: [], reading: 0, batch_status: `Claude is still searching (${Object.keys(next).length} niches going)`, checked_at: now }).eq('id', run.id);
        return;
      }
      const found = run.found ?? [];
      if (!found.length) return void (await finish({ request: null, error: run.note || 'Claude found no creators with a public email this time' }));
      await db.from('growth_runs').update({ request: null, results_read: true, batch_status: `Checking ${found.length} creators' pages`, checked_at: now }).eq('id', run.id);
      return;
    }
    // A read that keeps failing ends the search with a reason.
    if (run.reading >= 5) return void (await finish({ error: "Claude finished, but its results couldn't be read" }));
    await db.from('growth_runs').update({ reading: run.reading + 1 }).eq('id', run.id);
    const r = await nextResult(client, batch.results_url ?? '', new Set(readIds), total);
    if (!r) return; // all read (the next step moves on)
    let note = run.note ?? '', spent = Number(run.cost_usd);
    const creators: Found[] = [];
    if (r.result.type !== 'succeeded') {
      note = r.result.type === 'errored' ? `Claude: ${(r.result.error as { error?: { message?: string } })?.error?.message ?? 'a search failed'}` : `Claude: a search was ${r.result.type}`;
    } else {
      const message = r.result.message;
      spent += cost(message.usage);
      const params = asked[r.custom_id];
      if (message.stop_reason === 'pause_turn' && params) {
        // Paused part-way: that niche carries on in the next batch (the pause_turn pattern).
        next[r.custom_id] = { ...params, messages: [...params.messages, { role: 'assistant', content: message.content }] } as Params;
      } else if (message.stop_reason === 'refusal') {
        note = 'Claude declined a search';
      } else {
        const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
        const kind = r.custom_id.startsWith('b') ? 'brand' : 'creator';
        creators.push(...parseCreators(text).map((c) => ({ ...c, kind }) as Found));
        if (!creators.length && text) note = `Claude found no ${kind === 'brand' ? 'brands' : 'creators'} with a public email this time: ${text.replace(/\s+/g, ' ').slice(0, 140)}`;
      }
    }
    const read = [...readIds, r.custom_id];
    await db.from('growth_runs').update({
      found: [...(run.found ?? []), ...creators], asked: (run.asked ?? 0) + creators.length, cost_usd: round(spent),
      read_ids: read, next_requests: next, note, reading: 0, checked_at: now,
      batch_status: `Reading Claude's results: ${read.length} of ${total} niches`,
    }).eq('id', run.id);
  } catch (e) {
    await finish({ error: claudeError(e) });
  } finally {
    await db.from('growth_runs').update({ busy_until: null }).eq('id', run.id);
  }
}

// Creators checked and queued per step: each one's page (and their own site) is opened to see the email there.
const CHECK_STEP = 8;

/** The next few creators of a search Claude has finished: checked, written and queued; the search ends with the last. */
async function check(db: Db, site: string, run: Run, finish: (patch: Record<string, unknown>) => PromiseLike<unknown>) {
  const found = run.found ?? [];
  const now = found.slice(0, CHECK_STEP), rest = found.slice(CHECK_STEP);
  const ctx = await context(db);
  if ('error' in ctx) return void (await finish({ error: ctx.error }));
  const out = now.length ? await queue(db, site, ctx, now, { writeWait: 20_000 }) : { added: 0, confirmed: 0, error: undefined };
  const totals = { confirmed: (run.confirmed ?? 0) + out.confirmed, added: (run.added ?? 0) + out.added };
  if (rest.length) {
    await db.from('growth_runs').update({ ...totals, found: rest, batch_status: `Checking creators' pages: ${rest.length} to go, ${totals.added} added so far` }).eq('id', run.id);
    return;
  }
  await finish({ ...totals, found: [], batch_status: 'done', error: totals.added ? '' : out.error ?? `${run.asked ?? 0} creators found, but none of their emails could be confirmed on a public page` });
}

/** The first result of a finished batch whose niche isn't read yet, or null when every one has been. Lines are split
 * on the raw bytes and only that one line is decoded and parsed: each niche's result is one very long line with every
 * page Claude read inside it, and the SDK's own reader (batches.results), which copies and rescans everything it has
 * for every chunk, took far longer than the server allows. A file that ends before every niche is in is an error, so
 * a cut-off read is tried again instead of being taken as the whole answer. */
async function nextResult(client: Anthropic, url: string, read: Set<string>, total: number): Promise<Anthropic.Messages.MessageBatchIndividualResponse | null> {
  if (!url) throw new Error('the batch has no results yet');
  const res = (await client.get(url, { headers: { Accept: 'application/binary' }, __binaryResponse: true })) as Response;
  const reader = res.body!.getReader();
  const text = new TextDecoder();
  let parts: Uint8Array[] = [], size = 0, lines = 0;
  // The line so far, as one piece; null when it's a niche already read.
  const line = () => {
    const all = new Uint8Array(size);
    let at = 0;
    for (const p of parts) (all.set(p, at), (at += p.length));
    parts = [];
    size = 0;
    if (!all.length) return null;
    lines++;
    const id = /"custom_id"\s*:\s*"([^"]+)"/.exec(text.decode(all.subarray(0, 300)))?.[1];
    return id && read.has(id) ? null : (JSON.parse(text.decode(all)) as Anthropic.Messages.MessageBatchIndividualResponse);
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        const last = line();
        if (last) return last;
        if (lines < total) throw new Error(`Claude's results were cut short (${lines} of ${total} niches)`);
        return null;
      }
      let from = 0, end: number;
      while ((end = value.indexOf(10, from)) >= 0) {
        parts.push(value.subarray(from, end));
        size += end - from;
        const got = line();
        if (got) return got;
        from = end + 1;
      }
      if (from < value.length) (parts.push(value.subarray(from)), (size += value.length - from));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** What one answer cost, at batch prices (web fetch costs only its tokens). */
function cost(usage: Anthropic.Messages.Usage) {
  const u = usage as { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null; server_tool_use?: { web_search_requests?: number } | null };
  return (u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)) * PRICE.input + u.output_tokens * PRICE.output + (u.server_tool_use?.web_search_requests ?? 0) * PRICE.search;
}
const round = (usd: number) => Math.round(usd * 100) / 100;

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
      contact: String(x.contact ?? '').trim().split(/\s+/)[0].slice(0, 40),
      handle: String(x.handle ?? '').replace(/^@+/, '').trim().toLowerCase().slice(0, 30),
      email: String(x.email ?? '').trim().toLowerCase().slice(0, 120),
      email_source: String(x.email_source ?? '').trim().slice(0, 300),
      website: String(x.website ?? '').trim().slice(0, 300),
      niche: String(x.niche ?? '').trim().slice(0, 60),
      city: String(x.city ?? '').trim().slice(0, 60),
      followers: Math.round(Number(x.followers) || 0) || null,
      why: String(x.why ?? '').trim().slice(0, 160),
      subject: String(x.subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
      opening: String(x.opening ?? '').trim().slice(0, 400),
    }))
    .filter((x) => x.name.length > 1 && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(x.email));
}

// ---------- after the search, the same for both: check each page, write each email, queue ----------
async function queue(db: Db, site: string, ctx: Ctx, creators: Found[], o: { want?: number; writeWait: number; dry?: boolean }): Promise<{ added: number; confirmed: number; error?: string; rows?: unknown[] }> {
  const { want = Infinity, writeWait, dry = false } = o;
  const { s, today, seenEmail, seenHandle } = ctx;
  const { seenSite } = ctx;
  const fresh = creators.filter((c) => {
    const brand = c.kind === 'brand';
    const site = brand ? siteOf(c.website) : '';
    const ok = !seenEmail.has(c.email) && !(c.handle && seenHandle.has(c.handle)) && !(site && seenSite.has(site)) && !BAD.test(c.email) && !(brand && BAD_BRAND.test(c.email));
    seenEmail.add(c.email);
    if (c.handle) seenHandle.add(c.handle);
    if (site) seenSite.add(site);
    return ok;
  });
  // The email must really be on the page given (or their own site): every page at once.
  const checked = await Promise.all(fresh.map(async (c) => ({ c, src: await seenOn(c) })));
  const found = checked.filter((x) => x.src).slice(0, want).map((x) => ({ ...x.c, email_source: x.src }));
  if (!found.length) return { added: 0, confirmed: 0, error: creators.length ? `${creators.length} creator${creators.length === 1 ? '' : 's'} found, but none of their emails could be confirmed on a public page` : undefined };
  // An email for each: Claude's own subject and opening when it wrote them, else the AI writes one (all at once), else
  // the standard email.
  const written = await Promise.all(found.map((c) => (c.subject && c.opening) || !writeWait || c.kind === 'brand' ? null :
    ai<{ subject: string; body: string }>(db, site, 'growthmail', { name: c.name, handle: c.handle, niche: c.niche, city: c.city, about_them: c.why, offer: s.offer }, writeWait)));
  const slots = sendTimes(found.length);
  const rows = found.map((c, k) => {
    const w = written[k] as { subject?: string; body?: string } | null;
    const brand = c.kind === 'brand';
    const word = c.name.split(' ')[0];
    // A brand: its marketing person by first name when the page names one, else the brand's team.
    const first = brand ? (c.contact && c.contact.length > 1 ? c.contact : `${c.name} team`) : word.length > 1 ? word : 'there';
    const pitch = brand
      ? `Miracle is where brands find Indian Instagram creators: their live Instagram numbers and rates up front, collab requests in one tap, and every post, deliverable and invoice tracked in one place. You pay creators directly; we never take a cut.${s.brand_offer ? `\n\n${s.brand_offer}` : ''}\n\nWould you like to try it?`
      : `Miracle is a free tool for creators: a brand page with your rates and live Instagram numbers, quotes brands accept online, invoices with a UPI QR, and reminders that chase late payments for you. Brands pay you directly; we never take a cut.${s.offer ? `\n\n${s.offer}` : ''}\n\nWould you like to try it?`;
    return {
      kind: brand ? 'brand' : 'creator',
      name: c.name, handle: c.handle, email: c.email, website: c.website, source_url: c.email_source, niche: c.niche, city: c.city, followers: brand ? null : c.followers, why: c.why,
      subject: (c.opening && c.subject) || w?.subject?.trim() || (brand ? `creators for ${c.name.toLowerCase()}` : `your brand deals, simpler`),
      body: (c.subject && c.opening ? `Hi ${first},\n\n${c.opening}\n\n${pitch}` : '') || w?.body?.trim() ||
        (brand ? `Hi ${first},\n\nI came across ${c.name}${c.niche ? `, and your ${c.niche.toLowerCase()} range` : ''}, and saw you work with Instagram creators.\n\n${pitch}` : `Hi ${first},\n\nI came across your ${c.niche || ''} content${c.city ? ` from ${c.city}` : ''} and loved it.\n\n${pitch}`),
      status: s.mode === 'auto' ? 'approved' : 'ready', found_on: today, send_after: slots[k],
    };
  });
  if (dry) return { added: 0, confirmed: found.length, rows };
  const { error } = await db.from('growth_leads').insert(rows);
  if (!error) return { added: rows.length, confirmed: found.length };
  if (error.code !== '23505') return { added: 0, confirmed: found.length, error: error.message };
  // Someone in this batch is already queued (their email is unique): the rest go in one by one.
  let added = 0;
  for (const row of rows) if (!(await db.from('growth_leads').insert(row)).error) added++;
  return { added, confirmed: found.length };
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
    const out = await queue(db, site, ctx, found, { want: ctx.want, writeWait: wait, dry });
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
// A brand's customer-service addresses: not the people who run creator collabs.
const BAD_BRAND = /^(care|customercare|customer\.?care|customer\.?support|cs|orders?|returns?|refunds?|complaints?|feedback|billing|accounts|finance|grievances?)@/i;
/** A website as its bare host (no scheme, www or path), to tell one brand's site from another. */
function siteOf(u: string) {
  return String(u ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');
}
/** An Instagram handle from a handle or a profile link. */
function igHandle(v: string) {
  return String(v ?? '').trim().toLowerCase().replace(/^.*instagram\.com\//, '').replace(/^@+/, '').replace(/[/?#].*$/, '');
}

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
    return (await r.text()).slice(0, 400_000);
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
