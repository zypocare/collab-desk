// The site's own small server on Cloudflare. It serves the app's files as before, and answers
// /api/ai/* with free AI: reading a DM or screenshot, drafting replies, captions, pitches, and the
// "Should I take it?" reading. Only the creator (signed in) can use it.
// Nothing here can cost money: Cloudflare's AI is counted by size and stops before its free daily
// amount (checked by the database); after that, Google Gemini's free key is the backup (a key with
// no billing attached, set as the GEMINI_API_KEY secret), with emails and phone numbers removed.

import { brandPage, qrScan } from './page';
import { directory } from './directory';
import { asText, search as helpSearch } from '../src/lib/help/articles';

type Env = {
	ASSETS: { fetch: (req: Request) => Promise<Response> };
	AI: {
		run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
		/** Cloudflare's document reader: PDFs (and images) to plain text. */
		toMarkdown?: (docs: { name: string; blob: Blob }[]) => Promise<{ name: string; data?: string; format?: string; error?: string }[]>;
	};
	SUPABASE_URL: string;
	SUPABASE_ANON_KEY?: string;
	GEMINI_API_KEY?: string;
};
/** One AI job: which service runs it, and how much Cloudflare AI it used (in neurons). */
type Run = { env: Env; gemini: boolean; neurons: number };

// Expected size of each job in Cloudflare neurons (reserved before, corrected after).
const COST: Record<string, number> = { dm: 160, reply: 110, caption: 110, pitch: 140, fit: 230, classify: 40, summary: 220, negotiate: 210, script: 330, nudge: 120, ask: 260, voice: 60, embed: 8, cheer: 60, reelcheck: 260, growplan: 200, checkup: 420, offercheck: 700, precheck: 220, getfound: 180, brandask: 450, brandbrief: 600, safety: 300, helpask: 200, casestudy: 400 };
// Cloudflare's price list in neurons per token (Llama 3.3 70B fast; Llama 3.2 11B vision).
const PER_TOKEN = { text: [0.0267, 0.2048], vision: [0.0045, 0.0615] };
const USED_UP = "Today's free AI is used up. It's back at 5:30 am.";

const TEXT = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const VISION = '@cf/meta/llama-3.2-11b-vision-instruct';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
	async fetch(req: Request, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
		const url = new URL(req.url);
		// The Miracle website (on Vercel) isn't a creator's address: pass it straight through.
		if (url.hostname === 'miracleapp.live' || url.hostname === 'www.miracleapp.live') return fetch(req);
		if (url.pathname.startsWith('/q/')) return qrScan(req, env, url);
		if (url.pathname === '/' && req.method === 'GET') return brandPage(req, env, url, ctx);
		// The public creator directory (the website shows it at www.miracleapp.live/creators).
		if ((url.pathname === '/creators' || url.pathname.startsWith('/creators/')) && req.method === 'GET') return directory(req, env, url, ctx);
		if (!url.pathname.startsWith('/api/ai/')) return env.ASSETS.fetch(req);
		if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
		try {
			const kind = url.pathname.slice('/api/ai/'.length);
			if (kind === 'status') return json(await status(req, env));
			if (!['dm', 'reply', 'caption', 'pitch', 'classify', 'fit', 'summary', 'negotiate', 'script', 'nudge', 'ask', 'voice', 'embed', 'cheer', 'scout', 'reelcheck', 'growplan', 'checkup', 'offercheck', 'precheck', 'getfound', 'brandask', 'brandbrief', 'safety', 'helpask', 'compwatch', 'casestudy'].includes(kind)) return json({ error: 'Unknown.' }, 404);
			const body = (await req.json()) as Record<string, unknown>;
			const job = (x: Run) =>
				kind === 'cheer' ? cheer(x, body) : kind === 'scout' ? scout(x, body) : kind === 'dm' ? readDm(x, body) : kind === 'reply' ? replies(x, body) : kind === 'pitch' ? pitch(x, body) : kind === 'classify' ? classify(x, body) : kind === 'fit' ? fit(x, body) : kind === 'summary' ? summary(x, body) : kind === 'negotiate' ? creatorOf(req, env).then((me) => negotiate(x, body, me)) : kind === 'script' ? script(x, body) : kind === 'nudge' ? nudge(x, body) : kind === 'ask' ? creatorOf(req, env).then((me) => ask(x, body, me)) : kind === 'voice' ? voice(x, body) : kind === 'embed' ? embed(x, body) : kind === 'reelcheck' ? reelCheck(x, body) : kind === 'growplan' ? growPlan(x, body) : kind === 'checkup' ? checkup(x, body) : kind === 'safety' ? safety(x, body) : kind === 'helpask' ? helpAsk(x, body) : kind === 'compwatch' ? compWatch(x, body) : kind === 'casestudy' ? caseStudy(x, body) : kind === 'offercheck' ? offerCheck(x, body) : kind === 'precheck' ? preCheck(x, body) : kind === 'getfound' ? getFound(x, body) : kind === 'brandask' ? brandAsk(x, body) : kind === 'brandbrief' ? brandBrief(x, body) : creatorOf(req, env).then((me) => caption(x, body, me));

			// Checking an incoming Instagram DM comes from the DM webhook with a single-use pass, and the
			// hourly fun nudge from its job the same way. DMs stay on Cloudflare (never sent to Google);
			// the fun nudges are written by Gemini first (wittier), Cloudflare if Gemini can't.
			// The daily pitch finder comes the same way for finding brands (Gemini with Google Search) and
			// writing their pitches (Gemini first).
			if (kind === 'classify' || kind === 'cheer' || kind === 'scout' || kind === 'compwatch' || ((kind === 'pitch' || kind === 'checkup' || kind === 'safety') && req.headers.get('x-ai-ticket'))) {
				const allowed = await takeTicket(req, env, kind);
				if (allowed !== true) return json({ error: allowed }, 403);
				let why = env.GEMINI_API_KEY ? '' : 'no Gemini key';
				if ((kind === 'cheer' || kind === 'scout' || kind === 'compwatch') && env.GEMINI_API_KEY) {
					try {
						return json({ ...(await job({ env, gemini: true, neurons: 0 })), by: 'gemini' });
					} catch (e) {
						// Which key Cloudflare holds, by its last four characters and length only (as AI Studio shows it).
						const k = (env.GEMINI_API_KEY ?? '').trim().replace(/^["']+|["']+$/g, '');
						why = `${String((e as Error)?.message ?? e).slice(0, kind === 'scout' ? 1200 : 140)} (key …${k.slice(-4)}, ${k.length} characters)`;
						// Finding brands only works with Gemini (it searches Google): say what went wrong.
					}
				}
				// Pitches: Cloudflare first (Gemini's small free allowance stays for the nudges and the brand search).
				if (kind === 'pitch' && env.GEMINI_API_KEY) {
					try {
						return json({ ...(await job({ env, gemini: false, neurons: 0 })), by: 'cloudflare' });
					} catch {
						return json({ ...(await job({ env, gemini: true, neurons: 0 })), by: 'gemini' });
					}
				}
				return json({ ...(await job({ env, gemini: false, neurons: 0 })), ...(kind === 'cheer' || kind === 'scout' ? { by: 'cloudflare', why } : {}) });
			}

			// The help centre's AI: nothing to read means nothing to ask (and no AI used).
			if (kind === 'helpask' && !helpSearch(String(body.q ?? ''), body.side === 'brand' ? 'brand' : 'creator', 4).length) return json({ answer: '', sources: [], confident: false });

			// Brands have their own, smaller daily share (per team), then the same free Gemini backup.
			// (Help questions from a creator fall through to hers.)
			const brandHelp = kind === 'helpask' && body.side === 'brand';
			if (kind === 'brandask' || kind === 'brandbrief' || brandHelp) {
				// A link we won't open is turned away before it uses any of today's share.
				if (kind === 'brandbrief') publicUrl(String(body.url ?? ''));
				const t = await rpc(req, env, 'ai_take_brand', { p_kind: kind, p_cost: COST[kind] });
				if (!t || t.reason === 'not_brand') return json({ error: 'Sign in with your brand account to use AI.' }, 403);
				if (t.ok) {
					try {
						return json(await job({ env, gemini: false, neurons: 0 }));
					} catch (e) {
						if (!/neuron|allocation|4006|quota|limit/i.test(String((e as Error)?.message))) throw e;
					}
				}
				if (!env.GEMINI_API_KEY || !(await rpc(req, env, 'ai_take_brand_gemini', { p_kind: kind }))?.ok) return json({ error: USED_UP }, 429);
				return json(await job({ env, gemini: true, neurons: 0 }));
			}

			// The same reading asked again is answered from the cache (two weeks), at no cost.
			const cacheable = CACHED.includes(kind) && !(kind === 'embed' && (body.texts as unknown[] | undefined)?.length !== 1);
			const key = cacheable ? await sha(kind + JSON.stringify(body)) : '';
			if (key) {
				const hit = await rpc(req, env, 'ai_cache_get', { p_key: key });
				if (hit && typeof hit === 'object' && Object.keys(hit).length) return json(hit);
			}
			const done = async (res: unknown) => {
				if (key) await rpc(req, env, 'ai_cache_put', { p_key: key, p_kind: kind, p_result: res });
				return json(res);
			};

			const est = (COST[kind] ?? 150) + (kind === 'dm' && String(body.image ?? '') ? 100 : 0);
			const t = await take(req, env, kind, est);
			if (t === 'auth') return json({ error: 'Sign in again to use AI.' }, 403);
			if (t === 'ok') {
				const x: Run = { env, gemini: false, neurons: 0 };
				try {
					const res = await job(x);
					await settle(req, env, kind, Math.round(x.neurons) - est);
					return done(res);
				} catch (e) {
					// Cloudflare says its free amount is gone (counted differently from ours): use the backup.
					if (!/neuron|allocation|4006|quota|limit/i.test(String((e as Error)?.message))) throw e;
					await settle(req, env, kind, 9000);
				}
			}
			// Cloudflare's free amount is used up today: the free Gemini backup, if it's set up.
			if (!env.GEMINI_API_KEY || !(await takeGemini(req, env, kind))) return json({ error: USED_UP }, 429);
			return done(await job({ env, gemini: true, neurons: 0 }));
		} catch (e) {
			const m = String((e as Error)?.message ?? e);
			if (m === 'USED_UP') return json({ error: USED_UP }, 429);
			// Something broke on our side (not a message meant for the person): the admin panel hears about it.
			if (!m.startsWith('!')) ctx.waitUntil(reportProblem(env, `ai/${url.pathname.slice('/api/ai/'.length)}: ${m}`, url.pathname, String((e as Error)?.stack ?? '')));
			return json({ error: m.startsWith('!') ? m.slice(1) : `The AI couldn't answer just now (${m.slice(0, 160)}). Try again in a minute.` }, 502);
		}
	}
};

/** Adds a crash to the admin panel's Problems tab (never throws). */
async function reportProblem(env: Env, message: string, place: string, stack: string) {
	if (!env.SUPABASE_ANON_KEY) return;
	await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/problem_report`, {
		method: 'POST',
		headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, 'content-type': 'application/json' },
		body: JSON.stringify({ p: { source: 'server', message: message.slice(0, 300), place, stack: stack.slice(0, 4000) } })
	}).catch(() => null);
}

// Readings that give the same answer for the same input (kept two weeks).
const CACHED = ['dm', 'summary', 'fit', 'embed', 'helpask'];
async function sha(text: string) {
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Ask the database (as the signed-in creator). */
async function rpc(req: Request, env: Env, fn: string, args: Record<string, unknown>) {
	const auth = req.headers.get('authorization') ?? '';
	const apikey = req.headers.get('apikey') ?? '';
	if (!auth.startsWith('Bearer ') || !apikey) return null;
	const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
		method: 'POST',
		headers: { authorization: auth, apikey, 'content-type': 'application/json' },
		body: JSON.stringify(args)
	}).catch(() => null);
	return r?.ok ? ((await r.json().catch(() => null)) as Record<string, unknown> | null) : null;
}
/** Signed in as the creator, and room left in Cloudflare's free amount today? */
async function take(req: Request, env: Env, kind: string, cost: number): Promise<'ok' | 'budget' | 'auth'> {
	const res = await rpc(req, env, 'ai_take2', { p_kind: kind, p_cost: cost });
	return res?.ok ? 'ok' : res?.reason === 'budget' ? 'budget' : 'auth';
}
/** Correct the reserved size to what the job really used. */
async function settle(req: Request, env: Env, kind: string, delta: number) {
	if (delta) await rpc(req, env, 'ai_settle', { p_kind: kind, p_delta: delta });
}
async function takeGemini(req: Request, env: Env, kind: string) {
	return !!(await rpc(req, env, 'ai_take_gemini', { p_kind: kind }))?.ok;
}
/** What's left today, for the app. */
async function status(req: Request, env: Env) {
	const left = await rpc(req, env, 'ai_left', {});
	if (!left) return { error: 'Sign in again to use AI.' };
	return { ...left, gemini: !!env.GEMINI_API_KEY };
}

/** A single-use pass made by the DM webhook (checked and spent by the database). */
async function takeTicket(req: Request, env: Env, want: string): Promise<true | string> {
	const ticket = req.headers.get('x-ai-ticket') ?? '';
	const apikey = req.headers.get('apikey') ?? '';
	if (!ticket || !apikey) return 'Not allowed.';
	const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/ai_take_ticket`, {
		method: 'POST',
		headers: { apikey, authorization: `Bearer ${apikey}`, 'content-type': 'application/json' },
		body: JSON.stringify({ p_ticket: ticket })
	});
	if (!r.ok) return 'Not allowed.';
	const j = (await r.json()) as { ok: boolean; kind?: string };
	return j.ok && (j.kind ?? 'classify') === want ? true : 'Not allowed.';
}

