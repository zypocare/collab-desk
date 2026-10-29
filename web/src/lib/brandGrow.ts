// A brand's own Instagram, read the way a creator's is: the Insights screen's numbers (made from the brand's
// sync), what each creator's post did for the brand's followers, and the ideas on Grow.
import type { BrandIg } from './brandIg.svelte';
import type { FormatStats, PublicInsights, TopPost } from './insights';

const EMPTY: FormatStats = { posts: 0, avg_views: null, avg_reach: null, avg_interactions: null, er: null };

/** The creator's Insights screen takes this shape; a brand's sync fills it the same way. */
export function brandInsights(g: BrandIg, who: { name: string; category?: string; city?: string }): PublicInsights {
	const ins = g.insights ?? {};
	const f = ins.formats;
	const top: TopPost[] = [...(g.media ?? [])]
		.filter((m) => m.views !== null || m.reach !== null)
		.sort((a, b) => (b.views ?? b.reach ?? 0) - (a.views ?? a.reach ?? 0))
		.slice(0, 6)
		.map((m) => ({ permalink: m.permalink, thumbnail_url: m.thumbnail_url, media_type: m.media_type, product_type: m.product_type, views: m.views, reach: m.reach, interactions: m.interactions, likes: m.likes, comments: m.comments, posted_at: m.posted_at }));
	return {
		display_name: g.name || who.name,
		handle: g.username,
		niche: who.category ?? '',
		city: who.city ?? '',
		username: g.username,
		profile_picture_url: g.picture,
		followers: g.followers,
		media_count: g.media_count,
		engagement_rate: ins.er ?? null,
		avg_views: f?.reels.avg_views ?? null,
		avg_reach: f?.reels.avg_reach ?? null,
		demographics: g.demographics ?? {},
		insights: { ...ins, formats: f ? { ...f, stories: f.stories ?? EMPTY } : undefined, growth: { d30: ins.growth?.d30 ?? null, d90: ins.growth?.d90 ?? null }, sponsored: null, topics: [] },
		updated_at: g.synced_at,
		history: g.history ?? [],
		top
	} as PublicInsights;
}

/** Followers on a day (the count on it, or the last one before). */
const followersOn = (h: { day: string; followers: number }[], day: string) => [...h].reverse().find((x) => x.day <= day)?.followers ?? null;
const plus = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00`) + n * 864e5).toISOString().slice(0, 10);

export type CreatorEffect = { name: string; gain: number; views: number; perK: number | null };

/**
 * What creators' posts did for the brand's own account: followers gained in the 7 days after each live post,
 * less a usual week (the account's average week over its history). Only posts the history covers count.
 */
export function creatorEffect(
	h: { day: string; followers: number }[],
	live: { creator: string; live_date: string | null }[],
	byCreator: { name: string; views: number; fees: number }[]
): { rows: CreatorEffect[]; total: number; enough: boolean } {
	if (h.length < 10) return { rows: [], total: 0, enough: false };
	const first = h[0], last = h[h.length - 1];
	const days = Math.max(1, (Date.parse(last.day) - Date.parse(first.day)) / 864e5);
	const usualWeek = ((last.followers - first.followers) / days) * 7;
	const per = new Map<string, number>();
	for (const r of live) {
		if (!r.live_date || r.live_date < first.day || plus(r.live_date, 7) > last.day) continue;
		const a = followersOn(h, plus(r.live_date, -1)), b = followersOn(h, plus(r.live_date, 7));
		if (a === null || b === null) continue;
		per.set(r.creator, (per.get(r.creator) ?? 0) + Math.round(b - a - usualWeek));
	}
	const rows = [...per]
		.map(([name, gain]) => {
			const c = byCreator.find((x) => x.name === name);
			return { name, gain, views: c?.views ?? 0, perK: c && c.views ? Math.round((c.fees / c.views) * 1000 * 10) / 10 : null };
		})
		.filter((r) => r.gain > 0)
		.sort((a, b) => b.gain - a.gain);
	return { rows, total: rows.reduce((s, r) => s + r.gain, 0), enough: true };
}

export type Idea = { title: string; why: string; act: string; href: string };

/** This week's ideas for the brand's own account, each from its numbers and its creators'. */
export function growIdeas(g: BrandIg | null, best: { name: string; views: number; code?: string; slug?: string } | null, href: (slug: string, path: string) => string): Idea[] {
	const out: Idea[] = [];
	if (!g) {
		out.push({ title: 'Connect your Instagram.', why: 'Then this page shows your own reach, followers and best posts, and what creators did for them.', act: 'Connect', href: '/brand/settings?s=company' });
		return out;
	}
	const usual = g.insights?.formats?.reels.avg_views ?? null;
	if (best && usual && best.views > usual * 1.2) {
		out.push({
			title: `Reshare ${best.name.split(' ')[0]}'s Reel as a collab post.`,
			why: `It got ${(best.views / usual).toFixed(1)}× your usual Reel views. Ask to be added as a collaborator so it shows on your profile too.`,
			act: 'Ask',
			href: best.code && best.slug ? href(best.slug, `/brand/r/${best.code}`) : '/brand/requests'
		});
	}
	const bt = g.insights?.best_time;
	if (bt?.best_day || bt?.best_band) {
		out.push({ title: `Post your Reels on ${[bt.best_day, bt.best_band].filter(Boolean).join(', ')}.`, why: 'Your recent posts did best then.', act: 'Plan', href: '/brand/business/calendar' });
	}
	const city = Object.entries(g.demographics?.city ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0]?.split(',')[0];
	if (city) out.push({ title: `Work with creators in ${city}.`, why: `Most of your followers are there, so their audience is likely yours.`, act: 'Find', href: `/brand/creators?tab=discover&q=${encodeURIComponent(city)}` });
	const er = g.insights?.formats?.reels.er ?? null;
	if (er !== null && er < 1) out.push({ title: 'Ask creators for Reels you can run as ads.', why: `Your own Reels get ${er}% engagement; creators' Reels usually do better for brands.`, act: 'Find', href: '/brand/creators?tab=discover' });
	return out.slice(0, 3);
}
