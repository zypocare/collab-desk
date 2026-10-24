// AI for brands: a plain-language read of their reports, and a creator brief from a product link.
// Runs on the free AI with the brand team's own daily share (worker/index.ts, migration 133).
import { askAi } from './ai';
import type { Report } from './brandReports.svelte';
import type { SalesRow } from './brandSales';
import type { BriefDetails } from './types';

export type Reading = { headline: string; points: string[]; next: string[]; answer: string };
export type BriefDraft = { product: string; price: number | null; brief: string; message: string; dos: string[]; donts: string[]; hashtags: string[]; mentions: string[]; link: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
// How many creators and campaigns the analyst gets one by one; the rest come as one "others" total, and
// coverage says so, so an answer never speaks for the whole portfolio from a part of it.
const MAX_CREATORS = 40;
const MAX_CAMPAIGNS = 15;

/** The numbers the analyst reads: totals, the funnel, each creator (cost per view, engagement, sales), campaigns. */
export function reportFacts(r: Report, sales: SalesRow[] = []) {
	const k = r.kpi;
	const salesBy = new Map<number, { orders: number; revenue: number }>();
	const undated = sales.reduce((n, s) => n + (s.undated ?? 0), 0);
	for (const s of sales) {
		const t = salesBy.get(s.creator_id) ?? { orders: 0, revenue: 0 };
		t.orders += s.orders;
		t.revenue += s.revenue;
		salesBy.set(s.creator_id, t);
	}
	const byFees = [...r.by_creator].sort((a, b) => b.fees - a.fees || b.spent - a.spent);
	const listed = byFees.slice(0, MAX_CREATORS);
	const rest = byFees.slice(MAX_CREATORS);
	const camps = r.campaigns.slice(0, MAX_CAMPAIGNS);
	return {
		coverage: {
			creators_listed: listed.length, creators_total: r.by_creator.length,
			campaigns_listed: camps.length, campaigns_total: r.campaigns.length,
			note: rest.length || r.campaigns.length > camps.length ? 'Only the biggest are listed one by one; the rest are added up in others.' : 'Every creator and campaign in the period is listed.'
		},
		totals: {
			paid: k.spent, paid_before: k.spent_prev, still_to_pay: k.to_pay, creators: k.creators, booked_again: k.rebooked,
			requests: k.collabs, live: k.live, in_talks: k.talks, posts: k.posts, views: k.views, views_before: k.views_prev,
			cpv: k.views ? r2(k.post_fees / k.views) : null, engagement_pct: k.views ? r2((k.acts / (k.reach || k.views)) * 100) : null
		},
		funnel: r.funnel,
		creators: listed.map((c) => {
			const s = salesBy.get(c.id);
			return {
				// Invoices sent to this brand in the period, paid or not (the totals' "paid" counts paid only).
				name: c.name, collabs: c.collabs, invoiced: c.spent, views: c.views,
				cpv: c.views ? r2(c.fees / c.views) : null, engagement_pct: c.views ? r2((c.acts / c.views) * 100) : null,
				// Sales per rupee of creator fees only: not the full campaign cost (product, shipping, ads, agency).
				rating: c.rating, orders: s?.orders ?? null, sales: s?.revenue ?? null, sales_per_fee_rupee: s && c.fees ? r2(s.revenue / c.fees) : null
			};
		}),
		others: rest.length
			? { creators: rest.length, collabs: rest.reduce((n, c) => n + c.collabs, 0), invoiced: rest.reduce((n, c) => n + c.spent, 0), views: rest.reduce((n, c) => n + c.views, 0) }
			: null,
		// Sales are orders dated inside this period, matched by promo code; fees are this period's too.
		sales_note: `Orders dated ${r.from} to ${r.to}, matched to creators by promo code.${undated ? ` ${undated} order${undated === 1 ? '' : 's'} had no date and ${undated === 1 ? 'is' : 'are'} not counted.` : ''}`,
		campaigns: camps.map((c) => ({ name: c.name, budget: c.budget, creators_asked: c.asked, creators_agreed: c.agreed, fees_agreed: c.spent, views: c.views })),
		months: r.by_month.slice(-6),
		rights: r.content,
		tax: r.tax
	};
}

export const explainReport = (facts: ReturnType<typeof reportFacts>, company: string, period: string, question = '') =>
	askAi<Reading>('brandask', { facts, company, period, question });

export const briefFromLink = (url: string, ctx: { category?: string; deal?: string; deliverables?: string } = {}) =>
	askAi<BriefDraft>('brandbrief', { url, ...ctx });

/** The draft laid into the brief's fields: only the ones still empty, so nothing typed is lost. */
export function fillBrief(cur: BriefDetails, d: BriefDraft): BriefDetails {
	const lines = (l: string[]) => l.map((t) => `• ${t}`).join('\n');
	return {
		...cur,
		message: cur.message?.trim() ? cur.message : d.message,
		dos: cur.dos?.trim() ? cur.dos : lines(d.dos),
		donts: cur.donts?.trim() ? cur.donts : lines(d.donts),
		hashtags: cur.hashtags?.length ? cur.hashtags : d.hashtags,
		mentions: cur.mentions?.length ? cur.mentions : d.mentions,
		link: cur.link?.trim() ? cur.link : d.link
	};
}
