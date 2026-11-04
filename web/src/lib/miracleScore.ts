// The Miracle Score: how Explore ranks creators for brands. Earned, never bought: what a creator has
// delivered on Miracle, how fast they answer, how healthy their audience is and how complete their page is.
// New creators start in the middle on the parts they have no record for yet, so they aren't buried.
import type { DiscoverCreator } from './types';
import { reelRate } from './fit';

export type ScorePart = { key: 'delivery' | 'proof' | 'replies' | 'audience' | 'profile'; label: string; got: number; max: number; why: string };
export type MiracleScore = { total: number; parts: ScorePart[]; label: string; tone: 'ok' | 'warn' | 'info' };

export type Reviews = { avg: number; n: number } | null | undefined;

export function miracleScore(c: DiscoverCreator, rev?: Reviews): MiracleScore {
	const t = c.trust;
	const posted = t?.posted ?? 0;
	const onTime = t?.on_time ?? 0;
	const deals = t?.deals ?? 0;
	const reply = t?.reply_hours ?? null;
	const health = c.health?.score ?? null;

	// Delivery (35): posts that went up on time. Fewer than 3 posts blends towards the middle.
	const ratio = posted ? onTime / posted : 0.5;
	const weight = Math.min(posted, 3) / 3;
	const delivery = Math.round(35 * (ratio * weight + 0.5 * (1 - weight)));
	// Proof (20): paid deals done through Miracle (15), and what brands said after (5; none yet sits mid-way).
	const stars = rev?.n ? (rev.avg >= 4.5 ? 5 : rev.avg >= 4 ? 4 : rev.avg >= 3 ? 2 : 0) : 2;
	const proof = Math.min(deals, 5) * 3 + stars;
	// Replies (15): how fast they answer brands.
	const replies = reply == null ? 8 : reply <= 2 ? 15 : reply <= 6 ? 13 : reply <= 24 ? 10 : reply <= 48 ? 6 : 3;
	// Audience (20): Audience health from Instagram; a serious brand-safety note takes some off.
	let audience = health == null ? 10 : Math.round((health / 100) * 20);
	if (c.health?.safety?.level === 'review') audience = Math.max(0, audience - 6);
	// Profile (10): what a brand needs to decide.
	const bits = [!!c.photo, !!c.niche?.trim(), !!c.city?.trim(), !!c.languages?.length, !!reelRate(c), c.followers != null];
	const profile = Math.round((bits.filter(Boolean).length / bits.length) * 10);

	const parts: ScorePart[] = [
		{ key: 'delivery', label: 'Delivers on time', got: delivery, max: 35, why: posted ? `${onTime} of ${posted} posts on time` : 'No posts through Miracle yet' },
		{ key: 'proof', label: 'Deals and reviews', got: proof, max: 20, why: [deals ? `${deals} paid deal${deals === 1 ? '' : 's'} on Miracle` : 'No paid deals yet', rev?.n ? `${rev.avg}★ from ${rev.n} brand${rev.n === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') },
		{ key: 'replies', label: 'Replies fast', got: replies, max: 15, why: reply == null ? 'Not enough messages yet' : reply <= 1 ? 'Usually within an hour' : `Usually within ${Math.round(reply)} hours` },
		{ key: 'audience', label: 'Healthy audience', got: audience, max: 20, why: health == null ? 'Instagram not connected' : `Audience health ${health}` },
		{ key: 'profile', label: 'Complete profile', got: profile, max: 10, why: `${bits.filter(Boolean).length} of ${bits.length} basics filled in` }
	];
	const total = Math.max(0, Math.min(100, parts.reduce((a, p) => a + p.got, 0)));
	const label = total >= 80 ? 'Top rated' : total >= 65 ? 'Strong' : total >= 50 ? 'Good' : 'New';
	return { total, parts, label, tone: total >= 65 ? 'ok' : total >= 50 ? 'info' : 'warn' };
}

/** Short proof lines for a card: the record that makes a brand trust them. */
export function proofLines(c: DiscoverCreator, rev?: Reviews): { text: string; tone: 'ok' | 'info' | 'warn' }[] {
	const t = c.trust;
	const out: { text: string; tone: 'ok' | 'info' | 'warn' }[] = [];
	if (rev?.n) out.push({ text: `${rev.avg}★ (${rev.n} review${rev.n === 1 ? '' : 's'})`, tone: rev.avg >= 4 ? 'ok' : 'warn' });
	if (t?.posted) out.push({ text: `On time ${t.on_time} of ${t.posted}`, tone: t.on_time / t.posted >= 0.85 ? 'ok' : 'warn' });
	if (t?.deals) out.push({ text: `${t.deals} verified deal${t.deals === 1 ? '' : 's'}`, tone: 'ok' });
	if (c.health?.score != null) out.push({ text: `Audience ${c.health.score}`, tone: c.health.score >= 65 ? 'ok' : 'warn' });
	if (t?.reply_hours != null) out.push({ text: t.reply_hours <= 1 ? 'Replies in ~1h' : `Replies in ~${Math.round(t.reply_hours)}h`, tone: t.reply_hours <= 24 ? 'info' : 'warn' });
	return out;
}

/** Cost per 1,000 views for a Reel, when both are known. */
export const costPerK = (c: DiscoverCreator) => {
	const r = reelRate(c);
	return r && c.avg_views ? Math.round((r / c.avg_views) * 1000) : null;
};
