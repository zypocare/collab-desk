import type { BriefDetails } from './types';
import { money } from './currency';
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
export const HELD_STAGES: { id: Stage; label: string; pub: string }[] = [
	{ id: 'paused', label: 'Paused', pub: 'Paused' }, { id: 'cancelled', label: 'Cancelled', pub: 'Cancelled' }
];
export const stageLabel = (s: Stage) => (s === 'declined' ? 'Declined' : [...STAGES, ...HELD_STAGES].find((x) => x.id === s)?.label ?? s);
export const stagePub = (s: Stage) => (s === 'declined' ? 'Not going ahead' : [...STAGES, ...HELD_STAGES].find((x) => x.id === s)?.pub ?? s);
export const productionHeld = (c: { stage: Stage }) => c.stage === 'paused' || c.stage === 'cancelled';

/** WhatsApp click-to-chat link (free). Indian 10-digit numbers get +91. Empty if no usable number. */
/** An email address someone can actually receive at: one @, a name, and a domain with a dot. */
export const emailOk = (v: string | null | undefined) => /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(String(v ?? '').trim());

/** A phone or WhatsApp number (optional): empty, or 8 to 15 digits with an optional +, spaces, dashes or brackets. */
export const phoneOk = (v: string | null | undefined) => {
	const t = String(v ?? '').trim();
	return !t || (/^\+?[\d\s\-()]+$/.test(t) && t.replace(/\D/g, '').length >= 8 && t.replace(/\D/g, '').length <= 15);
};

/** WhatsApp to this number, or (with no number) WhatsApp's own chat picker. */
export const waShare = (phone: string | null | undefined, text: string) => waLink(phone, text) || `https://wa.me/?text=${encodeURIComponent(text)}`;

export function waLink(phone: string | null | undefined, text: string) {
	let n = (phone ?? '').replace(/\D/g, '');
	if (n.length === 11 && n.startsWith('0')) n = n.slice(1);
	if (n.length === 10) n = '91' + n;
	return n.length >= 11 ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : '';
}

export const KINDS = ['Reel', 'Story', 'Static post', 'Carousel', 'UGC video', 'Shoot'];
/** Work she makes for the brand but doesn't post on her own Instagram (a shoot, UGC for their channels). */
export const NO_POST = ['Shoot', 'UGC video'];
/** A collab with nothing to post: no go-live, no posting checklist; "Live" means delivered. */
export const noPost = (c: Pick<Collab, 'deliverables'>) => (c.deliverables?.length ?? 0) > 0 && c.deliverables.every((d) => NO_POST.includes(d.kind));
/** The stage's name for this collab: the same everywhere (board, list, profile, collab page). */
export const stageName = (_c: Pick<Collab, 'deliverables'>, s: Stage) => stageLabel(s);
/** The content types she has switched on (all of them if the list is missing). */
export const offeredKinds = (list?: string[] | null) => (list?.length ? KINDS.filter((k) => list.includes(k)) : KINDS);
/** A package can be booked only if everything in it is still offered. */
export const packageOffered = (items: { kind: string }[], list?: string[] | null) => items.every((i) => offeredKinds(list).includes(i.kind));
/** What Instagram calls a post, in her words. */
export const mediaLabel = (type: string, product: string) =>
	product === 'STORY' ? 'Story' : product === 'REELS' ? 'Reel' : type === 'CAROUSEL_ALBUM' ? 'Carousel' : type === 'VIDEO' ? 'Video' : 'Post';
export const USAGE = ['Organic only', '30 days paid ads', '60 days paid ads', '90 days paid ads', 'Perpetual usage'];
/** How usage rights read to people. The stored values ("30 days paid ads") stay as they are; these make clear
 *  that the brand runs the ads, from its own ad account, and that it costs extra. */
