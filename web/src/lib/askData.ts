// What "Ask your desk" sends the AI: a compact summary of her collabs, money and plans. No contact
// details (names, emails, phones) and no messages.
import { receivedIn } from './invoice';
import type { Collab, Settings } from './types';
import { delivText, iso, outstanding, overdue, todayIso } from './util';

export function askData(collabs: Collab[], s: Settings | null) {
	const ym = todayIso().slice(0, 7);
	const prev = (() => {
		const d = new Date();
		d.setDate(1);
		d.setMonth(d.getMonth() - 1);
		return iso(d).slice(0, 7);
	})();
	const list = collabs
		.filter((c) => c.stage !== 'declined' || (c.updated_at ?? c.created_at) > new Date(Date.now() - 60 * 864e5).toISOString())
		.map((c) => ({
			code: c.code,
			brand: c.brand.name,
			category: c.brand.category || undefined,
			stage: c.stage,
			type: c.type,
			fee: c.type === 'barter' ? 0 : c.fee,
			product: c.type === 'paid' ? undefined : c.product || undefined,
			product_value: c.product_value || undefined,
			content: delivText(c.deliverables),
			language: c.content_language || undefined,
			received: c.pay_received || 0,
			owed: outstanding(c) || undefined,
			pay: c.pay_status,
			overdue: overdue(c) || undefined,
			invoice: c.invoice_no || undefined,
			pay_due: c.pay_due || undefined,
			paid_on: c.paid_on || undefined,
			received_on: c.received_on,
			shoot: c.shoot_date || undefined,
			draft_due: c.draft_date || undefined,
			live: c.live_date || c.preferred_live || undefined
		}));
	return {
		creator: s?.display_name,
		monthly_goal: s?.monthly_goal || undefined,
		received_this_month: collabs.reduce((a, c) => a + receivedIn(c, ym), 0),
		received_last_month: collabs.reduce((a, c) => a + receivedIn(c, prev), 0),
		still_owed: collabs.reduce((a, c) => a + outstanding(c), 0),
		collabs: list
	};
}
