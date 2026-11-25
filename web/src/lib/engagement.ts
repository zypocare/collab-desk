// Centralized industry-standard Instagram Engagement Rate calculations.
// - Full ER (Today, My Page, Your Insights, Media Kit):
//     Avg(Likes + Comments + Shares + Saves) across last 10 non-Story posts ÷ Followers × 100.
// - Public ER (Peer Benchmarks, apples-to-apples with competitors whose Shares & Saves are private):
//     Avg(Likes + Comments) across last 10 non-Story posts ÷ Followers × 100.

export type EngagementPost = {
	likes?: number | null;
	comments?: number | null;
	saves?: number | null;
	shares?: number | null;
	interactions?: number | null;
	media_type?: string | null;
	product_type?: string | null;
	posted_at?: string | null;
};

export const ENGAGEMENT_POST_LIMIT = 10;

function recentFeed(posts: EngagementPost[] | null | undefined, limit: number): EngagementPost[] {
	if (!Array.isArray(posts) || !posts.length) return [];
	return posts
		.filter((p) => {
			const mt = String(p.media_type ?? '').toUpperCase();
			const pt = String(p.product_type ?? '').toUpperCase();
			return mt !== 'STORY' && pt !== 'STORY' && (p.interactions != null || p.likes != null || p.comments != null);
		})
		.sort((a, b) => String(b.posted_at ?? '').localeCompare(String(a.posted_at ?? '')))
		.slice(0, limit);
}

/** Industry-standard connected Insights ER: Avg(Likes + Comments + Shares + Saves) ÷ Followers × 100. */
export function calcEngagementRate(
	posts: EngagementPost[] | null | undefined,
	followers: number | null | undefined,
	limit = ENGAGEMENT_POST_LIMIT
): number | null {
	const f = Number(followers ?? 0);
	if (!Number.isFinite(f) || f <= 0) return null;
	const feed = recentFeed(posts, limit);
	if (!feed.length) return null;
	const avgInteractions =
		feed.reduce((sum, p) => {
			const total =
				p.interactions != null
					? Number(p.interactions)
					: Number(p.likes ?? 0) + Number(p.comments ?? 0) + Number(p.saves ?? 0) + Number(p.shares ?? 0);
			return sum + total;
		}, 0) / feed.length;
	return Math.round((avgInteractions / f) * 10000) / 100;
}

/** Public-only ER for apples-to-apples Peer Benchmarks: Avg(Likes + Comments) ÷ Followers × 100. */
export function calcPublicEngagementRate(
	posts: EngagementPost[] | null | undefined,
	followers: number | null | undefined,
	limit = ENGAGEMENT_POST_LIMIT
): number | null {
	const f = Number(followers ?? 0);
	if (!Number.isFinite(f) || f <= 0) return null;
	const feed = recentFeed(posts, limit);
	if (!feed.length) return null;
	const avgPublic =
		feed.reduce((sum, p) => sum + Number(p.likes ?? 0) + Number(p.comments ?? 0), 0) / feed.length;
	return Math.round((avgPublic / f) * 10000) / 100;
}

type WithFormats = { formats?: { reels?: { er?: number | null } } } | Record<string, unknown> | null | undefined;

export function headlineEr(insights: WithFormats, all: number | null | undefined): number | null {
	if (typeof all === 'number' && Number.isFinite(all) && all > 0) return Math.round(all * 100) / 100;
	const reels = (insights as { formats?: { reels?: { er?: number | null } } } | null | undefined)?.formats?.reels?.er;
	return typeof reels === 'number' && reels > 0 ? Math.round(reels * 100) / 100 : null;
}

/** 4.34 → "4.34%", 4.3 → "4.3%", 4 → "4%". */
export const erText = (v: number) => `${+Number(v).toFixed(2)}%`;
