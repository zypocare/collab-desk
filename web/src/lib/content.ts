// The content side of a collab: what she still has to make, when she shoots it, how long it takes,
// and a shot list made from the brief so she can walk on set and just follow it.
import type { Collab, Settings } from './types';
import { allDone, diff, latestDraft, ships, todayIso } from './util';

export type Shot = { t: string; done: boolean };
export const DEFAULT_HOURS: Record<string, number> = { Reel: 6, Story: 1, 'Static post': 3, Carousel: 4, 'UGC video': 4, Shoot: 6 };

/** Hours still needed for a collab: pieces not done × her time per piece. */
export function hoursLeft(c: Collab, s: Pick<Settings, 'piece_hours'> | null) {
	const per = { ...DEFAULT_HOURS, ...(s?.piece_hours ?? {}) };
	return c.deliverables.filter((d) => !d.done).reduce((a, d) => a + (Number(per[d.kind]) || 2) * d.qty, 0);
}

/** Where a collab sits in her content week. */
export type ContentState = 'waiting_product' | 'to_make' | 'with_brand' | 'to_post' | null;
export function contentState(c: Collab): ContentState {
	if (!['confirmed', 'creating'].includes(c.stage)) return null;
	const dr = latestDraft(c);
	if (dr?.status === 'pending') return 'with_brand';
	if (dr?.status === 'approved') return 'to_post';
	if (allDone(c) && !dr) return 'to_post';
	if (ships(c) && !c.product_received_at && !(c.product_date && diff(c.product_date) <= 0)) return 'waiting_product';
	return 'to_make';
}

/** A sensible shoot day: two days before the draft is due, not before the product arrives, not in the past. */
export function suggestShoot(c: Collab): string {
	const today = todayIso();
	const add = (iso: string, n: number) => {
		const d = new Date(iso + 'T00:00:00');
		d.setDate(d.getDate() + n);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	};
	let day = c.draft_date ? add(c.draft_date, -2) : c.live_date ? add(c.live_date, -4) : add(today, 2);
	if (c.product_date && day < c.product_date) day = c.product_date;
	return day < today ? today : day;
}

const SHOTS: Record<string, string[]> = {
	Reel: ['Hook in the first 2 seconds (say it, don’t show a logo)', 'Product hero close-up, good light', 'Using the product, real hands, real moment', 'Result or reaction shot', 'B-roll: packaging, texture, details', 'Ending: call to action'],
	Story: ['First look or unboxing', 'Using it, talking to camera', 'Link or tag sticker slide'],
	'Static post': ['Styled product shot (2–3 angles)', 'You with the product, natural setting'],
	Carousel: ['Cover slide that stops the scroll', '3–4 detail or step slides', 'Final slide: verdict or call to action'],
	'UGC video': ['Hook: the problem in one line', 'Product demo, close-up', 'Result / before-after', 'Call to action (no on-screen branding unless asked)'],
	Shoot: ['Shot list and looks agreed with the brand', 'Hero shots in every format they need', 'Detail and lifestyle angles', 'Final edits delivered in the agreed sizes']
};

/** A shot list for the whole collab, from its deliverables and brief. */
export function makeShotList(c: Collab): Shot[] {
	const d = c.brief_details ?? {};
	const out: string[] = [];
	const product = c.product || c.brand.name;
	for (const del of c.deliverables) {
		const shots = SHOTS[del.kind] ?? [`${del.kind}: plan the shots`];
		const label = del.qty > 1 ? `${del.kind} ×${del.qty}` : del.kind;
		out.push(...shots.map((x) => `${label}: ${x}`));
	}
	if (d.message?.trim()) out.push(`Say it: ${d.message.trim()}`);
	for (const x of (d.dos ?? '').split(/\n|;/).map((s) => s.trim()).filter(Boolean)) out.push(`Do: ${x}`);
	for (const x of (d.donts ?? '').split(/\n|;/).map((s) => s.trim()).filter(Boolean)) out.push(`Avoid: ${x}`);
	if (d.references?.trim()) out.push(`Look at the references: ${d.references.trim()}`);
	const tags = [c.brand.instagram && `@${c.brand.instagram.replace(/^@/, '')}`, ...(d.mentions ?? [])].filter(Boolean);
	if (tags.length) out.push(`Tag ${[...new Set(tags)].join(' ')}`);
	if (d.link) out.push(`Link: ${d.link}`);
	out.push(`Hook ideas: “I tried ${product} for a week…” · “Stop scrolling if you…” · “My honest take on ${c.brand.name}”`);
	return out.map((t) => ({ t, done: false }));
}

export const BRIEF_NEEDS: Record<string, string> = { message: 'key message', hashtags: 'hashtags', dos: "do's or don'ts", tag: 'accounts to tag' };
/** What the brief is missing before she can plan the shoot (same rules as the database). */
export function briefMissing(c: Collab): string[] {
	const d = c.brief_details ?? {};
	return [
		!d.message?.trim() && 'message',
		!d.hashtags?.length && 'hashtags',
		!d.dos?.trim() && !d.donts?.trim() && 'dos',
		!c.brand.instagram?.trim() && !d.mentions?.length && 'tag'
	].filter((x): x is string => !!x);
}

/** Monday of the week a date falls in. */
export function weekOf(iso: string) {
	const d = new Date(iso + 'T00:00:00');
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
