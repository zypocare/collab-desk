// Invoice helpers shared by the invoice page, the PDF and the studio.
import qrcode from 'qrcode-generator';

export type InvoiceItem = { description: string; qty: number; rate: number };
export type InvoiceStatus = 'draft' | 'sent' | 'partly_paid' | 'paid' | 'cancelled';
export type Seller = {
	name: string; display_name: string; handle: string; pan: string; gstin: string; sac: string; address: string;
	state: string; email: string; upi_id: string; bank_details: string; footer: string; gst_registered: boolean;
	lut_arn?: string; intl_bank?: string;
};
export type BillTo = { name: string; gstin: string; address: string; state: string; contact: string; email: string; code: string; country?: string };

export type InvoiceView = {
	number: string;
	kind: 'advance' | 'balance' | 'full';
	issue_date: string;
	due_date: string | null;
	items: InvoiceItem[];
	subtotal: number;
	tax_mode: 'none' | 'intra' | 'inter' | 'export';
	currency?: string;
	inr_rate?: number;
	gst_rate: number;
	cgst: number;
	sgst: number;
	igst: number;
	total: number;
	tds_rate: number;
	tds_section?: '194J' | '194C';
	tds_seen_at?: string | null;
	tds_amount: number;
	payable: number;
	amount_received: number;
	tds_deducted: number;
	paid_on: string | null;
	status: InvoiceStatus;
	notes: string;
	seller: Seller;
	bill_to: BillTo;
	token: string;
	/** The brand said they paid (waiting for her to confirm). */
	claim_amount?: number | null;
	claim_ref?: string;
	claim_on?: string | null;
	claim_at?: string | null;
};

export type Invoice = Omit<InvoiceView, 'token' | 'number'> & {
	id: string;
	collab_id: string;
	public_token: string;
	payment_ref: string;
	tds_certificate: boolean;
	tds_requested_at?: string | null;
	send_to: string;
	auto_remind: boolean;
	reminders_sent: number[];
	sent_at: string | null;
	created_at: string;
	number: string | null;
};

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; k: string }> = {
	draft: { label: 'Draft', k: 'plain' },
	sent: { label: 'Sent', k: 'k-new' },
	partly_paid: { label: 'Part paid', k: 'k-product' },
	paid: { label: 'Paid', k: 'k-pay' },
	cancelled: { label: 'Cancelled', k: 'plain' }
};
export const KIND_LABEL = { advance: 'Advance', balance: 'Balance', full: 'Full payment' } as const;

export const num = (v: unknown) => Number(v) || 0;
export function normaliseInvoice<T extends object>(i: T): T {
	const r = i as Record<string, unknown>;
	for (const k of ['subtotal', 'gst_rate', 'cgst', 'sgst', 'igst', 'total', 'tds_rate', 'tds_amount', 'payable', 'amount_received', 'tds_deducted']) {
		if (k in r) r[k] = num(r[k]);
	}
	return i;
}

/** Cash still to arrive: the total, less what was received, less the TDS (what the brand actually
 *  deducted, or the TDS expected on the invoice if that's more). */
export const balanceDue = (i: Pick<InvoiceView, 'total' | 'tds_amount' | 'amount_received' | 'status'> & { tds_deducted?: number }) =>
	i.status === 'paid' || i.status === 'cancelled' ? 0 : Math.max(0, num(i.total) - num(i.amount_received) - Math.max(num(i.tds_amount), num(i.tds_deducted)));

/** UPI payment link with the amount filled in. Opens GPay, PhonePe, Paytm and other UPI apps on a phone. */
export const validUpiId = (id: string) => /^[\w.-]{2,}@[a-zA-Z][\w.-]*$/.test(id.trim());
export const validUpiAmount = (amount: number) => Number.isFinite(amount) && amount > 0
	&& Number.isSafeInteger(Math.round(amount * 100))
	&& Math.abs(amount * 100 - Math.round(amount * 100)) <= Math.max(1e-6, amount * 100 * Number.EPSILON * 4);