export function usageLabel(u: string) {
	const d = usageDaysOf(u);
	if (d) return `Brand ads for ${d} days`;
	if (/perpetual/i.test(u)) return 'Brand use, no end date';
	if (/organic/i.test(u)) return 'Organic only (no ads)';
	return u;
}
/** The longer wording in usage pickers. */
export function usageOption(u: string) {
	const d = usageDaysOf(u);
	if (d) return `Brand runs it as ads for ${d} days (extra fee)`;
	if (/perpetual/i.test(u)) return 'Brand can use it with no end date (extra fee)';
	if (/organic/i.test(u)) return 'Organic only, no ads';
	return u;
}
/** "60 days paid ads" -> 60; organic or perpetual -> 0 (same rule as the database). */
export const usageDaysOf = (usage: string) => (/paid/i.test(usage) ? Number(usage.match(/(\d+)\s*day/i)?.[1] ?? 0) : 0);
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
/** The local calendar day of a timestamp (a UTC slice would give yesterday until 5:30 am in India). */
export const localDay = (ts?: string | null) => (ts ? iso(new Date(ts)) : '');
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
/** When numbers were last updated: "Fri, 16 Oct, 9:46 pm". */
export const fmtUpdated = (s: string) =>
	new Date(s).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
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
/** Something gets shipped to her (not an experience like a stay, a meal or an event). */
export const ships = (c: Pick<Collab, 'type' | 'barter_kind'>) => c.type !== 'paid' && c.barter_kind !== 'experience';
/** Shipped by the brand, not yet marked received. */
export const inTransit = (c: Pick<Collab, 'shipped_at' | 'product_received_at'>) => !!c.shipped_at && !c.product_received_at;

