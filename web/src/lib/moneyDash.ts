// The Money dashboard's numbers, for one financial year (April to March): what came in, from whom,
// how fast, what is still to come and how the year compares with the last one.
import { buildReport, fyFromStart, type FY, type FinancialSummary } from './reports';
import type { Collab } from './types';
import { diff, iso, isPaid, outstanding, overdue, parse, today } from './util';

export type Slice = { label: string; value: number; color: string };

const PALETTE = ['var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--h-live)', 'var(--h-request)', 'var(--h-nego)', 'var(--m5)', 'var(--m3)'];

const monthsOf = (fy: FY) =>
	Array.from({ length: 12 }, (_, i) => {
		const d = new Date(fy.start, 3 + i, 1);
		return { ym: iso(d).slice(0, 7), label: d.toLocaleDateString('en-IN', { month: 'short' }) };
	});

const inFy = (d: string | null | undefined, fy: FY) => !!d && d >= fy.from && d <= fy.to;
/** Money received from one collab during the year, counted exactly as the Reports page counts it. */
function receivedFy(c: Collab, fy: FY) {
	const issued = (c.invoices ?? []).filter((i) => i.status !== 'draft' && i.status !== 'cancelled');
	if (!issued.length) return isPaid(c) && inFy(c.paid_on, fy) ? Number(c.pay_received) || 0 : 0;
	return issued.filter((i) => inFy(i.paid_on, fy)).reduce((a, i) => a + (Number(i.amount_received) || 0) * (Number(i.inr_rate) || 1), 0);
}

export function moneyDash(collabs: Collab[], fy: FY, goal: number, summary?: FinancialSummary | null, previous?: FinancialSummary | null) {
	const r = summary ?? buildReport(collabs, fy);
	const prevFy = fyFromStart(fy.start - 1);
	const prev = previous ?? buildReport(collabs, prevFy);
	const T = today();
	const ymNow = iso(T).slice(0, 7);
	const months = monthsOf(fy);
	// Months of this year that have happened (all twelve for a past year).
	const upto = fy.to < iso(T) ? 12 : Math.max(1, months.findIndex((m) => m.ym === ymNow) + 1);

	// Month by month: received, invoiced (before GST) and barter value.
	const monthly = months.map((m, i) => ({
		label: m.label,
		received: r.months[i]?.received ?? 0,
		invoiced: r.months[i]?.taxable ?? 0,
		barter: r.months[i]?.barter ?? 0,
		now: m.ym === ymNow
	}));

	// Growth: running total this year against the same months last year.
	let a = 0;
	let b = 0;
	const growth = months.map((_, i) => ({ now: i < upto ? (a += r.months[i]?.received ?? 0) : null, last: (b += prev.months[i]?.received ?? 0) }));
	const sameTimeLastYear = prev.months.slice(0, upto).reduce((x, m) => x + m.received, 0);
	const vsLast = sameTimeLastYear > 0 ? Math.round(((r.total.received - sameTimeLastYear) / sameTimeLastYear) * 100) : null;

	// Who it comes from: by brand category, and the top brands.
	const byCat = new Map<string, number>();
	const byBrand = new Map<string, { name: string; received: number; due: number }>();
	for (const c of collabs) {
		const got = receivedFy(c, fy);
		const due = outstanding(c);
		if (got) byCat.set(c.brand.category || 'Other', (byCat.get(c.brand.category || 'Other') ?? 0) + got);
		if (got || due) {
			const x = byBrand.get(c.brand.id) ?? { name: c.brand.name, received: 0, due: 0 };
			x.received += got;
			x.due += due;
			byBrand.set(c.brand.id, x);
		}
	}
	const cats = [...byCat.entries()].sort((x, y) => y[1] - x[1]);
	const categories: Slice[] = [...cats.slice(0, 5), ...(cats.length > 5 ? [['Other categories', cats.slice(5).reduce((s, x) => s + x[1], 0)] as [string, number]] : [])].map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
	const brands = [...byBrand.values()].sort((x, y) => y.received + y.due - (x.received + x.due)).slice(0, 6);

	// Cash or product: what the year paid in money, in products, and what is still to come.
	const due = collabs.reduce((s, c) => s + outstanding(c), 0);
	const mix: Slice[] = [
		{ label: 'Money received', value: r.total.received, color: 'var(--g2)' },
		{ label: 'Products (barter)', value: r.total.barter, color: 'var(--g3)' },
		{ label: 'Still to come', value: due, color: 'var(--g1)' }
	];

	// Coming in: what is owed, by the week it is due, for the next eight weeks (and what is late).
	const late = collabs.filter(overdue).reduce((s, c) => s + outstanding(c), 0);
	const weeks = Array.from({ length: 8 }, (_, w) => {
		const start = new Date(T.getFullYear(), T.getMonth(), T.getDate() + w * 7);
		return { label: w === 0 ? 'This week' : start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: 0 };
	});
	let later = 0;
	for (const c of collabs) {
		const owed = outstanding(c);
		if (!owed || overdue(c)) continue;
		const d = c.pay_due ? diff(c.pay_due) : null;
		if (d === null || d >= 56) later += owed;
		else weeks[Math.max(0, Math.floor(d / 7))].value += owed;
	}

	// How fast brands pay: on time (by the due date) and the usual wait after going live.
	const paidCs = collabs.filter((c) => isPaid(c) && c.pay_status === 'paid' && c.paid_on && c.paid_on >= fy.from && c.paid_on <= fy.to);
	const withDue = paidCs.filter((c) => c.pay_due);
	const onTime = withDue.length ? withDue.filter((c) => c.paid_on! <= c.pay_due!).length / withDue.length : null;
	const waits = paidCs.map((c) => (parse(c.paid_on!).getTime() - parse(c.live_date || c.received_on).getTime()) / 864e5).filter((d) => d >= 0 && d < 365);
	const avgWait = waits.length ? Math.round(waits.reduce((s, d) => s + d, 0) / waits.length) : null;

	// Deals: average paid deal this year, and how many paid out.
	const won = collabs.filter((c) => c.received_on >= fy.from && c.received_on <= fy.to && isPaid(c) && c.fee > 0 && ['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage));
	const avgDeal = won.length ? Math.round(won.reduce((s, c) => s + Number(c.fee), 0) / won.length) : 0;

	const thisMonth = r.months.find((x) => x.key === ymNow)?.received ?? 0;
	return {
		fy,
		received: r.total.received,
		tds: r.total.tds,
		barter: r.total.barter,
		invoiced: r.total.taxable,
		vsLast,
		prevLabel: prevFy.label,
		thisMonth,
		goal,
		goalPct: goal ? thisMonth / goal : null,
		due,
		late,
		monthly,
		growth,
		categories,
		brands,
		mix,
		weeks,
		later,
		onTime,
		avgWait,
		avgDeal,
		deals: won.length
	};
}
export type MoneyDash = ReturnType<typeof moneyDash>;
