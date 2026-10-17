// The signed agreement as a PDF: both parties, every term, and both sign-offs: the creator's offer
// (when she sent the quote) and the brand's acceptance (name, email, time). A fingerprint of the
// contents is printed at the bottom, so any later change to the document would show.
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { loadFonts, wrap } from './invoicePdf';
import type { Agreement } from './types';
import { fmtLong, fmtTime, payTerms, plural, usageLabel } from './util';
import { saveBlob } from './download';

const INK = rgb(0.12, 0.09, 0.11);
const MUTED = rgb(0.45, 0.41, 0.44);
const LINE = rgb(0.88, 0.85, 0.85);
const SOFT = rgb(0.965, 0.95, 0.95);
const DARK = rgb(0.1, 0.075, 0.1);
const G2 = rgb(0.83, 0.16, 0.42);
const OK = rgb(0.17, 0.48, 0.27);
const WHITE = rgb(1, 1, 1);
const SIGN: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SGD: 'S$' };

/** The terms in plain words (also what the fingerprint covers). */
export function agreementTerms(a: Agreement) {
	const q = a.quote;
	return [
		`Usage rights: ${usageLabel(q.usage)}. The brand may repost the content with credit to @${a.creator.handle}${q.usage !== 'Organic only' ? ' and run it as ads from its own ad account for the period stated; the creator does not run ads' : ''}.`,
		`Payment: ${payTerms(q)}. Invoices are issued by the creator.`,
		`Revisions: ${q.revision_rounds} round${q.revision_rounds === 1 ? '' : 's'} of changes included. Extra rounds may be charged.`,
		...(q.exclusivity_days ? [`Exclusivity: the creator won't post for a direct competitor for ${q.exclusivity_days} days after going live.`] : []),
		`Go-live: ${a.live_date ? fmtLong(a.live_date) : a.preferred_live ? `around ${fmtLong(a.preferred_live)}, to be confirmed` : 'to be agreed'}.`,
		'Disclosure: posts are marked as a paid partnership or with #ad, as Indian advertising rules (ASCI) require.',
		"Approval: the brand reviews drafts before posting. Content stays the creator's own work; the brand gets the usage rights above."
	];
}

/** SHA-256 of what was agreed, shown as groups of four characters. */
export async function fingerprint(a: Agreement) {
	const q = a.quote;
	const what = JSON.stringify({
		id: q.id, version: q.version, items: q.items, usage: q.usage, usage_fee: q.usage_fee, discount: q.discount, total: q.total, currency: q.currency,
		advance: q.advance_pct, days: q.pay_days, rounds: q.revision_rounds, exclusivity: q.exclusivity_days, notes: q.notes,
		creator: a.creator.legal_name, brand: a.brand.name, sent: q.sent_at, accepted_by: q.accepted_name, accepted_email: q.accepted_email, accepted_at: q.responded_at
	});
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(what)));
	const hex = [...hash].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
	return hex.slice(0, 32).match(/.{4}/g)!.join(' ');
}