// Couriers brands use most in India. Delhivery and Shiprocket have direct tracking pages; the rest open a search.
export const CARRIERS = ['Delhivery', 'Blue Dart', 'DTDC', 'Ekart', 'Xpressbees', 'Shiprocket', 'India Post', 'Shadowfax', 'Ecom Express', 'Hand delivery', 'Other'];
export function trackUrl(carrier: string, tracking: string) {
	const t = encodeURIComponent(tracking.trim());
	if (!t) return '';
	if (carrier === 'Delhivery') return `https://www.delhivery.com/track/package/${t}`;
	if (carrier === 'Shiprocket') return `https://shiprocket.co/tracking/${t}`;
	return `https://www.google.com/search?q=${encodeURIComponent(`${carrier} tracking ${tracking.trim()}`)}`;
}
export const allDone = (c: Collab) => c.deliverables.length > 0 && c.deliverables.every((d) => d.done);
export const deliverableProgress = (deliverables: { qty: number; done: boolean; items?: { status: string }[] }[]) => ({
	total: deliverables.reduce((n, d) => n + d.qty, 0),
	done: deliverables.reduce((n, d) => n + (d.items?.length ? d.items.filter((x) => ['published', 'delivered'].includes(x.status)).length : d.done ? d.qty : 0), 0)
});
export const isActive = (c: Collab) => !['wrapped', 'declined', 'paused', 'cancelled'].includes(c.stage);
export const outstanding = (c: Collab) =>
	productionHeld(c)
		? (c.invoices ?? []).filter((i) => ['sent', 'partly_paid'].includes(i.status)).reduce((sum, i) => sum + Math.max(0, Number(i.total) - Number(i.amount_received) - Math.max(Number(i.tds_amount), Number(i.tds_deducted))) * (Number(i.inr_rate) || 1), 0)
		: isPaid(c) && c.pay_status !== 'paid' && ['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage)
		? Math.max(0, (Number(c.fee) || 0) - (Number(c.pay_received) || 0))
		: 0;
export const overdue = (c: Collab) => isPaid(c) && c.pay_status === 'invoiced' && !!c.pay_due && diff(c.pay_due) < 0;
/** Paid once the status says so, or once the whole fee has come in (whatever the status still says). */
export const payState = (c: Collab) =>
	c.pay_status === 'paid' || (isPaid(c) && Number(c.fee) > 0 && (Number(c.pay_received) || 0) >= Number(c.fee) - 1) ? 'paid' : overdue(c) ? 'overdue' : 'due';

export type NextLine = { text: string; tone: '' | 'late' | 'soon'; icon: string };
export function nextLine(c: Collab): NextLine {
	const tone = (d: number) => (d < 0 ? 'late' : d <= 2 ? 'soon' : '') as NextLine['tone'];
	const r = (text: string, d: number | null, icon = 'clock'): NextLine => ({ text, tone: d === null ? '' : tone(d), icon });
	switch (c.stage) {
		case 'paused': return r(c.resume_on ? `Paused · review ${fmt(c.resume_on)}` : 'Paused', null, 'clock');
		case 'cancelled': return r('Cancelled · review settlement', null, 'x');
		case 'request':
			return r(`Received ${relWord(diff(c.received_on))}`, null, 'inbox');
		case 'negotiating':
			return c.follow_date ? r(`Follow up ${relWord(diff(c.follow_date))}`, diff(c.follow_date), 'bell') : r('Waiting on brand', null);
		case 'confirmed':
			if (inTransit(c)) return r(`Parcel on the way · ${c.ship_carrier}`, null, 'box');
			if (ships(c) && !c.shipped_at && !c.product_received_at && !(c.product_date && diff(c.product_date) <= 0)) return r('Waiting for the brand to ship', null, 'box');
			if (c.product_date && diff(c.product_date) >= 0) return r(`Product arrives ${relWord(diff(c.product_date))}`, diff(c.product_date), 'box');
			return c.draft_date ? r(`Draft due ${relWord(diff(c.draft_date))}`, diff(c.draft_date), 'film') : r('Set a draft date', null);
		case 'creating':
			if (c.draft_date && !allDone(c)) {
				const d = diff(c.draft_date);
				return r(d < 0 ? `Draft overdue by ${-d} day${-d > 1 ? 's' : ''}` : `Draft due ${relWord(d)}`, d, 'film');
			}
			if (noPost(c)) return c.live_date ? r(`Deliver ${relWord(diff(c.live_date))}`, diff(c.live_date), 'send') : r('Deliver the content', null, 'send');
			return c.live_date ? r(`Goes live ${relWord(diff(c.live_date))}`, diff(c.live_date), 'spark') : r('Set a go-live date', null);
		case 'live':
			if (overdue(c)) {
				const d = diff(c.pay_due!);
				return r(`Payment overdue by ${-d} day${-d > 1 ? 's' : ''}`, d, 'alert');
			}
			if (c.follow_date) return r(`Follow up ${relWord(diff(c.follow_date))}`, diff(c.follow_date), 'bell');
			return noPost(c) ? r(`Delivered ${fmt(c.live_date)}`, null, 'check') : r(`Live since ${fmt(c.live_date)}`, null, 'spark');
		case 'declined':
			return r('Declined', null, 'x');
		default:
			return r(`Wrapped · ${noPost(c) ? 'delivered' : 'live'} ${fmt(c.live_date)}`, null, 'check');
	}
}

/** Messages from the brand she hasn't read yet. */
export function unreadFor(c: Collab) {
	const seen = c.reads?.find((r) => r.side === 'creator')?.read_at ?? '';
	return (c.messages ?? []).filter((m) => m.sender === 'brand' && m.created_at > seen).length;
}

/** When a brand's TDS certificate (Form 16A) is due: 15 Aug, 15 Nov, 15 Feb or 15 Jun after the quarter. */
export function certDueDate(paidOn: string) {
	const [y, m] = paidOn.split('-').map(Number);
	if (m >= 4 && m <= 6) return `${y}-08-15`;
	if (m >= 7 && m <= 9) return `${y}-11-15`;
	if (m >= 10) return `${y + 1}-02-15`;
	return `${y}-06-15`;
}

export type Task = { c: Collab; kind: 'new' | 'follow' | 'draft' | 'live' | 'product' | 'pay' | 'quote' | 'revise' | 'msg' | 'usage' | 'shoot' | 'claim' | 'tds'; d: number; title: string; order: number };
export function tasks(collabs: Collab[]): Task[] {
	const out: Task[] = [];
	for (const c of collabs) {
		const unread = unreadFor(c);
		if (unread) out.push({ c, kind: 'msg', d: 0, title: `Reply to ${unread} new message${unread > 1 ? 's' : ''}`, order: -1 });
		if (productionHeld(c)) {
			if (c.stage === 'paused' && c.resume_on && diff(c.resume_on) <= 0) out.push({ c, kind: 'follow', d: diff(c.resume_on), title: 'Review paused collaboration', order: 1 });
			continue;
		}
		if (c.stage === 'declined') continue;
		const pieces = c.deliverables.flatMap((d) => (d.items ?? []).filter((x) => x.due_date && !['published', 'delivered'].includes(x.status)).map((x) => ({ ...x, kind: d.kind })));
		const firstPiece = [...pieces].sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0];
		if (firstPiece && diff(firstPiece.due_date!) <= 3) out.push({ c, kind: 'draft', d: diff(firstPiece.due_date!), title: `${firstPiece.kind} ${firstPiece.position} due ${fmt(firstPiece.due_date)}${firstPiece.assigned_to ? ` · ${firstPiece.assigned_to}` : ''}`, order: 2 });
		if (c.usage_ext_status === 'requested')
			out.push({ c, kind: 'usage', d: 0, title: `Wants ${c.usage_ext_days} more days of paid usage (${inr(c.usage_ext_price)})`, order: 0 });
		else if (c.usage_ends && diff(c.usage_ends) >= 0 && diff(c.usage_ends) <= 7)
			out.push({ c, kind: 'usage', d: diff(c.usage_ends), title: 'Paid usage rights end', order: 6 });
		if (c.stage === 'request') out.push({ c, kind: 'new', d: Math.min(0, diff(c.received_on)), title: 'Review new request', order: 0 });
		const q = latestQuote(c);
		if (q?.status === 'changes') out.push({ c, kind: 'quote', d: 0, title: 'Brand asked for changes to your quote', order: 0 });
		const dr = latestDraft(c);
		if (dr?.status === 'changes') out.push({ c, kind: 'revise', d: 0, title: `Revise draft ${dr.round}: ${dr.feedback.slice(0, 60)}`, order: 1 });
		if (c.follow_date && diff(c.follow_date) <= 2) out.push({ c, kind: 'follow', d: diff(c.follow_date), title: c.follow_note || 'Follow up', order: 1 });
		if (['confirmed', 'creating'].includes(c.stage) && c.shoot_date && !allDone(c) && diff(c.shoot_date) <= 1)
			out.push({ c, kind: 'shoot', d: diff(c.shoot_date), title: `Shoot · ${delivText(c.deliverables.filter((x) => !x.done))}`, order: 2 });
		if (!pieces.length && ['confirmed', 'creating'].includes(c.stage) && c.draft_date && !allDone(c) && diff(c.draft_date) <= 3)
			out.push({ c, kind: 'draft', d: diff(c.draft_date), title: `Send draft · ${delivText(c.deliverables)}`, order: 2 });
		if (['confirmed', 'creating'].includes(c.stage) && c.live_date && diff(c.live_date) <= 3 && diff(c.live_date) >= 0)
			out.push({ c, kind: 'live', d: diff(c.live_date), title: `Goes live · ${delivText(c.deliverables)}`, order: 3 });
		if (inTransit(c)) out.push({ c, kind: 'product', d: c.product_date ? Math.min(0, diff(c.product_date)) : 0, title: `Parcel on the way via ${c.ship_carrier}: mark it received when it arrives`, order: 4 });
		else if (c.stage === 'confirmed' && !c.product_received_at && c.product_date && diff(c.product_date) >= 0 && diff(c.product_date) <= 2)
			out.push({ c, kind: 'product', d: diff(c.product_date), title: 'Product arriving, check the parcel', order: 4 });
		for (const inv of c.invoices ?? [])
			if (inv.claim_at && (inv.status === 'sent' || inv.status === 'partly_paid'))
				out.push({ c, kind: 'claim', d: 0, title: `Brand says they paid ${money(Number(inv.claim_amount), inv.currency)} (ref ${inv.claim_ref}): confirm it`, order: 0 });
		// The brand's TDS certificate is due and hasn't come (and she hasn't asked in the last two weeks).
		for (const inv of c.invoices ?? []) {
			if (!(inv.tds_deducted > 0) || inv.tds_certificate || inv.status === 'cancelled' || inv.status === 'draft') continue;
			const due = certDueDate(inv.paid_on ?? inv.issue_date);
			const asked = inv.tds_requested_at && Date.now() - new Date(inv.tds_requested_at).getTime() < 14 * 864e5;
			if (diff(due) <= 0 && !asked) out.push({ c, kind: 'tds', d: diff(due), title: `Ask for the TDS certificate (Form 16A) for ${inv.number}`, order: 7 });
		}
		if (overdue(c)) out.push({ c, kind: 'pay', d: diff(c.pay_due!), title: `Payment overdue · ${inr(outstanding(c))}`, order: 5 });
	}
	return out.sort((a, b) => a.d - b.d || a.order - b.order);
}

