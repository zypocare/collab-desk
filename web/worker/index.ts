// The site's own small server on Cloudflare. It serves the app's files as before, and answers
// /api/ai/* with free AI: reading a DM or screenshot, drafting replies, captions, pitches, and the
// "Should I take it?" reading. Only the creator (signed in) can use it.
// Nothing here can cost money: Cloudflare's AI is counted by size and stops before its free daily
// amount (checked by the database); after that, Google Gemini's free key is the backup (a key with
// no billing attached, set as the GEMINI_API_KEY secret), with emails and phone numbers removed.

import { brandPage, qrScan } from './page';

type Env = {
	ASSETS: { fetch: (req: Request) => Promise<Response> };
	AI: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
	SUPABASE_URL: string;
	SUPABASE_ANON_KEY?: string;
	GEMINI_API_KEY?: string;
};
/** One AI job: which service runs it, and how much Cloudflare AI it used (in neurons). */
type Run = { env: Env; gemini: boolean; neurons: number };

// Expected size of each job in Cloudflare neurons (reserved before, corrected after).
const COST: Record<string, number> = { dm: 160, reply: 110, caption: 110, pitch: 140, fit: 230, classify: 40, summary: 220, negotiate: 210, script: 330, nudge: 120, ask: 260, voice: 60, embed: 8 };
// Cloudflare's price list in neurons per token (Llama 3.3 70B fast; Llama 3.2 11B vision).
const PER_TOKEN = { text: [0.0267, 0.2048], vision: [0.0045, 0.0615] };
const USED_UP = "Today's free AI is used up. It's back at 5:30 am.";

const TEXT = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const VISION = '@cf/meta/llama-3.2-11b-vision-instruct';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
	async fetch(req: Request, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
		const url = new URL(req.url);
		if (url.pathname.startsWith('/q/')) return qrScan(req, env, url);
		if (url.pathname === '/' && req.method === 'GET') return brandPage(req, env, url, ctx);
		if (!url.pathname.startsWith('/api/ai/')) return env.ASSETS.fetch(req);
		if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
		try {
			const kind = url.pathname.slice('/api/ai/'.length);
			if (kind === 'status') return json(await status(req, env));
			if (!['dm', 'reply', 'caption', 'pitch', 'classify', 'fit', 'summary', 'negotiate', 'script', 'nudge', 'ask', 'voice', 'embed'].includes(kind)) return json({ error: 'Unknown.' }, 404);
			const body = (await req.json()) as Record<string, unknown>;
			const job = (x: Run) =>
				kind === 'dm' ? readDm(x, body) : kind === 'reply' ? replies(x, body) : kind === 'pitch' ? pitch(x, body) : kind === 'classify' ? classify(x, body) : kind === 'fit' ? fit(x, body) : kind === 'summary' ? summary(x, body) : kind === 'negotiate' ? negotiate(x, body) : kind === 'script' ? script(x, body) : kind === 'nudge' ? nudge(x, body) : kind === 'ask' ? ask(x, body) : kind === 'voice' ? voice(x, body) : kind === 'embed' ? embed(x, body) : caption(x, body);

			// Checking an incoming Instagram DM comes from the DM webhook with a single-use pass
			// (Cloudflare only: DMs are never sent to the backup automatically).
			if (kind === 'classify') {
				const allowed = await takeTicket(req, env);
				if (allowed !== true) return json({ error: allowed }, 403);
				return json(await job({ env, gemini: false, neurons: 0 }));
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
			return json({ error: m.startsWith('!') ? m.slice(1) : `The AI couldn't answer just now (${m.slice(0, 160)}). Try again in a minute.` }, 502);
		}
	}
};

// Readings that give the same answer for the same input (kept two weeks).
const CACHED = ['dm', 'summary', 'fit', 'embed'];
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
async function takeTicket(req: Request, env: Env): Promise<true | string> {
	const ticket = req.headers.get('x-ai-ticket') ?? '';
	const apikey = req.headers.get('apikey') ?? '';
	if (!ticket || !apikey) return 'Not allowed.';
	const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/ai_take_ticket`, {
		method: 'POST',
		headers: { apikey, authorization: `Bearer ${apikey}`, 'content-type': 'application/json' },
		body: JSON.stringify({ p_ticket: ticket })
	});
	if (!r.ok) return 'Not allowed.';
	return ((await r.json()) as { ok: boolean }).ok ? true : 'Not allowed.';
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
	try {
		return JSON.parse(s.slice(a, b + 1)) as Record<string, unknown>;
	} catch {
		return null;
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
async function chat(x: Run, system: string, user: string, max = 700) {
	if (x.gemini) return gemini(x.env, system, private_(user), max);
	const r = await x.env.AI.run(TEXT, { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: max, temperature: 0.3 });
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
/** Emails and phone numbers stay out of what goes to Google (the app reads those itself). */
const private_ = (t: string) => t.replace(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, '[email]').replace(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, '[phone]').replace(/\+?\d[\d\s-]{8,}\d/g, (m) => (m.replace(/\D/g, '').length >= 10 ? '[phone]' : m));

/** Google Gemini's free tier (a key with no billing attached, so it can't charge). */
async function gemini(env: Env, system: string, user: string, max: number) {
	for (const model of ['gemini-flash-latest', 'gemini-2.5-flash']) {
		for (const thinking of [true, false]) {
			const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY ?? '' },
				body: JSON.stringify({
					systemInstruction: { parts: [{ text: system }] },
					contents: [{ role: 'user', parts: [{ text: user }] }],
					generationConfig: { temperature: 0.3, maxOutputTokens: max, ...(thinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) }
				})
			});
			if (r.status === 429) throw new Error('USED_UP');
			const j = (await r.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
			if (r.status === 404) break; // try the next model name
			if (r.status === 400 && thinking && /think/i.test(j.error?.message ?? '')) continue; // a model without that setting
			if (!r.ok) throw new Error(j.error?.message ?? `Gemini ${r.status}`);
			return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
		}
	}
	throw new Error('Gemini model not found');
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
async function caption(x: Run, b: Record<string, unknown>) {
	const reply = await chat(
		x,
		`You write Instagram captions for an Indian lifestyle creator's brand collaborations. The caption must sound like her (first person, natural, not salesy), start with a hook line, include the brand's key message and required tags/hashtags from the brief, mention the promo code if given, and start with "#ad" or include "#ad" as Indian ASCI rules require. Keep it under 120 words. Also give a short shot list for the Reel.
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
		600
	);
	const j = firstJson(reply) ?? {};
	return { subject: String(j.subject ?? '').trim(), body: String(j.body ?? '').trim() };
}

