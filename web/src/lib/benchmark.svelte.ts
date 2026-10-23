// What creators like her charge: per content type, the middle half of prices in accepted quotes across
// Miracle from creators of a similar size (and niche, when there are enough), never fewer than 5
// creators and never hers. Until there's enough data, a rough guide from published Indian rate cards.
import { supabase } from './supabase';

export type Range = { p25: number; p50: number; p75: number; creators: number; deals: number; niche: boolean };
export const bench = $state<{ band: number; niche: string; kinds: Record<string, Range>; loaded: boolean }>({ band: 0, niche: '', kinds: {}, loaded: false });

export async function loadBench() {
	if (bench.loaded) return;
	const { data } = await supabase.rpc('rate_benchmark');
	const d = (data ?? {}) as { band?: number; niche?: string; kinds?: Record<string, Range> };
	bench.band = d.band ?? 0;
	bench.niche = d.niche ?? '';
	bench.kinds = d.kinds ?? {};
	bench.loaded = true;
}

export const BANDS = ['', 'under 10K followers', '10K to 50K followers', '50K to 2L followers', '2L to 10L followers', 'over 10L followers'];
// Rough guide (per piece, in rupees) by follower band, from Indian agency rate cards published in
// 2025-26. Wide on purpose: niche, engagement and city move prices a lot.
const GUIDE: Record<string, [number, number][]> = {
	Reel: [[0, 0], [2000, 8000], [8000, 30000], [30000, 100000], [100000, 300000], [300000, 1000000]],
	'Static post': [[0, 0], [1000, 5000], [5000, 15000], [15000, 50000], [50000, 150000], [150000, 500000]],
	Carousel: [[0, 0], [1500, 6000], [6000, 20000], [20000, 60000], [60000, 180000], [180000, 600000]],
	Story: [[0, 0], [500, 2000], [2000, 6000], [6000, 20000], [20000, 60000], [60000, 200000]]
};
export const guide = (kind: string, band: number) => {
	const g = GUIDE[kind]?.[band];
	return g && g[1] ? { low: g[0], high: g[1] } : null;
};

/** The range for a content type: real deals when there are enough, else the guide. */
export function rangeFor(kind: string) {
	const r = bench.kinds[kind];
	if (r) return { low: r.p25, mid: r.p50, high: r.p75, from: `${r.creators} creators${r.niche ? ` in ${bench.niche}` : ''} your size on Miracle` };
	const g = guide(kind, bench.band);
	return g ? { low: g.low, mid: Math.round((g.low + g.high) / 2), high: g.high, from: 'a rough guide from Indian rate cards' } : null;
}

// Common add-ons on top of the content price (rules of thumb creators and agencies use).
export const ADDONS = [
	{ what: 'Brand reposts it with paid ads, 30 days', add: '+25 to 30%' },
	{ what: 'Paid ads for 90 days', add: '+50 to 75%' },
	{ what: 'Partnership ads from your handle (whitelisting)', add: '+30 to 50%' },
	{ what: 'No competitor brands for 30 days', add: '+15 to 25%' },
	{ what: 'Raw footage', add: '+20 to 30%' },
	{ what: 'Rush (under 5 days)', add: '+20%' }
];