/** Text out of whatever the model returned. */
// (When the answer is JSON, Cloudflare may hand it back already parsed, as an object.)
const out = (r: unknown) => {
	const v = (r as { response?: unknown })?.response ?? r;
	return (typeof v === 'string' ? v : v && typeof v === 'object' ? JSON.stringify(v) : '').trim();
};
/** The first JSON object in a reply (models sometimes wrap it in words or code fences). */
function firstJson(s: string) {
	const a = s.indexOf('{'), b = s.lastIndexOf('}');
	if (a < 0 || b <= a) return null;
	const raw = s.slice(a, b + 1);
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		// Models often put real line breaks or tabs inside the text of a field: escape those and try again.
		let out = '', inStr = false, esc = false;
		for (const ch of raw) {
			if (inStr && !esc && (ch === '\n' || ch === '\r' || ch === '\t')) out += ch === '\n' ? '\\n' : ch === '\t' ? '\\t' : '';
			else out += ch;
			if (esc) esc = false;
			else if (ch === '\\') esc = true;
			else if (ch === '"') inStr = !inStr;
		}
		try {
			return JSON.parse(out) as Record<string, unknown>;
		} catch {
			return null;
		}
	}
}
type Usage = { usage?: { prompt_tokens?: number; completion_tokens?: number } };
/** Count what a Cloudflare model used (it reports tokens; if not, about 4 characters a token). */
function meter(x: Run, r: unknown, model: 'text' | 'vision', input: string, extraIn = 0) {
	const u = (r as Usage)?.usage;
	const tin = u?.prompt_tokens ?? input.length / 4 + extraIn;
	const tout = u?.completion_tokens ?? out(r).length / 4;
	x.neurons += tin * PER_TOKEN[model][0] + tout * PER_TOKEN[model][1];
}
async function chat(x: Run, system: string, user: string, max = 700, temperature = 0.3) {
	if (x.gemini) return gemini(x.env, system, private_(user), max, temperature);
	const r = await x.env.AI.run(TEXT, { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: max, temperature });
	meter(x, r, 'text', system + user);
	return out(r);
}
/** How she writes (a few of her own sent messages, names and amounts removed) and the tone asked for. */
function voiceOf(b: Record<string, unknown>) {
	const ex = (Array.isArray(b.style) ? b.style : []).map((t) => String(t ?? '').slice(0, 300)).filter(Boolean).slice(0, 12);
	const formal = b.formal === true;
	return (
		(ex.length ? ` Write the way she writes: match her greetings, warmth, length and emoji habits from these messages she sent before (copy the style, not the content):\n${ex.map((t) => `- ${t}`).join('\n')}\n` : '') +
		(formal ? ' This one is for a big brand or agency: keep her voice but make it polished and formal, no emojis.' : '')
	);
}
/** Who the signed-in creator is, from her own settings (the database shows each person only the
 *  creator they work for). Asked once per request; empty when there is no signed-in creator. */
type Creator = { display_name?: string; handle?: string; niche?: string; city?: string; content_languages?: string[] };
const creators = new WeakMap<Request, Promise<Creator>>();
function creatorOf(req: Request, env: Env): Promise<Creator> {
	let p = creators.get(req);
	if (!p) {
		p = (async () => {
			const auth = req.headers.get('authorization') ?? '';
			const apikey = req.headers.get('apikey') ?? '';
			if (!auth.startsWith('Bearer ') || !apikey) return {};
			const r = await fetch(`${env.SUPABASE_URL}/rest/v1/creator_settings?select=display_name,handle,niche,city,content_languages&limit=1`, { headers: { authorization: auth, apikey } }).catch(() => null);
			const rows = r?.ok ? ((await r.json().catch(() => null)) as Creator[] | null) : null;
			return rows?.[0] ?? {};
		})();
		creators.set(req, p);
	}
	return p;
}
/** What she makes content about, from her niche ("lifestyle, travel, fashion"), or ''. */
const nicheOf = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120);
/** "lifestyle, travel, fashion; Bengaluru": her niche and city, or '' when neither is known. */
const aboutOf = (niche: unknown, city: unknown) => [nicheOf(niche), String(city ?? '').trim().slice(0, 60)].filter(Boolean).join('; ');
/** "English, Hinglish, Hindi or Kannada": the languages to expect, with the ones she creates in. */
function tongues(langs: unknown) {
	const own = (Array.isArray(langs) ? langs : []).map((l) => String(l ?? '').trim().slice(0, 20)).filter((l) => l && !['English', 'Hinglish', 'Hindi'].includes(l)).slice(0, 4);
	return ['English', 'Hinglish', 'Hindi', ...own];
}
const orList = (a: string[]) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} or ${a[a.length - 1]}` : (a[0] ?? ''));

/** Emails and phone numbers stay out of what goes to Google (the app reads those itself). */
const private_ = (t: string) => t.replace(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, '[email]').replace(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, '[phone]').replace(/\+?\d[\d\s-]{8,}\d/g, (m) => (m.replace(/\D/g, '').length >= 10 ? '[phone]' : m));

/** Google Gemini's free tier (a key with no billing attached, so it can't charge). */
async function gemini(env: Env, system: string, user: string, max: number, temperature = 0.3, search = false) {
	// Web search on the free tier works on some models only: try those, and on "too many" try the next.
	let lastErr = '';
	for (const model of search ? ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'] : ['gemini-flash-latest', 'gemini-2.5-flash']) {
		for (const thinking of [true, false]) {
			const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
				method: 'POST',
				// Pasted keys often carry a space, a line break or quote marks: send the key alone.
				headers: { 'content-type': 'application/json', 'x-goog-api-key': (env.GEMINI_API_KEY ?? '').trim().replace(/^["']+|["']+$/g, '') },
				body: JSON.stringify({
					systemInstruction: { parts: [{ text: system }] },
					contents: [{ role: 'user', parts: [{ text: user }] }],
					// Looking things up on the web: Google Search inside Gemini (JSON mode can't be used with it).
					...(search ? { tools: [{ google_search: {} }] } : {}),
					// Jobs that ask for JSON get Gemini's JSON mode, so the reply is never loose prose.
					generationConfig: { temperature, maxOutputTokens: max, ...(!search && /Return ONLY JSON/.test(system) ? { responseMimeType: 'application/json' } : {}), ...(thinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) }
				})
			});
			const j = (await r.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
			if (r.status === 429) {
				if (!search) throw new Error('USED_UP');
				lastErr += `${lastErr ? ' | ' : ''}${model}: ${(j.error?.message ?? 'too many requests').replace(/\s+/g, ' ').slice(0, 230)}`;
				break;
			}
			if (r.status === 404) {
				if (search) lastErr += `${lastErr ? ' | ' : ''}${model}: not available`;
				break; // try the next model name
			}
			if (r.status === 400 && thinking && /think/i.test(j.error?.message ?? '')) continue; // a model without that setting
			if (!r.ok) throw new Error(j.error?.message ?? `Gemini ${r.status}`);
			return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
		}
	}
	throw new Error(lastErr || 'Gemini model not found');
}

// ---------- 1. A DM (text or screenshot) into collab details ----------
/** Meaning fingerprints (bge-m3, 1024 numbers; English, Hindi, Hinglish) for "search by meaning". */
async function embed(x: Run, b: Record<string, unknown>) {
	if (x.gemini) throw new Error("!Search by meaning rests until 5:30 am: today's free AI is used up.");
	const texts = (Array.isArray(b.texts) ? b.texts : []).map((t) => String(t ?? '').slice(0, 2000)).filter(Boolean).slice(0, 32);
	if (!texts.length) return { vectors: [] };
	const r = (await x.env.AI.run('@cf/baai/bge-m3', { text: texts })) as { data?: number[][] };
	// About 1,075 neurons per million tokens (a token is about 4 characters).
	x.neurons += 1 + (texts.join(' ').length / 4) * 0.001075;
	return { vectors: (r.data ?? []).map((v) => v.map((n) => Math.round(n * 1e5) / 1e5)) };
}

/** Speech to text for browsers without their own (Whisper on Cloudflare; English, Hindi, Hinglish, Kannada). */
async function voice(x: Run, b: Record<string, unknown>) {
	if (x.gemini) throw new Error('!Voice typing is used up for today. Type it instead.');
	const audio = String(b.audio ?? '');
	if (!audio) throw new Error('!Nothing was recorded.');
	if (audio.length > 2_400_000) throw new Error('!That recording is too long. Keep it under a minute.');
	const r = (await x.env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio, task: 'transcribe', vad_filter: true })) as { text?: string; transcription_info?: { duration?: number } };
	// About 47 neurons per minute of audio.
	x.neurons += Math.max(5, ((r.transcription_info?.duration ?? 30) / 60) * 47);
	return { text: String(r.text ?? '').trim() };
}

async function readDm(x: Run, b: Record<string, unknown>) {
	let text = String(b.text ?? '').slice(0, 6000);
	const image = String(b.image ?? '');
	if (image.startsWith('data:image/')) {
		if (x.gemini) throw new Error("!Reading screenshots is used up for today. Paste the message text instead; it's back at 5:30 am.");
		const env = x.env;
		const bytes = [...Uint8Array.from(atob(image.split(',')[1] ?? ''), (c) => c.charCodeAt(0))];
		const ask = {
			messages: [
				{ role: 'system', content: 'You read screenshots of Instagram, WhatsApp and email conversations. Write out every message exactly as shown, oldest first, one per line, as "Sender: message". Include names, handles, numbers, prices, dates and emails exactly. No comments.' },
				{ role: 'user', content: 'Transcribe this conversation.' }
			],
			image: bytes,
			max_tokens: 900
		};
		let r: unknown;
		try {
			r = await env.AI.run(VISION, ask);
		} catch (e) {
			// The model asks for its licence to be accepted once (Meta's terms), then works.
			if (/agree|licen/i.test(String((e as Error)?.message))) {
				await env.AI.run(VISION, { prompt: 'agree', max_tokens: 5 });
				r = await env.AI.run(VISION, ask);
			} else throw e;
		}
		meter(x, r, 'vision', '', 1600);
		text = `${out(r)}\n${text}`.trim();
	}
	if (!text) return { error: 'Nothing to read.' };
	const today = new Date().toISOString().slice(0, 10);
	const reply = await chat(
		x,
		`You help an Indian Instagram creator log brand collaboration requests. Today is ${today}. From the conversation, return ONLY a JSON object:
{"brand": "brand name", "instagram": "brand handle without @", "contact": "person's name", "email": "", "phone": "",
 "type": "paid" | "hybrid" | "barter" | null, "fee": number in rupees (0 if not said),
 "product": "what they send, if anything", "product_value": number in rupees,
 "deliverables": [{"kind": "Reel" | "Story" | "Static post" | "Carousel" | "UGC video" | "Shoot", "qty": number}],
 "preferred_live": "YYYY-MM-DD" or "", "usage": "Organic only" | "Paid usage 30 days" | "Paid usage 90 days" | "",
 "summary": "one sentence: what the brand wants"}
