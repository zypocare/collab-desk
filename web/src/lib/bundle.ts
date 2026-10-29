import type { BundleTier } from './types';
import { KINDS } from './util';

// The package builder: a brand picks how many of each piece from her rates, and the more pieces they take, the
// bigger the discount on the whole package (her steps: from N pieces, P% off). Totals round to the nearest ₹100.

export const DEFAULT_TIERS: BundleTier[] = [
	{ min: 2, pct: 5 },
	{ min: 4, pct: 10 },
	{ min: 6, pct: 15 }
];

/** What each piece is, in a line, for her rate card. */
export const KIND_NOTE: Record<string, string> = {
	Reel: 'Up to 60 seconds, on the feed and in Reels.',
	Story: 'One Story frame, with your link sticker.',
	'Static post': 'One photo on the feed.',
	Carousel: 'Up to 10 slides on the feed.',
	'UGC video': 'A video for your own ads, not posted.',
	Shoot: 'Photos for you to use.'
};

/** Her steps, cleaned: whole numbers, 2+ pieces, 1–60% off, one per size, smallest first. */
export function cleanTiers(tiers?: BundleTier[] | null): BundleTier[] {
	const ok = (tiers ?? [])
		.map((t) => ({ min: Math.round(Number(t?.min)), pct: Math.round(Number(t?.pct)) }))
		.filter((t) => t.min >= 2 && t.min <= 50 && t.pct >= 1 && t.pct <= 60)
		.sort((a, b) => a.min - b.min);
	return ok.filter((t, i) => i === 0 || t.min !== ok[i - 1].min);
}

export type BundleQty = Record<string, number>;

export type BundlePrice = {
	pieces: number;
	/** At her rates, one by one. */
	full: number;
	pct: number;
	total: number;
	save: number;
	/** The next step up: how many more pieces, and its discount. */
	next: { more: number; pct: number } | null;
};

export function bundlePrice(rates: Record<string, number> | null | undefined, qty: BundleQty, tiers?: BundleTier[] | null): BundlePrice {
	const steps = cleanTiers(tiers);
	let pieces = 0;
	let full = 0;
	for (const [k, n] of Object.entries(qty)) {
		const q = Math.max(0, Math.round(Number(n) || 0));
		const r = Number(rates?.[k]) || 0;
		if (!q || !r) continue;
		pieces += q;
		full += q * r;
	}
	const pct = steps.filter((t) => pieces >= t.min).pop()?.pct ?? 0;
	const total = pct ? Math.min(full, Math.round((full * (100 - pct)) / 100 / 100) * 100) : full;
	const up = steps.find((t) => t.min > pieces);
	return { pieces, full, pct, total, save: full - total, next: up ? { more: up.min - pieces, pct: up.pct } : null };
}

/** The package as a link value, `Reel:2,Story:2`, and back. */
export const buildParam = (qty: BundleQty) =>
	KINDS.filter((k) => qty[k] > 0)
		.map((k) => `${k}:${qty[k]}`)
		.join(',');

export function parseBuild(v: string | null | undefined): BundleQty {
	const out: BundleQty = {};
	for (const part of (v ?? '').split(',')) {
		const [k, n] = part.split(':');
		const q = Math.round(Number(n));
		if (KINDS.includes(k) && q > 0) out[k] = Math.min(20, q);
	}
	return out;
}
