// Brands that have gone quiet, and a gentle nudge for each (the free AI writes it; she approves it).
// Each kind waits a few days first; a second or third nudge reads a little firmer.
import type { Collab } from './types';
import { diff, todayIso } from './util';

export type NudgeKind = 'quiet' | 'quote' | 'draft' | 'brief' | 'product' | 'payment';
export type Nudge = { c: Collab; kind: NudgeKind; days: number; tries: number; why: string; invoice?: { number: string; token: string; payable: number } };

const WAIT: Record<NudgeKind, number> = { quiet: 3, quote: 3, draft: 3, brief: 3, product: 5, payment: 1 };
const daysSince = (iso?: string | null) => (iso ? -diff(iso.slice(0, 10)) : 0);

/** How many nudges she already sent for this since `since` (from the collab's history). */
const triesSince = (c: Collab, since: string) => (c.events ?? []).filter((e) => e.kind === 'nudge' && e.at >= since).length;

export function nudgesFor(collabs: Collab[]): Nudge[] {
	const out: Nudge[] = [];
	for (const c of collabs) {
		if (['declined', 'wrapped', 'paused', 'cancelled'].includes(c.stage)) continue;
		const lastEvent = (c.events ?? []).filter((e) => e.kind === 'nudge').map((e) => e.at).sort().pop() ?? '';
		// Not twice in two days, whatever the reason.
		if (lastEvent && daysSince(lastEvent) < 2) continue;
		// Snoozed: not for three days.
		const snoozed = (c.events ?? []).filter((e) => e.kind === 'nudge_snooze').map((e) => e.at).sort().pop() ?? '';
		if (snoozed && daysSince(snoozed) < 3) continue;
		const add = (kind: NudgeKind, since: string | null | undefined, why: string, extra: Partial<Nudge> = {}) => {
			const days = daysSince(since);
			if (!since || days < WAIT[kind]) return false;
			out.push({ c, kind, days, tries: triesSince(c, since), why, ...extra });
			return true;
		};

		// Payment: an invoice past its due date (when automatic reminders are off for it).
		const late = (c.invoices ?? []).find((i) => (i.status === 'sent' || i.status === 'partly_paid') && i.due_date && i.due_date < todayIso() && !i.auto_remind && !i.claim_amount);
		if (late && add('payment', late.due_date, `Invoice ${late.number} is ${daysSince(late.due_date)} days overdue`, { invoice: { number: late.number ?? '', token: late.public_token, payable: late.payable - late.amount_received } })) continue;

		// A quote with no answer.
		const q = [...(c.quotes ?? [])].sort((a, b) => b.version - a.version)[0];
		if ((c.stage === 'request' || c.stage === 'negotiating') && q?.status === 'sent' && add('quote', q.sent_at, `No answer to your quote for ${daysSince(q.sent_at)} days`)) continue;

		// A draft waiting for their review.
		const dr = [...(c.drafts ?? [])].sort((a, b) => b.round - a.round)[0];
		if (c.stage === 'creating' && dr?.status === 'pending' && add('draft', dr.submitted_at, `Draft ${dr.round} waiting for review for ${daysSince(dr.submitted_at)} days`)) continue;

		// The brief she asked for.
		if (c.brief_asked_at && !c.brief.trim() && !Object.values(c.brief_details ?? {}).some((v) => (Array.isArray(v) ? v.length : String(v ?? '').trim())) && add('brief', c.brief_asked_at, `You asked for the brief ${daysSince(c.brief_asked_at)} days ago`)) continue;

		// A product that hasn't been sent.
		const agreed = (c.events ?? []).filter((e) => e.kind === 'stage' && /Agreed|Confirmed/i.test(e.text)).map((e) => e.at).sort()[0];
		if (c.type !== 'paid' && c.barter_kind !== 'experience' && ['confirmed', 'creating'].includes(c.stage) && !c.shipped_at && !c.product_received_at && add('product', agreed, `Product not shipped ${daysSince(agreed)} days after agreeing`)) continue;

		// A chat that went quiet: her message last, and no reply since.
		const msgs = [...(c.messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
		const last = msgs[msgs.length - 1];
		if (last?.sender === 'creator') add('quiet', last.created_at, `No reply to your message for ${daysSince(last.created_at)} days`);
	}
	// Money first, then the longest wait.
	const rank: Record<NudgeKind, number> = { payment: 0, product: 1, draft: 2, quote: 3, brief: 4, quiet: 5 };
	return out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.days - a.days);
}
