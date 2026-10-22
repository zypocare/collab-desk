// Fit score: how well a creator suits this brand and what it is looking for, out of 100. Four parts,
// each 0-100: niche, audience (from what the creator shares from Instagram), past results with this
// brand, and price. A part with nothing to go on is left out rather than guessed.
import type { DiscoverCreator } from './types';

export type FitFilters = {
	niches: string[];
	/** Least share of women in the audience, 0 for any. */
	women: number;
	ages: string[];
	cities: string[];
	minFollowers: number;
	maxFollowers: number;
	/** Most for a Reel, 0 for any (only creators who show their rates can be checked). */
	reelMax: number;
	languages: string[];
};
export const NO_FILTERS: FitFilters = { niches: [], women: 0, ages: [], cities: [], minFollowers: 0, maxFollowers: 0, reelMax: 0, languages: [] };

export type Fit = { total: number; niche: number; audience: number | null; results: number | null; price: number | null; label: string; tone: 'ok' | 'warn' | 'calm' };

// Niches that sit close to each other: a skincare brand fits a beauty or wellness creator too.
const NEAR: string[][] = [
	['beauty', 'skincare', 'makeup', 'haircare', 'grooming', 'wellness', 'fashion', 'lifestyle'],
	['fashion', 'style', 'lifestyle', 'beauty', 'jewellery', 'jewelry'],
	['food', 'cooking', 'recipes', 'travel', 'lifestyle', 'restaurants'],
	['fitness', 'yoga', 'wellness', 'health', 'sports', 'running', 'lifestyle'],
	['travel', 'lifestyle', 'food', 'photography', 'adventure'],
	['tech', 'gadgets', 'gaming', 'education'],
	['parenting', 'family', 'kids', 'lifestyle'],
	['home', 'decor', 'interiors', 'lifestyle']
];
const words = (s: string) =>
	s
		.toLowerCase()
		.split(/[,&/·]| and /)
		.map((w) => w.trim())
		.filter(Boolean);

