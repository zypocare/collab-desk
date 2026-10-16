// Profile insights brands ask for, as stored by the Instagram sync (ig_account.insights).
export type FormatStats = { posts: number; avg_views: number | null; avg_reach: number | null; avg_interactions: number | null; er: number | null; manual?: boolean };
export type InsightsData = {
	from?: string;
	to?: string;
	totals?: Record<string, number>;
	prev?: Record<string, number>;
	formats?: { reels: FormatStats; carousels: FormatStats; photos: FormatStats; stories?: FormatStats };
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

/** Instagram's 30-day reach sometimes comes back lower than the accounts that engaged, which can't be;
 *  then it isn't shown. */
export const reachOk = (t: Record<string, number> | undefined) => !!t?.reach && t.reach >= (t.accounts_engaged ?? 0);

/** % change from the previous 30 days, or null when there's nothing to compare with. */
export function change(cur: number | undefined, prev: number | undefined) {
	if (!cur || !prev) return null;
	return Math.round(((cur - prev) / prev) * 100);
}

export const FORMAT_LABEL: Record<string, string> = { reels: 'Reels', carousels: 'Carousels', photos: 'Photos', stories: 'Stories' };

// ---- What the insights page shows (also used by the media kit PDF, so both always match) ----
export type Kpi = { k: string; v: number; sub: string; ch: number | null; pct?: boolean };

export function insightKpis(d: PublicInsights): Kpi[] {
	const t = d.insights.totals ?? {};
	const pv = d.insights.prev ?? {};
	const f = d.insights.formats;
	const g = d.insights.growth?.d30;
	const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '-' : '');
	const short = (n: number) => (Math.abs(n) >= 1e6 ? `${+(Math.abs(n) / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${+(Math.abs(n) / 1e3).toFixed(1)}K` : String(Math.abs(n)));
	const all: { k: string; v: number | null | undefined; sub: string; ch: number | null; pct?: boolean }[] = [
		{ k: 'Followers', v: d.followers, sub: g ? `${sign(g)}${short(g)} in 30 days` : '', ch: null },
		{ k: 'Accounts reached', v: reachOk(t) ? t.reach : undefined, sub: '30 days', ch: reachOk(pv) ? change(t.reach, pv.reach) : null },
		{ k: 'Views', v: t.views, sub: '30 days', ch: change(t.views, pv.views) },
		{ k: 'Accounts engaged', v: t.accounts_engaged, sub: '30 days', ch: change(t.accounts_engaged, pv.accounts_engaged) },
		{ k: 'Engagement rate', v: d.engagement_rate, sub: 'per post, last 12', ch: null, pct: true },
		{ k: 'Interactions', v: t.total_interactions, sub: '30 days', ch: change(t.total_interactions, pv.total_interactions) },
		{ k: 'Avg. Reel views', v: f?.reels.avg_views ?? d.avg_views, sub: f?.reels.posts ? `last ${f.reels.posts} Reels` : 'recent posts', ch: null },
		// Only when she shows Stories (the server leaves them out otherwise); her own average if she typed one.
		{ k: 'Avg. Story reach', v: f?.stories?.avg_reach, sub: f?.stories?.manual ? 'per Story' : f?.stories?.posts ? `${f.stories.posts} Stories` : '', ch: null }
	];
	return all.filter((x): x is Kpi => typeof x.v === 'number' && x.v > 0);
}

/** Likes, comments, shares and saves over the 30 days. */
export function engageMix(d: PublicInsights) {
	const t = d.insights.totals ?? {};
	return [
		{ k: 'Likes', v: t.likes },
		{ k: 'Comments', v: t.comments },
		{ k: 'Shares', v: t.shares },
		{ k: 'Saves', v: t.saves }
	].filter((x): x is { k: string; v: number } => !!x.v);
}

/** Formats she has posted, with their averages. Stories only when she shows them (with her own numbers,
 *  if she typed them in settings). */
export function formatRows(d: PublicInsights) {
	const f = d.insights.formats;
	return f ? (Object.entries(f) as [string, FormatStats][]).filter(([, s]) => s && (s.posts > 0 || s.manual)) : [];
}

/** Age, gender, top cities and top countries as percentages. */
export function audienceOf(demo: PublicInsights['demographics']) {
	const pct = (part: Record<string, number> | undefined) => {
		const entries = Object.entries(part ?? {});
		const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
		return entries.map(([k, v]) => ({ k, p: Math.round((v / total) * 100) }));
	};
	const countryName = (code: string) => {
		try {
			return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
		} catch {
			return code;
		}
	};
	return {
		age: pct(demo.age).sort((a, b) => a.k.localeCompare(b.k)),
		gender: pct(demo.gender).map((g) => ({ ...g, k: g.k === 'F' ? 'Women' : g.k === 'M' ? 'Men' : 'Other' })).sort((a, b) => b.p - a.p),
		cities: pct(demo.city).sort((a, b) => b.p - a.p).slice(0, 5).map((c) => ({ ...c, k: c.k.split(',')[0] })),
		countries: pct(demo.country).sort((a, b) => b.p - a.p).slice(0, 5).map((c) => ({ ...c, k: countryName(c.k) }))
	};
}
