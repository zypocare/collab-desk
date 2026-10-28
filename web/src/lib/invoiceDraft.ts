import type { Collab, Settings } from './types';
import type { Invoice, InvoiceItem } from './invoice';
import { acceptedQuote, delivText, iso, parse, rel, todayIso, usageLabel } from './util';

/** What a new invoice for this collab starts as: the advance, the balance or the full fee (from the accepted quote and
 * what's been invoiced so far), its line, when it's due, GST from her settings, and the TDS this brand deducted last
 * time. The invoice form and the going-live sheet both start from this, so they always agree. */
export function invoiceStart(c: Collab, s: Settings, collabs: Collab[]) {
	const q = acceptedQuote(c);
	const issued = c.invoices.filter((i) => i.status !== 'draft' && i.status !== 'cancelled');
	const invoicedSoFar = issued.reduce((a, i) => a + i.subtotal, 0);
	const hasAdvance = issued.some((i) => i.kind === 'advance');
	const fee = c.fee || q?.total || 0;
	let kind: Invoice['kind'] = 'full';
	let amount = fee;
	// An advance only makes sense before the content is out; after that it's the full amount.
	const posted = c.stage === 'live' || c.stage === 'wrapped';
	if (q && q.advance_pct > 0 && q.advance_pct < 100 && !hasAdvance && invoicedSoFar === 0 && !posted) {
		kind = 'advance';
		amount = Math.round((fee * q.advance_pct) / 100);
	} else if (invoicedSoFar > 0) {
		kind = 'balance';
		amount = Math.max(0, fee - invoicedSoFar);
	}
	const what = `${delivText(c.deliverables)} for ${c.brand.name}${c.usage && c.usage !== 'Organic only' ? `, ${usageLabel(c.usage).toLowerCase()}` : ''} (${c.code})`;
	const label = kind === 'advance' ? `Advance (${q?.advance_pct}%)` : kind === 'balance' ? 'Balance' : 'Content collaboration';
	let due = rel(15);
	if (kind === 'advance') due = rel(7);
	else if (q && c.live_date) {
		const d = parse(c.live_date);
		d.setDate(d.getDate() + q.pay_days);
		due = iso(d) < todayIso() ? rel(7) : iso(d);
	}
	const sameState = !!c.brand.state && !!s.state && c.brand.state === s.state;
	// Same TDS as this brand's last invoice (brands deduct the same rate every time).
	const lastForBrand = collabs
		.filter((x) => x.brand_id === c.brand_id)
		.flatMap((x) => x.invoices)
		.filter((i) => i.status !== 'draft' && i.status !== 'cancelled')
		.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
	return {
		kind,
		items: [{ description: `${label}: ${what}`, qty: 1, rate: amount }] as InvoiceItem[],
		tax_mode: (s.gst_registered ? (sameState ? 'intra' : 'inter') : 'none') as Invoice['tax_mode'],
		gst_rate: s.gst_rate || 18,
		tds_rate: lastForBrand?.tds_rate ?? 0,
		tds_section: (lastForBrand?.tds_section ?? '194J') as '194J' | '194C',
		due,
		invoicedSoFar,
		fee,
		accounts: c.brand.accounts_email ?? ''
	};
}
