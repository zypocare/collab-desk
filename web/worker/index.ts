// The site's own small server on Cloudflare. It serves the app's files as before, and answers
// /api/ai/* with free AI: reading a DM or screenshot, drafting replies, captions, pitches, and the
// "Should I take it?" reading. Only the creator (signed in) can use it.
// Nothing here can cost money: Cloudflare's AI is counted by size and stops before its free daily
// amount (checked by the database); after that, Google Gemini's free key is the backup (a key with
// no billing attached, set as the GEMINI_API_KEY secret), with emails and phone numbers removed.

type Env = {
	ASSETS: { fetch: (req: Request) => Promise<Response> };
	AI: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
	SUPABASE_URL: string;
	GEMINI_API_KEY?: string;
};
/** One AI job: which service runs it, and how much Cloudflare AI it used (in neurons). */
type Run = { env: Env; gemini: boolean; neurons: number };

// Expected size of each job in Cloudflare neurons (reserved before, corrected after).
const COST: Record<string, number> = { dm: 160, reply: 110, caption: 110, pitch: 140, fit: 230, classify: 40, summary: 220 };
// Cloudflare's price list in neurons per token (Llama 3.3 70B fast; Llama 3.2 11B vision).
const PER_TOKEN = { text: [0.0267, 0.2048], vision: [0.0045, 0.0615] };
const USED_UP = "Today's free AI is used up. It's back at 5:30 am.";

const TEXT = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const VISION = '@cf/meta/llama-3.2-11b-vision-instruct';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);
		if (!url.pathname.startsWith('/api/ai/')) return env.ASSETS.fetch(req);
		if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
		try {
			const kind = url.pathname.slice('/api/ai/'.length);
			if (kind === 'status') return json(await status(req, env));
			if (!['dm', 'reply', 'caption', 'pitch', 'classify', 'fit', 'summary'].includes(kind)) return json({ error: 'Unknown.' }, 404);
			const body = (await req.json()) as Record<string, unknown>;
			const job = (x: Run) =>
				kind === 'dm' ? readDm(x, body) : kind === 'reply' ? replies(x, body) : kind === 'pitch' ? pitch(x, body) : kind === 'classify' ? classify(x, body) : kind === 'fit' ? fit(x, body) : kind === 'summary' ? summary(x, body) : caption(x, body);

			// Checking an incoming Instagram DM comes from the DM webhook with a single-use pass
			// (Cloudflare only: DMs are never sent to the backup automatically).
			if (kind === 'classify') {
				const allowed = await takeTicket(req, env);
				if (allowed !== true) return json({ error: allowed }, 403);
				return json(await job({ env, gemini: false, neurons: 0 }));
			}

			const est = (COST[kind] ?? 150) + (kind === 'dm' && String(body.image ?? '') ? 100 : 0);
			const t = await take(req, env, kind, est);
			if (t === 'auth') return json({ error: 'Sign in again to use AI.' }, 403);
			if (t === 'ok') {
				const x: Run = { env, gemini: false, neurons: 0 };
				try {
					const res = await job(x);
					await settle(req, env, kind, Math.round(x.neurons) - est);
					return json(res);
				} catch (e) {
					// Cloudflare says its free amount is gone (counted differently from ours): use the backup.
					if (!/neuron|allocation|4006|quota|limit/i.test(String((e as Error)?.message))) throw e;
					await settle(req, env, kind, 9000);
				}
			}
			// Cloudflare's free amount is used up today: the free Gemini backup, if it's set up.
			if (!env.GEMINI_API_KEY || !(await takeGemini(req, env, kind))) return json({ error: USED_UP }, 429);
			return json(await job({ env, gemini: true, neurons: 0 }));
		} catch (e) {
			const m = String((e as Error)?.message ?? e);
			if (m === 'USED_UP') return json({ error: USED_UP }, 429);
			return json({ error: m.startsWith('!') ? m.slice(1) : `The AI couldn't answer just now (${m.slice(0, 160)}). Try again in a minute.` }, 502);
		}
	}
};

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
const out = (r: unknown) => String((r as { response?: unknown })?.response ?? (typeof r === 'string' ? r : '')).trim();
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
 "deliverables": [{"kind": "Reel" | "Story" | "Static post" | "Carousel" | "UGC video", "qty": number}],
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
		`${ig ? 'You draft short Instagram DM replies for an Indian Instagram creator. The other person may be a brand, an agency or a follower: answer what they actually asked, in her voice. For brands, be warm and professional and move towards the details (deliverables, budget, dates); never quote a price unless it is in the facts.' : 'You draft short replies for an Indian Instagram creator answering a brand about a paid collaboration.'} Warm, professional, plain English, no emojis overload (one at most), 1 to 3 sentences each. Never invent prices, dates or promises that aren't in the facts. Facts: ${JSON.stringify(ctx ?? {})}.
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
		`You sort Instagram DMs for an Indian lifestyle creator. Decide whether someone is offering or asking about a collaboration: paid, barter or gifted content (a Reel, Story, post or video), a budget, her rates, or a campaign. This counts even if no brand is named yet: "would you do a paid Reel? Budget 30k" is "likely". Use "maybe" for vague business interest. Only these are "no": fans, friends and personal chat, giveaways she didn't run, "promote your page" or follower-selling spam, crypto, job scams, and anyone asking HER to pay or for logins.
Return ONLY JSON: {"collab": "likely" | "maybe" | "no", "brand": "brand name or ''", "summary": "under 12 words, e.g. 'Sunveda: paid Reel for SPF launch, ~₹40k'"}`,
		String(b.text ?? '').slice(0, 3000),
		200
	);
	const j = firstJson(reply) ?? {};
	const c = String(j.collab ?? 'no');
	return { collab: ['likely', 'maybe', 'no'].includes(c) ? c : 'no', brand: String(j.brand ?? ''), summary: String(j.summary ?? '').slice(0, 120) };
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