Rules: "hybrid" = money plus product; "barter" = product only (vouchers, gift cards, a free stay or meal count as product). "product" is only what the CREATOR RECEIVES; never something the brand asks her to send (screenshots, insights, contact details, rates). A "video" for Instagram means a Reel. Mention store visits or events in the summary. "30k" = 30000, "1.5L" = 150000. The creator's own handle is ${String(b.handle ?? '')}; never use it as the brand. Leave fields empty when not mentioned. Use only facts in the text.`,
		text,
		600
	);
	const j = firstJson(reply) ?? {};
	return { transcript: image ? text : '', fields: j };
}

// ---------- 2. Reply drafts for a brand chat ----------
async function replies(x: Run, b: Record<string, unknown>) {
	const thread = (Array.isArray(b.thread) ? b.thread : []).slice(-12) as { from: string; text: string }[];
	const ctx = b.context as Record<string, unknown> | undefined;
	const ig = ctx?.channel === 'instagram';
	if (ig && x.gemini) throw new Error("!Today's free AI is used up. It's back at 5:30 am.");
	const reply = await chat(
		x,
		`${ig ? 'You draft short Instagram DM replies for an Indian Instagram creator. The other person may be a brand, an agency or a follower: answer what they actually asked, in her voice. For brands, be warm and professional and move towards the details (deliverables, budget, dates); never quote a price unless it is in the facts.' : 'You draft short replies for an Indian Instagram creator answering a brand about a paid collaboration.'} Warm, professional, plain English, no emojis overload (one at most), 1 to 3 sentences each. Never invent prices, dates or promises that aren't in the facts.${voiceOf(b)} Facts: ${JSON.stringify(ctx ?? {})}.
Return ONLY JSON: {"replies": ["...", "...", "..."]} with three different options (e.g. agree, ask a question, propose next step).`,
		thread.map((m) => `${m.from === 'creator' ? 'Creator' : 'Brand'}: ${String(m.text).slice(0, 800)}`).join('\n') || 'No messages yet. Write a friendly first message.',
		500
	);
	const j = firstJson(reply);
	const list = Array.isArray(j?.replies) ? (j!.replies as unknown[]).map(String).filter(Boolean).slice(0, 3) : [];
	return { replies: list };
}

// ---------- 3. A caption (and shot list) from the brief ----------
async function caption(x: Run, b: Record<string, unknown>, me: Creator) {
	const niche = nicheOf(me.niche);
	const reply = await chat(
		x,
		`You write Instagram captions for an Indian Instagram creator's brand collaborations${niche ? ` (she makes ${niche} content)` : ''}. The caption must sound like her (first person, natural, not salesy), start with a hook line, include the brand's key message and required tags/hashtags from the brief, mention the promo code if given, and start with "#ad" or include "#ad" as Indian ASCI rules require. Keep it under 120 words. Also give a short shot list for the Reel.
Return ONLY JSON: {"caption": "...", "hashtags": ["#..."], "shots": ["...", "..."]}`,
		JSON.stringify(b).slice(0, 4000),
		700
	);
	const j = firstJson(reply) ?? {};
	return {
		caption: String(j.caption ?? '').trim(),
		hashtags: Array.isArray(j.hashtags) ? (j.hashtags as unknown[]).map(String).slice(0, 15) : [],
		shots: Array.isArray(j.shots) ? (j.shots as unknown[]).map(String).slice(0, 8) : []
	};
}

// ---------- 4. A first pitch email to a brand she'd like to work with ----------
async function pitch(x: Run, b: Record<string, unknown>) {
	const reply = await chat(
		x,
		`You write short pitch emails for an Indian Instagram creator to a brand she would like to collaborate with. Personal, specific to the brand, confident, not pushy. 90 to 140 words. Mention one concrete content idea for the brand, her audience fit (only facts given), and end with an easy next step and her page link. No made-up numbers. Sign with her name.
Return ONLY JSON: {"subject": "...", "body": "..."} (body is plain text with blank lines between paragraphs).`,
		JSON.stringify(b).slice(0, 3000),
		// Room for newer Gemini models that think before answering.
		1600
	);
	const j = firstJson(reply) ?? {};
	const subject = String(j.subject ?? '').trim(), text = String(j.body ?? '').trim();
	// An empty or cut-off answer counts as no answer (the server's run then tries the other AI).
	if (!subject || text.length < 60) throw new Error(`No clear answer from the AI: ${reply.replace(/\s+/g, ' ').slice(0, 160)}`);
	return { subject, body: text };
}

// ---------- 5. Does an Instagram DM look like a brand collaboration? ----------
// The DM webhook sends her niche, city and languages with the chat (it comes with a pass, not her sign-in).
async function classify(x: Run, b: Record<string, unknown>) {
	const about = aboutOf(b.niche, b.city);
	const reply = await chat(
		x,
		`You screen Instagram DMs for an Indian Instagram creator${about ? ` (${about})` : ''}. You get the chat so far ("Them:" is the sender, "Her:" is the creator); judge what THEM wants. Messages may be in ${tongues(b.languages).join(', ')} or other Indian languages.
"likely": a business wants her to make content for them, in any form: paid Reel/Story/post/video, UGC, barter or gifted product for a review, a free stay/meal/evening/event invite in exchange for content, an event appearance, ambassador or affiliate deal, or asking her rates/charges/commercials/media kit for content. No brand name is needed: "would you do a paid Reel? budget 30k" and "aapka 1 reel ka rate kya hai" are likely.
"maybe": business interest without an offer yet: "do you do collabs?", "who manages your collaborations?", "can I get your email for a business inquiry", "we're a new label, would love to connect", "we might have something for you".
"no": fans and compliments (even about her past collabs or asking what brands pay her), friends and family, people asking HER to promote THEM or to buy/pay for anything, people selling her services (photography, editing, followers, verification), customers asking about her classes or sessions, giveaways, follow-for-follow, crypto/job/investment scams, phishing.
Set "kind" to one of: paid, barter, experience, event, ugc, affiliate, inquiry, scam, spam, fan, personal, service, other. Scam = she must pay a fee/shipping/registration, buy first, or share logins/bank details, even if it says "collab" or "ambassador".
Return ONLY JSON: {"collab": "likely" | "maybe" | "no", "kind": "...", "brand": "brand or business name, or ''", "summary": "under 12 English words, e.g. 'Sunveda: paid Reel + 2 stories for SPF launch, ~₹40k'"}`,
		String(b.text ?? '').slice(-3000),
		160
	);
	const j = firstJson(reply) ?? {};
	const c = String(j.collab ?? '');
	if (!['likely', 'maybe', 'no'].includes(c)) throw new Error('No clear answer from the AI.');
	return { collab: c, kind: String(j.kind ?? '').toLowerCase(), brand: String(j.brand ?? ''), summary: String(j.summary ?? '').slice(0, 120), ...(b.debug ? { raw: reply.slice(0, 400) } : {}) };
}

// ---------- 5b. Negotiation: three replies when a brand pushes back on price ----------
// The numbers (their offer, her ask, her walk-away point) are worked out in the app; the AI writes the
// words and may only use those numbers. Any option below her walk-away point is dropped here.
async function negotiate(x: Run, b: Record<string, unknown>, me: Creator) {
	const num = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
	const offer = num(b.offer), ask = num(b.ask), floor = num(b.floor);
	const thread = (Array.isArray(b.thread) ? b.thread : []).slice(-10) as { from: string; text: string }[];
	const reply = await chat(
		x,
		`You are a seasoned talent manager negotiating brand deals for an Indian Instagram creator. Write replies in her voice (first person), warm and confident, never apologetic or desperate, 2 to 4 short sentences, no more than one emoji. Reply in the language the brand used (${orList(tongues(me.content_languages))}), keeping amounts as ₹ figures.
Numbers you may use, and no others: their offer ₹${offer || 'not stated'}, her ask ₹${ask}, her walk-away point ₹${floor} (never go below it, and never mention it). Facts: ${JSON.stringify(b.facts ?? {})}. Her audience: ${JSON.stringify(b.stats ?? {})}. History with this brand: ${JSON.stringify(b.history ?? {})}.
Good tactics: anchor on value (audience, engagement, what the deliverables include, usage rights), keep the door open, trade instead of discounting (fewer deliverables, a Story instead of a second Reel, shorter usage rights, no exclusivity, no paid-ads/whitelisting rights, 50% advance, a longer timeline, a long-term package), and ask a question that moves the deal forward.
Give exactly three options:
1. "hold": keep her ask (₹${ask}) and justify it.
2. "middle": one fair number between their offer and her ask, never below ₹${floor}.
3. "trade": accept a price at or near their offer ONLY by changing what they get, and say exactly what changes; never below ₹${floor}.
Return ONLY JSON: {"read": "one line on where the brand stands", "options": [{"key": "hold" | "middle" | "trade", "label": "2-4 words", "amount": number, "changes": "what changes, or ''", "text": "the reply"}], "tip": "one short negotiating tip for her"}`,
		thread.map((m) => `${m.from === 'creator' ? 'Her' : 'Brand'}: ${String(m.text).slice(0, 700)}`).join('\n') || `Brand: ${String(b.said ?? 'Can you do it for less?')}`,
		900
	);
	const j = firstJson(reply) ?? {};
	const options = (Array.isArray(j.options) ? (j.options as Record<string, unknown>[]) : [])
		.map((o) => ({ key: String(o.key ?? ''), label: String(o.label ?? '').slice(0, 40), amount: num(o.amount), changes: String(o.changes ?? '').slice(0, 200), text: String(o.text ?? '').trim() }))
		.filter((o) => o.text && (!floor || !o.amount || o.amount >= floor))
		.slice(0, 3);
	if (!options.length) throw new Error('No clear answer from the AI.');
	return { read: String(j.read ?? '').slice(0, 200), options, tip: String(j.tip ?? '').slice(0, 200) };
}

// ---------- 5b2. A gentle nudge when a brand has gone quiet ----------
async function nudge(x: Run, b: Record<string, unknown>) {
	const tries = Math.max(0, Math.round(Number(b.tries) || 0));
	const tone =
		tries === 0
			? 'friendly and light, like checking in with someone you like working with'
			: tries === 1
				? 'polite and clear, a little more direct than a first check-in'
				: 'firm and direct but still professional and warm, stating plainly what is needed and by when';
	const thread = (Array.isArray(b.thread) ? b.thread : []).slice(-6) as { from: string; text: string }[];
	const reply = await chat(
		x,
		`You write short follow-up messages from an Indian Instagram creator to a brand she is working with. Situation: ${String(b.why ?? '')} (kind: ${String(b.kind ?? '')}; ${tries} earlier nudge${tries === 1 ? '' : 's'}). Tone: ${tone}. Write in her voice (first person), 2 to 4 sentences, at most one emoji (none if firm). Mention the specifics from the facts (the content, the quote, the draft round, the invoice number and amount, the link if given) and end with one clear next step or question. Never invent amounts, dates or promises not in the facts. Use the language the brand last wrote in (default English).${voiceOf(b)} Facts: ${JSON.stringify(b.facts ?? {})}.
Return ONLY JSON: {"text": "the message"}`,
		thread.map((m) => `${m.from === 'creator' ? 'Her' : 'Brand'}: ${String(m.text).slice(0, 500)}`).join('\n') || 'No messages yet.',
		400
	);
	const text = String(firstJson(reply)?.text ?? '').trim();
	if (!text) throw new Error('No clear answer from the AI.');
	return { text };
}

