// Builds her media kit (one A4 page) in the browser from live data: Instagram numbers, audience,
// packages, rates, brands she has worked with, and a QR code to her brand page.
import { supabase } from './supabase';
import { reachOk, type PublicInsights } from './insights';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import { qrMatrix } from './invoice';
import { loadFonts, wrap } from './invoicePdf';
import { rateValue } from './priority';
import type { PublicPage } from './types';
import { compact, delivText, initials, offeredKinds, packageOffered } from './util';

const INK = rgb(0.12, 0.09, 0.11);
const MUTED = rgb(0.45, 0.41, 0.44);
const LINE = rgb(0.9, 0.87, 0.87);
const SOFT = rgb(0.965, 0.95, 0.95);
const DARK = rgb(0.1, 0.075, 0.1);
const G1 = rgb(0.42, 0.25, 0.83);
const G2 = rgb(0.83, 0.16, 0.42);
const G3 = rgb(0.95, 0.6, 0.29);
const WHITE = rgb(1, 1, 1);

const rupees = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const pct = (part: Record<string, number> | undefined) => {
	const entries = Object.entries(part ?? {});
	const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
	return entries.map(([k, v]) => ({ k, p: Math.round((v / total) * 100) }));
};
const mix = (a: RGB, b: RGB, t: number) => rgb(a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t);

/** Her photo, cropped to a circle on a canvas (null if the image can't be read). */
async function circlePhoto(url: string): Promise<Uint8Array | null> {
	if (!url) return null;
	try {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.referrerPolicy = 'no-referrer';
		await new Promise<void>((res, rej) => {
			img.onload = () => res();
			img.onerror = () => rej(new Error('photo'));
			img.src = url;
		});
		const n = 360;
		const cv = document.createElement('canvas');
		cv.width = cv.height = n;
		const ctx = cv.getContext('2d')!;
		ctx.beginPath();
		ctx.arc(n / 2, n / 2, n / 2, 0, Math.PI * 2);
		ctx.clip();
		const s = Math.min(img.naturalWidth, img.naturalHeight);
		ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, n, n);
		const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/png'));
		return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
	} catch {
		return null;
	}
}

