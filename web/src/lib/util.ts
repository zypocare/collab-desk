import type { BrandPrivate, Checklist, Collab, CollabType, Draft, PayStatus, Quote, QuoteItem, Stage } from './types';

export const STAGES: { id: Stage; label: string; pub: string }[] = [
	{ id: 'request', label: 'New request', pub: 'Request received' },
	{ id: 'negotiating', label: 'Negotiating', pub: 'In discussion' },
	{ id: 'confirmed', label: 'Confirmed', pub: 'Terms agreed' },
	{ id: 'creating', label: 'Creating', pub: 'Content in production' },
	{ id: 'live', label: 'Live', pub: 'Live on Instagram' },
	{ id: 'wrapped', label: 'Wrapped', pub: 'Wrapped up' }
];
export const stageIndex = (s: Stage) => STAGES.findIndex((x) => x.id === s);
export const stageLabel = (s: Stage) => (s === 'declined' ? 'Declined' : STAGES[stageIndex(s)].label);
export const stagePub = (s: Stage) => (s === 'declined' ? 'Not going ahead' : STAGES[stageIndex(s)].pub);

export const KINDS = ['Reel', 'Story', 'Static post', 'Carousel', 'YouTube Short', 'UGC video'];
export const USAGE = ['Organic only', '30 days paid ads', '60 days paid ads', '90 days paid ads', 'Perpetual usage'];
export const CATS = ['Beauty', 'Skincare', 'Fashion', 'Jewellery', 'Food & drink', 'Travel', 'Home', 'Wellness', 'Fitness', 'Tech', 'Other'];
export const PAY_LABEL: Record<PayStatus, string> = {
	na: 'Barter',
	pending: 'Not invoiced',
	advance: 'Advance received',
	invoiced: 'Invoice sent',
	paid: 'Paid in full'
};
export const TYPE_LABEL: Record<CollabType, string> = { paid: 'Paid', barter: 'Barter', hybrid: 'Paid + product' };