function nicheScore(niche: string, want: string[]): number {
	const have = words(niche);
	const target = want.flatMap(words);
	if (!target.length) return 70;
	if (have.some((h) => target.some((t) => h.includes(t) || t.includes(h)))) return 100;
	const near = NEAR.filter((g) => target.some((t) => g.includes(t))).flat();
	return have.some((h) => near.includes(h)) ? 75 : 40;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const cityShare = (c: DiscoverCreator, cities: string[]) =>
	(c.audience?.cities ?? []).filter((x) => cities.some((w) => x.name.toLowerCase().startsWith(w.toLowerCase()))).reduce((a, x) => a + x.pct, 0);
const ageShare = (c: DiscoverCreator, ages: string[]) => ages.reduce((a, b) => a + (c.audience?.age?.[b] ?? 0), 0);

/** The creator's Reel rate when they show it (else their lowest shown rate), or null. */
export const reelRate = (c: DiscoverCreator) => (c.rates ? (c.rates['Reel'] ?? Math.min(...Object.values(c.rates).filter((v) => v > 0))) || null : null);

export function fit(c: DiscoverCreator, f: FitFilters, brandCategory: string): Fit {
	const niche = nicheScore(c.niche ?? '', f.niches.length ? f.niches : [brandCategory]);

	let audience: number | null = null;
	if (c.audience) {
		const parts: number[] = [];
		if (f.women && c.audience.women !== null) parts.push(clamp((c.audience.women / f.women) * 100));
		if (f.ages.length) parts.push(clamp((ageShare(c, f.ages) / 50) * 100));
		if (f.cities.length) parts.push(clamp((cityShare(c, f.cities) / 30) * 100));
		audience = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 75;
	}

	let results: number | null = null;
	const w = c.with_me;
	if (w.collabs) {
		const cpv = w.fees > 0 && w.views > 0 ? w.fees / w.views : null;
		// ₹0.20 a view or less scores full marks, ₹2 a view about 20.
		const fromViews = cpv === null ? (w.wrapped ? 80 : 65) : clamp(100 - Math.max(0, cpv - 0.2) * 45);
		const r = c.rating ? ((c.rating.on_time + c.rating.quality + c.rating.results) / 15) * 100 : null;
		results = r === null ? fromViews : (fromViews + r) / 2;
	}

	let price: number | null = null;
	const rate = reelRate(c);
	if (rate) price = f.reelMax ? clamp(rate <= f.reelMax ? 100 : (f.reelMax / rate) * 100) : 75;

	const parts: [number | null, number][] = [
		[niche, 0.3],
		[audience, 0.35],
		[results, 0.2],
		[price, 0.15]
	];
	const used = parts.filter(([v]) => v !== null) as [number, number][];
	const total = clamp(used.reduce((a, [v, wt]) => a + v * wt, 0) / used.reduce((a, [, wt]) => a + wt, 0));
	return {
		total,
		niche,
		audience: audience === null ? null : clamp(audience),
		results: results === null ? null : clamp(results),
		price,
		label: total >= 80 ? 'Great fit' : total >= 60 ? 'Good fit' : 'Some fit',
		tone: total >= 80 ? 'ok' : total >= 60 ? 'warn' : 'calm'
	};
}

/** Does the creator pass the hard filters (followers, price, language, and audience when shared)? */
export function passes(c: DiscoverCreator, f: FitFilters): boolean {
	if (f.niches.length && nicheScore(c.niche ?? '', f.niches) < 75) return false;
	if (f.minFollowers && (c.followers ?? 0) < f.minFollowers) return false;
	if (f.maxFollowers && (c.followers ?? 0) > f.maxFollowers) return false;
	const rate = reelRate(c);
	if (f.reelMax && (!rate || rate > f.reelMax)) return false;
	if (f.languages.length && !(c.languages ?? []).some((l) => f.languages.includes(l))) return false;
	if (f.women && (c.audience?.women ?? 0) < f.women) return false;
	if (f.ages.length && ageShare(c, f.ages) < 25) return false;
	if (f.cities.length && cityShare(c, f.cities) < 10) return false;
	return true;
}

/** One line about the audience, picking what the brand asked about: "68% women · 54% aged 25-34 · 41% in Bangalore". */
export function audienceLine(c: DiscoverCreator, f: FitFilters): string {
	const a = c.audience;
	if (!a) return 'Audience not shared yet';
	const bits: string[] = [];
	if (a.women !== null) bits.push(`${a.women}% women`);
	const ages = f.ages.length ? f.ages : Object.entries(a.age).sort((x, y) => y[1] - x[1]).slice(0, 1).map(([k]) => k);
	const share = ages.reduce((s, b) => s + (a.age[b] ?? 0), 0);
	if (share) bits.push(`${share}% aged ${ages.join(', ')}`);
	const city = f.cities.length ? f.cities.join(', ') : a.cities[0]?.name;
	const cs = f.cities.length ? cityShare(c, f.cities) : (a.cities[0]?.pct ?? 0);
	if (city && cs) bits.push(`${cs}% in ${city}`);
	return bits.join(' · ');
}

/** Creators like this one: close in niche, size, audience and price. */
export function similar(c: DiscoverCreator, all: DiscoverCreator[], n = 4): DiscoverCreator[] {
	const nw = new Set(words(c.niche ?? ''));
	const size = (x: DiscoverCreator) => Math.log10(Math.max(1000, x.followers ?? 1000));
	const score = (x: DiscoverCreator) => {
		const xw = words(x.niche ?? '');
		const overlap = xw.filter((w) => nw.has(w)).length / Math.max(1, new Set([...nw, ...xw]).size);
		const sizeGap = Math.abs(size(x) - size(c));
		const women = c.audience?.women != null && x.audience?.women != null ? Math.abs(c.audience.women - x.audience.women) / 100 : 0.3;
		const sameCity = x.city && c.city && x.city.toLowerCase() === c.city.toLowerCase() ? 0.15 : 0;
		return overlap * 2 - sizeGap - women + sameCity;
	};
	return all
		.filter((x) => x.id !== c.id)
		.map((x) => ({ x, s: score(x) }))
		.sort((a, b) => b.s - a.s)
		.slice(0, n)
		.map((v) => v.x);
}