/** One collab's production steps due the same day (shoot, draft, go live, product) become one card:
 * "Shoot, send draft and go live · 1 Story" instead of three cards for the same story. */
export function mergeSteps(list: Task[]): Task[] {
	const STEP = new Set(['shoot', 'draft', 'live', 'product']);
	const out: Task[] = [];
	const seen = new Map<string, Task[]>();
	for (const t of list) {
		if (!STEP.has(t.kind)) {
			out.push(t);
			continue;
		}
		const key = `${t.c.id}:${t.d}`;
		const group = seen.get(key);
		if (group) group.push(t);
		else {
			const g = [t];
			seen.set(key, g);
			out.push(t);
		}
	}
	return out.map((t) => {
		if (!STEP.has(t.kind)) return t;
		const g = seen.get(`${t.c.id}:${t.d}`)!;
		if (g.length < 2) return t;
		const steps = g.map((x, i) => {
			const w = x.title.split(' · ')[0];
			return i === 0 ? w : w.charAt(0).toLowerCase() + w.slice(1);
		});
		const what = t.title.includes(' · ') ? t.title.slice(t.title.indexOf(' · ')) : '';
		const said = steps.length === 2 ? steps.join(' and ') : `${steps.slice(0, -1).join(', ')} and ${steps[steps.length - 1]}`;
		return { ...t, title: said + what, order: Math.min(...g.map((x) => x.order)) };
	});
}

