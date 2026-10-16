// Builds her media kit in the browser from live data: her Instagram insights only (no packages or prices),
// each number shown once. 30-day numbers with changes, formats, how people engage, follower trend, audience,
// top content and past collab results, then a QR code to her brand page. If she doesn't share insights,
// a one-page version with the basic numbers and audience.
import { supabase } from './supabase';
import { audienceOf, audienceSummary, basedOn, benchmark, engageMix, formatRows, FORMAT_LABEL, insightKpis, monthName, sponsoredLine, type PublicInsights } from './insights';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import { qrMatrix } from './invoice';
import { loadFonts, wrap } from './invoicePdf';
import type { PublicPage } from './types';
import { compact, fmt, fmtUpdated, initials, mediaLabel } from './util';

const INK = rgb(0.12, 0.09, 0.11);
const MUTED = rgb(0.45, 0.41, 0.44);
const LINE = rgb(0.9, 0.87, 0.87);
const SOFT = rgb(0.965, 0.95, 0.95);
const DARK = rgb(0.1, 0.075, 0.1);
const G1 = rgb(0.42, 0.25, 0.83);
const G2 = rgb(0.83, 0.16, 0.42);
const G3 = rgb(0.95, 0.6, 0.29);
const WHITE = rgb(1, 1, 1);

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