// ---------- 5. Does an Instagram DM look like a brand collaboration? ----------
async function classify(x: Run, b: Record<string, unknown>) {
	const reply = await chat(
		x,
		`You screen Instagram DMs for an Indian lifestyle creator (yoga, travel, fashion, food; Bengaluru). You get the chat so far ("Them:" is the sender, "Her:" is the creator); judge what THEM wants. Messages may be in English, Hinglish, Hindi, Kannada or other Indian languages.
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
async function negotiate(x: Run, b: Record<string, unknown>) {
	const num = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
	const offer = num(b.offer), ask = num(b.ask), floor = num(b.floor);
	const thread = (Array.isArray(b.thread) ? b.thread : []).slice(-10) as { from: string; text: string }[];
	const reply = await chat(
		x,
		`You are a seasoned talent manager negotiating brand deals for an Indian Instagram creator. Write replies in her voice (first person), warm and confident, never apologetic or desperate, 2 to 4 short sentences, no more than one emoji. Reply in the language the brand used (English, Hinglish, Hindi or Kannada), keeping amounts as ₹ figures.
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

// ---------- 5b3. "Ask your desk": questions about her own collabs, money and plans ----------
// The app sends a compact summary of her data (no contact details); the AI answers only from it and
// may suggest up to three actions from a fixed list, which the app shows as buttons she confirms.
const ASK_ACTIONS = ['open_collab', 'mark_paid', 'new_invoice', 'nudge', 'go', 'new_collab', 'remind', 'move_stage', 'shoot_day'];
const ASK_STAGES = ['negotiating', 'confirmed', 'creating', 'live', 'wrapped', 'declined'];
const ASK_PATHS = ['/studio', '/studio/collabs', '/studio/payments', '/studio/reports', '/studio/content', '/studio/calendar', '/studio/inbox', '/studio/settings', '/studio/pitches', '/studio/brands'];
async function ask(x: Run, b: Record<string, unknown>) {
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
		`You are the assistant inside an Indian Instagram creator's collab studio. Answer her question using ONLY the data below (her collabs, money and plans). Today is ${String(b.today ?? '')}. If the answer isn't in the data, say so plainly. Be brief: 1 to 4 sentences, or a short list of up to 6 lines. Amounts in rupees in Indian format (₹1,50,000), dates like "18 Oct". Reply in the language she asked in (English, Hinglish, Hindi or Kannada).
When useful, suggest up to 3 actions, each one of: open_collab {code}, mark_paid {code} (only for a collab with money still owed), new_invoice {code} (agreed or later, not invoiced yet), nudge {code} (brand gone quiet), go {path: one of ${ASK_PATHS.join(', ')}}, new_collab {text: the details she gave}, remind {codes: [codes]} (when she asks to remind or chase several brands: those with an unpaid invoice, an open quote or a draft waiting), move_stage {code, stage: one of ${ASK_STAGES.join(', ')}} (when she asks to move or mark a collab), shoot_day {code, date: YYYY-MM-DD} (when she asks to plan a shoot). Give each a short button label. She confirms every action in the app before anything happens.
Data (stage: request=new, negotiating=in talks, confirmed=agreed, creating, live, wrapped=done; money in rupees): ${JSON.stringify(b.data ?? {}).slice(0, 12000)}
${sources.length ? `Messages, emails, briefs and notes that may answer the question (numbered). When you use one, cite it like [2]; quote the brand's own words when it helps:\n${sources.map((s) => `[${s.n}] ${s.kind} · ${s.brand}${s.code ? ` (${s.code})` : ''} · ${s.date}: ${s.text}`).join('\n')}\n` : ''}Return ONLY JSON: {"answer": "...", "cites": [numbers of the sources you used], "actions": [{"type": "...", "code": "", "codes": [], "stage": "", "date": "", "path": "", "text": "", "label": "..."}]}`,
		[...history.map((h) => `Earlier question: ${h.q}\nEarlier answer: ${h.a}`), `Question: ${String(b.question ?? '').slice(0, 600)}`].join('\n\n'),
		700
	);
	const j = firstJson(reply) ?? {};
	const answer = String(j.answer ?? '').trim();
	if (!answer) throw new Error('No clear answer from the AI.');
	const CODE = /^CD-[A-Z0-9]{4,8}$/;
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
const UA = { 'user-agent': 'CollabDesk/1.0 (collab-desk.zypocare.workers.dev)', 'accept-language': 'en' };

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