// ---------- 5a. Finding brands to pitch (Gemini with Google Search) ----------
// Real brands that suit her and already work with creators, with their official website. The
// daily finder then checks each website itself for a public email before anything is written.
async function scout(x: Run, b: Record<string, unknown>) {
	const n = Math.min(x.gemini ? 20 : 14, Math.max(1, Math.round(Number(b.count) || 12)));
	const skip = (Array.isArray(b.exclude) ? b.exclude : []).map((t) => String(t ?? '').slice(0, 60)).filter(Boolean).slice(0, 200);
	// Gemini with Google Search when the key includes it, Gemini from what it knows if not, and
	// Cloudflare's AI when Gemini is out for the day. Either way the daily finder keeps only brands
	// whose own website loads and shows a public email.
	const system = (search: boolean) => `You find brands for an Indian Instagram creator to pitch for paid collaborations. ${search ? 'Use Google Search.' : 'Use what you know well; only brands you are sure exist and are still trading.'} Find ${n} real, currently active brands or businesses that:
- fit her content and audience (details below), and sell in India (D2C brands, Indian labels, and businesses in or near her city: cafes, restaurants, studios, stays, experiences);
- already work with Instagram creators (influencer campaigns, ambassador or creator programmes, gifting, paid partnerships), ideally recently;
- are a realistic fit for her size (skip global giants that only work through big agencies).
- are a brand or business in their own right: no marketplaces or stores that sell other brands (Myntra, Amazon, Flipkart, Nykaa, Ajio, Tata Cliq), and nothing unrelated to her content (no B2B, real estate, senior living, finance);
- ideally publish a contact or collaborations email on their own website.
Never include any brand in the exclude list, and no duplicates. ${search ? 'Only brands you found in search results with an official website you saw' : 'Only brands whose official website domain you are sure of'}; never invent a brand, a website or a handle. Vary the picks: mix well-known names with smaller, newer Indian labels and local businesses.
For each give: "name", "website" (the official site, https://...), "instagram" (handle without @, or ""), "category" (one of: Beauty, Fashion, Food & drink, Travel, Fitness, Wellness, Tech, Home, Lifestyle, Other), "why" (one specific line, under 20 words, why they suit her, e.g. "${String((b.creator as Record<string, unknown> | undefined)?.city ?? '').trim().slice(0, 40) || 'Local'} café chain that hosted creator tastings for its new menu in 2026").
Return ONLY a JSON array of objects, nothing else.`;
	const user = `Creator: ${JSON.stringify(b.creator ?? {}).slice(0, 1200)}\nExclude (already known or pitched): ${skip.join(', ') || 'none'}`;
	let reply = '';
	if (x.gemini) {
		try {
			reply = await gemini(x.env, system(true), user, 4000, 0.8, true);
		} catch {
			reply = await gemini(x.env, system(false), user, 4000, 0.8);
		}
	} else reply = await chat(x, system(false), user, 2600, 0.8);
	const a = reply.indexOf('['), z = reply.lastIndexOf(']');
	let list: Record<string, unknown>[] = [];
	try {
		list = a >= 0 && z > a ? (JSON.parse(reply.slice(a, z + 1)) as Record<string, unknown>[]) : [];
	} catch {
		list = [];
	}
	const brands = list
		.map((r) => ({ name: String(r.name ?? '').trim().slice(0, 80), website: String(r.website ?? '').trim().slice(0, 200), instagram: String(r.instagram ?? '').replace(/^@+/, '').trim().slice(0, 60), category: String(r.category ?? 'Other').slice(0, 30), why: String(r.why ?? '').trim().slice(0, 160) }))
		.filter((r) => r.name && /^https?:\/\/[^\s/]+\.[^\s]+/.test(r.website));
	if (!brands.length) throw new Error(`No brands came back: ${reply.replace(/\s+/g, ' ').slice(0, 120)}`);
	return { brands };
}

// ---------- 5b2. The hourly fun nudge: one funny, kind, useful phone notification ----------
// The hourly job sends what kind it is (work, water, food, yoga, night), the one fact to build on, the
// recent lines already sent and a little about her (city, niche, and her evening hobby for the "yoga"
// slot); the AI writes a new one. The job checks it isn't a near-copy.
const CHEER_GOAL: Record<string, string> = {
	work: 'nudge her to act on the one work fact given (reply, edit, shoot, post, invoice, chase a payment, pitch), so she does it now',
	water: 'get her to drink a glass of water right now',
	food: 'get her to eat a proper meal or snack now (the meal named), not skip it for work',
	night: 'help her wind down and sleep on time; mention tomorrow only if a fact is given'
};
/** The evening slot: her own hobby (yoga, the gym, a walk), or a plain stretch break if she gave none. */
const breakGoal = (hobby: string) =>
	/yoga/i.test(hobby) ? 'get her onto the yoga mat now for her evening practice' : hobby ? `get her to stop work now for her evening ${hobby}` : 'get her away from the screen now for a short stretch or walk';
