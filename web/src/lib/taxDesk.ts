// The tax desk: what an Indian creator has to watch in a financial year, from her own invoices and barter.
// - GST: registration is needed above ₹20 lakh of turnover (₹10 lakh in special-category states), and
//   barter counts at its market value (CGST Rule 27).
// - TDS on her fees: 194J (10%) once a brand pays her over ₹50,000 in the year; 194C (1% or 2%) on contract
//   work over ₹30,000 at once or ₹1 lakh in the year. From 1 April 2026 these sit in Section 393 of the
//   Income-tax Act, 2025, at the same rates. Without her PAN, brands deduct 20%.
// - The TDS a brand deducted is only hers once it shows in her Form 26AS / AIS.
import type { Invoice } from './invoice';
import { barter194r } from './tds194r';
import type { FY } from './reports';
import type { Collab } from './types';

export const GST_LIMIT = 2000000;
export const GST_LIMIT_SPECIAL = 1000000;
const SPECIAL = ['Manipur', 'Mizoram', 'Nagaland', 'Tripura'];
export const gstLimit = (state: string | null | undefined) => (SPECIAL.includes(state ?? '') ? GST_LIMIT_SPECIAL : GST_LIMIT);

const issued = (i: Invoice) => i.status !== 'draft' && i.status !== 'cancelled';
const inFy = (d: string | null | undefined, fy: FY) => !!d && d >= fy.from && d <= fy.to;
const inr = (i: Invoice) => (Number(i.subtotal) || 0) * (i.currency && i.currency !== 'INR' ? Number(i.inr_rate) || 1 : 1);

export function turnover(collabs: Collab[], fy: FY) {
	let fees = 0;
	let paidNoInvoice = 0;
	for (const c of collabs) {
		const inv = c.invoices.filter(issued);
		fees += inv.filter((i) => inFy(i.issue_date, fy)).reduce((a, i) => a + inr(i), 0);
		// Paid without an invoice on Miracle: the money she recorded.
		if (!inv.length && c.pay_status === 'paid' && inFy(c.paid_on, fy)) paidNoInvoice += Number(c.pay_received) || Number(c.fee) || 0;
	}
	const barter = barter194r(collabs, fy).reduce((a, r) => a + r.total, 0);
	return { fees, paidNoInvoice, barter, total: fees + paidNoInvoice + barter };
}

export type QuarterKey = 'Q1' | 'Q2' | 'Q3' | 'Q4';
/** Apr-Jun is Q1 … Jan-Mar is Q4. */
export const quarterOf = (d: string): QuarterKey => {
	const m = Number(d.slice(5, 7));
	return m >= 4 && m <= 6 ? 'Q1' : m >= 7 && m <= 9 ? 'Q2' : m >= 10 && m <= 12 ? 'Q3' : 'Q4';
};

export type TdsBrand = {
	brandId: string;
	brand: string;
	tan: string;
	paid: number;
	tds: number;
	section: '194J' | '194C';
	note: string;
	tone: 'ok' | 'warn' | 'info';
	invoices: { inv: Invoice; c: Collab; tds: number; q: QuarterKey }[];
};

export function tdsByBrand(collabs: Collab[], fy: FY): TdsBrand[] {
	const m = new Map<string, TdsBrand>();
	for (const c of collabs) {
		for (const inv of c.invoices.filter(issued)) {
			if (!inFy(inv.issue_date, fy) || (inv.currency && inv.currency !== 'INR')) continue;
			const row = m.get(c.brand_id) ?? { brandId: c.brand_id, brand: c.brand.name, tan: c.brand.tan ?? '', paid: 0, tds: 0, section: inv.tds_section ?? '194J', note: '', tone: 'info' as const, invoices: [] };
			row.paid += Number(inv.subtotal) || 0;
			const tds = Math.max(Number(inv.tds_deducted) || 0, inv.status === 'paid' ? Number(inv.tds_amount) || 0 : 0);
			row.tds += tds;
			if (inv.tds_section) row.section = inv.tds_section;
			row.invoices.push({ inv, c, tds, q: quarterOf(inv.paid_on ?? inv.issue_date) });
			m.set(c.brand_id, row);
		}
	}
	return [...m.values()]
		.map((r) => {
			const limit = r.section === '194C' ? 100000 : 50000;
			const big = r.section === '194C' && r.invoices.some((x) => Number(x.inv.subtotal) > 30000);
			const over = r.paid > limit || big;
			const k = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
			const note =
				r.tds > 0
					? over
						? `Deducted ${k(r.tds)}. Check it shows in your Form 26AS.`
						: `Deducted ${k(r.tds)} though they've paid under ${k(limit)} this year. Fine, but check your 26AS.`
					: over
						? `Over ${k(limit)} this year: they should deduct ${r.section === '194C' ? '1% or 2%' : '10%'} TDS. Ask before the next invoice.`
						: `Under ${k(limit)} this year: no TDS needed yet (${k(limit - r.paid)} to go).`;
			return { ...r, note, tone: (r.tds > 0 ? 'ok' : over ? 'warn' : 'info') as TdsBrand['tone'] };
		})
		.sort((a, b) => b.paid - a.paid);
}
