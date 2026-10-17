// Rate advice that learns from her own deals: for each deliverable, what happened when she quoted
// her price (accepted, asked for changes, no answer or declined) and what brands offered on their
// own. Plain counting over the last 12 months, so every suggestion can show its evidence.
import type { Collab } from './types';
import { diff } from './util';

export type RateLesson = {
	kind: string;
	rate: number;
	quoted: number;
	yes: number;
	pushed: number;
	lost: number;
	/** Average price they said yes to, per piece. */
	avgYes: number | null;
	/** Brand-sent offers at or above her rate card (for collabs with only this kind). */
	offersAbove: number;
	offers: number;
	advice: 'raise' | 'lower' | 'hold' | 'discount' | 'learning';
	suggest: number | null;
	why: string;
};

const r500 = (n: number) => Math.round(n / 500) * 500 || 500;

export function learnRates(collabs: Collab[], rates: Record<string, number>, kinds: string[]): RateLesson[] {
	const recent = collabs.filter((c) => -diff(c.received_on) <= 365);
	return kinds
		.filter((k) => (rates[k] ?? 0) > 0)
		.map((kind) => {
			const rate = rates[kind];
			let quoted = 0, yes = 0, pushed = 0, lost = 0, yesSum = 0;
			for (const c of recent) {
				// The latest quote she sent on each collab is the one the brand answered.
				const q = [...(c.quotes ?? [])].filter((x) => x.sent_at && x.status !== 'draft').sort((a, b) => b.version - a.version)[0];
				const item = q?.items.find((i) => i.kind === kind && i.qty > 0);
				if (!q || !item) continue;
				const sub = q.items.reduce((a, i) => a + i.rate * i.qty, 0);
				const each = sub ? item.rate * (1 - (q.discount || 0) / sub) : item.rate;
				quoted++;
				if (q.status === 'accepted' || ['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage)) {
					yes++;
					yesSum += each;
				} else if (q.status === 'changes') pushed++;
				else if (c.stage === 'declined' || (q.sent_at && -diff(q.sent_at.slice(0, 10)) > 21)) lost++;
			}
			// What brands offered without being asked: single-kind paid requests with a fee.
			const own = recent.filter((c) => c.fee > 0 && c.type !== 'barter' && c.deliverables.length === 1 && c.deliverables[0].kind === kind && c.source !== 'retainer');
			const offersAbove = own.filter((c) => c.fee / c.deliverables[0].qty >= rate).length;
			const answered = yes + pushed + lost;
			const avgYes = yes ? Math.round(yesSum / yes) : null;

			let advice: RateLesson['advice'] = 'learning';
			let suggest: number | null = null;
			let why = answered ? `${yes} of ${answered} quote${answered === 1 ? '' : 's'} accepted so far.` : 'No quotes for this yet.';
			if (answered >= 3) {
				const win = yes / answered;
				// Yes at a discount isn't a sign to charge more.
				const full = avgYes !== null && avgYes >= rate * 0.95;
				if (win >= 0.6 && avgYes !== null && avgYes < rate * 0.85) {
					advice = 'discount';
					why = `Brands say yes (${yes} of ${answered}), but at about ₹${avgYes.toLocaleString('en-IN')} a piece, ${Math.round((1 - avgYes / rate) * 100)}% under your rate card. Hold your price more often, or offer fewer pieces instead of a lower price.`;
				} else if (full && (win >= 0.8 || (win >= 0.6 && own.length >= 2 && offersAbove / own.length >= 0.5))) {
					advice = 'raise';
					suggest = r500(rate * (win >= 0.9 ? 1.2 : 1.1));
					why = `Brands said yes to ${yes} of ${answered} quotes${offersAbove ? `, and ${offersAbove} offered your price or more on their own` : ''}. You're likely under-charging.`;
				} else if (win <= 0.4) {
					advice = 'lower';
					suggest = r500(rate * 0.9);
					why = `Only ${yes} of ${answered} said yes (${pushed} asked for changes, ${lost} went quiet or declined). A little lower, or a package, may win more.`;
				} else {
					advice = 'hold';
					why = `${yes} of ${answered} said yes: about right for now.`;
				}
			} else if (own.length >= 3 && offersAbove / own.length >= 0.7) {
				advice = 'raise';
				suggest = r500(rate * 1.1);
				why = `${offersAbove} of ${own.length} brands offered your price or more without being asked.`;
			}
			return { kind, rate, quoted, yes, pushed, lost, avgYes, offersAbove, offers: own.length, advice, suggest, why };
		});
}
