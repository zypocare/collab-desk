// Reports for a brand: everything across its creators, campaigns and money for a period, and the
// same as one Excel file (a sheet per table).
import { call, type Money, type ContentItem, type Shipment } from './business.svelte';
import { saveBlob } from './download';
import { iso, today } from './util';
import { xlsx } from './xlsx';

export type Report = {
	from: string;
	to: string;
	kpi: {
		spent: number;
		spent_prev: number;
		to_pay: number;
		creators: number;
		rebooked: number;
		collabs: number;
		live: number;
		talks: number;
		views: number;
		views_prev: number;
		acts: number;
		reach: number;
		post_fees: number;
		posts: number;
	};
	by_month: { month: string; paid: number; due: number }[];
	by_week: { week: string; views: number; posts: number }[];
	funnel: { sent: number; agreed: number; live: number; paid: number };
	by_creator: { id: number; name: string; slug: string; collabs: number; spent: number; views: number; fees: number; acts: number; rating: number | null }[];
	campaigns: { id: string; name: string; status: string; budget: number; open: boolean; asked: number; agreed: number; spent: number; views: number; applications: number }[];
	content: { with_rights: number; ending_soon: number };
	tax: { gst: number; tds: number };
	requests: { code: string; creator: string; stage: string; type: string; fee: number; product_value: number; received_on: string; live_date: string | null; pay_status: string; deliverables: string | null; views: number }[];
};

export type Period = '30d' | 'quarter' | 'fy';
export const PERIODS: { id: Period; label: string }[] = [
	{ id: '30d', label: '30 days' },
	{ id: 'quarter', label: 'Quarter' },
	{ id: 'fy', label: 'This year' }
];

/** The dates a period covers, ending today. The year is India's financial year (from 1 April). */
export function range(p: Period): { from: string; to: string; label: string } {
	const t = today();
	const to = iso(t);
	if (p === '30d') return { from: iso(new Date(t.getTime() - 29 * 864e5)), to, label: 'Last 30 days' };
	if (p === 'quarter') return { from: iso(new Date(t.getTime() - 90 * 864e5)), to, label: 'Last 3 months' };
	const y = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1;
	return { from: `${y}-04-01`, to, label: `FY ${String(y).slice(2)}-${String(y + 1).slice(2)}` };
}

export const reports = $state<{ data: Report | null; period: Period; error: string; busy: boolean }>({ data: null, period: 'fy', error: '', busy: false });

export async function loadReports(p: Period = reports.period) {
	reports.period = p;
	reports.busy = true;
	const r = range(p);
	try {
		reports.data = await call<Report>('brand_reports', { p_from: r.from, p_to: r.to });
		reports.error = '';
	} catch (e) {
		reports.error = e instanceof Error ? e.message : String(e);
	} finally {
		reports.busy = false;
	}
}

/** Cost per view: what the posts in the period cost, over their views. */
export const perView = (fees: number, views: number) => (fees > 0 && views > 0 ? fees / views : null);

