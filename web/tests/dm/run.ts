// DM reading accuracy: runs every case in cases.json through the rule-based reader and scores
// each field. Fails (exit 1) when a field drops below its pass mark.
// Run: npm run test:dm
import { readFileSync } from 'node:fs';
import { parseDm, type Parsed } from '../../src/lib/parseDm.ts';

type Case = {
	id: string;
	text: string;
	brand?: string;
	contact?: string;
	email?: string;
	phone?: string;
	fee?: number;
	productValue?: number;
	type?: string;
	usage?: string;
	deliverables?: Record<string, number>;
	/** MM-DD of the go-live date. */
	live?: string;
	/** Day of month of the go-live date ("25 tak"). */
	liveDay?: number;
};

// Hand-written cases plus 180 made from templates (node tests/dm/generate.mjs).
const load = (f: string) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8')) as Case[];
const cases = [...load('./cases.json'), ...load('./cases-gen.json')];
// Pass marks per field (share of cases that state the field and get it right).
const MARK: Record<string, number> = { brand: 0.8, contact: 0.8, email: 1, phone: 1, fee: 0.95, productValue: 0.9, type: 0.9, usage: 0.9, deliverables: 0.9, live: 0.9 };

const score: Record<string, { ok: number; n: number; miss: string[] }> = {};
const check = (field: string, id: string, good: boolean, got: unknown) => {
	const s = (score[field] ??= { ok: 0, n: 0, miss: [] });
	s.n++;
	if (good) s.ok++;
	else s.miss.push(`${id} (got ${JSON.stringify(got)})`);
};

// AI mode: DM_AI_URL=https://…/api/ai/dm DM_AI_TOKEN=<signed-in token> DM_AI_KEY=<public key>
// scores the AI reader instead (same cases, same pass marks). Each case uses a little of the
// day's free AI, so run it before releases, not on every push.
const AI = process.env.DM_AI_URL;
async function readWithAi(text: string): Promise<Parsed> {
	const r = await fetch(AI!, { method: 'POST', headers: { authorization: `Bearer ${process.env.DM_AI_TOKEN}`, apikey: process.env.DM_AI_KEY ?? '', 'content-type': 'application/json' }, body: JSON.stringify({ text, image: '', handle: 'nicks_universe_it_is' }) });
	const f = ((await r.json()) as { fields?: Record<string, unknown> }).fields ?? {};
	const s = (k: string) => String(f[k] ?? '').trim();
	return {
		brand: s('brand'), instagram: s('instagram').replace(/^@/, ''), email: s('email'), phone: s('phone'), contact: s('contact'),
		type: (['paid', 'barter', 'hybrid'].includes(s('type')) ? s('type') : null) as Parsed['type'],
		fee: Number(f.fee) || 0, product: s('product'), productValue: Number(f.product_value) || 0,
		deliverables: (Array.isArray(f.deliverables) ? f.deliverables : []) as Parsed['deliverables'],
		preferredLive: s('preferred_live'), usage: s('usage'), brief: ''
	};
}

for (const c of cases) {
	const p: Parsed = AI ? await readWithAi(c.text) : parseDm(c.text, 'nicks_universe_it_is');
	if (c.brand !== undefined) check('brand', c.id, p.brand === c.brand, p.brand);
	if (c.contact !== undefined) check('contact', c.id, p.contact === c.contact, p.contact);
	if (c.email !== undefined) check('email', c.id, p.email === c.email, p.email);
	if (c.phone !== undefined) check('phone', c.id, p.phone === c.phone, p.phone);
	if (c.fee !== undefined) check('fee', c.id, p.fee === c.fee, p.fee);
	if (c.productValue !== undefined) check('productValue', c.id, p.productValue === c.productValue, p.productValue);
	if (c.type !== undefined) check('type', c.id, p.type === c.type, p.type);
	if (c.usage !== undefined) check('usage', c.id, p.usage === c.usage, p.usage);
	if (c.deliverables) {
		const got = Object.fromEntries(p.deliverables.map((d) => [d.kind, d.qty]));
		const want = c.deliverables;
		const same = Object.keys(want).length === Object.keys(got).length && Object.entries(want).every(([k, v]) => got[k] === v);
		check('deliverables', c.id, same, got);
	}
	if (c.live) check('live', c.id, p.preferredLive.slice(5) === c.live, p.preferredLive);
	if (c.liveDay) check('live', c.id, Number(p.preferredLive.slice(8)) === c.liveDay, p.preferredLive);
}

let failed = false;
console.log(`DM ${AI ? 'AI' : 'rule'} reader: ${cases.length} cases\n`);
for (const [f, s] of Object.entries(score)) {
	const pct = s.ok / s.n;
	const pass = pct >= (MARK[f] ?? 0.9);
	if (!pass) failed = true;
	console.log(`${pass ? 'ok  ' : 'FAIL'} ${f.padEnd(13)} ${s.ok}/${s.n}  ${(pct * 100).toFixed(1)}%  (pass mark ${((MARK[f] ?? 0.9) * 100).toFixed(0)}%)`);
	for (const m of s.miss) console.log(`       miss: ${m}`);
}
process.exit(failed ? 1 : 0);