export type CalEvent = { date: string; kind: 'shoot' | 'draft' | 'live' | 'follow' | 'pay' | 'product'; c: Collab; label?: string };
export function events(collabs: Collab[]): CalEvent[] {
	const ev: CalEvent[] = [];
	for (const c of collabs) {
		if (productionHeld(c)) {
			if (c.stage === 'paused' && c.resume_on) ev.push({ date: c.resume_on, kind: 'follow', c });
			continue;
		}
		if (c.stage === 'declined') continue;
		const si = stageIndex(c.stage);
		const pieces = c.deliverables.flatMap((d) => (d.items ?? []).filter((x) => x.due_date && !['published', 'delivered'].includes(x.status)).map((x) => ({ ...x, kind: d.kind })));
		for (const date of new Set(pieces.map((x) => x.due_date!))) ev.push({ date, kind: 'draft', c, label: pieces.filter((x) => x.due_date === date).map((x) => `${x.kind} ${x.position}`).join(', ') });
		if (c.product_date && si >= 2 && si <= 3) ev.push({ date: c.product_date, kind: 'product', c });
		if (c.shoot_date && si >= 2 && si <= 3 && !allDone(c)) ev.push({ date: c.shoot_date, kind: 'shoot', c });
		if (!pieces.length && c.draft_date && si >= 2 && si <= 3) ev.push({ date: c.draft_date, kind: 'draft', c });
		if (c.live_date && si >= 2) ev.push({ date: c.live_date, kind: 'live', c });
		if (c.follow_date) ev.push({ date: c.follow_date, kind: 'follow', c });
		if (isPaid(c) && c.pay_due && ['invoiced', 'advance'].includes(c.pay_status)) ev.push({ date: c.pay_due, kind: 'pay', c });
	}
	return ev;
}
export const KIND_ICON: Record<string, string> = { tds: 'rupee', claim: 'wallet', shoot: 'cal', follow: 'bell', draft: 'film', live: 'spark', pay: 'wallet', new: 'inbox', product: 'box', quote: 'rupee', revise: 'edit', msg: 'mail', usage: 'eye' };
export const KIND_LABEL: Record<string, string> = { shoot: 'Shoot day', draft: 'Draft due', live: 'Go live', follow: 'Follow-up', pay: 'Payment due', product: 'Product arrives' };
export const evLabel = (e: CalEvent) => (e.kind === 'live' && stageIndex(e.c.stage) >= 4 ? 'Went live' : KIND_LABEL[e.kind]);

