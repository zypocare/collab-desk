import type { IgMedia } from './types';

export type PulseStatus = 'hot' | 'steady' | 'slow';

export type PulseSnapshot = {
	minute: number;
	views: number;
	shares: number;
	saves: number;
	likes: number;
	comments: number;
	ts: string;
};

export type LaunchPulse = {
	id: string;
	media_id: string;
	caption: string;
	permalink: string;
	thumbnail_url: string;
	posted_at: string;
	snapshots: PulseSnapshot[];
	latest_views: number;
	latest_shares: number;
	latest_saves: number;
	latest_likes: number;
	latest_comments: number;
	median_views: number;
	median_shares_1k: number;
	median_saves_1k: number;
	pulse_score: number;
	status: PulseStatus;
	story_hook: string;
	story_done: boolean;
	dm_keyword: string | null;
	notified_at: string | null;
	updated_at: string;
};

export type PulseComment = {
	id: string;
	username: string;
	text: string;
	timestamp: string;
	replied: boolean;
	suggestedReply: string;
};

function median(nums: number[]): number {
	const arr = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
	if (!arr.length) return 0;
	const mid = Math.floor(arr.length / 2);
	return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

export function minutesSince(isoStr: string): number {
	const ms = Date.parse(isoStr);
	if (!Number.isFinite(ms)) return 999;
	return Math.max(1, Math.round((Date.now() - ms) / 60000));
}

export function isGoldenHour(isoStr: string): boolean {
	const m = minutesSince(isoStr);
	return m >= 0 && m <= 60;
}

/** Golden Hour applies only to feed Posts, Carousels, and Reels — never Stories. */
export function isEligiblePulseMedia(m: { product_type?: string | null; media_type?: string | null; media_product_type?: string | null }): boolean {
	const pt = String(m.product_type ?? m.media_product_type ?? '').toUpperCase();
	const mt = String(m.media_type ?? '').toUpperCase();
	if (pt === 'STORY' || pt === 'STORIES' || mt === 'STORY') return false;
	return pt === 'REELS' || pt === 'FEED' || mt === 'VIDEO' || mt === 'IMAGE' || mt === 'CAROUSEL_ALBUM' || (!pt && !mt);
}

export function activeReelFromMedia(media: IgMedia[]): IgMedia | null {
	const eligible = media.filter(isEligiblePulseMedia);
	return eligible[0] ?? null;
}

export function suggestKeywordFromCaption(caption: string): string {
	const stop = new Set(['THIS', 'THAT', 'WITH', 'FROM', 'YOUR', 'JUST', 'WHAT', 'WHEN', 'HAVE', 'MORE', 'ABOUT', 'REEL', 'VIDEO', 'INSTA', 'TODAY']);
	const words = caption
		.replace(/#\S+/g, ' ')
		.toUpperCase()
		.replace(/[^A-Z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter((w) => w.length >= 4 && w.length <= 12 && !stop.has(w));
	return words[0] ?? 'LINK';
}

export function suggestStoryHookFromCaption(caption: string): string {
	const clean = caption.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
	const lead = clean.split(/[.!?\n]/)[0]?.trim() ?? '';
	if (lead.length >= 16) {
		const short = lead.length > 78 ? lead.slice(0, 75).trim() + '…' : lead;
		return `"${short} — full details in the new Reel (tap to watch)"`;
	}
	return '"Just posted a new Reel — tap to watch and tell me your favourite part in the comments"';
}

/** Build a local LaunchPulse preview from synced studio.media when no DB pulse row exists yet. */
export function buildFallbackPulse(media: IgMedia[]): LaunchPulse | null {
	const newest = activeReelFromMedia(media);
	if (!newest) return null;

	const others = media.filter((m) => m.id !== newest.id && isEligiblePulseMedia(m));
	const fullMedViews = median(others.map((m) => Number(m.views ?? m.reach ?? 0))) || 2000;
	const hour1MedViews = Math.max(250, Math.round(fullMedViews * 0.28));
	const medShares1k = Number(
		(
			median(
				others
					.map((m) => {
						const v = Number(m.views ?? m.reach ?? 0);
						return v >= 100 && m.shares != null ? (Number(m.shares) / v) * 1000 : 0;
					})
					.filter((x) => x > 0)
			) || 10
		).toFixed(2)
	);
	const medSaves1k = Number(
		(
			median(
				others
					.map((m) => {
						const v = Number(m.views ?? m.reach ?? 0);
						return v >= 100 && m.saves != null ? (Number(m.saves) / v) * 1000 : 0;
					})
					.filter((x) => x > 0)
			) || 12
		).toFixed(2)
	);

	const views = Number(newest.views ?? newest.reach ?? 0);
	const shares = Number(newest.shares ?? 0);
	const saves = Number(newest.saves ?? 0);
	const age = Math.min(60, minutesSince(newest.posted_at));
	const frac = Math.min(1, Math.max(0.12, Math.pow(Math.max(5, age) / 60, 0.85)));
	const expectedViews = Math.max(50, hour1MedViews * frac);
	const viewRatio = views / expectedViews;
	const shares1k = views > 0 ? (shares / views) * 1000 : 0;
	const saves1k = views > 0 ? (saves / views) * 1000 : 0;
	const composite = viewRatio * 0.45 + (shares1k / Math.max(1, medShares1k)) * 0.35 + (saves1k / Math.max(1, medSaves1k)) * 0.2;
	const pulse_score = Math.max(15, Math.min(99, Math.round(52 + Math.log2(Math.max(0.25, composite)) * 22)));
	const status: PulseStatus = pulse_score >= 76 ? 'hot' : pulse_score >= 52 ? 'steady' : 'slow';

	return {
		id: '',
		media_id: newest.id,
		caption: newest.caption || 'Latest Instagram Reel',
		permalink: newest.permalink,
		thumbnail_url: newest.thumbnail_url,
		posted_at: newest.posted_at,
		snapshots: [
			{
				minute: age,
				views,
				shares,
				saves,
				likes: Number(newest.likes ?? 0),
				comments: Number(newest.comments ?? 0),
				ts: newest.insights_at || new Date().toISOString()
			}
		],
		latest_views: views,
		latest_shares: shares,
		latest_saves: saves,
		latest_likes: Number(newest.likes ?? 0),
		latest_comments: Number(newest.comments ?? 0),
		median_views: hour1MedViews,
		median_shares_1k: medShares1k,
		median_saves_1k: medSaves1k,
		pulse_score,
		status,
		story_hook: suggestStoryHookFromCaption(newest.caption || ''),
		story_done: false,
		dm_keyword: null,
		notified_at: null,
		updated_at: newest.insights_at || new Date().toISOString()
	};
}

export function statusCopy(status: PulseStatus): { pill: string; title: string; color: string } {
	if (status === 'hot') {
		return { pill: 'BREAKOUT MOMENTUM', title: 'Hitting Explore early', color: 'var(--ok)' };
	}
	if (status === 'steady') {
		return { pill: 'STEADY PACE', title: 'Right on your median', color: 'var(--g1)' };
	}
	return { pill: 'NEEDS EARLY SPARK', title: 'Slow start — still saveable', color: 'var(--warn)' };
}
