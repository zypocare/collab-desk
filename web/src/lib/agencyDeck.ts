// A roster pitch deck: a cover for the brand and one page per creator (who they are, reach, audience
// languages, record on Miracle and rates), to send with a pitch. Made in the browser as a PDF.
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { RosterCreator } from './agency.svelte';
import { saveBlob } from './download';
import { loadFonts, wrap } from './invoicePdf';
import { compact } from './util';

const INK = rgb(0.12, 0.09, 0.11);
const MUTED = rgb(0.45, 0.41, 0.44);
const SOFT = rgb(0.965, 0.95, 0.95);
const DARK = rgb(0.1, 0.075, 0.1);
const PINK = rgb(0.83, 0.16, 0.42);
const WHITE = rgb(1, 1, 1);

export async function rosterDeck(o: { brand: string; brief: string; from: string; creators: RosterCreator[] }) {
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const [r, b] = await loadFonts();
	const reg = await doc.embedFont(r);
	const bold = await doc.embedFont(b);
	doc.setTitle(`Creators for ${o.brand}`);
	const W = 841.89, H = 595.28, M = 48; // landscape A4
	const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

	// Cover.
	const c = doc.addPage([W, H]);
	c.drawRectangle({ x: 0, y: 0, width: W, height: H, color: DARK });
	c.drawRectangle({ x: 0, y: 0, width: W, height: 6, color: PINK });
	c.drawText('CREATORS FOR', { x: M, y: H - 110, size: 11, font: bold, color: PINK });
	c.drawText(o.brand, { x: M, y: H - 160, size: 44, font: bold, color: WHITE });
	let y = H - 200;
	for (const l of wrap(o.brief || `${o.creators.length} creators picked for you`, reg, 14, W - 2 * M).slice(0, 5)) {
		c.drawText(l, { x: M, y, size: 14, font: reg, color: rgb(0.85, 0.8, 0.84) });
		y -= 20;
	}
	c.drawText(`${o.creators.length} creator${o.creators.length === 1 ? '' : 's'} · ${compact(o.creators.reduce((a, x) => a + (x.followers ?? 0), 0))} followers together`, { x: M, y: M + 40, size: 12, font: bold, color: WHITE });
	c.drawText(`From ${o.from}`, { x: M, y: M + 20, size: 10, font: reg, color: rgb(0.7, 0.65, 0.69) });

	for (const x of o.creators) {
		const p: PDFPage = doc.addPage([W, H]);
		const t = (s: string, px: number, py: number, size = 11, font: PDFFont = reg, color = INK) => p.drawText(s, { x: px, y: py, size, font, color });
		p.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: PINK });
		t(x.name, M, H - 70, 30, bold);
		t([x.handle ? `@${x.handle.replace(/^@+/, '')}` : '', x.niche, x.city].filter(Boolean).join('  ·  '), M, H - 92, 12, reg, MUTED);
		const stats = [
			[x.followers != null ? compact(x.followers) : '—', 'Followers'],
			[x.engagement != null ? `${Number(x.engagement).toFixed(1)}%` : '—', 'Engagement'],
			[x.avg_views != null ? compact(x.avg_views) : '—', 'Avg. views'],
			[x.trust?.deals ? String(x.trust.deals) : '—', 'Paid deals on Miracle']
		];
		const tw = (W - 2 * M - 30) / 4;
		stats.forEach(([v, k], i) => {
			const px = M + i * (tw + 10);
			p.drawRectangle({ x: px, y: H - 190, width: tw, height: 70, color: SOFT });
			t(v, px + 16, H - 152, 24, bold);
			t(k, px + 16, H - 172, 10, reg, MUTED);
		});
		let py = H - 230;
		if (x.languages?.length) {
			t(`Creates in ${x.languages.join(', ')}`, M, py, 12);
			py -= 22;
		}
		if (x.trust?.posted) {
			t(`Posted on time ${x.trust.on_time} of ${x.trust.posted}${x.trust.reply_hours != null ? ` · replies in about ${Math.max(1, Math.round(x.trust.reply_hours))} hours` : ''}`, M, py, 12);
			py -= 22;
		}
		const rates = Object.entries(x.rates ?? {}).filter(([, v]) => Number(v) > 0).slice(0, 6);
		if (rates.length) {
			py -= 10;
			t('RATES', M, py, 9, bold, MUTED);
			py -= 6;
			for (const [k, v] of rates) {
				py -= 20;
				t(k, M, py, 12);
				const s = money(Number(v));
				t(s, M + 260 - bold.widthOfTextAtSize(s, 12), py, 12, bold);
			}
		}
		const link = (x.site_url || '').replace(/\/$/, '');
		if (link) t(`${link.replace(/^https?:\/\//, '')}${x.show_insights ? '  ·  live insights: ' + link.replace(/^https?:\/\//, '') + '/insights' : ''}`, M, M, 10, reg, PINK);
	}
	const bytes = await doc.save();
	await saveBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `Creators-for-${o.brand.replace(/[^\w]+/g, '-')}.pdf`);
}
