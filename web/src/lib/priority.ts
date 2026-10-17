// Barter rules and rate-card maths. The studio scores requests in decide.ts ("Should I take it?");
// the brand form uses the rules here to tell brands, before they send, how a barter request will
// be treated and how to improve it.
import type { Collab, CollabType, PublicPage } from './types';
import { inr, todayIso } from './util';

export type BarterMode = 'open' | 'selective' | 'closed';
export type Rules = {
	barter_mode: BarterMode;
	barter_min_value: number;
	barter_monthly_cap: number;
	barter_reply_time: string;
	priority_categories: string[];
};
export type Tier = 'top' | 'high' | 'normal' | 'low';
export type Reason = { text: string; pts: number };
export type Priority = { score: number; tier: Tier; reasons: Reason[]; counterFee: number | null };

// Badge labels: the "Should I take it?" verdict (decide.ts) behind the same four tiers.
export const TIER_LABEL: Record<Tier, string> = { top: 'Take it', high: 'Take it', normal: 'Negotiate', low: 'Pass' };

// A product counts for less than the same amount in cash: it can't pay bills.
export const PRODUCT_WORTH = 0.4;

type Line = { kind: string; qty: number };

/** What the deliverables would cost at her rate card (0 if no rates are set for them). */
export function rateValue(lines: Line[], rates: Record<string, number> | null | undefined) {
	if (!rates) return 0;
	return lines.reduce((a, d) => a + (Number(rates[d.kind]) || 0) * d.qty, 0);
}

/** A fee that, with the product, brings the offer up to the rate card. Rounded to ₹500. */
export function fairFee(rate: number, productValue: number) {
	const gap = rate - productValue * PRODUCT_WORTH;
	return gap > 0 ? Math.ceil(gap / 500) * 500 : 0;
}

export const offerWorth = (type: CollabType, fee: number, productValue: number) =>
	(type === 'barter' ? 0 : fee) + (type === 'paid' ? 0 : productValue * PRODUCT_WORTH);


/** Barter collabs she has said yes to this month (same rule as the database's barter_slots_used). */
export function barterSlotsUsed(collabs: Collab[]) {
	const ym = todayIso().slice(0, 7);
	return collabs.filter(
		(c) => c.type === 'barter' && ['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage) && (c.live_date ?? c.preferred_live ?? c.received_on).startsWith(ym)
	).length;
}

/** Requests still being decided get ranked; everything later is just work to do. */
export const isRanked = (c: Collab) => c.stage === 'request' || c.stage === 'negotiating';

// ---------------------------------------------------------------------------
// Brand side: plain-language guidance while they fill in the request form.
// ---------------------------------------------------------------------------
export type Advice = {
	tone: 'good' | 'info' | 'warn' | 'block';
	title: string;
	lines: string[];
	/** A better offer the brand can switch to with one tap. */
	suggest?: { type: CollabType; fee: number; label: string };
};

export function brandAdvice(
	o: { type: CollabType; fee: number; productValue: number; lines: Line[] },
	page: PublicPage,
	creator: string
): Advice | null {
	const b = page.barter;
	const rate = rateValue(o.lines, page.rates);
	const worth = offerWorth(o.type, o.fee, o.productValue);
	const who = creator || 'The creator';

	if (o.type === 'paid') {
		if (!o.fee || !rate) return null;
		const r = o.fee / rate;
		if (r >= 1) return { tone: 'good', title: 'Great fit', lines: [`Your budget matches ${who}'s rates for this, so it goes to the top of the list.`] };
		if (r >= 0.75) return { tone: 'info', title: 'Close to the rate card', lines: [`${who}'s rates for this add up to ${inr(rate)}. Budgets near that get the fastest replies.`] };
		return {
			tone: 'warn',
			title: 'Budget is below the rate card',
			lines: [`${who}'s rates for this add up to ${inr(rate)}. You can still send it, or choose fewer deliverables to fit your budget.`]
		};
	}

	if (!b) return null;
	const replyPaid = page.reply_time;
	const minOk = !b.min_value || o.productValue >= b.min_value;
	const fee = rate ? fairFee(rate, o.productValue) : 0;

	if (o.type === 'hybrid') {
		if (!rate || !o.fee) return { tone: 'good', title: 'Paid + product gets priority', lines: [`Requests with a fee are reviewed first, usually within ${replyPaid}.`] };
		const r = worth / rate;
		return r >= 0.75
			? { tone: 'good', title: 'Strong offer', lines: [`Fee plus product covers ${who}'s rates well. Expect a reply within ${replyPaid}.`] }
			: {
					tone: 'info',
					title: 'Reviewed with paid requests',
					lines: [`${who}'s rates for this add up to ${inr(rate)}. A product counts for less than cash, so a fee closer to ${inr(fee)} gets a faster yes.`],
					suggest: fee > o.fee ? { type: 'hybrid', fee, label: `Make the fee ${inr(fee)}` } : undefined
				};
	}

	// Barter.
	if (b.mode === 'closed') {
		return {
			tone: 'block',
			title: `${who} is taking paid collaborations only right now`,
			lines: ['Barter requests are paused. Add a fee to send this request.'],
			suggest: { type: 'hybrid', fee: fee || 5000, label: fee ? `Switch to Paid + product (${inr(fee)} fee)` : 'Switch to Paid + product' }
		};
	}
	if (b.min_value && !minOk && o.productValue >= 0) {
		return {
			tone: 'warn',
			title: 'You can send this, but it will be reviewed last',
			lines: [`${who}'s barter offers start at ${inr(b.min_value)}. Offers below that go to the end of the list, so a reply can take longer. Adding a fee gets it seen sooner.`],
			suggest: { type: 'hybrid', fee: fee || 3000, label: fee ? `Switch to Paid + product (${inr(fee)} fee)` : 'Switch to Paid + product' }
		};
	}

	const lines = [`${who} reviews paid collaborations first. Barter requests usually get a reply within ${b.reply_time}.`];
	if (b.slots_left === 0) lines.push(`Barter spots for this month are taken, so yours would be planned for next month.`);
	else if (b.slots_left !== null && b.slots_left <= 2) lines.push(`Only ${b.slots_left} barter spot${b.slots_left === 1 ? '' : 's'} left this month.`);
	if (rate && o.productValue) {
		const r = worth / rate;
		if (r < 0.5) {
			const fits = o.lines.length > 1 || o.lines[0]?.qty > 1 ? ' Or ask for fewer deliverables.' : '';
			lines.push(`For a product worth ${inr(o.productValue)}, this is a lot of content.${fits}`);
		}
	}
	return {
		tone: b.slots_left === 0 ? 'warn' : 'info',
		title: 'Barter requests are reviewed after paid ones',
		lines,
		suggest: fee ? { type: 'hybrid', fee, label: `Get priority: add a ${inr(fee)} fee` } : { type: 'hybrid', fee: 0, label: 'Get priority: add a fee' }
	};
}
