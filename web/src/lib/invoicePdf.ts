// Builds the invoice PDF in the browser (A4), with the UPI QR code drawn in.
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { amountInWords, balanceDue, qrMatrix, upiLink, type InvoiceView } from './invoice';

const INK = rgb(0.12, 0.09, 0.11);
const MUTED = rgb(0.45, 0.41, 0.44);
const LINE = rgb(0.88, 0.85, 0.85);
const ACCENT = rgb(0.78, 0.15, 0.37);
const PAID = rgb(0.17, 0.48, 0.27);

// Set for each invoice: amounts in its own currency.
let CUR = 'INR';
const SIGN: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SGD: 'S$' };
const money = (n: number) => (SIGN[CUR] ?? CUR + ' ') + n.toLocaleString(CUR === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateText = (d: string | null) =>
	d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
	const lines: string[] = [];
	for (const para of String(text ?? '').split(/\r?\n/)) {
		let line = '';
		for (const word of para.split(/\s+/)) {
			const test = line ? `${line} ${word}` : word;
			if (font.widthOfTextAtSize(test, size) > width && line) {
				lines.push(line);
				line = word;
			} else line = test;
		}
		lines.push(line);
	}
	return lines;
}

let fontCache: Promise<[ArrayBuffer, ArrayBuffer]> | null = null;
export const loadFonts = () =>
	(fontCache ??= Promise.all([
		fetch('/fonts/Inter-Regular.ttf').then((r) => r.arrayBuffer()),
		fetch('/fonts/Inter-SemiBold.ttf').then((r) => r.arrayBuffer())
	]));

