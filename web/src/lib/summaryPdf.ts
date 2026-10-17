// "Collab summary": one A4 page a brand can file or forward to finance or legal. Who, what, money,
// usage rights, key dates, invoices and results, as they stand today.
import fontkit from '@pdf-lib/fontkit';
import { todayIso } from './util';
import { PDFDocument, rgb, type PDFFont, type RGB } from 'pdf-lib';
import { milestones } from './campaign';
import { loadFonts, wrap } from './invoicePdf';
import type { BrandRequest } from './types';
import { TYPE_LABEL, compact, delivText, fmtLong, inr, payTerms } from './util';
import { saveBlob } from './download';

const INK = rgb(0.12, 0.09, 0.11);
const MUTED = rgb(0.45, 0.41, 0.44);
const LINE = rgb(0.9, 0.87, 0.87);
const SOFT = rgb(0.965, 0.95, 0.95);
const DARK = rgb(0.1, 0.075, 0.1);
const G2 = rgb(0.83, 0.16, 0.42);
const OK = rgb(0.17, 0.48, 0.27);
const WHITE = rgb(1, 1, 1);

export async function summaryPdf(r: BrandRequest, brand: string, creator: { name: string; handle: string }): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const [regBytes, boldBytes] = await loadFonts();
	const reg = await doc.embedFont(regBytes);
	const bold = await doc.embedFont(boldBytes);
	doc.setTitle(`${r.code} · Collab summary`);
	const W = 595.28, H = 841.89, M = 44;
	const page = doc.addPage([W, H]);
	const text = (t: string, x: number, y: number, size = 9.5, font: PDFFont = reg, color: RGB = INK) => page.drawText(t, { x, y, size, font, color });
	const label = (t: string, y: number) => {
		text(t.toUpperCase(), M, y, 7.5, bold, MUTED);
		page.drawLine({ start: { x: M, y: y - 5 }, end: { x: W - M, y: y - 5 }, thickness: 0.6, color: LINE });
	};
	const row = (k: string, v: string, y: number) => {
		text(k, M, y, 9.5, reg, MUTED);
		const lines = wrap(v, reg, 9.5, W - M - 190);
		lines.forEach((l, i) => text(l, M + 150, y - i * 12, 9.5));
		return y - Math.max(1, lines.length) * 12 - 6;
	};

	// Header.
	page.drawRectangle({ x: 0, y: H - 104, width: W, height: 104, color: DARK });
	page.drawRectangle({ x: 0, y: H - 104, width: W, height: 4, color: G2 });
	text(`COLLAB SUMMARY · ${r.code}`, M, H - 38, 8, bold, rgb(0.75, 0.7, 0.74));
	text(`${brand} × ${creator.name}`, M, H - 64, 20, bold, WHITE);
	text(`${delivText(r.deliverables)} · ${r.stage_label} · as of ${fmtLong(todayIso())}`, M, H - 84, 9.5, reg, rgb(0.85, 0.8, 0.84));

	let y = H - 134;
	const accepted = r.quotes?.find((q) => q.status === 'accepted');

	label('The collaboration', y);
	y -= 20;
	y = row('Brand', brand, y);
	y = row('Creator', `${creator.name} (@${creator.handle})`, y);
	y = row('Type', TYPE_LABEL[r.type], y);
	y = row('Content', r.deliverables.map((d) => `${d.qty} × ${d.kind}${d.done ? ' (done)' : ''}`).join(', '), y);
	if (r.type !== 'paid' && r.product) y = row(r.barter_kind === 'experience' ? 'Experience' : 'Product', `${r.product}${r.product_value ? ` (worth ${inr(r.product_value)})` : ''}`, y);
	y -= 8;

	label('Agreement', y);
	y -= 20;
	if (accepted) {
		y = row('Fee', `${inr(accepted.total)}${accepted.items?.length ? ` (${accepted.items.map((i) => `${i.qty} × ${i.kind}`).join(', ')})` : ''}`, y);
		y = row('Payment terms', payTerms(accepted), y);
		y = row('Usage rights', `${accepted.usage}${r.usage_ends ? `, until ${fmtLong(r.usage_ends)}` : ''}`, y);
		y = row('Revisions', `${accepted.revision_rounds} round${accepted.revision_rounds === 1 ? '' : 's'} included${accepted.exclusivity_days ? ` · ${accepted.exclusivity_days} days category exclusivity` : ''}`, y);
		y = row('Accepted', `${accepted.accepted_name ?? ''}${accepted.responded_at ? ` on ${fmtLong(accepted.responded_at.slice(0, 10))}` : ''}`, y);
	} else {
		y = row('Fee', r.type === 'barter' ? 'Barter (product only)' : r.fee ? `${inr(r.fee)} (offer, not yet agreed)` : 'Quote to follow', y);
		y = row('Usage rights', r.usage, y);
	}
	y -= 8;

	label('Key dates', y);
	y -= 20;
	for (const m of milestones(r, creator.name.split(' ')[0])) {
		if (y < 230) break;
		const when = m.date ? fmtLong(m.date) : m.who === 'done' ? '' : 'to be set';
		text(m.title, M, y, 9.5, m.who === 'you' ? bold : reg);
		text(when, M + 230, y, 9.5, reg, MUTED);
		text(m.who === 'done' ? 'Done' : m.who === 'you' ? 'Brand' : creator.name.split(' ')[0], W - M - 70, y, 9, bold, m.who === 'done' ? OK : m.who === 'you' ? G2 : MUTED);
		y -= 15;
	}
	y -= 8;

	if (r.invoices?.length) {
		label('Invoices', y);
		y -= 20;
		for (const i of r.invoices) {
			text(i.number, M, y, 9.5, bold);
			text(fmtLong(i.issue_date), M + 130, y, 9.5, reg, MUTED);
			text(inr(Number(i.payable)), M + 270, y, 9.5);
			text(i.status === 'paid' ? 'Paid' : i.claimed ? 'Payment reported' : i.due_date ? `Due ${fmtLong(i.due_date)}` : 'Open', M + 350, y, 9.5, reg, i.status === 'paid' ? OK : INK);
			y -= 15;
		}
		y -= 8;
	}

	if (r.results?.views || r.results?.reach) {
		label('Results so far (from Instagram)', y);
		y -= 14;
		const tiles = [
			{ v: compact(r.results.views), k: 'Views' },
			{ v: compact(r.results.reach), k: 'Accounts reached' },
			{ v: compact(r.results.interactions), k: 'Engagements' },
			...(accepted && r.results.views ? [{ v: `₹${(accepted.total / r.results.views).toFixed(2)}`, k: 'Cost per view' }] : [])
		];
		const gap = 10, tw = (W - 2 * M - gap * (tiles.length - 1)) / tiles.length;
		tiles.forEach((t, i) => {
			const x = M + i * (tw + gap);
			page.drawRectangle({ x, y: y - 46, width: tw, height: 46, color: SOFT });
			text(t.v, x + 10, y - 24, 15, bold);
			text(t.k, x + 10, y - 38, 8, reg, MUTED);
		});
	}

	text(`Generated from Collab Desk on ${fmtLong(todayIso())}. The accepted quote is the agreement; see the agreement page for the full terms.`, M, M - 10, 7.5, reg, MUTED);
	return doc.save();
}

export async function downloadSummary(r: BrandRequest, brand: string, creator: { name: string; handle: string }) {
	const bytes = await summaryPdf(r, brand, creator);
	void saveBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${r.code}-collab-summary.pdf`);
}