export async function mediaKitPdf(p: PublicPage, link: string, ins: PublicInsights | null = null): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const [regBytes, boldBytes] = await loadFonts();
	const reg = await doc.embedFont(regBytes);
	const bold = await doc.embedFont(boldBytes);
	doc.setTitle(`${p.display_name} · Media kit`);
	doc.setAuthor(p.display_name);

	const W = 595.28, H = 841.89, M = 40;
	const page: PDFPage = doc.addPage([W, H]);
	const text = (t: string, x: number, y: number, size = 9.5, font: PDFFont = reg, color: RGB = INK) => page.drawText(t, { x, y, size, font, color });
	const right = (t: string, xr: number, y: number, size = 9.5, font: PDFFont = reg, color: RGB = INK) => text(t, xr - font.widthOfTextAtSize(t, size), y, size, font, color);
	const label = (t: string, x: number, y: number) => text(t.toUpperCase(), x, y, 7.5, bold, MUTED);

	// ---- header band with a gradient strip ----
	const bandH = 178;
	page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: DARK });
	const steps = 60;
	for (let i = 0; i < steps; i++) {
		const t = i / (steps - 1);
		const c = t < 0.5 ? mix(G1, G2, t * 2) : mix(G2, G3, (t - 0.5) * 2);
		page.drawRectangle({ x: (W / steps) * i, y: H - bandH, width: W / steps + 0.5, height: 5, color: c });
	}
	const ig = p.instagram;
	const photoBytes = await circlePhoto(ig?.profile_picture_url ?? '');
	let photo: PDFImage | null = null;
	if (photoBytes) photo = await doc.embedPng(photoBytes).catch(() => null);
	const R = 46, cx = M + R, cy = H - 86;
	page.drawCircle({ x: cx, y: cy, size: R + 3, color: G2 });
	if (photo) page.drawImage(photo, { x: cx - R, y: cy - R, width: R * 2, height: R * 2 });
	else {
		page.drawCircle({ x: cx, y: cy, size: R, color: rgb(0.2, 0.16, 0.2) });
		const ini = initials(p.display_name);
		text(ini, cx - bold.widthOfTextAtSize(ini, 26) / 2, cy - 9, 26, bold, WHITE);
	}
	const tx = cx + R + 22;
	text('MEDIA KIT', tx, H - 52, 8, bold, rgb(0.95, 0.6, 0.29));
	text(p.display_name, tx, H - 80, 26, bold, WHITE);
	text(`@${ig?.username || p.handle}`, tx, H - 99, 11, reg, rgb(0.85, 0.8, 0.84));
	const sub = [p.niche, p.city].filter(Boolean).join(' · ');
	if (sub) for (const [i, l] of wrap(sub, reg, 9.5, W - tx - M).slice(0, 2).entries()) text(l, tx, H - 116 - i * 12, 9.5, reg, rgb(0.7, 0.65, 0.69));
	const updated = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
	right(`Updated ${updated}${ig ? ' · live from Instagram' : ''}`, W - M, H - bandH + 16, 7.5, reg, rgb(0.6, 0.55, 0.59));

	let y = H - bandH - 26;

	// ---- stat tiles ----
	const stats = [
		{ v: ig?.followers ? compact(ig.followers) : p.followers, k: 'Followers' },
		{ v: ig?.engagement_rate != null ? `${ig.engagement_rate}%` : p.engagement, k: 'Avg. engagement' },
		{ v: ig?.avg_views ? compact(ig.avg_views) : '', k: 'Avg. views per post' },
		{ v: ig?.avg_reach ? compact(ig.avg_reach) : '', k: 'Avg. reach per post' }
	].filter((s) => s.v);
	if (stats.length) {
		const gap = 10, tw = (W - 2 * M - gap * (stats.length - 1)) / stats.length, th = 62;
		stats.forEach((s, i) => {
			const x = M + i * (tw + gap);
			page.drawRectangle({ x, y: y - th, width: tw, height: th, color: SOFT });
			page.drawRectangle({ x, y: y - th, width: 3, height: th, color: i === 0 ? G1 : i === 1 ? G2 : G3 });
			text(String(s.v), x + 14, y - 32, 21, bold);
			text(s.k, x + 14, y - 49, 8.5, reg, MUTED);
		});
		y -= th + 26;
	}

	// ---- last 30 days (what brands ask for) ----
	const t = ins?.insights?.totals ?? {};
	const fm = ins?.insights?.formats;
	const month = [
		{ v: reachOk(t) ? t.reach : undefined, k: 'Accounts reached' },
		{ v: t.views, k: 'Views' },
		{ v: t.accounts_engaged, k: 'Accounts engaged' },
		{ v: fm?.reels?.avg_views, k: 'Avg. Reel views' },
		{ v: fm?.stories?.avg_reach, k: 'Avg. Story reach' }
	].filter((s): s is { v: number; k: string } => typeof s.v === 'number' && s.v > 0);
	if (month.length) {
		label('Last 30 days · verified from Instagram', M, y);
		y -= 14;
		const gap = 8, tw = (W - 2 * M - gap * (month.length - 1)) / month.length, th = 44;
		month.forEach((s, i) => {
			const x = M + i * (tw + gap);
			page.drawRectangle({ x, y: y - th, width: tw, height: th, color: SOFT });
			text(compact(s.v), x + 10, y - 22, 15, bold);
			text(s.k, x + 10, y - 36, 7.5, reg, MUTED);
		});
		y -= th + 22;
	}

	// ---- audience ----
	const demo = ig?.demographics ?? {};
	const age = pct(demo.age).sort((a, b) => a.k.localeCompare(b.k));
	const gender = pct(demo.gender).map((g) => ({ ...g, k: g.k === 'F' ? 'Women' : g.k === 'M' ? 'Men' : 'Other' })).sort((a, b) => b.p - a.p);
	const cities = pct(demo.city).sort((a, b) => b.p - a.p).slice(0, 5).map((c) => ({ ...c, k: c.k.split(',')[0] }));
	if (age.length || gender.length || cities.length) {
		label('Audience', M, y);
		y -= 16;
		const colW = (W - 2 * M - 40) / 3;
		const top = y;
		// Age bars
		if (age.length) {
			text('Age', M, top, 9.5, bold);
			const max = Math.max(1, ...age.map((a) => a.p));
			let yy = top - 16;
			for (const a of age) {
				text(a.k, M, yy, 8.5, reg, MUTED);
				const bw = (colW - 70) * (a.p / max);
				page.drawRectangle({ x: M + 38, y: yy - 1, width: Math.max(2, bw), height: 8, color: G2 });
				text(`${a.p}%`, M + 42 + bw, yy, 8.5, bold);
				yy -= 14;
			}
		}
		// Gender split
		if (gender.length) {
			const gx = M + colW + 20;
			text('Gender', gx, top, 9.5, bold);
			let bx = gx;
			const cols = [G2, G1, G3];
			gender.forEach((g, i) => {
				const w = (colW * g.p) / 100;
				page.drawRectangle({ x: bx, y: top - 22, width: Math.max(1, w - 1.5), height: 9, color: cols[i % 3] });
				bx += w;
			});
			gender.forEach((g, i) => {
				const yy = top - 42 - i * 14;
				page.drawCircle({ x: gx + 3, y: yy + 3, size: 3, color: cols[i % 3] });
				text(g.k, gx + 12, yy, 9);
				right(`${g.p}%`, gx + colW, yy, 9, bold);
			});
		}
		// Top cities
		if (cities.length) {
			const cx2 = M + 2 * (colW + 20);
			text('Top cities', cx2, top, 9.5, bold);
			cities.forEach((c, i) => {
				const yy = top - 18 - i * 14;
				text(c.k, cx2, yy, 9);
				right(`${c.p}%`, cx2 + colW, yy, 9, bold);
			});
		}
		y = top - Math.max(16 + age.length * 14, 42 + gender.length * 14, 18 + cities.length * 14) - 18;
	}

	// ---- packages ----
	const packs = (p.packages ?? []).filter((k) => packageOffered(k.items, p.offered));
	if (packs.length) {
		label('Packages', M, y);
		y -= 12;
		const n = Math.min(3, packs.length), gap = 10, pw = (W - 2 * M - gap * (n - 1)) / n, ph = 78;
		packs.slice(0, 3).forEach((k, i) => {
			const x = M + i * (pw + gap);
			page.drawRectangle({ x, y: y - ph, width: pw, height: ph, borderColor: k.badge ? G2 : LINE, borderWidth: k.badge ? 1.2 : 0.8, color: WHITE });
			text(k.name, x + 12, y - 20, 11, bold);
			if (k.badge) right(k.badge.toUpperCase(), x + pw - 10, y - 18, 6.5, bold, G2);
			for (const [j, l] of wrap(delivText(k.items), reg, 8.5, pw - 24).slice(0, 2).entries()) text(l, x + 12, y - 35 - j * 11, 8.5, reg, MUTED);
			text(rupees(k.price), x + 12, y - ph + 13, 15, bold);
			const r = rateValue(k.items, p.rates);
			if (r > k.price && k.price) right(`save ${Math.round((1 - k.price / r) * 100)}%`, x + pw - 10, y - ph + 15, 8, bold, rgb(0.17, 0.48, 0.27));
		});
		y -= ph + 24;
	}

	// ---- rates ----
	const room = (need: number) => y - need > M + 96 + 14;
	const rates = Object.entries(p.rates ?? {}).filter(([k, v]) => v && offeredKinds(p.offered).includes(k));
	if (rates.length && room(16 + Math.ceil(rates.length / 2) * 17)) {
		label('Starting rates', M, y);
		y -= 16;
		const half = Math.ceil(rates.length / 2), cw = (W - 2 * M - 30) / 2;
		rates.forEach(([k, v], i) => {
			const col = i < half ? 0 : 1, row = i < half ? i : i - half;
			const x = M + col * (cw + 30), yy = y - row * 17;
			text(k, x, yy, 9.5);
			right(`from ${rupees(v)}`, x + cw, yy, 9.5, bold);
			page.drawLine({ start: { x, y: yy - 5 }, end: { x: x + cw, y: yy - 5 }, thickness: 0.5, color: LINE });
		});
		y -= half * 17 + 18;
	}

	// ---- worked with ----
	if (p.worked_with?.length && room(40)) {
		label('Brands I have worked with', M, y);
		y -= 15;
		for (const l of wrap(p.worked_with.join('  ·  '), bold, 10, W - 2 * M).slice(0, 3)) (text(l, M, y, 10, bold), (y -= 14));
		y -= 10;
	}

	// ---- footer: book + QR ----
	const fh = 96;
	page.drawRectangle({ x: M, y: M, width: W - 2 * M, height: fh, color: SOFT });
	const m = qrMatrix(link);
	const qs = 72, cell = qs / m.length, qx = W - M - qs - 12, qy = M + 12;
	page.drawRectangle({ x: qx - 4, y: qy - 4, width: qs + 8, height: qs + 8, color: WHITE });
	m.forEach((row, r) => row.forEach((dark, c) => dark && page.drawRectangle({ x: qx + c * cell, y: qy + qs - (r + 1) * cell, width: cell + 0.15, height: cell + 0.15, color: INK })));
	text("Let's work together", M + 18, M + fh - 30, 15, bold);
	text('Send a request, see packages and track it live at', M + 18, M + fh - 48, 9.5, reg, MUTED);
	text(link.replace(/^https?:\/\//, ''), M + 18, M + fh - 64, 11, bold, G2);
	text(`Usually replies within ${p.reply_time}.`, M + 18, M + 18, 8.5, reg, MUTED);

	return doc.save();
}

export async function downloadMediaKit(p: PublicPage, link: string) {
	const { data } = await supabase.rpc('public_insights');
	const bytes = await mediaKitPdf(p, link, (data as PublicInsights | null) ?? null);
	saveBlob(bytes, `${p.display_name.replace(/[^\w]+/g, '-')}-media-kit.pdf`);
}

function saveBlob(bytes: Uint8Array, name: string) {
	const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
