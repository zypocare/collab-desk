// The results report as a one-page A4 PDF a brand can forward: results, ROI and every post.
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type RGB } from 'pdf-lib';
import { loadFonts } from './invoicePdf';
import { deliv, money, roiOf, type ReportFull } from './roi';
import { compact, localDay } from './util';
import { saveBlob } from './download';

const INK = rgb(0.12, 0.09, 0.11);
const MUTED = rgb(0.45, 0.41, 0.44);
const LINE = rgb(0.9, 0.87, 0.87);
const SOFT = rgb(0.965, 0.95, 0.95);
const DARK = rgb(0.1, 0.075, 0.1);
const G1 = rgb(0.42, 0.25, 0.83);
const G2 = rgb(0.83, 0.16, 0.42);
const G3 = rgb(0.95, 0.6, 0.29);
const WHITE = rgb(1, 1, 1);

export async function reportPdf(r: ReportFull): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const [regBytes, boldBytes] = await loadFonts();
	const reg = await doc.embedFont(regBytes);
	const bold = await doc.embedFont(boldBytes);
	doc.setTitle(`${r.brand} × ${r.creator.name} · Results`);
	const W = 595.28, H = 841.89, M = 40;
	const page = doc.addPage([W, H]);
	const text = (t: string, x: number, y: number, size = 9.5, font: PDFFont = reg, color: RGB = INK) => page.drawText(t, { x, y, size, font, color });
	const right = (t: string, xr: number, y: number, size = 9.5, font: PDFFont = reg, color: RGB = INK) => text(t, xr - font.widthOfTextAtSize(t, size), y, size, font, color);
	const label = (t: string, x: number, y: number) => text(t.toUpperCase(), x, y, 7.5, bold, MUTED);
	const roi = roiOf(r);

	// Header.
	const bandH = 132;
	page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: DARK });
	page.drawRectangle({ x: 0, y: H - bandH, width: W / 3, height: 5, color: G1 });
	page.drawRectangle({ x: W / 3, y: H - bandH, width: W / 3, height: 5, color: G2 });
	page.drawRectangle({ x: (2 * W) / 3, y: H - bandH, width: W / 3, height: 5, color: G3 });
	text(`COLLABORATION RESULTS · ${r.code}`, M, H - 40, 8, bold, rgb(0.75, 0.7, 0.74));
	text(`${r.brand} × ${r.creator.name}`, M, H - 68, 22, bold, WHITE);
	text(`${deliv(r.deliverables)} · @${r.creator.handle}${r.creator.followers ? ` · ${compact(r.creator.followers)} followers` : ''}`, M, H - 88, 10, reg, rgb(0.85, 0.8, 0.84));
	const asOf = localDay(roi.latest?.updated_at ?? r.generated_at);
	text(`Numbers from Instagram${asOf ? ` as of ${new Date(asOf).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`, M, H - 108, 8.5, reg, rgb(0.65, 0.6, 0.64));

	let y = H - bandH - 30;
	const tiles = (items: { v: string; k: string }[], th = 58, size = 19) => {
		const gap = 10, tw = (W - 2 * M - gap * (items.length - 1)) / items.length;
		items.forEach((s, i) => {
			const x = M + i * (tw + gap);
			page.drawRectangle({ x, y: y - th, width: tw, height: th, color: SOFT });
			page.drawRectangle({ x, y: y - th, width: 3, height: th, color: [G1, G2, G3][i % 3] });
			text(s.v, x + 12, y - th / 2 - 2, size, bold);
			text(s.k, x + 12, y - th + 11, 8, reg, MUTED);
		});
		y -= th + 24;
	};

	label('Results', M, y);
	y -= 12;
	tiles([
		{ v: compact(roi.views), k: 'Views' },
		{ v: compact(roi.reach), k: 'Accounts reached' },
		{ v: compact(roi.engagements), k: 'Engagements' },
		{ v: r.engagement_rate !== null ? `${r.engagement_rate}%` : '—', k: 'Engagement rate' }
	]);

	if (roi.cost > 0) {
		label(`Return on ${money(roi.cost)} invested${r.product_value ? ` (incl. ${money(r.product_value)} product)` : ''}`, M, y);
		y -= 12;
		tiles([
			{ v: money(roi.cpv), k: 'Cost per view' },
			{ v: money(roi.cpm), k: 'Cost per 1,000 views' },
			{ v: money(roi.cpe), k: 'Cost per engagement' },
			{ v: money(roi.cpr), k: 'Cost per account reached' }
		]);
	}

	label('Breakdown', M, y);
	y -= 16;
	const t = roi.latest ?? r.totals;
	const rows: [string, number | null | undefined][] = [['Likes', t.likes], ['Comments', t.comments], ['Saves', t.saves], ['Shares', t.shares]];
	const cw = (W - 2 * M - 30) / 2;
	rows.forEach(([k, v], i) => {
		const x = M + (i % 2) * (cw + 30), yy = y - Math.floor(i / 2) * 18;
		text(k, x, yy, 9.5);
		right(v === null || v === undefined ? '—' : Number(v).toLocaleString('en-IN'), x + cw, yy, 9.5, bold);
		page.drawLine({ start: { x, y: yy - 5 }, end: { x: x + cw, y: yy - 5 }, thickness: 0.5, color: LINE });
	});
	y -= 2 * 18 + 22;

	label('Posts', M, y);
	y -= 16;
	const cols = [M, M + 120, M + 215, M + 300, M + 380, M + 455];
	['Post', 'Posted', 'Views', 'Reach', 'Likes', 'Saves'].forEach((h, i) => text(h, cols[i], y, 8, bold, MUTED));
	y -= 14;
	for (const p of r.posts.slice(0, 14)) {
		if (y < M + 60) break;
		text(p.type, cols[0], y, 9);
		text(new Date(p.posted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), cols[1], y, 9);
		text(compact(p.views), cols[2], y, 9, bold);
		text(compact(p.reach), cols[3], y, 9);
		text(compact(p.likes), cols[4], y, 9);
		text(compact(p.saves), cols[5], y, 9);
		page.drawLine({ start: { x: M, y: y - 5 }, end: { x: W - M, y: y - 5 }, thickness: 0.5, color: LINE });
		y -= 17;
	}

	text('Figures are Instagram’s own numbers for organic activity. “—” means Instagram doesn’t share that number.', M, M, 7.5, reg, MUTED);
	return doc.save();
}

export async function downloadReport(r: ReportFull) {
	const bytes = await reportPdf(r);
	void saveBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${r.brand.replace(/[^\w]+/g, '-')}-results-${r.code}.pdf`);
}
