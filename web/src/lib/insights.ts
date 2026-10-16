// Profile insights brands ask for, as stored by the Instagram sync (ig_account.insights).
export type FormatStats = { posts: number; avg_views: number | null; avg_reach: number | null; avg_interactions: number | null; er: number | null };
export type InsightsData = {
	from?: string;
	to?: string;
	totals?: Record<string, number>;
	prev?: Record<string, number>;
	formats?: { reels: FormatStats; carousels: FormatStats; photos: FormatStats; stories: FormatStats };
	growth?: { d30: number | null; d90: number | null };
};
export type TopPost = { permalink: string; thumbnail_url: string; media_type: string; product_type: string; views: number | null; reach: number | null; interactions: number | null; likes: number | null; comments: number | null; posted_at: string };
export type PublicInsights = {
	display_name: string;
	handle: string;
	niche: string;
	city: string;
	username: string;
	profile_picture_url: string;
	followers: number | null;
	media_count: number | null;
	engagement_rate: number | null;
	avg_views: number | null;
	avg_reach: number | null;
	demographics: Partial<Record<'age' | 'gender' | 'city' | 'country', Record<string, number>>>;
	insights: InsightsData;
	updated_at: string | null;
	history: { day: string; followers: number }[];
	top: TopPost[];
};

/** % change from the previous 30 days, or null when there's nothing to compare with. */
export function change(cur: number | undefined, prev: number | undefined) {
	if (!cur || !prev) return null;
	return Math.round(((cur - prev) / prev) * 100);
}

export const FORMAT_LABEL: Record<string, string> = { reels: 'Reels', carousels: 'Carousels', photos: 'Photos', stories: 'Stories' };