export function errMessage(e: unknown): string {
	if (!e) return 'Something went wrong.';
	if (typeof e === 'string') return e;
	// No connection: say so plainly instead of "TypeError: Failed to fetch".
	if (typeof navigator !== 'undefined' && (!navigator.onLine || /failed to fetch|networkerror|load failed/i.test(String((e as { message?: unknown })?.message ?? ''))))
		return "You're offline. Try again when you're connected.";
	if (typeof e === 'object' && e && 'message' in e) {
		// A spam limit (LIMIT:key:text): the person sees the text, the Safety tab hears it was hit.
		const m = String((e as { message: unknown }).message);
		const lim = /^LIMIT:([a-z_]+):/.exec(m);
		if (lim) {
			limitHook?.(lim[1]);
			return m.slice(lim[0].length);
		}
		return m;
	}
	return 'Something went wrong.';
}
let limitHook: ((key: string) => void) | null = null;
export const onLimit = (f: (key: string) => void) => (limitHook = f);

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
	{ key: 'ad_tag', label: '#ad (paid) or #gifted (product only) in the first line of the caption' },
	{ key: 'brand_tag', label: 'Brand tagged in the post and caption' },
	{ key: 'link', label: 'Discount code or link included (if agreed)' }
];
export const checklistDone = (c: Collab) => CHECKLIST.every((i) => c.checklist?.[i.key]);
export const checklistMissing = (c: Collab) => CHECKLIST.filter((i) => !c.checklist?.[i.key]).map((i) => i.label);

/** Reads a caption and says which disclosure items it already covers. */
/** "#GlowUp, skincare #glowup" -> ['#GlowUp', '#skincare'] (case-insensitive, no repeats). */
export function parseTags(text: string, sign: '#' | '@') {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of text.split(/[\s,]+/)) {
		const t = raw.replace(sign === '#' ? /^#+/ : /^@+/, '').replace(/[^\p{L}\p{N}_.]/gu, '');
		if (!t || seen.has(t.toLowerCase())) continue;
		seen.add(t.toLowerCase());
		out.push(sign + (sign === '@' ? t.toLowerCase() : t));
	}
	return out;
}

/** Everything the caption must have: disclosure, the brand tag, and the brief's hashtags and @mentions. */
export function briefCheck(caption: string, handle: string, d: BriefDetails | null | undefined, type: CollabType = 'paid') {
	const base = captionCheck(caption, handle);
	const lower = caption.toLowerCase();
	const has = (tag: string) => new RegExp(`${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'iu').test(lower);
	const items = [
		type === 'barter'
			? { label: '#gifted (or #ad) in the first line', ok: base.ad_tag }
			: { label: '#ad in the first line (it’s paid)', ok: /#(ad|sponsored|paidpartnership)(?![a-z])/i.test(caption.trim().split(/\r?\n/)[0] ?? '') },
		...(handle ? [{ label: `@${handle.replace(/^@/, '')}`, ok: base.brand_tag }] : []),
		...(d?.mentions ?? []).filter((m) => m.toLowerCase() !== `@${handle.toLowerCase().replace(/^@/, '')}`).map((m) => ({ label: m, ok: has(m.toLowerCase()) })),
		...(d?.hashtags ?? []).map((h) => ({ label: h, ok: has(h.toLowerCase()) })),
		...(d?.promo?.trim() ? [{ label: `code ${d.promo.trim().split(/\s/)[0].toUpperCase()}`, ok: lower.includes(d.promo.trim().split(/\s/)[0].toLowerCase()) }] : [])
	];
	return { items, missing: items.filter((i) => !i.ok).map((i) => i.label) };
}

export function captionCheck(caption: string, handle: string) {
	const firstLine = caption.trim().split(/\r?\n/)[0]?.slice(0, 140) ?? '';
	return {
		ad_tag: /#(ad|collab|sponsored|paidpartnership|partner|gifted)(?![a-z])/i.test(firstLine),
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

/** 251340 -> "251.3K" */
export const compact = (n: number | null | undefined) => {
	if (n === null || n === undefined) return '—';
	if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
	if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
	return String(Math.round(n));
};