export async function invoicePdf(inv: InvoiceView): Promise<Uint8Array> {
	CUR = inv.currency || 'INR';
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const [regBytes, boldBytes] = await loadFonts();
	const reg = await doc.embedFont(regBytes);
	const bold = await doc.embedFont(boldBytes);
	doc.setTitle(`Invoice ${inv.number}`);
	doc.setAuthor(inv.seller.name);

	const W = 595.28, H = 841.89, M = 48;
	let page: PDFPage = doc.addPage([W, H]);
	let y = H - M;
	const text = (t: string, x: number, yy: number, size = 9.5, font = reg, color = INK) => page.drawText(t, { x, y: yy, size, font, color });
	const right = (t: string, xr: number, yy: number, size = 9.5, font = reg, color = INK) =>
		text(t, xr - font.widthOfTextAtSize(t, size), yy, size, font, color);
	const hr = (yy: number, x1 = M, x2 = W - M) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.7, color: LINE });

	// ---- header ----
	page.drawRectangle({ x: M, y: y - 4, width: 36, height: 4, color: ACCENT });
	y -= 26;
	text(inv.seller.name, M, y, 18, bold);
	right(inv.seller.gst_registered ? 'TAX INVOICE' : 'INVOICE', W - M, y + 2, 13, bold, ACCENT);
	y -= 16;
	const sellerLines = [
		inv.seller.handle ? `@${inv.seller.handle}` : '',
		...wrap(inv.seller.address, reg, 9, 260),
		inv.seller.state ? `State: ${inv.seller.state}` : '',
		inv.seller.email,
		inv.seller.pan ? `PAN: ${inv.seller.pan}` : '',
		inv.seller.gstin ? `GSTIN: ${inv.seller.gstin}` : ''
	].filter(Boolean);
	const metaRows: [string, string][] = [
		['Invoice no.', inv.number],
		['Invoice date', dateText(inv.issue_date)],
		['Due date', dateText(inv.due_date)],
		['Reference', inv.bill_to.code]
	];
	if (inv.seller.sac) metaRows.push(['SAC', inv.seller.sac]);
	let ly = y, ry = y;
	for (const l of sellerLines) (text(l, M, ly, 9, reg, MUTED), (ly -= 12.5));
	for (const [k, v] of metaRows) {
		text(k, W - M - 190, ry, 9, reg, MUTED);
		right(v, W - M, ry, 9, bold);
		ry -= 13;
	}
	y = Math.min(ly, ry) - 14;

	// ---- bill to ----
	const billLines = [
		inv.bill_to.gstin ? `GSTIN: ${inv.bill_to.gstin}` : '',
		...wrap(inv.bill_to.address, reg, 9, 300),
		inv.bill_to.state ? `State: ${inv.bill_to.state}` : '',
		inv.bill_to.contact ? `Attn: ${inv.bill_to.contact}${inv.bill_to.email ? ` · ${inv.bill_to.email}` : ''}` : ''
	].filter(Boolean);
	// 14pt padding top and bottom so no line sits on the box edge.
	const boxH = 46 + billLines.length * 12.5;
	page.drawRectangle({ x: M, y: y - boxH, width: W - 2 * M, height: boxH, color: rgb(0.965, 0.95, 0.95) });
	text('BILL TO', M + 14, y - 17, 7.5, bold, MUTED);
	text(inv.bill_to.name, M + 14, y - 32, 11, bold);
	let by = y - 46;
	for (const l of billLines) (text(l, M + 14, by, 9, reg, MUTED), (by -= 12));
	y -= boxH + 22;

	// ---- items ----
	const cols = { desc: M, qty: W - M - 190, rate: W - M - 95, amt: W - M };
	text('DESCRIPTION', cols.desc, y, 7.5, bold, MUTED);
	right('QTY', cols.qty, y, 7.5, bold, MUTED);
	right('RATE', cols.rate, y, 7.5, bold, MUTED);
	right('AMOUNT', cols.amt, y, 7.5, bold, MUTED);
	y -= 8;
	hr(y);
	y -= 16;
	for (const it of inv.items) {
		const lines = wrap(it.description, reg, 9.5, cols.qty - cols.desc - 50);
		lines.forEach((l, i) => text(l, cols.desc, y - i * 12.5, 9.5));
		right(String(it.qty), cols.qty, y);
		right(money(it.rate), cols.rate, y);
		right(money(it.qty * it.rate), cols.amt, y, 9.5, bold);
		y -= lines.length * 12.5 + 8;
		hr(y + 4);
		y -= 10;
	}

	// ---- totals ----
	const tx = W - M - 230;
	const trow = (k: string, v: string, strong = false, color = INK) => {
		text(k, tx, y, strong ? 10.5 : 9.5, strong ? bold : reg, strong ? INK : MUTED);
		right(v, W - M, y, strong ? 10.5 : 9.5, strong ? bold : reg, color);
		y -= strong ? 17 : 14;
	};
	trow('Subtotal', money(inv.subtotal));
	if (inv.tax_mode === 'intra') {
		trow(`CGST @ ${inv.gst_rate / 2}%`, money(inv.cgst));
		trow(`SGST @ ${inv.gst_rate / 2}%`, money(inv.sgst));
	} else if (inv.tax_mode === 'inter') trow(`IGST @ ${inv.gst_rate}%`, money(inv.igst));
	hr(y + 8, tx, W - M);
	y -= 4;
	trow('Total', money(inv.total), true);
	if (inv.tds_amount > 0) {
		trow(`Less TDS @ ${inv.tds_rate}% (if deducted)`, '− ' + money(inv.tds_amount));
		trow('Amount payable', money(inv.payable), true, ACCENT);
	}
	if (inv.amount_received > 0 && inv.status !== 'paid') trow('Received so far', '− ' + money(inv.amount_received));
	const wordsLines = wrap(amountInWords(inv.tds_amount > 0 ? inv.payable : inv.total, CUR), reg, 8.5, 230);
	wordsLines.forEach((l, i) => text(l, tx, y - i * 11, 8.5, reg, MUTED));
	y -= wordsLines.length * 11 + 16;

	// ---- payment ----
	if (y < 230) {
		// Not enough room on this page; payment details go to a second page.
		page = doc.addPage([W, H]);
		y = H - M;
	}
	hr(y);
	y -= 22;
	const due = balanceDue(inv);
	// The heading only when there is something under it (UPI or bank details).
	const foreign = CUR !== 'INR';
	const bank = foreign && inv.seller.intl_bank ? inv.seller.intl_bank : inv.seller.bank_details;
	if ((!foreign && inv.seller.upi_id && due > 0) || bank) {
		text('HOW TO PAY', M, y, 7.5, bold, MUTED);
		y -= 6;
	}
	if (!foreign && inv.seller.upi_id && due > 0) {
		const m = qrMatrix(upiLink(inv));
		const size = 104, cell = size / m.length;
		const qx = M, qy = y - size - 8;
		page.drawRectangle({ x: qx - 6, y: qy - 6, width: size + 12, height: size + 12, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.7 });
		m.forEach((row, r) => row.forEach((dark, c) => dark && page.drawRectangle({ x: qx + c * cell, y: qy + size - (r + 1) * cell, width: cell + 0.15, height: cell + 0.15, color: rgb(0, 0, 0) })));
		const px = M + size + 26;
		text('Scan with any UPI app', px, y - 20, 10.5, bold);
		text(`UPI ID: ${inv.seller.upi_id}`, px, y - 36, 9.5);
		text(`Amount: ${money(due)}`, px, y - 50, 9.5);
		text(`Note: Invoice ${inv.number}`, px, y - 64, 9.5, reg, MUTED);
		if (due > 100000) text('UPI limits are often ₹1 lakh a day; use bank transfer for larger amounts.', px, y - 80, 8, reg, MUTED);
		y = qy - 22;
	}
	if (bank) {
		text(foreign ? 'International bank transfer' : 'Bank transfer', M, y, 10, bold);
		y -= 14;
		for (const l of wrap(bank, reg, 9, W - 2 * M)) (text(l, M, y, 9, reg, MUTED), (y -= 12));
		y -= 10;
	}
	if ((!foreign && inv.seller.upi_id) || bank) {
		hr(y + 2);
		y -= 16;
	}
	const footer = [
		inv.notes,
		inv.tax_mode === 'export'
			? `Supply meant for export under LUT without payment of IGST${inv.seller.lut_arn ? ` (LUT ARN ${inv.seller.lut_arn})` : ''}.`
			: !inv.seller.gst_registered
				? 'The supplier is not registered under GST, so no GST is charged.'
				: '',
		inv.seller.footer
	].filter(Boolean);
	for (const f of footer) for (const l of wrap(f, reg, 9, W - 2 * M)) (text(l, M, y, 9, reg, MUTED), (y -= 12));

	// ---- stamp ----
	if (inv.status === 'paid' || inv.status === 'cancelled') {
		const label = inv.status === 'paid' ? `PAID${inv.paid_on ? ' · ' + dateText(inv.paid_on) : ''}` : 'CANCELLED';
		const color = inv.status === 'paid' ? PAID : ACCENT;
		const w = bold.widthOfTextAtSize(label, 16) + 24;
		const first = doc.getPage(0);
		first.drawRectangle({ x: W - M - w, y: H - 210, width: w, height: 30, borderColor: color, borderWidth: 2, opacity: 0, borderOpacity: 0.85 });
		first.drawText(label, { x: W - M - w + 12, y: H - 200, size: 16, font: bold, color, opacity: 0.85 });
	}

	return doc.save();
}

export async function downloadInvoicePdf(inv: InvoiceView) {
	const bytes = await invoicePdf(inv);
	const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = `${inv.number.replace(/\//g, '-')}.pdf`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
