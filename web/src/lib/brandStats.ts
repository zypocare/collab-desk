import type { Brand, Collab } from './types';
import { parse } from './util';

export type BrandStats = {
	brand: Brand;
	collabs: Collab[];
	count: number;
	active: number;
	paid: number;
	barter: number;
	outstanding: number;
	avgDaysToPay: number | null;
	onTimeRate: number | null;
	lastDate: string | null;
};

const DAY = 864e5;

export function brandStats(brand: Brand, all: Collab[]): BrandStats {
	const collabs = all.filter((c) => c.brand_id === brand.id).sort((a, b) => b.received_on.localeCompare(a.received_on));
	const live = collabs.filter((c) => c.stage !== 'declined');
	const paidOnes = live.filter((c) => c.pay_status === 'paid' && c.paid_on);
	const timed = paidOnes.filter((c) => c.invoiced_on);
	const withDue = paidOnes.filter((c) => c.pay_due);
	return {
		brand,
		collabs,
		count: live.length,
		active: live.filter((c) => c.stage !== 'wrapped').length,
		paid: live.reduce((a, c) => a + c.pay_received, 0),
		barter: live.filter((c) => c.type !== 'paid').reduce((a, c) => a + c.product_value, 0),
		outstanding: live
			.filter((c) => c.type !== 'barter' && c.pay_status !== 'paid' && ['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage))
			.reduce((a, c) => a + Math.max(0, c.fee - c.pay_received), 0),
		avgDaysToPay: timed.length
			? Math.round(timed.reduce((a, c) => a + (parse(c.paid_on!).getTime() - parse(c.invoiced_on!).getTime()) / DAY, 0) / timed.length)
			: null,
		onTimeRate: withDue.length ? withDue.filter((c) => c.paid_on! <= c.pay_due!).length / withDue.length : null,
		lastDate: live[0]?.live_date ?? live[0]?.received_on ?? null
	};
}
