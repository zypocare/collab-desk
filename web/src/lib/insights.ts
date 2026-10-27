import type { PostingInsights } from '../../../supabase/functions/_shared/postingTime.ts';
// Profile insights brands ask for, as stored by the Instagram sync (ig_account.insights).
export type FormatStats = {
	posts: number;
	avg_views: number | null;
	avg_reach: number | null;
	avg_interactions: number | null;
	er: number | null;
	manual?: boolean;
	measured?: number;
	avg_watch_ms?: number | null;
	/** Typical (middle) post, so one viral post doesn't pull it up. */
	med_views?: number | null;
	med_reach?: number | null;
	/** Saves and shares per 100 accounts reached. */
	save_rate?: number | null;
	share_rate?: number | null;
};
export type Topic = { k: string; posts: number; med_views: number | null; avg_views: number | null; med_reach: number | null };
export type TimeBucket = { k: string; posts: number; med_reach?: number | null; typical?: number };
export type BestTime = { posts: number; bands: TimeBucket[]; days: TimeBucket[]; best_band: string | null; best_day: string | null };
export type Month = { month: string; followers: number | null; reach: number | null; views: number | null; engaged: number | null; er: number | null; reels_er: number | null };
/** How many posts an average is based on: those Instagram gave figures for (older syncs: all looked at). */
export const basedOn = (s: FormatStats) => s.measured ?? s.posts;
export type InsightsData = {
	from?: string;
	to?: string;
	totals?: Record<string, number>;
	prev?: Record<string, number>;
	formats?: { reels: FormatStats; carousels: FormatStats; photos: FormatStats; stories?: FormatStats };
	growth?: { d30: number | null; d90: number | null };
	sponsored?: { sponsored: FormatStats; regular: FormatStats } | null;
	topics?: Topic[];
	best_time?: (BestTime & Partial<Pick<PostingInsights, 'version' | 'metric' | 'recommendation'>>) | null;
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
	months?: Month[];
	top: TopPost[];
};

// ---- Brand links: the sections a link can leave out ----
export const SECTIONS = [
	{ k: 'formats', label: 'By format' },
	{ k: 'engage', label: 'How people engage' },
	{ k: 'audience', label: 'Audience' },
	{ k: 'sponsored', label: 'Sponsored vs regular' },
	{ k: 'topics', label: 'What performs best' },
	{ k: 'top', label: 'Top content' },
	{ k: 'collabs', label: 'Past brand collabs' }
] as const;
export type SectionKey = (typeof SECTIONS)[number]['k'];

/** "80% India · 67% aged 18-34 · top city Bangalore · 69% women": what brands scan for first. */
export function audienceSummary(demo: PublicInsights['demographics']): string[] {
	const a = audienceOf(demo ?? {});
	const out: string[] = [];
	if (a.countries[0]) out.push(`${a.countries[0].p}% ${a.countries[0].k}`);
	const young = a.age.filter((x) => x.k === '18-24' || x.k === '25-34').reduce((s, x) => s + x.p, 0);
	if (young) out.push(`${young}% aged 18–34`);
	if (a.cities[0]) out.push(`top city ${a.cities[0].k}`);
	if (a.gender[0] && a.gender[0].k !== 'Other') out.push(`${a.gender[0].p}% ${a.gender[0].k.toLowerCase()}`);
	return out;
}

/** Honest benchmark for the all-posts engagement rate, by account size (typical industry ranges).
 *  Only returned when it's at least average, so it's a strength worth showing. */
export function benchmark(followers: number | null, er: number | null) {
	if (!followers || er === null) return null;
	const tiers = [
		{ max: 1e4, label: 'under 10K', typical: '2–4%', low: 2, good: 4 },
		{ max: 5e4, label: '10K–50K', typical: '1–3%', low: 1, good: 3 },
		{ max: 1e5, label: '50K–100K', typical: '1–2%', low: 1, good: 2.5 },
		{ max: Infinity, label: '100K+', typical: '0.5–1.5%', low: 0.5, good: 2 }
	];
	const t = tiers.find((x) => followers < x.max)!;
	const verdict = er >= t.good ? 'Above average' : er >= t.low ? 'Average' : null;
	return verdict ? `${verdict} engagement for ${t.label} accounts: ${er}% across all posts (typical ${t.typical})` : null;
}

/** "Sponsored posts reach 92% of a regular post's audience" from the typical post of each. */
export function sponsoredLine(sp: InsightsData['sponsored']) {
	const a = sp?.sponsored.med_reach, b = sp?.regular.med_reach;
	if (!a || !b) return null;
	const pct = Math.round((a / b) * 100);
	return pct >= 100 ? `Sponsored posts reach ${pct - 100}% more people than regular posts` : `Sponsored posts reach ${pct}% of a regular post's audience`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthName = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

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
export type Kpi = { k: string; v: number; sub: string; ch: number | null; pct?: boolean; show?: string };

/** 7,400 ms -> "7.4s"; 65,000 ms -> "1m 5s". */
export function watchText(ms: number) {
	const s = ms / 1000;
	return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export function insightKpis(d: PublicInsights): Kpi[] {
	const t = d.insights.totals ?? {};
	const pv = d.insights.prev ?? {};
	const f = d.insights.formats;
	const g = d.insights.growth?.d30;
	const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '-' : '');
	const short = (n: number) => (Math.abs(n) >= 1e6 ? `${+(Math.abs(n) / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${+(Math.abs(n) / 1e3).toFixed(1)}K` : String(Math.abs(n)));
	const all: { k: string; v: number | null | undefined; sub: string; ch: number | null; pct?: boolean; show?: string }[] = [
		{ k: 'Followers', v: d.followers, sub: g ? `${sign(g)}${short(g)} in 30 days` : '', ch: null },
		{ k: 'Accounts reached', v: reachOk(t) ? t.reach : undefined, sub: '30 days', ch: reachOk(pv) ? change(t.reach, pv.reach) : null },
		{ k: 'Views', v: t.views, sub: '30 days', ch: change(t.views, pv.views) },
		{ k: 'Accounts engaged', v: t.accounts_engaged, sub: '30 days', ch: change(t.accounts_engaged, pv.accounts_engaged) },
		// The headline rate is the Reels one (what brands mostly book), labelled as such; all posts if no Reels.
		f?.reels?.er
			? { k: 'Reels engagement rate', v: f.reels.er, sub: `based on ${basedOn(f.reels)} Reel${basedOn(f.reels) === 1 ? '' : 's'}`, ch: null, pct: true }
			: { k: 'Engagement rate', v: d.engagement_rate, sub: 'per post, last 12', ch: null, pct: true },
		{ k: 'Interactions', v: t.total_interactions, sub: '30 days', ch: change(t.total_interactions, pv.total_interactions) },
		{ k: 'Avg. Reel views', v: f?.reels.avg_views ?? d.avg_views, sub: f?.reels.posts ? `based on ${basedOn(f.reels)} Reel${basedOn(f.reels) === 1 ? '' : 's'}` : 'recent posts', ch: null },
		// How long people watch a Reel, on average per view (from Instagram).
		{ k: 'Avg. watch time', v: f?.reels?.avg_watch_ms, show: f?.reels?.avg_watch_ms ? watchText(f.reels.avg_watch_ms) : undefined, sub: 'per Reel view', ch: null },
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
