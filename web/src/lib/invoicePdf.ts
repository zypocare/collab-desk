// Builds a clean, executive A4 invoice PDF in the browser with Miracle styling and optional UPI QR.
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { amountInWords, balanceDue, qrMatrix, upiLink, type InvoiceView } from './invoice';
import { saveBlob } from './download';

const INK = rgb(0.11, 0.08, 0.13);
const INK_2 = rgb(0.28, 0.24, 0.31);
const MUTED = rgb(0.49, 0.45, 0.52);
const LINE = rgb(0.89, 0.86, 0.9);
const SURFACE = rgb(0.975, 0.965, 0.98);
const SURFACE_DARK = rgb(0.945, 0.925, 0.955);
const VIOLET = rgb(0.61, 0.48, 1.0);
const ROSE = rgb(0.91, 0.31, 0.54);
const PEACH = rgb(0.98, 0.67, 0.42);
const PAID_BG = rgb(0.91, 0.97, 0.93);
const PAID_BORDER = rgb(0.2, 0.56, 0.33);
const PAID_INK = rgb(0.12, 0.44, 0.24);
const CANCEL_BG = rgb(0.99, 0.93, 0.94);

// Set for each invoice: amounts in its own currency.
let CUR = 'INR';
const SIGN: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SGD: 'S$' };
const money = (n: number) =>
	(SIGN[CUR] ?? CUR + ' ') +
	n.toLocaleString(CUR === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateText = (d: string | null) =>
	d
		? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', {
				day: '2-digit',
				month: 'short',
				year: 'numeric'
			})
		: '—';

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
	const lines: string[] = [];
	for (const para of String(text ?? '').split(/\r?\n/)) {
		const trimmed = para.trim();
		if (!trimmed) {
			lines.push('');
			continue;
		}
		let line = '';
		for (const word of trimmed.split(/\s+/)) {
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

	const W = 595.28;
	const H = 841.89;
	const M = 46;
	const CONTENT_W = W - 2 * M;

	let page: PDFPage = doc.addPage([W, H]);

	const text = (t: string, x: number, yy: number, size = 9.5, font = reg, color = INK) =>
		page.drawText(t, { x, y: yy, size, font, color });
	const right = (t: string, xr: number, yy: number, size = 9.5, font = reg, color = INK) =>
		text(t, xr - font.widthOfTextAtSize(t, size), yy, size, font, color);
	const hr = (yy: number, x1 = M, x2 = W - M, thickness = 0.7) =>
		page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color: LINE });

	// ---- Top Miracle 3-tone brand accent strip ----
	const segW = W / 3;
	page.drawRectangle({ x: 0, y: H - 5, width: segW + 1, height: 5, color: VIOLET });
	page.drawRectangle({ x: segW, y: H - 5, width: segW + 1, height: 5, color: ROSE });
	page.drawRectangle({ x: segW * 2, y: H - 5, width: segW + 1, height: 5, color: PEACH });

	let y = H - 46;

	// ---- Header: Seller (left) + Invoice Title & Metadata Card (right) ----
	text(inv.seller.name, M, y, 20, bold, INK);
	right(inv.seller.gst_registered ? 'TAX INVOICE' : 'INVOICE', W - M, y + 3, 12.5, bold, ROSE);

	y -= 18;
	const sellerLines = [
		inv.seller.handle ? `@${inv.seller.handle}` : '',
		...wrap(inv.seller.address, reg, 9, 255),
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

	// Left seller info
	let ly = y;
	for (const l of sellerLines) {
		text(l, M, ly, 9, reg, MUTED);
		ly -= 13;
	}

	// Right metadata box (cleanly aligned, fixed width)
	const metaW = 205;
	const metaX = W - M - metaW;
	const metaH = metaRows.length * 15 + 16;
	const metaTop = y + 8;
	page.drawRectangle({
		x: metaX,
		y: metaTop - metaH,
		width: metaW,
		height: metaH,
		color: SURFACE,
		borderColor: LINE,
		borderWidth: 0.7
	});
	let ry = metaTop - 16;
	for (const [k, v] of metaRows) {
		text(k, metaX + 12, ry, 8.5, reg, MUTED);
		right(v, metaX + metaW - 12, ry, 8.5, bold, INK);
		ry -= 15;
	}

	y = Math.min(ly, metaTop - metaH) - 18;

	// ---- Bill To Card (no Attn: contact/email line) + cleanly anchored Paid/Cancelled badge ----
	const billLines = [
		inv.bill_to.gstin ? `GSTIN: ${inv.bill_to.gstin}` : '',
		...wrap(inv.bill_to.address, reg, 9, 290),
		inv.bill_to.state ? `State: ${inv.bill_to.state}` : ''
	].filter(Boolean);

	const boxH = Math.max(58, 48 + billLines.length * 13);
	const boxBottom = y - boxH;
	page.drawRectangle({
		x: M,
		y: boxBottom,
		width: CONTENT_W,
		height: boxH,
		color: SURFACE,
		borderColor: LINE,
		borderWidth: 0.7
	});
	// Left rose-violet accent stripe
	page.drawRectangle({ x: M, y: boxBottom, width: 3.5, height: boxH, color: ROSE });

	text('BILL TO', M + 16, y - 18, 7.5, bold, MUTED);
	text(inv.bill_to.name, M + 16, y - 35, 12, bold, INK);
	let by = y - 50;
	for (const l of billLines) {
		text(l, M + 16, by, 9, reg, INK_2);
		by -= 13;
	}

	// Paid / Cancelled status pill aligned cleanly inside the right side of the Bill-To card
	if (inv.status === 'paid' || inv.status === 'cancelled') {
		const isPaid = inv.status === 'paid';
		const label = isPaid ? `PAID · ${inv.paid_on ? dateText(inv.paid_on) : 'SETTLED'}` : 'CANCELLED';
		const pillTextW = bold.widthOfTextAtSize(label, 10.5);
		const pillW = pillTextW + 24;
		const pillH = 26;
		const pillX = W - M - 14 - pillW;
		const pillY = boxBottom + (boxH - pillH) / 2;
		page.drawRectangle({
			x: pillX,
			y: pillY,
			width: pillW,
			height: pillH,
			color: isPaid ? PAID_BG : CANCEL_BG,
			borderColor: isPaid ? PAID_BORDER : ROSE,
			borderWidth: 1.2
		});
		text(label, pillX + 12, pillY + 9, 10.5, bold, isPaid ? PAID_INK : ROSE);
	}

	y = boxBottom - 24;

	// ---- Line Items Table ----
	const cols = { desc: M + 10, qty: W - M - 185, rate: W - M - 95, amt: W - M - 10 };
	const thH = 24;
	page.drawRectangle({ x: M, y: y - thH, width: CONTENT_W, height: thH, color: SURFACE_DARK });
	text('DESCRIPTION', cols.desc, y - 15, 7.5, bold, INK_2);
	right('QTY', cols.qty, y - 15, 7.5, bold, INK_2);
	right('RATE', cols.rate, y - 15, 7.5, bold, INK_2);
	right('AMOUNT', cols.amt, y - 15, 7.5, bold, INK_2);
	y -= thH + 16;

	for (const it of inv.items) {
		const lines = wrap(it.description, reg, 9.5, cols.qty - cols.desc - 36);
		lines.forEach((l, i) => text(l, cols.desc, y - i * 13.5, 9.5, reg, INK));
		right(String(it.qty), cols.qty, y, 9.5, reg, INK_2);
		right(money(it.rate), cols.rate, y, 9.5, reg, INK_2);
		right(money(it.qty * it.rate), cols.amt, y, 9.5, bold, INK);
		y -= lines.length * 13.5 + 10;
		hr(y + 4, M, W - M, 0.6);
		y -= 12;
	}

	// ---- Totals Block ----
	const totW = 235;
	const tx = W - M - totW;
	const trow = (k: string, v: string, strong = false, color = INK) => {
		text(k, tx + 10, y, strong ? 10 : 9, strong ? bold : reg, strong ? INK : MUTED);
		right(v, W - M - 10, y, strong ? 10.5 : 9, strong ? bold : reg, color);
		y -= strong ? 18 : 15;
	};

	trow('Subtotal', money(inv.subtotal));
	if (inv.tax_mode === 'intra') {
		trow(`CGST @ ${inv.gst_rate / 2}%`, money(inv.cgst));
		trow(`SGST @ ${inv.gst_rate / 2}%`, money(inv.sgst));
	} else if (inv.tax_mode === 'inter') {
		trow(`IGST @ ${inv.gst_rate}%`, money(inv.igst));
	}

	// Highlighted Total / Amount Payable strip (explicit gap below previous row so text never overlaps)
	const showPayable = inv.tds_amount > 0;
	if (showPayable) {
		hr(y + 9, tx, W - M, 0.6);
		y -= 6;
		trow('Total', money(inv.total), true);
		trow(`Less TDS @ ${inv.tds_rate}%`, '− ' + money(inv.tds_amount));
		y -= 10;
		const barH = 28;
		const barBottom = y - 10;
		page.drawRectangle({ x: tx, y: barBottom, width: totW, height: barH, color: SURFACE_DARK });
		text('Amount payable', tx + 10, barBottom + 10, 10, bold, INK);
		right(money(inv.payable), W - M - 10, barBottom + 10, 11, bold, ROSE);
		y = barBottom - 16;
	} else {
		y -= 10;
		const barH = 28;
		const barBottom = y - 10;
		page.drawRectangle({ x: tx, y: barBottom, width: totW, height: barH, color: SURFACE_DARK });
		text('Total', tx + 10, barBottom + 10, 10.5, bold, INK);
		right(money(inv.total), W - M - 10, barBottom + 10, 11, bold, INK);
		y = barBottom - 16;
	}

	if (inv.amount_received > 0 && inv.status !== 'paid') {
		trow('Received so far', '− ' + money(inv.amount_received));
	}

	const wordsLines = wrap(amountInWords(showPayable ? inv.payable : inv.total, CUR), reg, 8.5, totW - 10);
	wordsLines.forEach((l, i) => text(l, tx + 10, y - i * 11.5, 8.5, reg, MUTED));
	y -= wordsLines.length * 11.5 + 22;

	// ---- How to Pay Card (zero overlap between heading, UPI QR, and Bank transfer) ----
	const due = balanceDue(inv);
	const foreign = CUR !== 'INR';
	const bank = foreign && inv.seller.intl_bank ? inv.seller.intl_bank : inv.seller.bank_details;
	const upi = upiLink(inv);

	if (upi || bank) {
		const bankLines = bank ? wrap(bank, reg, 9, upi ? 210 : CONTENT_W - 28).filter((l) => l.length > 0) : [];
		const qrBlockH = upi ? 116 : 0;
		const bankBlockH = bank ? 22 + bankLines.length * 13 : 0;
		const innerH = upi && bank ? Math.max(qrBlockH, bankBlockH) : Math.max(qrBlockH, bankBlockH);
		const payCardH = 38 + innerH + 14;

		if (y - payCardH < 90) {
			page = doc.addPage([W, H]);
			y = H - M;
		}

		const cardBottom = y - payCardH;
		page.drawRectangle({
			x: M,
			y: cardBottom,
			width: CONTENT_W,
			height: payCardH,
			color: SURFACE,
			borderColor: LINE,
			borderWidth: 0.7
		});

		// Section eyebrow with clean 18pt gap before content
		text('HOW TO PAY', M + 14, y - 18, 7.5, bold, MUTED);
		hr(y - 25, M + 14, W - M - 14, 0.5);
		const contentTop = y - 40;

		if (upi) {
			const m = qrMatrix(upi);
			const size = 92;
			const cell = size / m.length;
			const quiet = cell * 3;
			const frameSize = size + quiet * 2;
			const qx = M + 14 + quiet;
			const qy = contentTop - size - quiet + 8;
			page.drawRectangle({
				x: qx - quiet,
				y: qy - quiet,
				width: frameSize,
				height: frameSize,
				color: rgb(1, 1, 1),
				borderColor: LINE,
				borderWidth: 0.7
			});
			m.forEach((row, r) =>
				row.forEach(
					(dark, c) =>
						dark &&
						page.drawRectangle({
							x: qx + c * cell,
							y: qy + size - (r + 1) * cell,
							width: cell + 0.15,
							height: cell + 0.15,
							color: rgb(0, 0, 0)
						})
				)
			);

			const px = M + 14 + frameSize + 16;
			text('Scan with any UPI app', px, contentTop - 2, 10, bold, INK);
			text(`UPI ID: ${inv.seller.upi_id}`, px, contentTop - 18, 9, reg, INK_2);
			text(`Amount: ${money(due)}`, px, contentTop - 32, 9, bold, INK);
			text(`Ref: Invoice ${inv.number}`, px, contentTop - 46, 8.5, reg, MUTED);
			if (due > 100000) {
				for (const [i, wl] of wrap('UPI limits are often ₹1L/day; use bank transfer for larger amounts.', reg, 7.5, 160).entries()) {
					text(wl, px, contentTop - 62 - i * 10, 7.5, reg, MUTED);
				}
			}

			if (bank) {
				// Place Bank Transfer cleanly in the right column when UPI QR is present
				const bx = W - M - 195;
				text(foreign ? 'International bank transfer' : 'Bank transfer', bx, contentTop - 2, 9.5, bold, INK);
				let bky = contentTop - 18;
				for (const bl of wrap(bank, reg, 8.5, 180).filter((l) => l.length > 0)) {
					text(bl, bx, bky, 8.5, reg, INK_2);
					bky -= 12.5;
				}
			}
		} else if (bank) {
			text(foreign ? 'International bank transfer' : 'Bank transfer', M + 14, contentTop - 2, 10, bold, INK);
			let bky = contentTop - 19;
			for (const bl of bankLines) {
				text(bl, M + 14, bky, 9, reg, INK_2);
				bky -= 13;
			}
		}

		y = cardBottom - 20;
	}

	// ---- Footer Notes ----
	const footer = [
		inv.notes,
		inv.tax_mode === 'export'
			? `Supply meant for export under LUT without payment of IGST${inv.seller.lut_arn ? ` (LUT ARN ${inv.seller.lut_arn})` : ''}.`
			: !inv.seller.gst_registered
				? 'The supplier is not registered under GST, so no GST is charged.'
				: '',
		inv.seller.footer
	].filter(Boolean);

	if (footer.length) {
		hr(y + 6, M, W - M, 0.5);
		y -= 10;
		for (const f of footer) {
			for (const l of wrap(f, reg, 8.5, CONTENT_W)) {
				text(l, M, y, 8.5, reg, MUTED);
				y -= 12;
			}
		}
	}

	// Miracle App branding footer on the bottom of the invoice
	const last = doc.getPage(doc.getPageCount() - 1);
	last.drawLine({ start: { x: M, y: 42 }, end: { x: W - M, y: 42 }, thickness: 0.5, color: LINE });
	const prefix = 'Created with ';
	const brand = 'Miracle App';
	const suffix = '  ·  miracleapp.live';
	const fSize = 8;
	const totalW =
		reg.widthOfTextAtSize(prefix, fSize) +
		bold.widthOfTextAtSize(brand, fSize) +
		reg.widthOfTextAtSize(suffix, fSize);
	let fx = (W - totalW) / 2;
	last.drawText(prefix, { x: fx, y: 26, size: fSize, font: reg, color: MUTED });
	fx += reg.widthOfTextAtSize(prefix, fSize);
	last.drawText(brand, { x: fx, y: 26, size: fSize, font: bold, color: ROSE });
	fx += bold.widthOfTextAtSize(brand, fSize);
	last.drawText(suffix, { x: fx, y: 26, size: fSize, font: reg, color: MUTED });

	return doc.save();
}

export async function downloadInvoicePdf(inv: InvoiceView) {
	const bytes = await invoicePdf(inv);
	const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
	await saveBlob(blob, `${inv.number.replace(/\//g, '-')}.pdf`);
}
