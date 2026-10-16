// Return on the brand's money for a finished collab: cost per view, per 1,000 views, per engagement
// and per account reached. Uses today's numbers when Instagram has newer ones than the report.
import type { ReportData } from './types';

export type ReportFull = ReportData & {
	type: 'paid' | 'barter' | 'hybrid';
	invested: number;
	product_value: number;
	usage: string;
	now: { views: number | null; reach: number | null; likes: number | null; comments: number | null; saves: number | null; shares: number | null; interactions: number | null; updated_at: string | null } | null;
};

export function roiOf(r: ReportFull) {
	const latest = r.now && (r.now.views ?? 0) >= (r.totals.views ?? 0) ? r.now : null;
	const views = latest?.views ?? r.totals.views ?? 0;
	const reach = latest?.reach ?? r.totals.reach ?? 0;
	const engagements = latest?.interactions ?? r.totals.interactions ?? 0;
	const cost = r.invested + (r.product_value || 0);
	const per = (n: number) => (cost > 0 && n > 0 ? cost / n : null);
	return {
		latest,
		views,
		reach,
		engagements,
		cost,
		cpv: per(views),
		cpm: per(views) === null ? null : (per(views) as number) * 1000,
		cpe: per(engagements),
		cpr: per(reach),
		growth: latest && r.totals.views ? Math.round(((views - r.totals.views) / r.totals.views) * 100) : null
	};
}

export const money = (n: number | null) => (n === null ? '—' : n < 10 ? `₹${n.toFixed(2)}` : '₹' + Math.round(n).toLocaleString('en-IN'));