/** Everything in one .xlsx: Summary, Requests, Invoices, Content, Campaigns, Creators, Shipping. */
export async function downloadExcel(company: string) {
	const r = range(reports.period);
	const [rep, money, content, ship] = await Promise.all([
		call<Report>('brand_reports', { p_from: r.from, p_to: r.to }),
		call<Money>('brand_money').catch(() => null),
		call<ContentItem[]>('brand_content').catch(() => []),
		call<Shipment[]>('brand_shipping').catch(() => [])
	]);
	const k = rep.kpi;
	const cpv = perView(k.post_fees, k.views);
	const inPeriod = (d: string | null) => !!d && d >= r.from && d <= r.to;
	const blob = xlsx([
		{
			name: 'Summary',
			rows: [
				['Miracle report', company],
				['Period', `${r.from} to ${r.to}`],
				[],
				['Measure', 'Value'],
				['Paid to creators (₹)', k.spent],
				['Still to pay (₹)', k.to_pay],
				['Requests sent', k.collabs],
				['Creators', k.creators],
				['Live now', k.live],
				['In talks', k.talks],
				['Posts', k.posts],
				['Views', k.views],
				['Likes, comments, saves, shares', k.acts],
				['Cost per view (₹)', cpv === null ? '' : Math.round(cpv * 100) / 100],
				['GST you can claim (₹)', rep.tax.gst],
				['TDS deducted (₹)', rep.tax.tds],
				['Posts you can still use in ads', rep.content.with_rights],
				[],
				['Month', 'Paid (₹)', 'Due (₹)'],
				...rep.by_month.map((m) => [m.month, m.paid, m.due])
			]
		},
		{
			name: 'Requests',
			rows: [
				['Code', 'Creator', 'Stage', 'Type', 'Content', 'Fee (₹)', 'Product value (₹)', 'Sent on', 'Goes live', 'Payment', 'Views'],
				...rep.requests.map((q) => [q.code, q.creator, q.stage, q.type, q.deliverables ?? '', q.fee, q.product_value, q.received_on, q.live_date ?? '', q.pay_status, q.views])
			]
		},
		{
			name: 'Invoices',
			rows: [
				['Invoice', 'Creator', 'Request', 'Issued', 'Due', 'Total (₹)', 'GST (₹)', 'TDS (₹)', 'Payable (₹)', 'Still due (₹)', 'Status', 'Paid on', 'Payment reference'],
				...(money?.invoices ?? [])
					.filter((i) => inPeriod(i.issue_date) || i.status !== 'paid')
					.map((i) => [i.number, i.creator, i.code, i.issue_date, i.due_date ?? '', i.total, i.gst, i.tds ?? 0, i.payable, i.due, i.status, i.paid_on ?? '', i.claim_ref ?? ''])
			]
		},
		{
			name: 'Content',
			rows: [
				['Creator', 'Request', 'Posted', 'Type', 'Views', 'Likes', 'Link', 'Ad use', 'Ad use ends'],
				...content.flatMap((c) =>
					c.posts.length
						? c.posts.map((p) => [c.creator, c.code, p.posted_at.slice(0, 10), p.product ?? p.type, p.views ?? '', p.likes ?? '', p.permalink, c.usage, c.usage_ends ?? ''])
						: [[c.creator, c.code, '', 'Files', '', '', '', c.usage, c.usage_ends ?? '']]
				)
			]
		},
		{
			name: 'Campaigns',
			rows: [
				['Campaign', 'Status', 'Budget (₹)', 'Creators asked', 'Agreed', 'Agreed fees (₹)', 'Views', 'Applications'],
				...rep.campaigns.map((c) => [c.name, c.open ? 'Open brief' : c.status === 'sent' ? 'Sent' : 'Draft', c.budget, c.asked, c.agreed, c.spent, c.views, c.applications])
			]
		},
		{
			name: 'Creators',
			rows: [
				['Creator', 'Address', 'Requests', 'Spent (₹)', 'Views', 'Cost per view (₹)', 'Likes, comments, saves, shares', 'Your rating (of 5)'],
				...rep.by_creator.map((c) => {
					const v = perView(c.fees, c.views);
					return [c.name, `${c.slug}.miracleapp.live`, c.collabs, c.spent, c.views, v === null ? '' : Math.round(v * 100) / 100, c.acts, c.rating ?? ''];
				})
			]
		},
		{
			name: 'Shipping',
			rows: [
				['Creator', 'Request', 'Product', 'Ship to', 'Courier', 'Tracking', 'Sent', 'Received'],
				...ship.map((s) => [s.creator, s.code, s.product, s.address_ready ? [s.name, s.address, s.phone].filter(Boolean).join(', ') : 'Address not shared yet', s.carrier ?? '', s.tracking ?? '', s.shipped_at?.slice(0, 10) ?? '', s.received_at?.slice(0, 10) ?? ''])
			]
		}
	]);
	await saveBlob(blob, `miracle-report-${r.from}-to-${r.to}.xlsx`);
}