// ---- dates (all dates are local calendar days, stored as YYYY-MM-DD) ----
const DAY = 864e5;
export const today = () => {
	const t = new Date();
	t.setHours(0, 0, 0, 0);
	return t;
};
export const iso = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayIso = () => iso(today());
export const rel = (n: number) => {
	const x = today();
	x.setDate(x.getDate() + n);
	return iso(x);
};
export const parse = (s: string) => {
	const [y, m, d] = s.slice(0, 10).split('-').map(Number);
	return new Date(y, m - 1, d);
};
export const diff = (s: string) => Math.round((parse(s).getTime() - today().getTime()) / DAY);
export const fmt = (s?: string | null) => (s ? parse(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');
export const fmtLong = (s?: string | null) =>
	s ? parse(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
export const fmtTime = (s: string) =>
	new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const relWord = (n: number) =>
	n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 1 ? `in ${n} days` : `${-n} days ago`;
export const daysLate = (n: number) => `${-n} day${-n > 1 ? 's' : ''} late`;

// ---- money ----
export const inr = (n: number | null | undefined) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
export const inrS = (n: number) => {
	n = Number(n) || 0;
	if (n >= 1e5) return '₹' + +(n / 1e5).toFixed(2) + 'L';
	if (n >= 1e3) return '₹' + +(n / 1e3).toFixed(1) + 'k';
	return '₹' + n;
};

// ---- text ----
export const plural = (k: string, n: number) => (n > 1 ? (k === 'Story' ? 'Stories' : k + 's') : k);
export const delivText = (del: { kind: string; qty: number }[]) =>
	del.length ? del.map((d) => `${d.qty} ${plural(d.kind, d.qty)}`).join(' · ') : 'No deliverables yet';
export const initials = (name: string) =>
	(name || '?')
		.split(/\s+/)
		.filter((w) => /[A-Za-z0-9]/.test(w[0] || ''))
		.slice(0, 2)
		.map((w) => w[0].toUpperCase())
		.join('') || '?';
export const hueOf = (name: string) => {
	let h = 0;
	for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return (h % 6) + 1;
};
export const firstName = (name: string) => (name || '').split(' ')[0];

// ---- collab logic ----
export const isPaid = (c: Pick<Collab, 'type'>) => c.type !== 'barter';
export const hasProduct = (c: Pick<Collab, 'type'>) => c.type !== 'paid';
export const allDone = (c: Collab) => c.deliverables.length > 0 && c.deliverables.every((d) => d.done);
export const isActive = (c: Collab) => c.stage !== 'wrapped' && c.stage !== 'declined';
export const outstanding = (c: Collab) =>
	isPaid(c) && c.pay_status !== 'paid' && ['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage)
		? Math.max(0, (Number(c.fee) || 0) - (Number(c.pay_received) || 0))
		: 0;
export const overdue = (c: Collab) => isPaid(c) && c.pay_status === 'invoiced' && !!c.pay_due && diff(c.pay_due) < 0;
export const payState = (c: Collab) => (c.pay_status === 'paid' ? 'paid' : overdue(c) ? 'overdue' : 'due');

export type NextLine = { text: string; tone: '' | 'late' | 'soon'; icon: string };
export function nextLine(c: Collab): NextLine {
	const tone = (d: number) => (d < 0 ? 'late' : d <= 2 ? 'soon' : '') as NextLine['tone'];
	const r = (text: string, d: number | null, icon = 'clock'): NextLine => ({ text, tone: d === null ? '' : tone(d), icon });
	switch (c.stage) {
		case 'request':
			return r(`Received ${relWord(diff(c.received_on))}`, null, 'inbox');
		case 'negotiating':
			return c.follow_date ? r(`Follow up ${relWord(diff(c.follow_date))}`, diff(c.follow_date), 'bell') : r('Waiting on brand', null);
		case 'confirmed':
			if (c.product_date && diff(c.product_date) >= 0) return r(`Product arrives ${relWord(diff(c.product_date))}`, diff(c.product_date), 'box');
			return c.draft_date ? r(`Draft due ${relWord(diff(c.draft_date))}`, diff(c.draft_date), 'film') : r('Set a draft date', null);
		case 'creating':
			if (c.draft_date && !allDone(c)) {
				const d = diff(c.draft_date);
				return r(d < 0 ? `Draft overdue by ${-d} day${-d > 1 ? 's' : ''}` : `Draft due ${relWord(d)}`, d, 'film');
			}
			return c.live_date ? r(`Goes live ${relWord(diff(c.live_date))}`, diff(c.live_date), 'spark') : r('Set a go-live date', null);
		case 'live':
			if (overdue(c)) {
				const d = diff(c.pay_due!);
				return r(`Payment overdue by ${-d} day${-d > 1 ? 's' : ''}`, d, 'alert');
			}
			if (c.follow_date) return r(`Follow up ${relWord(diff(c.follow_date))}`, diff(c.follow_date), 'bell');
			return r(`Live since ${fmt(c.live_date)}`, null, 'spark');
		case 'declined':
			return r('Declined', null, 'x');
		default:
			return r(`Wrapped · live ${fmt(c.live_date)}`, null, 'check');
	}
}

export type Task = { c: Collab; kind: 'new' | 'follow' | 'draft' | 'live' | 'product' | 'pay' | 'quote' | 'revise'; d: number; title: string; order: number };
export function tasks(collabs: Collab[]): Task[] {
	const out: Task[] = [];
	for (const c of collabs) {
		if (c.stage === 'declined') continue;
		if (c.stage === 'request') out.push({ c, kind: 'new', d: Math.min(0, diff(c.received_on)), title: 'Review new request', order: 0 });
		const q = latestQuote(c);
		if (q?.status === 'changes') out.push({ c, kind: 'quote', d: 0, title: 'Brand asked for changes to your quote', order: 0 });
		const dr = latestDraft(c);
		if (dr?.status === 'changes') out.push({ c, kind: 'revise', d: 0, title: `Revise draft ${dr.round}: ${dr.feedback.slice(0, 60)}`, order: 1 });
		if (c.follow_date && diff(c.follow_date) <= 2) out.push({ c, kind: 'follow', d: diff(c.follow_date), title: c.follow_note || 'Follow up', order: 1 });
		if (['confirmed', 'creating'].includes(c.stage) && c.draft_date && !allDone(c) && diff(c.draft_date) <= 3)
			out.push({ c, kind: 'draft', d: diff(c.draft_date), title: `Send draft · ${delivText(c.deliverables)}`, order: 2 });
		if (['confirmed', 'creating'].includes(c.stage) && c.live_date && diff(c.live_date) <= 3 && diff(c.live_date) >= 0)
			out.push({ c, kind: 'live', d: diff(c.live_date), title: `Goes live · ${delivText(c.deliverables)}`, order: 3 });
		if (c.stage === 'confirmed' && c.product_date && diff(c.product_date) >= 0 && diff(c.product_date) <= 2)
			out.push({ c, kind: 'product', d: diff(c.product_date), title: 'Product arriving, check the parcel', order: 4 });
		if (overdue(c)) out.push({ c, kind: 'pay', d: diff(c.pay_due!), title: `Payment overdue · ${inr(outstanding(c))}`, order: 5 });
	}
	return out.sort((a, b) => a.d - b.d || a.order - b.order);
}

export type CalEvent = { date: string; kind: 'draft' | 'live' | 'follow' | 'pay' | 'product'; c: Collab };
export function events(collabs: Collab[]): CalEvent[] {
	const ev: CalEvent[] = [];
	for (const c of collabs) {
		if (c.stage === 'declined') continue;
		const si = stageIndex(c.stage);
		if (c.product_date && si >= 2 && si <= 3) ev.push({ date: c.product_date, kind: 'product', c });
		if (c.draft_date && si >= 2 && si <= 3) ev.push({ date: c.draft_date, kind: 'draft', c });
		if (c.live_date && si >= 2) ev.push({ date: c.live_date, kind: 'live', c });
		if (c.follow_date) ev.push({ date: c.follow_date, kind: 'follow', c });
		if (isPaid(c) && c.pay_due && ['invoiced', 'advance'].includes(c.pay_status)) ev.push({ date: c.pay_due, kind: 'pay', c });
	}
	return ev;
}
export const KIND_ICON: Record<string, string> = { follow: 'bell', draft: 'film', live: 'spark', pay: 'wallet', new: 'inbox', product: 'box', quote: 'rupee', revise: 'edit' };
export const KIND_LABEL: Record<string, string> = { draft: 'Draft due', live: 'Go live', follow: 'Follow-up', pay: 'Payment due', product: 'Product arrives' };
export const evLabel = (e: CalEvent) => (e.kind === 'live' && stageIndex(e.c.stage) >= 4 ? 'Went live' : KIND_LABEL[e.kind]);

export function errMessage(e: unknown): string {
	if (!e) return 'Something went wrong.';
	if (typeof e === 'string') return e;
	if (typeof e === 'object' && e && 'message' in e) return String((e as { message: unknown }).message);
	return 'Something went wrong.';
}

// ---- quotes ----
export const latestQuote = (c: { quotes?: Quote[] }) => [...(c.quotes ?? [])].sort((a, b) => b.version - a.version)[0];
export const acceptedQuote = (c: { quotes?: Quote[] }) =>
	[...(c.quotes ?? [])].filter((q) => q.status === 'accepted').sort((a, b) => b.version - a.version)[0];
export const itemsTotal = (items: QuoteItem[]) => items.reduce((a, i) => a + Math.max(0, Number(i.qty) || 0) * Math.max(0, Number(i.rate) || 0), 0);
export const quoteTotal = (items: QuoteItem[], usageFee: number, discount: number) =>
	Math.max(0, itemsTotal(items) + (Number(usageFee) || 0) - (Number(discount) || 0));
export function payTerms(q: Pick<Quote, 'advance_pct' | 'pay_days'>) {
	if (q.advance_pct >= 100) return 'Full payment before work starts';
	const rest = q.pay_days === 0 ? 'on the day it goes live' : `within ${q.pay_days} days of going live`;
	return q.advance_pct > 0 ? `${q.advance_pct}% advance, balance ${rest}` : `Full payment ${rest}`;
}
export const QUOTE_STATUS: Record<Quote['status'], { label: string; k: string }> = {
	draft: { label: 'Draft', k: 'plain' },
	sent: { label: 'Waiting for brand', k: 'k-new' },
	accepted: { label: 'Accepted', k: 'k-pay' },
	changes: { label: 'Changes requested', k: 'k-follow' },
	withdrawn: { label: 'Replaced', k: 'plain' }
};

// ---- drafts ----
export const latestDraft = (c: { drafts?: Draft[] }) => [...(c.drafts ?? [])].sort((a, b) => b.round - a.round)[0];
export const DRAFT_STATUS: Record<Draft['status'], { label: string; k: string }> = {
	pending: { label: 'Waiting for brand', k: 'k-new' },
	approved: { label: 'Approved', k: 'k-pay' },
	changes: { label: 'Changes requested', k: 'k-follow' }
};

// ---- posting checklist (ASCI disclosure rules + brand basics) ----
export const CHECKLIST: { key: keyof Checklist; label: string }[] = [
	{ key: 'paid_label', label: '"Paid partnership" label turned on' },
	{ key: 'ad_tag', label: '#ad or #collab in the first line of the caption' },
	{ key: 'brand_tag', label: 'Brand tagged in the post and caption' },
	{ key: 'link', label: 'Discount code or link included (if agreed)' }
];
export const checklistDone = (c: Collab) => CHECKLIST.every((i) => c.checklist?.[i.key]);
export const checklistMissing = (c: Collab) => CHECKLIST.filter((i) => !c.checklist?.[i.key]).map((i) => i.label);

/** Reads a caption and says which disclosure items it already covers. */
export function captionCheck(caption: string, handle: string) {
	const firstLine = caption.trim().split(/\r?\n/)[0]?.slice(0, 140) ?? '';
	return {
		ad_tag: /#(ad|collab|sponsored|paidpartnership|partner)(?![a-z])/i.test(firstLine),
		brand_tag: !!handle && caption.toLowerCase().includes('@' + handle.toLowerCase().replace(/^@/, ''))
	};
}

// ---- competitor clashes ----
export type Clash = { other: Collab; days: number; reason: string };
export function clashes(c: Collab, all: Collab[], windowDays: number, notes: Record<string, BrandPrivate>): Clash[] {
	if (['declined', 'wrapped'].includes(c.stage) || !c.live_date) return [];
	const lower = (x: string) => x.trim().toLowerCase();
	const mine = (notes[c.brand_id]?.competitors ?? []).map(lower);
	const out: Clash[] = [];
	for (const o of all) {
		if (o.id === c.id || o.brand_id === c.brand_id || !o.live_date) continue;
		if (!['confirmed', 'creating', 'live', 'wrapped'].includes(o.stage)) continue;
		const theirs = (notes[o.brand_id]?.competitors ?? []).map(lower);
		const named = mine.includes(lower(o.brand.name)) || theirs.includes(lower(c.brand.name));
		const sameCat = o.brand.category === c.brand.category && c.brand.category !== 'Other';
		if (!named && !sameCat) continue;
		const excl = Math.max(acceptedQuote(c)?.exclusivity_days ?? 0, acceptedQuote(o)?.exclusivity_days ?? 0);
		const window = Math.max(windowDays, excl);
		const days = Math.abs(Math.round((parse(c.live_date).getTime() - parse(o.live_date).getTime()) / 864e5));
		if (days > window) continue;
		const why = named ? 'listed as a competitor' : `same category (${c.brand.category})`;
		const gap = days === 0 ? 'goes live the same day' : `goes live ${days} day${days > 1 ? 's' : ''} apart`;
		out.push({ other: o, days, reason: `${why}, ${gap}${excl > windowDays ? ` (exclusivity ${excl} days)` : ''}` });
	}
	return out.sort((a, b) => a.days - b.days);
}
