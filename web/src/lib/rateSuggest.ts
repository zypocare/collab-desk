// Suggested starting rates from her live Instagram numbers, pitched at the moderate middle of the
// Indian market (not agency or US rates). A blend of reach (followers) and attention (average views),
// nudged by engagement, then each deliverable as a share of a Reel. A starting point to adjust.
import type { IgAccount } from './types';

// Price of each deliverable relative to one Reel (typical Indian ratios).
const SHARE: Record<string, number> = { Reel: 1, Story: 0.15, 'Static post': 0.4, Carousel: 0.5, 'UGC video': 0.5 };
const round = (n: number) => (n < 2000 ? Math.round(n / 100) * 100 : Math.round(n / 500) * 500);

export function engagementFactor(er: number | null) {
	if (er === null) return 1;
	return er < 1 ? 0.8 : er < 3 ? 1 : er < 6 ? 1.1 : 1.2;
}

/** ₹ per deliverable, or null if Instagram isn't connected with enough data. */
export function suggestRates(ig: IgAccount | null): Record<string, number> | null {
	if (!ig?.connected || !ig.followers) return null;
	// Per follower for a Reel: ₹0.50 for the first 10K, ₹0.35 up to 1 lakh, ₹0.25 up to 5 lakh, ₹0.15 beyond.
	// (About ₹5K at 10K followers, ₹8.5K at 20K, ₹36K at 1 lakh.)
	const f = ig.followers;
	const tier = (from: number, to: number) => Math.max(0, Math.min(f, to) - from);
	const byFollowers = tier(0, 1e4) * 0.5 + tier(1e4, 1e5) * 0.35 + tier(1e5, 5e5) * 0.25 + tier(5e5, Infinity) * 0.15;
	const byViews = (ig.avg_views ?? f * 0.3) * 0.8; // about ₹800 per 1,000 average views
	const reel = (0.5 * byFollowers + 0.5 * byViews) * engagementFactor(ig.engagement_rate);
	return Object.fromEntries(Object.entries(SHARE).map(([k, share]) => [k, Math.max(500, round(reel * share))]));
}

/** How her price compares: well under (30%+ below), well over (50%+ above), or fine. */
export const rateCheck = (cur: number, sg: number) => (cur > 0 && cur < sg * 0.7 ? 'low' : cur > sg * 1.5 ? 'high' : '');
