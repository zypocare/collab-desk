// The site's own small server on Cloudflare. It serves the app's files as before, and answers
// /api/ai/* with Cloudflare's free AI models: reading a DM screenshot, drafting replies, writing
// a caption from a brief. Only the creator (signed in) can use it, and at most 50 times a day
// (counted in the database) so it stays inside the free daily allowance.

type Env = {
	ASSETS: { fetch: (req: Request) => Promise<Response> };
	AI: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
	SUPABASE_URL: string;
};

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
			if (!['dm', 'reply', 'caption', 'pitch'].includes(kind)) return json({ error: 'Unknown.' }, 404);
			const allowed = await take(req, env, kind);
			if (allowed !== true) return json({ error: allowed }, 403);
			const body = (await req.json()) as Record<string, unknown>;
			if (kind === 'dm') return json(await readDm(env, body));
			if (kind === 'reply') return json(await replies(env, body));
			if (kind === 'pitch') return json(await pitch(env, body));
			return json(await caption(env, body));
		} catch (e) {
			return json({ error: `The AI couldn't answer just now (${String((e as Error)?.message ?? e).slice(0, 160)}). Try again in a minute.` }, 502);
		}
	}
};

/** Signed in as the creator, and under today's limit? (checked by the database) */
async function take(req: Request, env: Env, kind: string): Promise<true | string> {
	const auth = req.headers.get('authorization') ?? '';
	const apikey = req.headers.get('apikey') ?? '';
	if (!auth.startsWith('Bearer ') || !apikey) return 'Sign in again to use AI.';
	const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/ai_take`, {
		method: 'POST',
		headers: { authorization: auth, apikey, 'content-type': 'application/json' },
		body: JSON.stringify({ p_kind: kind })
	});
	if (!r.ok) return 'Sign in again to use AI.';
	const res = (await r.json()) as { ok: boolean; left?: number };
	return res.ok ? true : "You've used today's free AI. It resets at midnight.";
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
async function chat(env: Env, system: string, user: string, max = 700) {
	return out(await env.AI.run(TEXT, { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: max, temperature: 0.3 }));
}

// ---------- 1. A DM (text or screenshot) into collab details ----------
async function readDm(env: Env, b: Record<string, unknown>) {
	let text = String(b.text ?? '').slice(0, 6000);
	const image = String(b.image ?? '');
	if (image.startsWith('data:image/')) {
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
		text = `${out(r)}\n${text}`.trim();
	}
	if (!text) return { error: 'Nothing to read.' };
	const today = new Date().toISOString().slice(0, 10);
	const reply = await chat(
		env,
		`You help an Indian Instagram creator log brand collaboration requests. Today is ${today}. From the conversation, return ONLY a JSON object:
{"brand": "brand name", "instagram": "brand handle without @", "contact": "person's name", "email": "", "phone": "",
 "type": "paid" | "hybrid" | "barter" | null, "fee": number in rupees (0 if not said),
 "product": "what they send, if anything", "product_value": number in rupees,
 "deliverables": [{"kind": "Reel" | "Story" | "Static post" | "Carousel" | "YouTube Short" | "UGC video", "qty": number}],
 "preferred_live": "YYYY-MM-DD" or "", "usage": "Organic only" | "Paid usage 30 days" | "Paid usage 90 days" | "",
 "summary": "one sentence: what the brand wants"}
Rules: "hybrid" = money plus product; "barter" = product only. "30k" = 30000, "1.5L" = 150000. The creator's own handle is ${String(b.handle ?? '')}; never use it as the brand. Leave fields empty when not mentioned. Use only facts in the text.`,
		text,
		600
	);
	const j = firstJson(reply) ?? {};
	return { transcript: image ? text : '', fields: j };
}

// ---------- 2. Reply drafts for a brand chat ----------
async function replies(env: Env, b: Record<string, unknown>) {
	const thread = (Array.isArray(b.thread) ? b.thread : []).slice(-12) as { from: string; text: string }[];
	const ctx = b.context as Record<string, unknown> | undefined;
	const reply = await chat(
		env,
		`You draft short replies for an Indian Instagram creator answering a brand about a paid collaboration. Warm, professional, plain English, no emojis overload (one at most), 1 to 3 sentences each. Never invent prices, dates or promises that aren't in the facts. Facts: ${JSON.stringify(ctx ?? {})}.
Return ONLY JSON: {"replies": ["...", "...", "..."]} with three different options (e.g. agree, ask a question, propose next step).`,
		thread.map((m) => `${m.from === 'creator' ? 'Creator' : 'Brand'}: ${String(m.text).slice(0, 800)}`).join('\n') || 'No messages yet. Write a friendly first message.',
		500
	);
	const j = firstJson(reply);
	const list = Array.isArray(j?.replies) ? (j!.replies as unknown[]).map(String).filter(Boolean).slice(0, 3) : [];
	return { replies: list };
}

// ---------- 3. A caption (and shot list) from the brief ----------
async function caption(env: Env, b: Record<string, unknown>) {
	const reply = await chat(
		env,
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
async function pitch(env: Env, b: Record<string, unknown>) {
	const reply = await chat(
		env,
		`You write short pitch emails for an Indian Instagram creator to a brand she would like to collaborate with. Personal, specific to the brand, confident, not pushy. 90 to 140 words. Mention one concrete content idea for the brand, her audience fit (only facts given), and end with an easy next step and her page link. No made-up numbers. Sign with her name.
Return ONLY JSON: {"subject": "...", "body": "..."} (body is plain text with blank lines between paragraphs).`,
		JSON.stringify(b).slice(0, 3000),
		600
	);
	const j = firstJson(reply) ?? {};
	return { subject: String(j.subject ?? '').trim(), body: String(j.body ?? '').trim() };
}

