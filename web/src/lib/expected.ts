// What a brand can expect from a set of deliverables, from her real Instagram averages:
// views and reach per piece, then cost per view, per 1,000 views and per engagement.
import type { PublicInsights } from './insights';
import type { PublicPage } from './types';

type Line = { kind: string; qty: number };
export type Expected = { views: number; reach: number; engagements: number; cpv: number | null; cpm: number | null; cpe: number | null; basis: string };

/** Average views / reach / interactions per piece of each kind (null when Instagram has no data for it). */
function perPiece(kind: string, page: PublicPage | null, ins: PublicInsights | null) {
	const f = ins?.insights?.formats;
	const ig = page?.instagram;
	const er = (ig?.engagement_rate ?? ins?.engagement_rate ?? 0) / 100;
	const pick = (s: { avg_views: number | null; avg_reach: number | null; avg_interactions: number | null; posts: number } | undefined, fbViews: number | null | undefined, fbReach: number | null | undefined) => {
		const views = (s?.posts ? s.avg_views : null) ?? fbViews ?? null;
		const reach = (s?.posts ? s.avg_reach : null) ?? fbReach ?? null;
		if (!views && !reach) return null;
		const followers = ig?.followers ?? ins?.followers ?? 0;
		const inter = (s?.posts ? s.avg_interactions : null) ?? (er && followers ? Math.round(er * followers) : 0);
		return { views: views ?? reach ?? 0, reach: reach ?? Math.round((views ?? 0) * 0.65), inter };
	};
	switch (kind) {
		case 'Reel':
		case 'YouTube Short':
			return kind === 'Reel' ? pick(f?.reels, ig?.avg_views, ig?.avg_reach) : null;
		case 'Story':
			return pick(f?.stories, null, null);
		case 'Carousel':
			return pick(f?.carousels, ig?.avg_views, ig?.avg_reach);
		case 'Static post':
			return pick(f?.photos, null, ig?.avg_reach);
		default:
			return null; // UGC video is for the brand's own channels: no Instagram numbers.
	}
}

export function expectedResults(lines: Line[], cost: number, page: PublicPage | null, ins: PublicInsights | null): Expected | null {
	let views = 0, reach = 0, engagements = 0;
	const counted: string[] = [];
	for (const l of lines) {
		const p = perPiece(l.kind, page, ins);
		if (!p || !l.qty) continue;
		views += p.views * l.qty;
		reach += p.reach * l.qty;
		engagements += p.inter * l.qty;
		counted.push(l.kind);
	}
	if (!views && !reach) return null;
	const round = (n: number) => Math.round(n / 100) * 100;
	return {
		views: round(views),
		reach: round(reach),
		engagements: Math.round(engagements),
		cpv: cost > 0 && views ? Math.round((cost / views) * 100) / 100 : null,
		cpm: cost > 0 && views ? Math.round((cost / views) * 1000) : null,
		cpe: cost > 0 && engagements ? Math.round((cost / engagements) * 10) / 10 : null,
		basis: ins?.insights?.formats ? 'her average per format, last 90 days' : 'her recent post averages'
	};
}