async function cheer(x: Run, b: Record<string, unknown>) {
	const kind = String(b.kind ?? 'work');
	const recent = (Array.isArray(b.recent) ? b.recent : []).map((t) => String(t ?? '').slice(0, 200)).slice(0, 40);
	const city = String(b.city ?? '').trim().slice(0, 40), niche = nicheOf(b.niche), hobby = String(b.hobby ?? '').trim().slice(0, 40);
	const goal = kind === 'yoga' ? breakGoal(hobby) : (CHEER_GOAL[kind] ?? CHEER_GOAL.work);
	// One of the wit samples is about the evening slot: her yoga, or a stretch for everyone else.
	const sample = /yoga/i.test(hobby) ? '"Downward dog beats doom-scrolling 🧘‍♀️" / "Mat out. The DMs can wait an hour; your spine cannot."' : '"Your chair filed a complaint 🪑" / "Stand up and stretch. The DMs can wait five minutes; your back cannot."';
	const reply = await chat(
		x,
		`You write ONE phone notification for ${String(b.name || 'her').slice(0, 30)}, an Indian Instagram creator${city ? ` in ${city}` : ''}${niche ? ` (${niche})` : ''} who runs her brand collabs in an app. It is ${String(b.when ?? '').slice(0, 40)}. Kind: ${kind === 'yoga' ? hobby || 'stretch break' : kind}${b.meal ? ` (${String(b.meal)})` : ''}. Goal: ${goal}.
Make her smile: playful, witty and warm, like a funny best friend who also manages her career. Creator-life jokes are welcome (reels, hooks, the algorithm, edits, brand DMs, golden hour, chai, filter coffee, ${city ? `${city} traffic and rain` : 'traffic and rain'}). Plain English, at most one light Hinglish word. Never mean, no body or weight talk, no diet advice, no guilt. No hashtags, no quotation marks.
Use only the facts given; never invent brands, numbers, dates or plans.
Shape: the title is a playful hook or twist (at most 42 characters, may end with one emoji); the body lands the punchline and says the one thing to do now (two short sentences, 70 to 135 characters).
The level of wit to match (style only, never copy these): "Breakfast > brand DMs 🍳" / "No brand has ever paid extra for a hungry creator. Eat something real first, then go win the week." · ${sample} · "Sorso is refreshing their inbox 👀" / "Put them out of their misery: a two-line reply keeps the deal, and your rate, warm."
Avoid tired puns (reel in, fuel up, stay hydrated, self-care) and generic lines like "check it out". It must be clearly different from every earlier notification listed (new joke, new angle, new words); don't reuse their openings.
Return ONLY JSON: {"title": "...", "body": "..."}`,
		`Fact: ${String(b.fact ?? 'none').slice(0, 300)}\nTry: ${Math.round(Number(b.attempt) || 0) + 1}\nEarlier notifications (do not echo):\n${recent.map((t) => `- ${t}`).join('\n') || '- none yet'}`,
		// Room for newer Gemini models that think before answering (only what's used is counted).
		900,
		0.9
	);
	const j = firstJson(reply) ?? {};
	const title = String(j.title ?? '').replace(/["“”]/g, '').trim().slice(0, 60);
	const body = String(j.body ?? '').replace(/["“”]/g, '').trim().slice(0, 180);
	if (!title || body.length < 30) throw new Error(`No clear answer from the AI: ${reply.replace(/\s+/g, ' ').slice(0, 120)}`);
	return { title, body };
}

// ---------- 5b3. "Ask your desk": questions about her own collabs, money and plans ----------
// The app sends a compact summary of her data (no contact details); the AI answers only from it and
// may suggest up to three actions from a fixed list, which the app shows as buttons she confirms.
const ASK_ACTIONS = ['open_collab', 'mark_paid', 'new_invoice', 'nudge', 'go', 'new_collab', 'remind', 'move_stage', 'shoot_day'];
const ASK_STAGES = ['negotiating', 'confirmed', 'creating', 'live', 'wrapped', 'declined'];
const ASK_PATHS = ['/studio', '/studio/collabs', '/studio/payments', '/studio/reports', '/studio/content', '/studio/calendar', '/studio/inbox', '/studio/settings', '/studio/pitches', '/studio/brands'];
async function ask(x: Run, b: Record<string, unknown>, me: Creator) {
	const history = (Array.isArray(b.history) ? b.history : []).slice(-6) as { q: string; a: string }[];
	const sources = (Array.isArray(b.sources) ? b.sources : []).slice(0, 8).map((s: Record<string, unknown>, i: number) => ({
		n: i + 1,
		kind: String(s.kind ?? 'note').slice(0, 20),
		brand: String(s.brand ?? '').slice(0, 60),
		code: String(s.code ?? '').slice(0, 12),
		date: String(s.date ?? '').slice(0, 12),
		text: String(s.text ?? '').slice(0, 500)
	}));
	const reply = await chat(
		x,
		`You are the assistant inside an Indian Instagram creator's collab studio. Answer her question using ONLY the data below (her collabs, money and plans). Today is ${String(b.today ?? '')}. If the answer isn't in the data, say so plainly. Be brief: 1 to 4 sentences, or a short list of up to 6 lines. Amounts in rupees in Indian format (₹1,50,000), dates like "18 Oct". Reply in the language she asked in (${orList(tongues(me.content_languages))}).
When useful, suggest up to 3 actions, each one of: open_collab {code}, mark_paid {code} (only for a collab with money still owed), new_invoice {code} (agreed or later, not invoiced yet), nudge {code} (brand gone quiet), go {path: one of ${ASK_PATHS.join(', ')}}, new_collab {text: the details she gave}, remind {codes: [codes]} (when she asks to remind or chase several brands: those with an unpaid invoice, an open quote or a draft waiting), move_stage {code, stage: one of ${ASK_STAGES.join(', ')}} (when she asks to move or mark a collab), shoot_day {code, date: YYYY-MM-DD} (when she asks to plan a shoot). Give each a short button label. She confirms every action in the app before anything happens.
Data (stage: request=new, negotiating=in talks, confirmed=agreed, creating, live, wrapped=done; money in rupees): ${JSON.stringify(b.data ?? {}).slice(0, 12000)}
${sources.length ? `Messages, emails, briefs and notes that may answer the question (numbered). When you use one, cite it like [2]; quote the brand's own words when it helps:\n${sources.map((s) => `[${s.n}] ${s.kind} · ${s.brand}${s.code ? ` (${s.code})` : ''} · ${s.date}: ${s.text}`).join('\n')}\n` : ''}Return ONLY JSON: {"answer": "...", "cites": [numbers of the sources you used], "actions": [{"type": "...", "code": "", "codes": [], "stage": "", "date": "", "path": "", "text": "", "label": "..."}]}`,
		[...history.map((h) => `Earlier question: ${h.q}\nEarlier answer: ${h.a}`), `Question: ${String(b.question ?? '').slice(0, 600)}`].join('\n\n'),
		700
	);
	const j = firstJson(reply) ?? {};
	const answer = String(j.answer ?? '').trim();
	if (!answer) throw new Error('No clear answer from the AI.');
	// a collab code: the creator's 1–4 letter prefix, then the code (CD-AB12CD)
	const CODE = /^[A-Z]{1,4}-[A-Z0-9]{4,8}$/;
	const actions = (Array.isArray(j.actions) ? (j.actions as Record<string, unknown>[]) : [])
		.map((a) => ({
			type: String(a.type ?? ''),
			code: String(a.code ?? '').toUpperCase().trim(),
			codes: (Array.isArray(a.codes) ? a.codes : []).map((c) => String(c ?? '').toUpperCase().trim()).filter((c) => CODE.test(c)).slice(0, 20),
			stage: String(a.stage ?? ''),
			date: String(a.date ?? ''),
			path: String(a.path ?? ''),
			text: String(a.text ?? '').slice(0, 1000),
			label: String(a.label ?? '').slice(0, 40)
		}))
		.filter(
			(a) =>
				ASK_ACTIONS.includes(a.type) &&
				(a.type !== 'go' || ASK_PATHS.includes(a.path)) &&
				(!['open_collab', 'mark_paid', 'new_invoice', 'nudge', 'move_stage', 'shoot_day'].includes(a.type) || CODE.test(a.code)) &&
				(a.type !== 'remind' || a.codes.length > 0) &&
				(a.type !== 'move_stage' || ASK_STAGES.includes(a.stage)) &&
				(a.type !== 'shoot_day' || /^\d{4}-\d{2}-\d{2}$/.test(a.date))
		)
		.slice(0, 3);
	const cites = (Array.isArray(j.cites) ? j.cites : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= sources.length);
	return { answer: answer.slice(0, 2000), cites: [...new Set(cites)], actions };
}

// ---------- 5c. Brief to Reel script: hooks, scenes, must-says, caption ----------
// ---------- Grow: check a reel before it goes up ----------
// The first frame (a small JPEG) is read by the vision model; the length, caption and her own numbers
// (how long people watch her reels, which formats work) decide the rest. Advice only, never a promise of views.
async function reelCheck(x: Run, b: Record<string, unknown>) {
	const facts = { seconds: Number(b.seconds) || 0, caption: String(b.caption ?? '').slice(0, 600), avg_watch_s: Number(b.avg_watch_s) || 0, best_formats: b.best_formats ?? [], best_time: String(b.best_time ?? ''), niche: String(b.niche ?? '') };
	let frame = '';
	const image = String(b.frame ?? '');
	if (image.startsWith('data:image/') && !x.gemini) {
		const bytes = [...Uint8Array.from(atob(image.split(',')[1] ?? ''), (c) => c.charCodeAt(0))];
		const ask = {
			messages: [
				{ role: 'system', content: 'You look at the first frame of an Instagram Reel. In two short sentences say what a viewer sees in the first second: is there a face, a product, on-screen text (quote it), and is it clear what the reel is about? Also say if any text sits in the bottom fifth or the right edge, where Instagram covers it. No advice.' },
				{ role: 'user', content: 'Describe the first frame.' }
			],
			image: bytes,
			max_tokens: 160
		};
		let r: unknown;
		try {
			r = await x.env.AI.run(VISION, ask);
		} catch (e) {
			if (/agree|licen/i.test(String((e as Error)?.message))) {
				await x.env.AI.run(VISION, { prompt: 'agree', max_tokens: 5 });
				r = await x.env.AI.run(VISION, ask);
			} else throw e;
		}
		meter(x, r, 'vision', '', 300);
		frame = out(r).trim().slice(0, 500);
	}
	const reply = await chat(
		x,
		`You are a short-video coach for an Indian Instagram creator. Check one Reel before she posts it, using ONLY these facts and the first-frame description. Compare with HER numbers (avg_watch_s = how long people watch her reels on average; best_formats = formats that get her the most shares/saves). Be specific and kind, plain English. Never promise views or followers.
Return ONLY JSON: {"score": 0-100, "verdict": "short line like 'Good, fix 2 things first'", "checks": [{"ok": true|false, "title": "under 8 words", "detail": "one or two sentences"}], "line": "a scroll-stopping first caption line under 14 words, in her voice, matching the reel"}.
Give 3 to 5 checks covering: length versus her avg watch time (a reel much longer than people watch loses them; if seconds is 0 skip it), the first second (from the frame), text covered by Instagram's buttons, the caption's first line, and whether it matches a format that works for her. Score lower for each real problem.`,
		JSON.stringify({ ...facts, first_frame: frame || 'not available' }),
		600
	);
	const j = firstJson(reply) ?? {};
	const checks = (Array.isArray(j.checks) ? (j.checks as Record<string, unknown>[]) : [])
		.map((c) => ({ ok: c.ok === true, title: String(c.title ?? '').trim().slice(0, 80), detail: String(c.detail ?? '').trim().slice(0, 300) }))
		.filter((c) => c.title)
		.slice(0, 5);
	return { score: Math.max(0, Math.min(100, Math.round(Number(j.score) || 0))), verdict: String(j.verdict ?? '').slice(0, 80), checks, line: String(j.line ?? '').trim().slice(0, 160), frame };
}

// ---------- Grow: this week's three reel ideas ----------
async function growPlan(x: Run, b: Record<string, unknown>) {
	const reply = await chat(
		x,
		`You plan next week's Instagram Reels for an Indian creator, from what already works for HER (her top reels with their views, shares and saves, her niche, her best posting times). Suggest exactly 3 reels she can shoot easily, each like one of her proven formats but fresh (new angle, new product type, a seasonal hook for India this time of year). No fake claims, no buying engagement, no trends you can't name confidently.
Return ONLY JSON: {"ideas": [{"title": "under 9 words, the reel itself", "why": "under 12 words: which of her reels or numbers it builds on"}]}`,
		JSON.stringify(b).slice(0, 3500),
		500
	);
	const j = firstJson(reply) ?? {};
	const ideas = (Array.isArray(j.ideas) ? (j.ideas as Record<string, unknown>[]) : [])
		.map((i) => ({ title: String(i.title ?? '').trim().slice(0, 120), why: String(i.why ?? '').trim().slice(0, 160) }))
		.filter((i) => i.title)
		.slice(0, 3);
	if (!ideas.length) throw new Error('!The AI had no ideas this time. Try again.');
	return { ideas };
}

// ---------- Grow: the growth check-up ----------
// Reads her reels' captions into a few topics, says who her content is made for (to compare with who
// actually follows her), suggests a one-line bio, and names the best reel's format to repeat.
// The numbers themselves are worked out in the app; this only reads the words.
async function checkup(x: Run, b: Record<string, unknown>) {
	const reels = (Array.isArray(b.reels) ? b.reels : []).slice(0, 40) as { id: string; caption: string; views: number }[];
	const reply = await chat(
		x,
		`You help an Indian Instagram creator understand her account. From her niche, city, languages and her reels (id, caption start, views), return ONLY JSON:
{"topics": [{"name": "2-4 word topic in plain English, like 'Trips near Bengaluru'", "ids": ["reel ids"]}],
 "ideal": {"gender": "women" | "men" | "everyone", "age_from": number, "age_to": number, "city": "the city her content is mostly for, or '' if not local"},
 "bio": "a one-line Instagram bio under 60 characters saying who it's for and what they get, built on her best topics",
 "repeat": "one sentence: the format of her best reel to repeat, from its caption (hook first, then what)"}
Rules: 3 to 6 topics; every reel id in exactly one topic; put reels that fit nothing in a topic named "Everything else". Base "ideal" on who her topics are made for (e.g. home decor and festival looks for women 22-40 in her city). Use only the captions; never invent facts.`,
		JSON.stringify({ niche: b.niche ?? '', city: b.city ?? '', languages: b.languages ?? [], reels: reels.map((r) => ({ id: String(r.id), caption: String(r.caption ?? '').slice(0, 120), views: Number(r.views) || 0 })) }),
		1200
	);
	const j = firstJson(reply) ?? {};
	const ids = new Set(reels.map((r) => String(r.id)));
	const topics = (Array.isArray(j.topics) ? (j.topics as Record<string, unknown>[]) : [])
		.map((t) => ({ name: String(t.name ?? '').trim().slice(0, 40), ids: (Array.isArray(t.ids) ? t.ids.map(String) : []).filter((i) => ids.has(i)) }))
		.filter((t) => t.name && t.ids.length)
		.slice(0, 6);
	const ideal = (j.ideal ?? {}) as Record<string, unknown>;
	const g = String(ideal.gender ?? 'everyone');
	return {
		topics,
		ideal: { gender: ['women', 'men'].includes(g) ? g : 'everyone', age_from: Math.max(13, Math.min(60, Number(ideal.age_from) || 18)), age_to: Math.max(18, Math.min(65, Number(ideal.age_to) || 40)), city: String(ideal.city ?? '').slice(0, 40) },
		bio: String(j.bio ?? '').trim().slice(0, 80),
		repeat: String(j.repeat ?? '').trim().slice(0, 200)
	};
}

// The help centre's AI: answers a question only from the help articles that match it (found here, not
// sent by the app), says which ones, and owns up when they don't cover it so the person can ask a human.
async function helpAsk(x: Run, b: Record<string, unknown>) {
	const q = String(b.q ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
	const side = b.side === 'brand' ? 'brand' : 'creator';
	const found = helpSearch(q, side, 4);
	if (!q || !found.length) return { answer: '', sources: [], confident: false };
	const reply = await chat(
		x,
		`You are Miracle's help desk. Miracle is an Indian app where ${side === 'brand' ? 'brands book creators (influencers) and pay them directly' : 'creators run brand collabs: requests, quotes, drafts, GST invoices and payments, with no commission'}. Answer the person's question using ONLY the help articles given. Return ONLY JSON:
{"answer": "2 to 5 short sentences or numbered steps, in plain friendly English, saying exactly where to tap", "sources": ["slug of each article you used"], "confident": true or false}
Rules: never invent menus, features, prices or promises that aren't in the articles. If the articles don't answer it, or it needs someone to look at their account (a payment that didn't arrive, a bug, a charge, a ban), set "confident": false and say in one sentence that support can look into it. Use "you".`,
		JSON.stringify({ question: q, articles: found.map((a) => ({ slug: a.slug, text: asText(a) })) }),
		600
	);
	const j = firstJson(reply) ?? {};
	const slugs = new Set(found.map((a) => a.slug));
	const sources = (Array.isArray(j.sources) ? j.sources.map(String) : []).filter((s) => slugs.has(s)).slice(0, 3);
	return { answer: String(j.answer ?? '').trim().slice(0, 1200), sources: sources.length ? sources : [found[0].slug], confident: j.confident === true && !!String(j.answer ?? '').trim() };
}

// A case study from a finished collab: the goal, what was made and the results, in the creator's voice, from
// the brief, the results report and the brand's review. Numbers only from what's given.
async function caseStudy(x: Run, b: Record<string, unknown>) {
	const reply = await chat(
		x,
		`You write short case studies for an Indian creator's page, about one brand collaboration, for other brands to read. Return ONLY JSON:
{"title": "under 70 characters: brand + the result, e.g. 'How a monsoon skincare reel reached 1.2L people for Kora'", "summary": "1 sentence, under 220 characters", "goal": "1-2 sentences: what the brand wanted", "made": "1-2 sentences: what was made and why it worked for this audience", "results": "1-2 sentences with the real numbers given"}
Rules: use ONLY the facts and numbers given; never invent numbers, sales or quotes. Write in first person as the creator ("I made…"). Plain, specific, no hype words (no "amazing", "viral sensation"). Indian number style (1.2L, 45K).`,
		JSON.stringify(b).slice(0, 4000),
		700
	);
	const j = firstJson(reply) ?? {};
	const t = (k: string, n: number) => String(j[k] ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
	return { title: t('title', 120), summary: t('summary', 300), goal: t('goal', 600), made: t('made', 600), results: t('results', 600) };
}

// Competitor watch (a brand's weekly job, single-use pass): which Instagram creators each competitor worked
// with lately, from a Google search only. Without search there's no answer: a model's memory would invent
// creators. Every creator needs a source link the search returned.
async function compWatch(x: Run, b: Record<string, unknown>) {
	const brands = (Array.isArray(b.brands) ? b.brands : []).slice(0, 5) as { name?: string; handle?: string }[];
	if (!x.gemini || !brands.length) return { competitors: [], why: x.gemini ? 'no competitors' : 'needs search' };
	const out: { competitor: string; creators: { handle: string; name: string; url: string; note: string }[] }[] = [];
	for (const br of brands) {
		const name = String(br.name ?? '').trim().slice(0, 80);
		const handle = String(br.handle ?? '').replace(/^@+/, '').trim().slice(0, 30);
		if (!name && !handle) continue;
		const who = [name, handle ? `@${handle}` : ''].filter(Boolean).join(' / ');
		let reply = '';
		try {
			reply = await gemini(
				x.env,
				`You research influencer marketing in India. Use Google Search. Find Instagram creators (influencers) who posted a paid partnership, collab, ambassador or gifted post with the brand ${who} in the last 6 months. Only creators you found in search results, each with the https link of the page that shows it (the Instagram post, the creator's profile, or an article naming them). Never invent a creator, a handle or a link. Up to 10.
Return ONLY a JSON array: [{"handle": "instagram handle without @", "name": "creator's name", "url": "https://...", "note": "under 12 words: what they made, e.g. 'Reel for the monsoon skincare range, Sep 2026'"}]. If you find none, return [].`,
				`Brand: ${who}${b.category ? `\nCategory: ${String(b.category).slice(0, 40)}` : ''}`,
				2000,
				0.2,
				true
			);
		} catch {
			continue;
		}
		const a = reply.indexOf('['), z = reply.lastIndexOf(']');
		let list: Record<string, unknown>[] = [];
		try {
			list = a >= 0 && z > a ? (JSON.parse(reply.slice(a, z + 1)) as Record<string, unknown>[]) : [];
		} catch {
			list = [];
		}
		const own = handle.toLowerCase();
		const creators = list
			.map((r) => ({ handle: String(r.handle ?? '').replace(/^@+/, '').trim().toLowerCase().slice(0, 30), name: String(r.name ?? '').trim().slice(0, 120), url: String(r.url ?? '').trim().slice(0, 500), note: String(r.note ?? '').trim().slice(0, 200) }))
			.filter((r) => /^[a-z0-9._]{2,30}$/.test(r.handle) && r.handle !== own && /^https:\/\/[^\s]+$/.test(r.url))
			.slice(0, 10);
		out.push({ competitor: name || `@${handle}`, creators });
	}
	return { competitors: out };
}

// Brand safety: reads a creator's recent captions (from the nightly Instagram sync, with a single-use
// pass) for what a brand would want to know before booking her. Only clear cases; most creators have none.
async function safety(x: Run, b: Record<string, unknown>) {
	const posts = (Array.isArray(b.posts) ? b.posts : []).slice(0, 40) as { id: string; caption: string }[];
	if (!posts.length) return { flags: [] };
	const KINDS = ['betting', 'adult', 'hate', 'alcohol_tobacco', 'health_claims', 'money_schemes', 'politics_religion', 'strong_language', 'unlabelled_ad'];
	const reply = await chat(
		x,
		`You check an Indian Instagram creator's recent post captions for a brand that wants to book her. Return ONLY JSON:
{"flags": [{"id": "post id", "kind": one of ${KINDS.map((k) => `"${k}"`).join(', ')}, "why": "under 15 words, what in the caption"}]}
Kinds: betting = betting, satta, casinos, real-money or fantasy gaming apps; adult = sexual or explicit content; hate = abuse or hate against a group or person; alcohol_tobacco = drinking alcohol, smoking or vaping shown or promoted (some family brands avoid this); health_claims = cure, guaranteed weight loss or medical claims; money_schemes = crypto tips, trading signals, get-rich schemes; politics_religion = attacking a political party, a leader or a religion, or communal content (festivals like Diwali, Ganesh Chaturthi, Janmashtami, Eid, Christmas, Onam or Varamahalakshmi, Independence Day, prayers, temples and pujas are NEVER this); strong_language = swearing; unlabelled_ad = clearly promoting a brand, product or discount code with no #ad, #collab, #sponsored or paid partnership mention.
Rules: flag only what the caption clearly says, never guess. Festivals, food, fitness, fashion, travel, normal opinions and mild slang are fine. Most creators have no flags: then return {"flags": []}. Never flag a post twice for the same kind.`,
		JSON.stringify({ posts: posts.map((p) => ({ id: String(p.id), caption: String(p.caption ?? '').slice(0, 300) })) }),
		900
	);
	const j = firstJson(reply) ?? {};
	const byId = new Map(posts.map((p) => [String(p.id), String(p.caption ?? '')]));
	// The model over-flags (festivals as religion, every cocktail as an alcohol ad): a flag only stands
	// when the caption itself has words of that kind.
	const CUES: Record<string, RegExp> = {
		betting: /\b(bet|bets|betting|casino|rummy|poker|satta|teen ?patti|fantasy|dream ?11|real money|aviator|lottery|jackpot|win(ning)? ₹|cash prize)/i,
		adult: /\b(nsfw|18\+|nude|naked|onlyfans|explicit|porn|xxx|sex)/i,
		hate: /\b(hate|kill|terrorist|traitor|go back|scum|filthy|anti-?national|jihadi|sanghi|bhakt|libtard|chamcha)/i,
		alcohol_tobacco: /\b(beer|wine|whisk(e)?y|vodka|rum|gin|tequila|cocktail|brewery|liquor|alcohol|cigarette|smok|vape|vaping|hookah|gutka|tobacco)/i,
		health_claims: /\b(cure|cures|cured|guarantee|guaranteed|lose \d+|\d+ ?kg|weight ?loss|fat ?burn|detox|miracle|doctor|medicine|reverse|heal)/i,
		money_schemes: /\b(crypto|bitcoin|trading|forex|signals?|stock tips|passive income|double your|investment plan|f&o|options|earn ₹|earn rs|get rich)/i,
		politics_religion: /\b(bjp|congress|aap|modi|rahul|kejriwal|yogi|election|vote|voting|minister|party|protest|riot|propaganda|hindutva|jihad|communal|secular|pakistan|khalistan|bhakt|sanghi)/i,
		strong_language: /(f\*+k|f\*ck|fuck|shit|bitch|\bbc\b|\bmc\b|chutiya|bsdk|\bwtf\b|bloody|madarchod|behenchod)/i,
		unlabelled_ad: /(\bcode\b|discount|% ?off|link in (my )?bio|use my|\bshop\b|buy now|available (on|at)|order now)/i
	};
	const AD = /#(ad|collab|sponsored|paidpartnership|partner)\b|paid partnership/i;
	const flags = (Array.isArray(j.flags) ? (j.flags as Record<string, unknown>[]) : [])
		.map((f) => ({ id: String(f.id ?? ''), kind: String(f.kind ?? ''), why: String(f.why ?? '').trim().slice(0, 160) }))
		.filter((f) => byId.has(f.id) && KINDS.includes(f.kind) && CUES[f.kind].test(byId.get(f.id)!) && !(f.kind === 'unlabelled_ad' && AD.test(byId.get(f.id)!)))
		.slice(0, 20);
	return { flags };
}

// Checking a brand's offer: the agreement (pasted, a PDF, or photos of its pages) with their brief and
// messages, against her rate card and usual terms. Says what to push back on, quotes the clause, and
// writes her reply. Not legal advice; the app says so.
async function offerCheck(x: Run, b: Record<string, unknown>) {
	let text = String(b.text ?? '').slice(0, 14000);
	let pages = 0;
	const file = String(b.file ?? '');
	if (file.startsWith('data:application/pdf')) {
		if (!x.env.AI.toMarkdown) throw new Error("!Reading PDFs isn't available just now. Paste the agreement's text instead.");
		const bytes = Uint8Array.from(atob(file.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
		const [doc] = await x.env.AI.toMarkdown([{ name: String(b.name ?? 'agreement.pdf').slice(0, 80), blob: new Blob([bytes], { type: 'application/pdf' }) }]);
		const read = String(doc?.data ?? '').replace(/\n{3,}/g, '\n\n').trim();
		if (!read) throw new Error('!That PDF has no text in it (it may be a scan). Send photos of its pages instead.');
		pages = Math.max(1, (read.match(/^#+ ?Page \d+/gim) ?? []).length);
		text = `${read.slice(0, 14000)}\n${text}`.trim();
		x.neurons += read.length / 40;
	}
	const photos = (Array.isArray(b.photos) ? b.photos : []).map(String).filter((p) => p.startsWith('data:image/')).slice(0, 4);
	for (const photo of photos) {
		if (x.gemini) throw new Error("!Reading photos is used up for today. Paste the agreement's text instead; it's back at 5:30 am.");
		const ask = {
			messages: [
				{ role: 'system', content: 'You read photos and screenshots of contracts and brand agreements. Write out all the text exactly as shown, in order, keeping clause numbers, amounts, dates and durations exactly. No comments.' },
				{ role: 'user', content: 'Transcribe this page.' }
			],
			image: [...Uint8Array.from(atob(photo.split(',')[1] ?? ''), (c) => c.charCodeAt(0))],
			max_tokens: 1200
		};
		let r: unknown;
		try {
			r = await x.env.AI.run(VISION, ask);
		} catch (e) {
			if (/agree|licen/i.test(String((e as Error)?.message))) {
				await x.env.AI.run(VISION, { prompt: 'agree', max_tokens: 5 });
				r = await x.env.AI.run(VISION, ask);
			} else throw e;
		}
		meter(x, r, 'vision', '', 1600);
		text += `\n${out(r)}`;
		pages++;
	}
	const brief = String(b.brief ?? '').slice(0, 2500);
	const messages = (Array.isArray(b.messages) ? b.messages : []).map((m) => String(m ?? '').slice(0, 400)).slice(-12);
	if (!text.trim() && !brief.trim() && !messages.length) return { error: 'Nothing to read. Paste the offer or add the agreement.' };
	const facts = {
		brand: String(b.brand ?? ''),
		contact: String(b.contact ?? ''),
		deliverables: String(b.deliverables ?? ''),
		offered_fee: Number(b.fee) || 0,
		rate_card_total: Number(b.rate_total) || 0,
		paid_ads_rate_pct_per_30_days: Number(b.usage_ext_pct) || 20,
		her_usual_advance_pct: Number(b.advance_pct) || 0,
		her_usual_balance_days: Number(b.pay_days) || 15,
		gst_registered: b.gst === true
	};
	const reply = await chat(
		x,
		`You help an Indian Instagram creator check a brand's collaboration offer before she signs. You are not a lawyer: point out what creators usually push back on, plainly, and suggest fair asks. Return ONLY JSON:
{"score": 0-100 (how fair the offer is to her; 85+ fine to sign, 60-84 ask for changes, under 60 several problems),
 "headline": "short advice, like 'Ask for 3 changes before you sign' or 'Fair offer: fine to sign'",
 "flags": [{"level": "red" | "amber", "title": "the problem in under 8 words, like 'They can use your reel forever'", "quote": "the exact words from the agreement, under 25 words, or '' if not in the text", "ask": "what to ask for instead, one or two sentences, using her numbers"}],
 "fine": [{"title": "under 7 words, like 'Fee matches your rate card'", "sub": "under 12 words"}],
 "terms": {"advance_pct": 0 | 30 | 50 | 100 | null, "pay_days": number or null, "usage": "Organic only" | "Paid usage 30 days" | "Paid usage 90 days" | null, "exclusivity_days": number or null, "revision_rounds": number or null},
 "reply": "her reply to the brand's contact by first name: friendly, short, agrees to go ahead and lists the changes she asks for; ends asking if she should send the updated quote"}
What to look for (red = serious, amber = worth asking): usage in perpetuity, forever, or ownership/assignment of her content or likeness (red; ask for 3 months on their page, paid ads at her rate per 30 days); paid ads or whitelisting with no extra fee (red); payment more than 30 days after posting or no date (amber; ask for her usual advance before the shoot and the rest within her usual days); no advance from a new brand (amber); exclusivity over 30 days or a whole industry (amber; limit to the product's category, 30 days, or charge); unlimited revisions or reshoots (red; 2 rounds); payment only "on approval" or "on results"/sales targets (red); they can cancel without paying for work done (red); fines or penalties on her, broad indemnity (amber); content she must keep up forever or can never delete (amber); no #ad / paid-partnership disclosure, which ASCI requires in India (amber); the fee below her rate card total (amber, say by how much); TDS is normal (fine, not a flag). Use only what the text says; never invent clauses. A gap that matters, like no payment date, may be an amber flag with an empty quote. "terms" are the values to put in her updated quote (null to keep). Keep "flags" to the 5 that matter most, red first; "fine" up to 4.`,
		JSON.stringify({ facts, agreement: text.slice(0, 14000), brief, messages }),
		1300
	);
	const j = firstJson(reply) ?? {};
	const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
	const flags = (Array.isArray(j.flags) ? (j.flags as Record<string, unknown>[]) : [])
		.map((f) => ({ level: f.level === 'red' ? 'red' : 'amber', title: clip(f.title, 80), quote: clip(f.quote, 220).replace(/^["“]+|["”]+$/g, ''), ask: clip(f.ask, 320) }))
		.filter((f) => f.title)
		.sort((a, c) => (a.level === c.level ? 0 : a.level === 'red' ? -1 : 1))
		.slice(0, 6);
	const fine = (Array.isArray(j.fine) ? (j.fine as Record<string, unknown>[]) : []).map((f) => ({ title: clip(f.title, 70), sub: clip(f.sub, 120) })).filter((f) => f.title).slice(0, 4);
	const t = (j.terms ?? {}) as Record<string, unknown>;
	const n = (v: unknown, ok: (k: number) => boolean) => (v === null || v === undefined || v === '' || !ok(Number(v)) ? null : Number(v));
	const usage = ['Organic only', 'Paid usage 30 days', 'Paid usage 90 days'].includes(String(t.usage)) ? String(t.usage) : null;
	const score = Math.max(0, Math.min(100, Math.round(Number(j.score) || (flags.length ? 70 - flags.length * 6 : 88))));
	return {
		score,
		headline: clip(j.headline, 80) || (flags.length ? `Ask for ${flags.length} change${flags.length === 1 ? '' : 's'} before you sign` : 'Fair offer: fine to sign'),
		flags,
		fine,
		terms: {
			advance_pct: n(t.advance_pct, (k) => [0, 30, 50, 100].includes(k)),
			pay_days: n(t.pay_days, (k) => k >= 0 && k <= 90),
			usage,
			exclusivity_days: n(t.exclusivity_days, (k) => k >= 0 && k <= 365),
			revision_rounds: n(t.revision_rounds, (k) => k >= 0 && k <= 5)
		},
		reply: String(j.reply ?? '').trim().slice(0, 1200),
		read: { pages, chars: text.length }
	};
}

// Before the brand sees a draft: her caption and script against the brief's key message, must-says
// and don'ts. The tags, code and #ad are checked by the app itself (exact matches, no AI needed).
async function preCheck(x: Run, b: Record<string, unknown>) {
	const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
	const caption = String(b.caption ?? '').slice(0, 2200);
	const script = String(b.script ?? '').slice(0, 3000);
	const brief = String(b.brief ?? '').slice(0, 2500);
	if (!brief.trim()) return { items: [], summary: 'The brief has no talking points to check against.' };
	if (!caption.trim() && !script.trim()) return { error: 'Add the caption (or the script) first.' };
	const reply = await chat(
		x,
		`You check an Indian Instagram creator's draft for a brand collaboration before she sends it to the brand. Compare her caption and script with the brief. Return ONLY JSON:
{"items": [{"label": "the brief's point in under 8 words, like 'Says it is fragrance-free'", "ok": true | false, "note": "if not ok: what to add or change, one short sentence in plain English; '' if ok"}],
 "summary": "one friendly sentence: ready to send, or the one thing to fix first"}
Rules: one item per key message, must-say or must-show point, and each don't from the brief (ok = she avoided it). Skip hashtags, mentions, links and promo codes (checked elsewhere). Points that can only be seen in the video (like "show the product in the first 3 seconds") are ok: null with note "Check in the video". Up to 8 items. Use only the brief and her text; never invent requirements.`,
		JSON.stringify({ brief, caption, script }),
		700
	);
	const j = firstJson(reply) ?? {};
	const items = (Array.isArray(j.items) ? (j.items as Record<string, unknown>[]) : [])
		.map((i) => ({ label: clip(i.label, 80), ok: i.ok === true ? true : i.ok === false ? false : null, note: clip(i.note, 200) }))
		.filter((i) => i.label)
		.slice(0, 8);
	return { items, summary: clip(j.summary, 200) };
}

// Get found: the words brands (and the AI search inside Instagram, YouTube and Google) look for, in her
// "about" line, her Instagram bio and keywords, from what she actually makes.
async function getFound(x: Run, b: Record<string, unknown>) {
	const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
	const facts = {
		name: clip(b.name, 60),
		niche: clip(b.niche, 120),
		city: clip(b.city, 60),
		languages: (Array.isArray(b.languages) ? b.languages : []).map((l) => clip(l, 20)).slice(0, 6),
		topics: (Array.isArray(b.topics) ? b.topics : []).map((t) => clip(t, 40)).slice(0, 6),
		brands: (Array.isArray(b.brands) ? b.brands : []).map((t) => clip(t, 40)).slice(0, 12),
		followers: Number(b.followers) || 0,
		audience: clip(b.audience, 160),
		now: clip(b.bio, 400)
	};
	const reply = await chat(
		x,
		`You help an Indian Instagram creator get found by brands. Brands and the AI search inside Instagram, YouTube and Google match creators by plain descriptions: niche, city, language, audience and the kind of content. From her facts, return ONLY JSON:
{"bio": "her 'about' line for her collab page, 2 short sentences, under 260 characters, third person is fine: what she makes, for whom, where, in which languages, and the brands or categories she fits. No hashtags or emojis.",
 "ig_bio": "an Instagram bio under 140 characters: what you get + city + 'Collabs:' with no link (the link goes in the link field)",
 "keywords": ["6 to 10 short search phrases a brand would type, like 'Bengaluru skincare creator', 'Kannada lifestyle reels'"],
 "missing": ["up to 3 short things her profile doesn't say yet that brands look for, like 'your audience's age' or 'the languages you speak'"]}
Use only her facts; never invent numbers, awards or brands. Write in simple English.`,
		JSON.stringify(facts),
		600
	);
	const j = firstJson(reply) ?? {};
	const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).map((k) => clip(k, len)).filter(Boolean).slice(0, n);
	return { bio: clip(j.bio, 300), ig_bio: clip(j.ig_bio, 150), keywords: list(j.keywords, 10, 50), missing: list(j.missing, 3, 80) };
}

async function script(x: Run, b: Record<string, unknown>) {
	const reply = await chat(
		x,
		`You are a top Indian short-video strategist writing a ready-to-shoot script for a creator's brand collaboration. Use the brief and facts; never invent offers, prices or claims the brief doesn't make (no medical or "guaranteed" claims). The creator speaks in first person, natural and not salesy.
Style: ${String(b.style ?? 'whatever suits the brief best')}. Spoken language: ${String(b.language ?? 'English')}. Target length: ${String(b.length ?? '30-45 seconds')}.
Write:
- "hooks": 3 different scroll-stopping first lines (under 12 words each) for the first 3 seconds.
- "idea": the concept in one sentence.
- "scenes": 5 to 9 beats in order; each has "time" (like "0-3s"), "shot" (what the camera sees, specific and filmable at home or on location), "say" (her voiceover or lines, or '' if none), "text" (on-screen text, or '').
- "must": every must-say / must-show point from the brief (product name, key message, offer or promo code, mentions, link), as short checklist items.
- "avoid": the brief's don'ts and Indian ASCI basics (disclose the partnership, no false claims), as short items.
- "caption": an Instagram caption in her voice, hook first, including the key message, mentions and promo code from the brief, and "#ad" as Indian ASCI rules require; under 120 words.
- "hashtags": up to 10, the brief's first.
- "music": one line on the music/audio vibe. "props": short list of things to keep ready.
Return ONLY JSON with exactly these keys: {"hooks": [], "idea": "", "scenes": [{"time": "", "shot": "", "say": "", "text": ""}], "must": [], "avoid": [], "caption": "", "hashtags": [], "music": "", "props": []}`,
		JSON.stringify(b).slice(0, 4500),
		1600
	);
	const j = firstJson(reply) ?? {};
	const list = (v: unknown, n: number, len = 160) => (Array.isArray(v) ? v.map((s) => String(s ?? '').trim().slice(0, len)).filter(Boolean).slice(0, n) : []);
	const scenes = (Array.isArray(j.scenes) ? (j.scenes as Record<string, unknown>[]) : [])
		.map((s) => ({ time: String(s.time ?? '').slice(0, 20), shot: String(s.shot ?? '').trim().slice(0, 240), say: String(s.say ?? '').trim().slice(0, 300), text: String(s.text ?? '').trim().slice(0, 120) }))
		.filter((s) => s.shot || s.say)
		.slice(0, 12);
	if (!scenes.length) throw new Error('No clear answer from the AI.');
	return {
		hooks: list(j.hooks, 3, 120),
		idea: String(j.idea ?? '').slice(0, 240),
		scenes,
		must: list(j.must, 10),
		avoid: list(j.avoid, 8),
		caption: String(j.caption ?? '').trim().slice(0, 1500),
		hashtags: list(j.hashtags, 12, 40),
		music: String(j.music ?? '').slice(0, 160),
		props: list(j.props, 10, 80)
	};
}

// ---------- 6. "Should I take it?": what a request really involves ----------
// The AI reads the request (store visit? where? what outfit and makeup? red flags?), then free
// OpenStreetMap services work out the drive from her home area. The app scores it from these facts.
const UA = { 'user-agent': 'Miracle/1.0 (collab-desk.zypocare.workers.dev)', 'accept-language': 'en' };

async function geocode(q: string): Promise<{ lat: number; lng: number; name: string } | null> {
	if (!q.trim()) return null;
	const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`, { headers: UA }).catch(() => null);
	const j = (await r?.json().catch(() => null)) as { lat: string; lon: string; display_name: string }[] | null;
	return j?.[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon), name: j[0].display_name.split(',').slice(0, 3).join(',') } : null;
}

/** Driving distance and time (no traffic), or a straight-line estimate if routing is unavailable. */
async function drive(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
	const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`, { headers: UA }).catch(() => null);
	const j = (await r?.json().catch(() => null)) as { routes?: { distance: number; duration: number }[] } | null;
	if (j?.routes?.[0]) return { km: j.routes[0].distance / 1000, min: j.routes[0].duration / 60, routed: true };
	const rad = (d: number) => (d * Math.PI) / 180;
	const km = 2 * 6371 * Math.asin(Math.sqrt(Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2)) * 1.35;
	return { km, min: (km / 30) * 60, routed: false };
}

async function fit(x: Run, b: Record<string, unknown>) {
	const me = (b.creator ?? {}) as Record<string, unknown>;
	const reply = await chat(
		x,
		`You help an Indian Instagram creator decide whether to accept a brand collaboration. Read the request and return ONLY a JSON object with facts from the text:
{"visit": true if she must go somewhere (store, event, cafe, shoot location) else false,
 "location": "the place she must go: name, area, city (as precise as the text allows)" or "",
 "visit_hours": hours she must spend there (0 if unknown),
 "outfit": "none" | "own" | "specific" | "provided", "outfit_note": "short, e.g. 'ethnic wear in brand colours'",
 "makeup": "none" | "natural" | "glam" | "professional" | "provided", "makeup_note": "",
 "looks": number of different looks/outfits (1 if one),
 "category": "the brand's category, e.g. fashion, skincare, food",
 "fit": 0-10 how well the brand suits the creator's niche, "fit_note": "one short reason",
 "exclusivity": "any exclusivity or non-compete asked, else ''",
 "payment_terms": "when/how they pay, if said, else ''",
 "red_flags": ["short facts that are risky: e.g. asks for payment, vague brand, no website, unpaid usage rights, very tight deadline, many deliverables for little"],
 "good_signs": ["short facts that are good"],
 "questions": ["2-4 short questions she should ask before saying yes, about missing facts (voucher value, address, timing, usage, payment)"],
 "summary": "one plain sentence: what they want and what she gets"}
Rules: a store visit, event or shoot at their place means visit=true. "Outfit specific" = they ask for a particular look/colour/style she may need to buy; "provided" = they give the outfit or makeup artist. If makeup isn't mentioned, use "natural" for on-camera content and "none" for product-only content. Never invent facts. The creator: ${JSON.stringify({ niche: me.niche, city: me.city, avoid: me.avoid })}.`,
		JSON.stringify(b.collab ?? {}).slice(0, 5000),
		900
	);
	const ai = firstJson(reply) ?? {};

	// Travel: her home (saved once the app knows it) to the place.
	let home = me.home_lat && me.home_lng ? { lat: Number(me.home_lat), lng: Number(me.home_lng) } : null;
	let homeFound: { lat: number; lng: number } | null = null;
	if (!home && String(me.home_area ?? '').trim()) {
		const g = await geocode(String(me.home_area));
		if (g) home = homeFound = { lat: g.lat, lng: g.lng };
	}
	let travel: Record<string, unknown> | null = null;
	const place = String(ai.location ?? '').trim();
	if (ai.visit && place) {
		// The exact shop often isn't on the map: fall back to its area ("Mustard, Koramangala, Bengaluru" -> "Koramangala, Bengaluru").
		const city = String(me.city ?? '').trim();
		const parts = place.split(',').map((x) => x.trim()).filter(Boolean);
		if (city && !place.toLowerCase().includes(city.toLowerCase().split(/[ ,]/)[0]) && !/bangalore|bengaluru|mumbai|delhi|chennai|hyderabad|pune|kolkata/i.test(place)) parts.push(city);
		let g: Awaited<ReturnType<typeof geocode>> = null;
		let approx = false;
		for (let i = 0; i < parts.length - 1 && !g; i++) {
			if (homeFound || i) await new Promise((r) => setTimeout(r, 1100)); // OpenStreetMap asks for at most one search a second
			g = await geocode(parts.slice(i).join(', '));
			approx = i > 0;
		}
		if (!g && parts.length === 1) g = await geocode(parts[0]);
		if (g && home) {
			const d = await drive(home, g);
			travel = { place: g.name, approx, lat: g.lat, lng: g.lng, km: Math.round(d.km * 10) / 10, drive_min: Math.round(d.min), routed: d.routed };
		} else if (g) travel = { place: g.name, approx, lat: g.lat, lng: g.lng };
	}
	return { ai, travel, home: homeFound, read_at: new Date().toISOString() };
}

// ---------- 7. "Your month in review" from the month's facts ----------
async function summary(x: Run, b: Record<string, unknown>) {
	const reply = await chat(
		x,
		`You are the business coach of an Indian Instagram creator. From the facts of one month (money in rupees, brand deals, content results, followers, price lessons), write her monthly review. Warm, direct, specific, in plain English. Use only the numbers given; never invent any. Mention brands by name where useful.
Return ONLY JSON: {"headline": "one line, under 14 words, the story of the month",
 "wins": ["2-4 short points: what went well, with numbers"],
 "watch": ["1-3 short points: what needs attention (late payments, low acceptance, slow months)"],
 "actions": ["3 concrete things to do this month, e.g. raise Reel price to ₹X, chase Y for ₹Z, pitch more of a category"]}`,
		JSON.stringify(b.facts ?? {}).slice(0, 6000),
		700
	);
	const j = firstJson(reply) ?? {};
	const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, n) : []);
	return { headline: String(j.headline ?? '').trim(), wins: list(j.wins, 4), watch: list(j.watch, 3), actions: list(j.actions, 3) };
}

/** A brand's results in plain words: what stands out, and what to do next (or the answer to its question). */
async function brandAsk(x: Run, b: Record<string, unknown>) {
	const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
	const facts = JSON.stringify(b.facts ?? {}).slice(0, 7000);
	const question = clip(b.question, 300);
	const reply = await chat(
		x,
		`You are a plain-speaking marketing analyst for an Indian brand that works with Instagram creators. You get the brand's numbers for one period as JSON (money in rupees; totals.paid = what the brand actually paid in the period, a creator's invoiced = invoices that creator sent in the period, paid or still due; cpv = fees per view; engagement = likes, comments, shares and saves per view; sales only where the brand imported orders). Return ONLY JSON:
{"headline": "the single most important thing about these results, one sentence under 140 characters",
 "points": ["3 to 5 findings, one sentence each, each quoting the real number from the data"],
 "next": ["2 or 3 concrete next steps that name the creators or campaigns from the data"],
 "answer": "${question ? 'a direct answer to the question in 2 to 4 sentences, using the numbers' : ''}"}
Rules: use only numbers in the data and never invent any; compare creators by cost per view, engagement, sales and rating; when there is too little data to judge (few posts, no views yet), say so plainly instead of guessing. Write rupees the Indian way (₹1,20,000 or ₹1.2 lakh). Brands pay creators directly; never suggest paying or holding money through the app. Speak to the brand as "you" ("you paid", "your creators"). Simple English, no jargon.`,
		`Brand: ${clip(b.company, 60)}. Period: ${clip(b.period, 40)}.${question ? `\nQuestion: ${question}` : ''}\nData: ${facts}`,
		900
	);
	const j = firstJson(reply) ?? {};
	const list = (v: unknown, n: number) => (Array.isArray(v) ? v : []).map((k) => clip(k, 260)).filter(Boolean).slice(0, n);
	return { headline: clip(j.headline, 180), points: list(j.points, 5), next: list(j.next, 3), answer: question ? clip(j.answer, 900) : '' };
}

/** A link a brand pasted, as a public web page's address: no addresses inside a network, no logins in it. */
function publicUrl(raw: string) {
	let u: URL;
	try {
		u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
	} catch {
		throw new Error("!That doesn't look like a link. Paste the product page's address, like https://yourshop.in/product.");
	}
	const host = u.hostname.toLowerCase();
	if (!/^https?:$/.test(u.protocol) || u.username || u.password || host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[') || /\.(local|internal|lan|localhost)$/.test(host) || !host.includes('.'))
		throw new Error('!Use the public address of the product page, like https://yourshop.in/product.');
	return u;
}

/** A product page, read for a brief: the name, description and price it states, and some of its text. */
async function readProductPage(raw: string) {
	const CANT = "!That page couldn't be read (some shops block outside readers). Type the product and a line about it in the brief instead.";
	const u = publicUrl(raw);
	const host = u.hostname.toLowerCase();
	let r: Response;
	try {
		r = await fetch(u.href, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; MiracleBrief/1.0; +https://www.miracleapp.live)', accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(9000) });
	} catch {
		throw new Error(CANT);
	}
	if (!r.ok || !/html|text/i.test(r.headers.get('content-type') ?? '')) throw new Error(CANT);
	// At most 1.5 MB of the page.
	const reader = r.body?.getReader();
	if (!reader) throw new Error(CANT);
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (size < 1_500_000) {
		const { done, value } = await reader.read();
		if (done || !value) break;
		chunks.push(value);
		size += value.length;
	}
	reader.cancel().catch(() => {});
	const all = new Uint8Array(size);
	let at = 0;
	for (const c of chunks) {
		all.set(c.subarray(0, Math.max(0, size - at)), at);
		at += c.length;
	}
	const html = new TextDecoder().decode(all);
	const decode = (t: string) =>
		t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
	const meta = (name: string) => {
		const m =
			html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i')) ??
			html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i'));
		return m ? decode(m[1]).trim() : '';
	};
	// Structured product data (schema.org), when the shop has it.
	const walk = (n: unknown): Record<string, unknown> | null => {
		if (Array.isArray(n)) return n.map(walk).find(Boolean) ?? null;
		if (!n || typeof n !== 'object') return null;
		const o = n as Record<string, unknown>;
		const t = o['@type'];
		if (t === 'Product' || (Array.isArray(t) && t.includes('Product'))) return o;
		return walk(o['@graph']);
	};
	let product: Record<string, unknown> | null = null;
	for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
		try {
			product ??= walk(JSON.parse(m[1].trim()));
		} catch {
			/* a broken block: skip it */
		}
	}
	const offers = product?.offers;
	const offer = (Array.isArray(offers) ? offers[0] : offers) as Record<string, unknown> | undefined;
	const currency = String(offer?.priceCurrency || meta('product:price:currency') || meta('og:price:currency') || 'INR').toUpperCase();
	const priceNum = Number(offer?.price ?? offer?.lowPrice ?? (meta('product:price:amount') || meta('og:price:amount') || NaN));
	// A price only when the page states one in rupees.
	const price = currency === 'INR' && priceNum > 0 && priceNum < 1e7 ? Math.round(priceNum) : null;
	const brandName = product?.brand && typeof product.brand === 'object' ? String((product.brand as Record<string, unknown>).name ?? '') : String(product?.brand ?? '');
	const text = decode(html.replace(/<(script|style|noscript|svg|nav|footer|header)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 4000);
	const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim());
	const facts = {
		url: u.href,
		site: meta('og:site_name') || host.replace(/^www\./, ''),
		title: (String(product?.name ?? '') || meta('og:title') || title).slice(0, 200),
		brand: brandName.slice(0, 80),
		description: (String(product?.description ?? '') || meta('og:description') || meta('description')).slice(0, 1200),
		price,
		text
	};
	if (!facts.title && !facts.description && facts.text.length < 200) throw new Error(CANT);
	return facts;
}

/** A creator brief from a product link: what the content should show, the key message, do's and don'ts. */
async function brandBrief(x: Run, b: Record<string, unknown>) {
	const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
	const page = await readProductPage(String(b.url ?? ''));
	const reply = await chat(
		x,
		`You write creator briefs for an Indian brand that works with Instagram creators. From the product page below, return ONLY JSON:
{"product": "the product's short name, under 60 characters",
 "brief": "2 or 3 sentences for the creator: what the content should show, for whom, and the feeling to leave",
 "message": "the one key message, under 160 characters",
 "dos": ["3 to 5 short do's, e.g. show it in use, mention the real benefit the page states, add the Paid partnership label"],
 "donts": ["2 to 4 short don'ts, e.g. no claims the page doesn't make (medical, 'best', 'guaranteed'), no competitor brands in frame"],
 "hashtags": ["3 to 5 hashtags, including the brand's own if the page shows one"],
 "mentions": ["the brand's Instagram handle, only if the page shows it"]}
Use only facts from the page; never invent claims, ingredients, prices, offers or handles. Simple English. Indian creators label paid content as an ad (ASCI), so one do is always the Paid partnership label.`,
		JSON.stringify({ ...page, category: clip(b.category, 40), deal: clip(b.deal, 40), deliverables: clip(b.deliverables, 120) }),
		900
	);
	const j = firstJson(reply) ?? {};
	const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).map((k) => clip(k, len)).filter(Boolean).slice(0, n);
	const tags = (v: unknown, mark: string) => list(v, 6, 40).map((t) => mark + t.replace(/^[#@]+/, '').replace(/\s+/g, '')).filter((t) => t.length > 1);
	return {
		product: clip(j.product, 80) || clip(page.title, 80),
		price: page.price,
		brief: clip(j.brief, 600),
		message: clip(j.message, 200),
		dos: list(j.dos, 5, 160),
		donts: list(j.donts, 4, 160),
		hashtags: tags(j.hashtags, '#'),
		mentions: tags(j.mentions, '@'),
		link: page.url
	};
}
