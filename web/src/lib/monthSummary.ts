// "Your month in review": the facts of one month, worked out in the app (money, deals, content,
// followers, prices). The AI only turns these facts into a short review; it never invents numbers.
import { learnRates } from './rateLearn';
import type { Collab, IgMedia, Settings } from './types';
import { KINDS, outstanding, overdue } from './util';

export type MonthFacts = {
	month: string;
	label: string;
	earned: number;
	goal: number;
	paidBy: { brand: string; amount: number }[];
	invoiced: number;
	stillToCome: number;
	overdue: { brand: string; amount: number }[];
	requests: { total: number; paid: number; barter: number; hybrid: number; said_yes: number; declined: number };
	wentLive: string[];
	barterValue: number;
	collabPosts: { brand: string; views: number | null; reach: number | null; engagement: number | null }[];
	ownPosts: { count: number; avgViews: number | null; best: { caption: string; views: number } | null };
	followers: { start: number; end: number } | null;
	prices: { kind: string; advice: string; suggest: number | null; why: string }[];
	nextMonth: { booked: number; expected: number; brands: string[] };
};

const ym = (d: string | null | undefined) => (d ?? '').slice(0, 7);
const er = (m: IgMedia) => {
	const inter = (m.likes ?? 0) + (m.comments ?? 0) + (m.saves ?? 0) + (m.shares ?? 0);
	return m.reach ? Math.round((inter / m.reach) * 1000) / 10 : null;
};

export function monthLabel(month: string) {
	return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
export function prevMonth(d = new Date()) {
	const x = new Date(d.getFullYear(), d.getMonth() - 1, 1);
	return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}
const nextOf = (month: string) => {
	const [y, m] = month.split('-').map(Number);
	const x = new Date(y, m, 1);
	return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};

export function monthFacts(month: string, collabs: Collab[], s: Settings, media: IgMedia[], history: { day: string; followers: number }[]): MonthFacts {
	const paid = collabs.filter((c) => c.pay_status === 'paid' && ym(c.paid_on) === month);
	const byBrand = new Map<string, number>();
	for (const c of paid) byBrand.set(c.brand.name, (byBrand.get(c.brand.name) ?? 0) + c.pay_received);
	const invoices = collabs.flatMap((c) => (c.invoices ?? []).filter((i) => i.status !== 'draft' && i.status !== 'cancelled' && ym(i.issue_date) === month));
	const reqs = collabs.filter((c) => ym(c.received_on) === month);
	const live = collabs.filter((c) => ym(c.live_date) === month && ['live', 'wrapped'].includes(c.stage));
	const posts = collabs.flatMap((c) => (c.posts ?? []).filter((p) => ym(p.media?.posted_at) === month).map((p) => ({ brand: c.brand.name, m: p.media })));
	const own = media.filter((m) => ym(m.posted_at) === month);
	const views = own.map((m) => m.views).filter((v): v is number => typeof v === 'number');
	const best = [...own].filter((m) => m.views).sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
	const h = history.filter((x) => ym(x.day) === month).sort((a, b) => a.day.localeCompare(b.day));
	const next = nextOf(month);
	const booked = collabs.filter((c) => ['confirmed', 'creating'].includes(c.stage) && ym(c.live_date ?? c.preferred_live) === next);
	const od = collabs.filter(overdue);
	return {
		month,
		label: monthLabel(month),
		earned: paid.reduce((a, c) => a + c.pay_received, 0),
		goal: s.monthly_goal ?? 0,
		paidBy: [...byBrand].map(([brand, amount]) => ({ brand, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5),
		invoiced: invoices.reduce((a, i) => a + (Number(i.total) || 0), 0),
		stillToCome: collabs.reduce((a, c) => a + outstanding(c), 0),
		overdue: od.map((c) => ({ brand: c.brand.name, amount: outstanding(c) })).slice(0, 5),
		requests: {
			total: reqs.length,
			paid: reqs.filter((c) => c.type === 'paid').length,
			barter: reqs.filter((c) => c.type === 'barter').length,
			hybrid: reqs.filter((c) => c.type === 'hybrid').length,
			said_yes: reqs.filter((c) => ['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage)).length,
			declined: reqs.filter((c) => c.stage === 'declined').length
		},
		wentLive: live.map((c) => c.brand.name),
		barterValue: collabs.filter((c) => c.type !== 'paid' && ym(c.product_received_at ?? c.product_date) === month).reduce((a, c) => a + c.product_value, 0),
		collabPosts: posts.map((p) => ({ brand: p.brand, views: p.m?.views ?? null, reach: p.m?.reach ?? null, engagement: p.m ? er(p.m) : null })).slice(0, 6),
		ownPosts: { count: own.length, avgViews: views.length ? Math.round(views.reduce((a, b) => a + b, 0) / views.length) : null, best: best ? { caption: (best.caption ?? '').slice(0, 80), views: best.views ?? 0 } : null },
		followers: h.length >= 2 ? { start: h[0].followers, end: h[h.length - 1].followers } : null,
		prices: learnRates(collabs, s.rates ?? {}, KINDS)
			.filter((l) => l.advice === 'raise' || l.advice === 'lower')
			.map((l) => ({ kind: l.kind, advice: l.advice, suggest: l.suggest, why: l.why })),
		nextMonth: { booked: booked.length, expected: booked.reduce((a, c) => a + (c.type === 'barter' ? 0 : c.fee), 0), brands: booked.map((c) => c.brand.name).slice(0, 5) }
	};
}

/** Months worth reviewing: the last six that had any activity. */
export function reviewMonths(collabs: Collab[], now = new Date()) {
	const out: string[] = [];
	for (let i = 1; i <= 6; i++) {
		const x = new Date(now.getFullYear(), now.getMonth() - i, 1);
		const m = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
		if (collabs.some((c) => [c.received_on, c.paid_on, c.live_date].some((d) => ym(d) === m)) || i === 1) out.push(m);
	}
	return out;
}
