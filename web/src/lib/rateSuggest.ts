// Suggested starting rates from her live Instagram numbers. A blend of reach (followers) and
// attention (average views), lifted or lowered by engagement, then each deliverable as a share
// of a Reel. It's a starting point for her to adjust, not a market quote.
import type { IgAccount } from './types';

// Price of each deliverable relative to one Reel.
const SHARE: Record<string, number> = { Reel: 1, Story: 0.3, 'Static post': 0.5, Carousel: 0.65, 'YouTube Short': 0.8, 'UGC video': 0.6 };
const round = (n: number) => (n < 2000 ? Math.round(n / 100) * 100 : Math.round(n / 500) * 500);

export function engagementFactor(er: number | null) {
	if (er === null) return 1;
	return er < 1 ? 0.7 : er < 3 ? 1 : er < 6 ? 1.2 : 1.4;
}

/** ₹ per deliverable, or null if Instagram isn't connected with enough data. */
export function suggestRates(ig: IgAccount | null): Record<string, number> | null {
	if (!ig?.connected || !ig.followers) return null;
	// Per follower: ₹1 for the first 10K, ₹0.6 up to 1 lakh, ₹0.4 beyond (big audiences cost less each).
	const f = ig.followers;
	const byFollowers = Math.min(f, 1e4) * 1 + Math.max(0, Math.min(f, 1e5) - 1e4) * 0.6 + Math.max(0, f - 1e5) * 0.4;
	const byViews = (ig.avg_views ?? f * 0.3) * 1.5; // about ₹1.5 per average view
	const reel = (0.5 * byFollowers + 0.5 * byViews) * engagementFactor(ig.engagement_rate);
	return Object.fromEntries(Object.entries(SHARE).map(([k, share]) => [k, Math.max(500, round(reel * share))]));
}