export function upiPaymentLink(id: string, name: string, amount: number, note = '') {
	if (!validUpiId(id) || !validUpiAmount(amount) || Number(amount.toFixed(2)) <= 0) return '';
	const p = new URLSearchParams({ pa: id.trim(), pn: name.trim() || id.trim(), am: amount.toFixed(2), cu: 'INR' });
	if (note.trim()) p.set('tn', note.trim());
	return `upi://pay?${p.toString().replace(/\+/g, '%20')}`;
}

export function upiLink(i: InvoiceView) {
	if ((i.currency && i.currency !== 'INR') || i.status === 'draft') return '';
	return upiPaymentLink(i.seller.upi_id, i.seller.name, balanceDue(i), `Invoice ${i.number}`);
}

/** QR code modules for any text (true = dark). */
export function qrMatrix(text: string): boolean[][] {
	const qr = qrcode(0, 'M');
	qr.addData(text);
	qr.make();
	const n = qr.getModuleCount();
	return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}
export function qrSvgPath(text: string) {
	const m = qrMatrix(text);
	let d = '';
	m.forEach((row, r) => row.forEach((dark, c) => dark && (d += `M${c} ${r}h1v1h-1z`)));
	return { d, size: m.length };
}

// ---- amount in words (Indian numbering) ----
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function twoDigits(n: number) {
	return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}
function threeDigits(n: number) {
	const h = Math.floor(n / 100), rest = n % 100;
	return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
}
const CUR_WORDS: Record<string, [string, string]> = { USD: ['US Dollars', 'Cents'], EUR: ['Euros', 'Cents'], GBP: ['Pounds Sterling', 'Pence'], AED: ['UAE Dirhams', 'Fils'], SGD: ['Singapore Dollars', 'Cents'] };
function intlWords(n: number) {
	const parts: string[] = [];
	const b = Math.floor(n / 1e9), m = Math.floor((n % 1e9) / 1e6), t = Math.floor((n % 1e6) / 1e3), r = n % 1e3;
	if (b) parts.push(`${threeDigits(b)} Billion`);
	if (m) parts.push(`${threeDigits(m)} Million`);
	if (t) parts.push(`${threeDigits(t)} Thousand`);
	if (r) parts.push(threeDigits(r));
	return parts.join(' ') || 'Zero';
}
export function amountInWords(amount: number, currency = 'INR') {
	if (currency && currency !== 'INR') {
		const [major, minor] = CUR_WORDS[currency] ?? [currency, 'Cents'];
		const whole = Math.floor(amount), cents = Math.round((amount - whole) * 100);
		return `${major} ${intlWords(whole)}${cents ? ` and ${twoDigits(cents)} ${minor}` : ''} Only`;
	}
	const rupees = Math.floor(amount);
	const paise = Math.round((amount - rupees) * 100);
	if (rupees === 0 && paise === 0) return 'Rupees Zero Only';
	const parts: string[] = [];
	const crore = Math.floor(rupees / 1e7), lakh = Math.floor((rupees % 1e7) / 1e5), thousand = Math.floor((rupees % 1e5) / 1e3), rest = rupees % 1e3;
	if (crore) parts.push(`${threeDigits(crore)} Crore`);
	if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
	if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
	if (rest) parts.push(threeDigits(rest));
	return `Rupees ${parts.join(' ')}${paise ? ` and ${twoDigits(paise)} Paise` : ''} Only`;
}

export const INDIAN_STATES = [
	'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
	'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
	'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
	'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
	'Ladakh', 'Lakshadweep', 'Puducherry'
];

/** Money she received in a month ("YYYY-MM"), before GST, in rupees: every paid invoice (advances
 *  too) by the day it was paid, plus collabs marked paid without an invoice. Today's figures use this,
 *  so an advance counts in the month it arrived. */
export function receivedIn(c: import('./types').Collab, ym: string): number {
	const live = (c.invoices ?? []).filter((i) => i.status !== 'draft' && i.status !== 'cancelled');
	if (!live.length) return c.pay_status === 'paid' && (c.paid_on ?? '').startsWith(ym) ? Number(c.pay_received) || 0 : 0;
	return live
		.filter((i) => i.status === 'paid' && (i.paid_on ?? '').startsWith(ym))
		.reduce((a, i) => a + (Number(i.subtotal) || 0) * (Number(i.inr_rate) || 1), 0);
}