export async function agreementPdf(a: Agreement): Promise<Uint8Array> {
	const q = a.quote;
	const cur = q.currency || 'INR';
	const money = (n: number) => (SIGN[cur] ?? cur + ' ') + Number(n || 0).toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 2 });
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const [regBytes, boldBytes] = await loadFonts();
	const reg = await doc.embedFont(regBytes);
	const bold = await doc.embedFont(boldBytes);
	doc.setTitle(`${a.code} · Collaboration agreement`);
	doc.setAuthor(a.creator.legal_name);
	const W = 595.28, H = 841.89, M = 48;
	let page: PDFPage = doc.addPage([W, H]);
	let y = H;
	const text = (t: string, x: number, yy: number, size = 9.5, font: PDFFont = reg, color: RGB = INK) => page.drawText(t, { x, y: yy, size, font, color });
	const right = (t: string, xr: number, yy: number, size = 9.5, font: PDFFont = reg, color: RGB = INK) => text(t, xr - font.widthOfTextAtSize(t, size), yy, size, font, color);
	const room = (need: number) => {
		if (y - need < 70) {
			page = doc.addPage([W, H]);
			y = H - M;
		}
	};
	const para = (t: string, size = 9.5, font: PDFFont = reg, color: RGB = INK, x = M, width = W - 2 * M) => {
		for (const l of wrap(t, font, size, width)) {
			room(size + 4);
			text(l, x, y, size, font, color);
			y -= size + 4;
		}
	};
	const heading = (t: string) => {
		room(40);
		y -= 10;
		text(t.toUpperCase(), M, y, 7.5, bold, MUTED);
		page.drawLine({ start: { x: M, y: y - 5 }, end: { x: W - M, y: y - 5 }, thickness: 0.6, color: LINE });
		y -= 20;
	};

	// Header
	page.drawRectangle({ x: 0, y: H - 110, width: W, height: 110, color: DARK });
	page.drawRectangle({ x: 0, y: H - 110, width: W, height: 4, color: G2 });
	text(`COLLABORATION AGREEMENT · ${a.code} · VERSION ${q.version}`, M, H - 40, 8, bold, rgb(0.75, 0.7, 0.74));
	text(`${a.creator.legal_name} × ${a.brand.name}`, M, H - 68, 20, bold, WHITE);
	text(q.status === 'accepted' ? `Accepted ${q.responded_at ? fmtTime(q.responded_at) : ''} IST` : 'Offer: becomes the agreement when the brand accepts it online', M, H - 90, 9.5, reg, rgb(0.85, 0.8, 0.84));
	y = H - 140;

	// Parties
	heading('The parties');
	const col = (W - 2 * M) / 2;
	const party = (x: number, role: string, lines: string[]) => {
		let yy = y;
		text(role, x, yy, 8, bold, MUTED);
		yy -= 15;
		lines.filter(Boolean).forEach((l, i) => {
			for (const w of wrap(l, i === 0 ? bold : reg, i === 0 ? 11 : 9, col - 16)) {
				text(w, x, yy, i === 0 ? 11 : 9, i === 0 ? bold : reg, i === 0 ? INK : MUTED);
				yy -= i === 0 ? 15 : 12;
			}
		});
		return yy;
	};
	const y1 = party(M, 'CREATOR', [a.creator.legal_name, `@${a.creator.handle}${a.creator.city ? ` · ${a.creator.city}` : ''}`, a.creator.email, a.creator.pan ? `PAN ${a.creator.pan}` : '']);
	const y2 = party(M + col, 'BRAND', [a.brand.name, [a.brand.instagram ? `@${a.brand.instagram}` : '', a.brand.website].filter(Boolean).join(' · '), a.brand.address ?? '', a.brand.gstin ? `GSTIN ${a.brand.gstin}` : '', `Contact: ${a.contact.name}${a.contact.email ? ` · ${a.contact.email}` : ''}`]);
	y = Math.min(y1, y2) - 6;

	// Deliverables and fee
	heading('1. Deliverables and fee');
	const cols = { qty: W - M - 210, rate: W - M - 100, amt: W - M };
	text('Deliverable', M, y, 8, bold, MUTED);
	right('Qty', cols.qty, y, 8, bold, MUTED);
	right('Rate', cols.rate, y, 8, bold, MUTED);
	right('Amount', cols.amt, y, 8, bold, MUTED);
	y -= 16;
	const line = (k: string, qty: string, rate: string, amt: string, b = false) => {
		room(18);
		text(k, M, y, 9.5, b ? bold : reg);
		if (qty) right(qty, cols.qty, y);
		if (rate) right(rate, cols.rate, y);
		right(amt, cols.amt, y, 9.5, b ? bold : reg);
		y -= 16;
	};
	for (const it of q.items) line(plural(it.kind, it.qty), String(it.qty), money(it.rate), money(it.qty * it.rate));
	if (Number(q.usage_fee)) line(`Usage rights: ${usageLabel(q.usage)}`, '', '', money(q.usage_fee));
	if (Number(q.discount)) line('Discount', '', '', '− ' + money(q.discount));
	page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.6, color: LINE });
	y -= 4;
	line('Total fee (taxes extra if applicable)', '', '', money(q.total), true);
	if (a.type !== 'paid' && a.product) para(`Products supplied by the brand: ${a.product}${a.product_value ? ` (value ₹${Number(a.product_value).toLocaleString('en-IN')})` : ''}.`, 9.5, reg, MUTED);

	// Terms
	heading('2. Terms');
	for (const t of agreementTerms(a)) {
		const [k, ...rest] = t.split(': ');
		room(28);
		text('•', M, y, 9.5, bold, G2);
		const lines = wrap(`${k}: ${rest.join(': ')}`, reg, 9.5, W - 2 * M - 14);
		lines.forEach((l, i) => {
			room(14);
			if (i === 0) {
				text(`${k}:`, M + 12, y, 9.5, bold);
				text(l.slice(k.length + 1), M + 12 + bold.widthOfTextAtSize(`${k}:`, 9.5), y, 9.5);
			} else text(l, M + 12, y, 9.5);
			y -= 13.5;
		});
		y -= 3;
	}
	if (q.notes) {
		heading('3. Notes');
		para(q.notes);
	}

	// Signatures
	heading('Signatures');
	room(110);
	const box = (x: number, title: string, name: string, lines: string[], ok: boolean) => {
		page.drawRectangle({ x, y: y - 88, width: col - 8, height: 96, color: SOFT, borderColor: LINE, borderWidth: 0.6 });
		text(title, x + 12, y - 8, 7.5, bold, MUTED);
		text(name || '—', x + 12, y - 30, 15, bold, ok ? INK : MUTED);
		page.drawLine({ start: { x: x + 12, y: y - 36 }, end: { x: x + col - 30, y: y - 36 }, thickness: 0.6, color: ok ? G2 : LINE });
		lines.forEach((l, i) => text(l, x + 12, y - 52 - i * 12, 8.5, reg, MUTED));
		if (ok) text('Signed electronically', x + 12, y - 80, 8, bold, OK);
	};
	box(M, 'FOR THE CREATOR (OFFER)', a.creator.legal_name, [a.creator.email, q.sent_at ? `Sent ${fmtTime(q.sent_at)} IST` : ''], !!q.sent_at);
	const accepted = q.status === 'accepted';
	box(M + col + 8, 'FOR THE BRAND (ACCEPTANCE)', accepted ? q.accepted_name ?? '' : 'Not yet accepted', accepted ? [q.accepted_email ?? '', `${q.responded_at ? fmtTime(q.responded_at) : ''} IST${a.accepted_ip ? ` · from ${a.accepted_ip}` : ''}`] : ['Waiting for the brand'], accepted);
	y -= 112;

	// Fingerprint and footer
	const fp = await fingerprint(a);
	room(40);
	para(`Agreed online through ${a.creator.app_name}. The brand accepted by typing their full name, which is an electronic signature under the Information Technology Act, 2000. Document fingerprint (SHA-256): ${fp}`, 8, reg, MUTED);
	const pages = doc.getPages();
	pages.forEach((p, i) => p.drawText(`${a.code} · page ${i + 1} of ${pages.length}`, { x: M, y: 30, size: 7.5, font: reg, color: MUTED }));
	return doc.save();
}

export async function downloadAgreement(a: Agreement) {
	const bytes = await agreementPdf(a);
	void saveBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${a.code}-agreement${a.quote.status === 'accepted' ? '-signed' : ''}.pdf`);
}
