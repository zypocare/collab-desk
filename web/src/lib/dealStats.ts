// Deal analytics: how often she wins, what she gives away in discounts, how long deals take,
// and where the best-paying work comes from. All from collabs received in the period.
import type { Collab, Quote } from './types';
import { parse } from './util';

const DONE = ['confirmed', 'creating', 'live', 'wrapped'];
const won = (c: Collab) => DONE.includes(c.stage);
const inrOf = (q: Quote) => (Number(q.total) || 0) * (Number(q.inr_rate) || 1);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const days = (a: string, b: string) => Math.max(0, Math.round((parse(b.slice(0, 10)).getTime() - parse(a.slice(0, 10)).getTime()) / 864e5));

export type Group = { key: string; deals: number; won: number; rate: number | null; avgFee: number | null; total: number };
function groupBy(cs: Collab[], key: (c: Collab) => string): Group[] {
	const m = new Map<string, Collab[]>();
	for (const c of cs) m.set(key(c), [...(m.get(key(c)) ?? []), c]);
	return [...m.entries()]
		.map(([k, list]) => {
			const decided = list.filter((c) => won(c) || c.stage === 'declined');
			const paid = list.filter((c) => won(c) && c.type !== 'barter' && c.fee > 0);
			return {
				key: k,
				deals: list.length,
				won: list.filter(won).length,
				rate: decided.length ? list.filter(won).length / decided.length : null,
				avgFee: avg(paid.map((c) => c.fee)),
				total: paid.reduce((a, c) => a + c.fee, 0)
			};
		})
		.sort((a, b) => (b.avgFee ?? 0) - (a.avgFee ?? 0));
}

export function dealStats(collabs: Collab[], from: string, to: string, rates: Record<string, number>) {
	const cs = collabs.filter((c) => c.received_on >= from && c.received_on <= to);
	const decided = cs.filter((c) => won(c) || c.stage === 'declined');
	const winRate = decided.length ? cs.filter(won).length / decided.length : null;

	// Quotes: how many brands accept, and the discount from her rate card on the ones they accepted.
	const quotes = cs.flatMap((c) => (c.quotes ?? []).filter((q) => q.status !== 'draft').map((q) => ({ q, c })));
	const answered = quotes.filter(({ q }) => ['accepted', 'changes', 'withdrawn'].includes(q.status) || q.responded_at);
	const accepted = quotes.filter(({ q }) => q.status === 'accepted');
	const cardValue = (q: Quote) => (q.items ?? []).reduce((a, i) => a + (Number(rates[i.kind]) || 0) * (Number(i.qty) || 0), 0);
	const discounts = accepted
		.map(({ q }) => ({ card: cardValue(q), got: inrOf(q) - (Number(q.usage_fee) || 0) * (Number(q.inr_rate) || 1) }))
		.filter((d) => d.card > 0)
		.map((d) => (d.card - d.got) / d.card);
	// Accepted quotes priced at or above the rate card, against those below it.
	const priced = answered
		.map(({ q }) => ({ q, card: cardValue(q) }))
		.filter((x) => x.card > 0)
		.map((x) => ({ ok: x.q.status === 'accepted', full: inrOf(x.q) - (Number(x.q.usage_fee) || 0) * (Number(x.q.inr_rate) || 1) >= x.card * 0.98 }));
	const rateOf = (xs: { ok: boolean }[]) => (xs.length ? xs.filter((x) => x.ok).length / xs.length : null);

	// Time to close: request received to quote accepted.
	const closeDays = accepted.filter(({ q }) => q.responded_at).map(({ q, c }) => days(c.received_on, q.responded_at!));
	// Time for brands to answer a quote.
	const answerDays = answered.filter(({ q }) => q.sent_at && q.responded_at).map(({ q }) => days(q.sent_at!, q.responded_at!));

	const SOURCE: Record<string, string> = { brand_page: 'Your brand page', email: 'Email', manual: 'Added by you (DMs)', retainer: 'Monthly deals' };
	return {
		received: cs.length,
		wonCount: cs.filter(won).length,
		declined: cs.filter((c) => c.stage === 'declined').length,
		open: cs.filter((c) => c.stage === 'request' || c.stage === 'negotiating').length,
		winRate,
		quotesSent: quotes.length,
		quoteRate: answered.length ? accepted.length / answered.length : null,
		avgDiscount: avg(discounts),
		fullPriceRate: rateOf(priced.filter((x) => x.full)),
		discountRate: rateOf(priced.filter((x) => !x.full)),
		avgClose: avg(closeDays),
		avgAnswer: avg(answerDays),
		avgFee: avg(cs.filter((c) => won(c) && c.type !== 'barter' && c.fee > 0).map((c) => c.fee)),
		byCategory: groupBy(cs, (c) => c.brand.category || 'Other'),
		bySource: groupBy(cs, (c) => SOURCE[c.source] ?? c.source),
		byType: groupBy(cs, (c) => ({ paid: 'Paid', hybrid: 'Paid + product', barter: 'Barter' })[c.type] ?? c.type)
	};
}
