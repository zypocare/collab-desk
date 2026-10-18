// Section 194R: a business giving a creator benefits (products, stays, meals…) worth more than ₹20,000
// in a financial year must deduct 10% TDS on them. Per brand and year, from what actually arrived (a
// product once received; an experience once the collab is live).
import type { FY } from './reports';
import type { Collab } from './types';

export const LIMIT_194R = 20000;
export type BarterItem = { code: string; what: string; value: number; date: string };
export type Brand194R = { brandId: string; brand: string; total: number; items: BarterItem[]; over: boolean };

/** When a collab's barter counts (YYYY-MM-DD), or '' if it hasn't arrived yet. */
export function barterDate(c: Collab): string {
	if (c.type === 'paid' || !c.product_value || c.stage === 'declined') return '';
	if (c.product_received_at) return c.product_received_at.slice(0, 10);
	if (c.barter_kind === 'experience' && (c.stage === 'live' || c.stage === 'wrapped')) return c.live_date ?? '';
	return '';
}

export function barter194r(collabs: Collab[], fy: FY): Brand194R[] {
	const m = new Map<string, Brand194R>();
	for (const c of collabs) {
		const d = barterDate(c);
		if (!d || d < fy.from || d > fy.to) continue;
		const row = m.get(c.brand_id) ?? { brandId: c.brand_id, brand: c.brand.name, total: 0, items: [], over: false };
		row.total += Number(c.product_value) || 0;
		row.items.push({ code: c.code, what: c.product || (c.barter_kind === 'experience' ? 'Experience' : 'Product'), value: Number(c.product_value) || 0, date: d });
		m.set(c.brand_id, row);
	}
	return [...m.values()].map((r) => ({ ...r, over: r.total > LIMIT_194R })).sort((a, b) => b.total - a.total);
}

/** "2026-27" for the barter_tds table. */
export const fyKey = (fy: FY) => `${fy.start}-${String(fy.start + 1).slice(2)}`;