export async function mediaKitPdf(p: PublicPage, link: string, ins: PublicInsights | null = null, hide: string[] = []): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const [regBytes, boldBytes] = await loadFonts();
	const reg = await doc.embedFont(regBytes);
	const bold = await doc.embedFont(boldBytes);
	doc.setTitle(`${p.display_name} · Media kit`);
	doc.setAuthor(p.display_name);
	if (ins) {
		await insightsPages(doc, p, ins, link, reg, bold, new Set(hide));
		return doc.save();
	}

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
	const updated = fmtUpdated(ig?.updated_at ?? new Date().toISOString());
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

	// ---- footer: book + QR ----
	const fh = 96;
	page.drawRectangle({ x: M, y: M, width: W - 2 * M, height: fh, color: SOFT });
	const m = qrMatrix(link);
	const qs = 72, cell = qs / m.length, qx = W - M - qs - 12, qy = M + 12;
	page.drawRectangle({ x: qx - 4, y: qy - 4, width: qs + 8, height: qs + 8, color: WHITE });
	m.forEach((row, r) => row.forEach((dark, c) => dark && page.drawRectangle({ x: qx + c * cell, y: qy + qs - (r + 1) * cell, width: cell + 0.15, height: cell + 0.15, color: INK })));
	text("Let's work together", M + 18, M + fh - 30, 15, bold);
	text('Send a collaboration request and track it live at', M + 18, M + fh - 48, 9.5, reg, MUTED);
	text(link.replace(/^https?:\/\//, ''), M + 18, M + fh - 64, 11, bold, G2);
	text(`Usually replies within ${p.reply_time}.`, M + 18, M + 18, 8.5, reg, MUTED);
	return doc.save();
}

const kindLabel = (k: string) => ({ REELS: 'Reel', STORY: 'Story', FEED: 'Post' })[k] ?? k;

/** A post thumbnail cropped to fill w×h (null if the image can't be read). */
async function coverJpeg(url: string, w: number, h: number): Promise<Uint8Array | null> {
	if (!url) return null;
	try {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.referrerPolicy = 'no-referrer';
		await new Promise<void>((res, rej) => {
			img.onload = () => res();
			img.onerror = () => rej(new Error('thumb'));
			setTimeout(() => rej(new Error('slow')), 8000);
			img.src = url;
		});
		const cv = document.createElement('canvas');
		cv.width = w * 3;
		cv.height = h * 3;
		const ctx = cv.getContext('2d')!;
		const s = Math.max(cv.width / img.naturalWidth, cv.height / img.naturalHeight);
		ctx.drawImage(img, (cv.width - img.naturalWidth * s) / 2, (cv.height - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
		const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', 0.82));
		return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
	} catch {
		return null;
	}
}

/** Everything on the insights page, on as many A4 pages as it needs. */
async function insightsPages(doc: PDFDocument, p: PublicPage, d: PublicInsights, link: string, reg: PDFFont, bold: PDFFont, hide: Set<string>) {
	const show = (k: string) => !hide.has(k);
	const W = 595.28, H = 841.89, M = 40, CW = W - 2 * M;
	let page = doc.addPage([W, H]);
	let y = H;
	const text = (t: string, x: number, yy: number, size = 9.5, font: PDFFont = reg, color: RGB = INK) => page.drawText(t, { x, y: yy, size, font, color });
	const right = (t: string, xr: number, yy: number, size = 9.5, font: PDFFont = reg, color: RGB = INK) => text(t, xr - font.widthOfTextAtSize(t, size), yy, size, font, color);
	const label = (t: string, x: number, yy: number) => text(t.toUpperCase(), x, yy, 7.5, bold, MUTED);
	const fit = (t: string, font: PDFFont, size: number, w: number) => {
		if (font.widthOfTextAtSize(t, size) <= w) return t;
		while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > w) t = t.slice(0, -1);
		return t + '…';
	};
	const UP = rgb(0.17, 0.48, 0.27), DOWN = rgb(0.75, 0.2, 0.2);

	// Header band (repeated, smaller, on any further page).
	const photoBytes = await circlePhoto(d.profile_picture_url ?? '');
	const photo: PDFImage | null = photoBytes ? await doc.embedPng(photoBytes).catch(() => null) : null;
	const header = (first: boolean) => {
		const bh = first ? 118 : 46;
		page.drawRectangle({ x: 0, y: H - bh, width: W, height: bh, color: DARK });
		for (let i = 0; i < 60; i++) {
			const t = i / 59;
			page.drawRectangle({ x: (W / 60) * i, y: H - bh, width: W / 60 + 0.5, height: 4, color: t < 0.5 ? mix(G1, G2, t * 2) : mix(G2, G3, (t - 0.5) * 2) });
		}
		if (first) {
			// Her photo in a ring, then name, handle, and where the numbers come from.
			const R = 36, cx = M + R, cy = H - 58;
			page.drawCircle({ x: cx, y: cy, size: R + 2.5, color: G2 });
			if (photo) page.drawImage(photo, { x: cx - R, y: cy - R, width: R * 2, height: R * 2 });
			else {
				page.drawCircle({ x: cx, y: cy, size: R, color: rgb(0.2, 0.16, 0.2) });
				const ini = initials(d.display_name);
				text(ini, cx - bold.widthOfTextAtSize(ini, 20) / 2, cy - 7, 20, bold, WHITE);
			}
			const tx = cx + R + 18, tw = W - M - tx;
			text('MEDIA KIT · INSTAGRAM INSIGHTS', tx, H - 32, 8, bold, G3);
			text(fit(d.display_name, bold, 22, tw), tx, H - 57, 22, bold, WHITE);
			const meta = [`@${d.username}`, d.niche, d.city].filter(Boolean).join(' · ');
			text(fit(meta, reg, 9.5, tw), tx, H - 75, 9.5, reg, rgb(0.85, 0.8, 0.84));
			const reviews = p.reviews ?? [];
			const avg = reviews.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : '';
			const src = `Verified from Instagram${d.updated_at ? ` · updated ${fmtUpdated(d.updated_at)}` : ''}${avg ? ` · rated ${avg}/5 by ${reviews.length} brand${reviews.length === 1 ? '' : 's'}` : ''}`;
			text(fit(src, reg, 8, tw), tx, H - 95, 8, reg, rgb(0.7, 0.65, 0.69));
		} else {
			text(`${d.display_name} · Instagram insights (continued)`, M, H - 28, 10, bold, WHITE);
		}
		y = H - bh - 22;
	};
	const need = (h: number) => {
		if (y - h >= M - 10) return;
		page = doc.addPage([W, H]);
		header(false);
	};
	header(true);

	if (d.insights.from) {
		text(`Last 30 days: ${fmt(d.insights.from)} to ${fmt(d.insights.to ?? '')}.`, M, y, 8.5, reg, MUTED);
		y -= 16;
	}
	const summary = show('audience') ? audienceSummary(d.demographics) : [];
	if (summary.length) {
		text(fit(`Audience at a glance: ${summary.join('  ·  ')}`, bold, 9.5, CW), M, y, 9.5, bold, G1);
		y -= 16;
	}

	// ---- headline numbers, 4 per row (Reel views and Story reach are in the format table, not here too) ----
	const fmts = new Set(formatRows(d).map(([k]) => k));
	const kpis = insightKpis(d).filter((k) => !(k.k === 'Avg. Reel views' && fmts.has('reels')) && !(k.k === 'Avg. Story reach' && fmts.has('stories')));
	if (kpis.length) {
		const cols = 4, gap = 9, tw = (CW - gap * (cols - 1)) / cols, th = 54;
		kpis.forEach((k, i) => {
			const col = i % cols, row = Math.floor(i / cols);
			const x = M + col * (tw + gap), top = y - row * (th + gap);
			page.drawRectangle({ x, y: top - th, width: tw, height: th, color: SOFT });
			page.drawRectangle({ x, y: top - th, width: 3, height: th, color: [G1, G2, G3, G2][col] });
			text(k.k, x + 12, top - 14, 8, reg, MUTED);
			text(k.show ?? (k.pct ? `${k.v}%` : compact(k.v)), x + 12, top - 34, 17, bold);
			let sx = x + 12;
			if (k.ch !== null) {
				const c = `${k.ch >= 0 ? '+' : '-'}${Math.abs(k.ch)}%`;
				text(c, sx, top - 47, 8, bold, k.ch >= 0 ? UP : DOWN);
				sx += bold.widthOfTextAtSize(c, 8) + 5;
			}
			if (k.sub) text(fit(k.sub, reg, 8, x + tw - 8 - sx), sx, top - 47, 8, reg, MUTED);
		});
		y -= Math.ceil(kpis.length / cols) * (th + gap) + 4;
		const bench = benchmark(d.followers, d.engagement_rate);
		if (bench) {
			text(fit(bench, bold, 8.5, CW), M, y, 8.5, bold, UP);
			y -= 6;
		}
		y -= 10;
	}

	// ---- by format: full width, with typical values and saves/shares ----
	const formats = show('formats') ? formatRows(d) : [];
	if (formats.length) {
		need(30 + formats.length * 18 + 20);
		const top = y;
		label('By format · last 12 of each, excluding posts from the last 3 days.', M, top);
		// Right edges of the number columns.
		const cx = [M, 0.25, 0.36, 0.47, 0.58, 0.69, 0.86, 1].map((f, i) => (i === 0 ? M : M + CW * f));
		let yy = top - 18;
		['Format', 'Based on', 'Avg. views', 'Typical views', 'Avg. reach', 'Typical reach', 'Saved · shared', 'Engagement'].forEach((h, i) => (i === 0 ? text(h, cx[0], yy, 8, bold, MUTED) : right(h, cx[i], yy, 8, bold, MUTED)));
		page.drawLine({ start: { x: M, y: yy - 5 }, end: { x: M + CW, y: yy - 5 }, thickness: 0.6, color: LINE });
		const c = (n: number | null | undefined) => (n ? compact(n) : '-');
		const rates = (a: number | null | undefined, b: number | null | undefined, none: string) => (a == null && b == null ? none : [a, b].map((v) => (v == null ? none : `${v}%`)).join(' · '));
		for (const [key, s] of formats) {
			yy -= 18;
			text(FORMAT_LABEL[key] ?? key, cx[0], yy, 9.5, bold);
			right(s.manual ? 'own' : `${basedOn(s)} ${key === 'stories' ? (basedOn(s) === 1 ? 'Story' : 'Stories') : basedOn(s) === 1 ? 'post' : 'posts'}`, cx[1], yy, 9.5);
			right(c(s.avg_views), cx[2], yy, 9.5);
			right(c(s.med_views), cx[3], yy, 9.5, reg, MUTED);
			right(c(s.avg_reach), cx[4], yy, 9.5);
			right(c(s.med_reach), cx[5], yy, 9.5, reg, MUTED);
			right(rates(s.save_rate, s.share_rate, '-'), cx[6], yy, 9);
			right(key === 'stories' ? (s.avg_interactions ? `${compact(s.avg_interactions)} actions` : '-') : s.er ? `${s.er}%` : '-', cx[7], yy, 9.5, bold);
			page.drawLine({ start: { x: M, y: yy - 6 }, end: { x: M + CW, y: yy - 6 }, thickness: 0.4, color: LINE });
		}
		text('Typical: the middle post, so one viral post does not pull it up. Saved · shared: per 100 accounts reached.', M, yy - 18, 7.5, reg, MUTED);
		y = yy - 36;
	}

	// Two side-by-side blocks (left and right halves); returns how tall the taller one was.
	const half = (CW - 24) / 2, rx = M + half + 24;
	const bars = (x: number, top: number, w: number, title: string, rows: { k: string; v: number; note?: string }[], fmtV: (v: number) => string) => {
		label(title, x, top);
		const max = Math.max(1, ...rows.map((r) => r.v));
		let yy = top - 18;
		for (const r of rows) {
			text(fit(r.k, reg, 9, 84), x, yy, 9);
			const bx = x + 88, bw = w - 88 - 52;
			page.drawRectangle({ x: bx, y: yy - 1, width: bw, height: 7, color: SOFT });
			page.drawRectangle({ x: bx, y: yy - 1, width: Math.max(2, (bw * r.v) / max), height: 7, color: G2 });
			right(fmtV(r.v), x + w, yy, 9, bold);
			if (r.note) text(r.note, x, yy - 9, 7, reg, MUTED);
			yy -= r.note ? 22 : 16;
		}
		return top - yy;
	};

	// ---- how people engage (left) and followers (right) ----
	const eng = show('engage') ? engageMix(d) : [];
	const hist = show('engage') ? (d.history ?? []) : [];
	if (eng.length || hist.length >= 3) {
		need(100);
		const top = y;
		const lh = eng.length ? bars(M, top, half, 'How people engage · 30 days', eng, (v) => compact(v)) : 0;
		let rh = 0;
		if (hist.length >= 3) {
			label(`Followers · ${fmt(hist[0].day)} to ${fmt(hist[hist.length - 1].day)}`, rx, top);
			const ys = hist.map((h) => h.followers), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
			const gx = rx, gy = top - 62, gw = half, gh = 46;
			page.drawRectangle({ x: gx, y: gy, width: gw, height: gh + 6, color: SOFT });
			const pt = (i: number) => ({ x: gx + 4 + (i / (hist.length - 1)) * (gw - 8), y: gy + 4 + ((ys[i] - lo) / span) * (gh - 4) });
			for (let i = 1; i < hist.length; i++) page.drawLine({ start: pt(i - 1), end: pt(i), thickness: 1.6, color: G2 });
			text(compact(ys[0]), gx, gy - 11, 8, reg, MUTED);
			right(compact(ys[ys.length - 1]), gx + gw, gy - 11, 8, bold);
			rh = 80;
		}
		y = top - Math.max(lh, rh) - 14;
	}

	// ---- sponsored vs regular (left) and what performs best (right) ----
	const sp = show('sponsored') ? (d.insights.sponsored ?? null) : null;
	const spLine = sponsoredLine(sp);
	const topics = show('topics') ? (d.insights.topics ?? []) : [];
	if ((sp && spLine) || topics.length) {
		need(30 + Math.max(4, topics.length) * 22);
		const top = y;
		let lh = 0;
		if (sp && spLine) {
			label('Sponsored vs regular posts · typical post', M, top);
			for (const [i, l] of wrap(`${spLine}.`, bold, 9.5, half).slice(0, 2).entries()) text(l, M, top - 17 - i * 12, 9.5, bold);
			const rows: [string, typeof sp.sponsored][] = [['Sponsored', sp.sponsored], ['Regular', sp.regular]];
			let yy = top - 50;
			['', 'Reach', 'Views', 'Engagement'].forEach((h, i) => i && right(h, M + half * [0, 0.55, 0.78, 1][i], yy, 8, bold, MUTED));
			for (const [k, st] of rows) {
				yy -= 15;
				text(`${k} (${basedOn(st)})`, M, yy, 9.5, bold);
				right(compact(st.med_reach), M + half * 0.55, yy, 9.5);
				right(compact(st.med_views), M + half * 0.78, yy, 9.5);
				right(st.er != null ? `${st.er}%` : '-', M + half, yy, 9.5, bold);
			}
			lh = top - yy + 6;
		}
		const tx = sp && spLine ? rx : M, tw = sp && spLine ? half : CW;
		const th = topics.length ? bars(tx, top, tw, 'What performs best · typical views by topic', topics.map((t) => ({ k: t.k, v: t.med_views ?? 0, note: `${t.posts} post${t.posts === 1 ? '' : 's'}` })), (v) => compact(v)) : 0;
		y = top - Math.max(lh, th) - 14;
	}

	// ---- audience: age, gender, top cities, top countries ----
	const a = audienceOf(show('audience') ? (d.demographics ?? {}) : {});
	const groups = [a.age.length ? 'age' : '', a.gender.length ? 'gender' : '', a.cities.length ? 'cities' : '', a.countries.length ? 'countries' : ''].filter(Boolean);
	if (groups.length) {
		const rows = Math.max(a.age.length, a.gender.length + 2, a.cities.length, a.countries.length);
		need(30 + rows * 14);
		label('Audience', M, y);
		y -= 16;
		const gap = 18, cw = (CW - gap * (groups.length - 1)) / groups.length, top = y;
		groups.forEach((gname, gi) => {
			const x = M + gi * (cw + gap);
			if (gname === 'age') {
				text('Age', x, top, 9.5, bold);
				const max = Math.max(1, ...a.age.map((r) => r.p));
				a.age.forEach((r, i) => {
					const yy = top - 16 - i * 14;
					text(r.k, x, yy, 8.5, reg, MUTED);
					const bw = (cw - 66) * (r.p / max);
					page.drawRectangle({ x: x + 36, y: yy - 1, width: Math.max(2, bw), height: 8, color: G2 });
					text(`${r.p}%`, x + 40 + bw, yy, 8.5, bold);
				});
			} else if (gname === 'gender') {
				text('Gender', x, top, 9.5, bold);
				let bx = x;
				const cols = [G2, G1, G3];
				a.gender.forEach((g, i) => {
					const w = (cw * g.p) / 100;
					page.drawRectangle({ x: bx, y: top - 20, width: Math.max(1, w - 1.5), height: 8, color: cols[i % 3] });
					bx += w;
				});
				a.gender.forEach((g, i) => {
					const yy = top - 38 - i * 14;
					page.drawCircle({ x: x + 3, y: yy + 3, size: 3, color: cols[i % 3] });
					text(g.k, x + 11, yy, 9);
					right(`${g.p}%`, x + cw, yy, 9, bold);
				});
			} else {
				const list = gname === 'cities' ? a.cities : a.countries;
				text(gname === 'cities' ? 'Top cities' : 'Top countries', x, top, 9.5, bold);
				list.forEach((c, i) => {
					const yy = top - 16 - i * 14;
					text(fit(c.k, reg, 9, cw - 30), x, yy, 9);
					right(`${c.p}%`, x + cw, yy, 9, bold);
				});
			}
		});
		y = top - 16 - rows * 14 - 12;
	}

	// ---- month by month ----
	const months = show('months') ? (d.months ?? []).filter((m) => m.reach || m.views) : [];
	if (months.length >= 2) {
		need(30 + months.length * 16);
		label('Month by month · 30 days to each month\'s last update', M, y);
		const cx = [M, 0.3, 0.46, 0.62, 0.8, 1].map((f, i) => (i === 0 ? M : M + CW * f));
		let yy = y - 18;
		['Month', 'Followers', 'Reached', 'Views', 'Engaged', 'Reels engagement'].forEach((h, i) => (i === 0 ? text(h, cx[0], yy, 8, bold, MUTED) : right(h, cx[i], yy, 8, bold, MUTED)));
		for (const m of months) {
			yy -= 16;
			text(monthName(m.month), cx[0], yy, 9.5, bold);
			[m.followers, m.reach, m.views, m.engaged].forEach((v, i) => right(v ? compact(v) : '-', cx[i + 1], yy, 9.5));
			right(m.reels_er ? `${m.reels_er}%` : '-', cx[5], yy, 9.5, bold);
		}
		y = yy - 22;
	}

	// ---- post grids: top content and past brand collabs ----
	const tw = (CW - 5 * 9) / 6, th = Math.round(tw * 0.9);
	const grid = async (title: string, items: { img: string; t: string; n: string; n2?: string; url: string }[]) => {
		if (!items.length) return;
		need(18 + th + 50);
		label(title, M, y);
		y -= 10;
		const imgs = await Promise.all(items.map((it) => coverJpeg(it.img, tw, th)));
		for (const [i, it] of items.entries()) {
			const x = M + i * (tw + 9), top = y;
			const bytes = imgs[i];
			const img = bytes ? await doc.embedJpg(bytes).catch(() => null) : null;
			if (img) page.drawImage(img, { x, y: top - th, width: tw, height: th });
			else {
				page.drawRectangle({ x, y: top - th, width: tw, height: th, color: SOFT });
				const ph = 'Instagram';
				text(ph, x + (tw - reg.widthOfTextAtSize(ph, 7.5)) / 2, top - th / 2, 7.5, reg, MUTED);
			}
			text(fit(it.t, reg, 7.5, tw), x, top - th - 11, 7.5, reg, MUTED);
			text(fit(it.n, bold, 8.5, tw), x, top - th - 22, 8.5, bold);
			if (it.n2) text(fit(it.n2, reg, 7.5, tw), x, top - th - 32, 7.5, reg, MUTED);
		}
		y -= th + 58;
	};
	const views = (v: number | null, r: number | null) => (v ? `${compact(v)} views` : r ? `${compact(r)} reached` : '');
	await grid(
		'Top performing content',
		(show('top') ? (d.top ?? []) : []).slice(0, 6).map((m) => ({ img: m.thumbnail_url, url: m.permalink, t: `${mediaLabel(m.media_type, m.product_type)} · ${fmt(m.posted_at.slice(0, 10))}`, n: views(m.views, m.reach), n2: m.interactions ? `${compact(m.interactions)} interactions` : '' }))
	);
	await grid(
		'Past brand collabs · how collab posts performed',
		(show('collabs') ? (p.results ?? []) : []).slice(0, 6).map((r) => ({ img: r.thumbnail, url: r.permalink, t: `${kindLabel(r.kind)} · ${r.brand}`, n: views(r.views, r.reach) }))
	);

	// ---- work together: link and QR to her brand page ----
	const site = link.replace(/^https?:\/\//, '').replace(/\/$/, '');
	const fh = 84;
	need(fh + 6);
	const fy = y - fh;
	page.drawRectangle({ x: M, y: fy, width: CW, height: fh, color: SOFT });
	const m = qrMatrix(link);
	const qs = 62, cell = qs / m.length, qx = W - M - qs - 11, qy = fy + 11;
	page.drawRectangle({ x: qx - 4, y: qy - 4, width: qs + 8, height: qs + 8, color: WHITE });
	m.forEach((row, r) => row.forEach((dark, c) => dark && page.drawRectangle({ x: qx + c * cell, y: qy + qs - (r + 1) * cell, width: cell + 0.15, height: cell + 0.15, color: INK })));
	text("Let's work together", M + 16, fy + fh - 26, 14, bold);
	text('Send a collaboration request and track it live at', M + 16, fy + fh - 43, 9, reg, MUTED);
	text(site, M + 16, fy + fh - 58, 10.5, bold, G2);
	text(`Usually replies within ${p.reply_time}. Live insights: ${site}/insights`, M + 16, fy + 12, 8, reg, MUTED);
}

export async function downloadMediaKit(p: PublicPage, link: string, hide: string[] = []) {
	const { data } = await supabase.rpc('public_insights');
	const bytes = await mediaKitPdf(p, link, (data as PublicInsights | null) ?? null, hide);
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
