// "Share to Story": a 1080×1920 picture of her page for an Instagram Story. Her photo in the story-ring
// gradient, her name, what she creates, her live numbers and her link, so followers and brands who see
// the Story know where to book her. Drawn on a canvas in the app's own fonts; no network needed beyond
// her photo (left out, with her initials instead, when it can't be drawn).
import { compact } from './util';

export type StoryCardData = {
	name: string;
	niche: string;
	city: string;
	link: string; // "priya.miracleapp.live"
	handle: string;
	photo: HTMLImageElement | null;
	initials: string;
	followers: number | null;
	engagement: number | null; // percent
	avgViews: number | null;
	accepting: boolean;
};

export const STORY_W = 1080;
export const STORY_H = 1920;

const SERIF = "'Instrument Serif', 'Iowan Old Style', Georgia, serif";
const SANS = "Inter, 'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif";
const INK = '#FBF2F6';
const INK2 = 'rgba(251,242,246,.72)';
const INK3 = 'rgba(251,242,246,.5)';

function grad(x: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
	const g = x.createLinearGradient(x0, y0, x1, y1);
	g.addColorStop(0, '#9C7BFF');
	g.addColorStop(0.52, '#F25A90');
	g.addColorStop(1, '#FFAE6B');
	return g;
}

/** Shrinks the font until the text fits in `max` px, and returns the size used. */
function fit(x: CanvasRenderingContext2D, text: string, font: (px: number) => string, start: number, max: number, min = 36) {
	let px = start;
	x.font = font(px);
	while (px > min && x.measureText(text).width > max) {
		px -= 2;
		x.font = font(px);
	}
	return px;
}

/** Breaks text into at most `lines` lines of `max` px, ending with … if it still runs over. */
function wrap(x: CanvasRenderingContext2D, text: string, max: number, lines: number) {
	const words = text.split(/\s+/).filter(Boolean);
	const out: string[] = [];
	let cur = '';
	for (const w of words) {
		const t = cur ? `${cur} ${w}` : w;
		if (x.measureText(t).width <= max || !cur) cur = t;
		else {
			out.push(cur);
			cur = w;
		}
	}
	if (cur) out.push(cur);
	if (out.length > lines) {
		const kept = out.slice(0, lines);
		let last = kept[lines - 1];
		while (last && x.measureText(`${last}…`).width > max) last = last.slice(0, -1);
		kept[lines - 1] = `${last.trimEnd()}…`;
		return kept;
	}
	return out;
}

export function drawStoryCard(canvas: HTMLCanvasElement, d: StoryCardData) {
	const W = STORY_W, H = STORY_H;
	canvas.width = W;
	canvas.height = H;
	const x = canvas.getContext('2d')!;
	x.textBaseline = 'alphabetic';

	// Ground: the app's dark plum with the gradient glowing in from the corners.
	x.fillStyle = '#1C1219';
	x.fillRect(0, 0, W, H);
	const glow = (cx: number, cy: number, r: number, c: string) => {
		const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
		g.addColorStop(0, c);
		g.addColorStop(1, 'rgba(28,18,25,0)');
		x.fillStyle = g;
		x.fillRect(0, 0, W, H);
	};
	glow(80, 120, 900, 'rgba(107,63,212,.55)');
	glow(1060, 1880, 900, 'rgba(212,41,106,.42)');
	glow(1040, 260, 520, 'rgba(242,153,74,.16)');

	// Top: who made it (small, so the Story stays hers).
	x.textAlign = 'center';
	x.font = `600 26px ${SANS}`;
	x.fillStyle = INK3;
	x.letterSpacing = '6px';
	x.fillText(d.accepting ? 'OPEN FOR COLLABS' : 'BRAND COLLABORATIONS', W / 2, 268);
	x.letterSpacing = '0px';

	// Her photo in the story ring.
	const cy = 540, r = 190;
	x.beginPath();
	x.arc(W / 2, cy, r + 22, 0, Math.PI * 2);
	x.fillStyle = grad(x, W / 2 - r, cy - r, W / 2 + r, cy + r);
	x.fill();
	x.beginPath();
	x.arc(W / 2, cy, r + 8, 0, Math.PI * 2);
	x.fillStyle = '#1C1219';
	x.fill();
	x.save();
	x.beginPath();
	x.arc(W / 2, cy, r, 0, Math.PI * 2);
	x.clip();
	if (d.photo) {
		const s = Math.max((r * 2) / d.photo.naturalWidth, (r * 2) / d.photo.naturalHeight);
		const w = d.photo.naturalWidth * s, h = d.photo.naturalHeight * s;
		x.drawImage(d.photo, W / 2 - w / 2, cy - h / 2, w, h);
	} else {
		x.fillStyle = grad(x, W / 2 - r, cy - r, W / 2 + r, cy + r);
		x.fillRect(W / 2 - r, cy - r, r * 2, r * 2);
		x.fillStyle = '#fff';
		x.font = `italic 400 190px ${SERIF}`;
		x.fillText(d.initials, W / 2, cy + 66);
	}
	x.restore();

	// Name, then what she makes and where.
	const nameSize = fit(x, d.name, (px) => `400 ${px}px ${SERIF}`, 132, W - 160, 72);
	x.fillStyle = INK;
	x.fillText(d.name, W / 2, 880);
	const line = [d.niche, d.city].filter(Boolean).join(' · ');
	if (line) {
		x.font = `500 38px ${SANS}`;
		x.fillStyle = INK2;
		wrap(x, line, W - 200, 2).forEach((l, i) => x.fillText(l, W / 2, 880 + nameSize * 0.2 + 60 + i * 50));
	}

	// Her numbers, when Instagram is connected.
	const stats = [
		d.followers ? { v: compact(d.followers), k: 'followers' } : null,
		d.engagement ? { v: `${+d.engagement.toFixed(2)}%`, k: 'engagement' } : null,
		d.avgViews ? { v: compact(d.avgViews), k: 'avg views' } : null
	].filter(Boolean) as { v: string; k: string }[];
	if (stats.length) {
		const top = 1060, h = 160, gap = 18, w = Math.min(300, (W - 160 - gap * (stats.length - 1)) / stats.length);
		const left = (W - (w * stats.length + gap * (stats.length - 1))) / 2;
		stats.forEach((s, i) => {
			const bx = left + i * (w + gap);
			x.fillStyle = 'rgba(251,242,246,.07)';
			x.strokeStyle = 'rgba(251,242,246,.14)';
			x.lineWidth = 2;
			x.beginPath();
			x.roundRect(bx, top, w, h, 28);
			x.fill();
			x.stroke();
			x.fillStyle = INK;
			x.font = `400 76px ${SERIF}`;
			x.fillText(s.v, bx + w / 2, top + 88);
			x.fillStyle = INK3;
			x.font = `600 22px ${SANS}`;
			x.letterSpacing = '4px';
			x.fillText(s.k.toUpperCase(), bx + w / 2, top + 130);
			x.letterSpacing = '0px';
		});
	}

	// The ask, and her link on a light block with the app's offset edge.
	const askY = stats.length ? 1340 : 1180;
	x.font = `italic 400 84px ${SERIF}`;
	x.fillStyle = grad(x, W / 2 - 330, 0, W / 2 + 330, 0);
	x.fillText('Book me for collabs', W / 2, askY);
	const ly = askY + 64, lh = 120;
	const linkSize = fit(x, d.link, (px) => `600 ${px}px ${SANS}`, 52, W - 260, 30);
	const lw = Math.min(W - 140, x.measureText(d.link).width + 110);
	const lx = (W - lw) / 2;
	x.fillStyle = '#D4296A';
	x.fillRect(lx + 14, ly + 14, lw, lh);
	x.fillStyle = '#F7F4F4';
	x.fillRect(lx, ly, lw, lh);
	x.fillStyle = '#1E171C';
	x.font = `600 ${linkSize}px ${SANS}`;
	x.fillText(d.link, W / 2, ly + lh / 2 + linkSize * 0.36);
	x.font = `500 30px ${SANS}`;
	x.fillStyle = INK3;
	x.fillText('Rates, packages and requests in one place', W / 2, ly + lh + 72);

	// Foot: made with Miracle, above Instagram's reply bar.
	x.font = `italic 400 36px ${SERIF}`;
	const made = 'made with Miracle';
	const tag = '  ·  @themiracleapp';
	const mw = x.measureText(made).width;
	x.font = `500 26px ${SANS}`;
	const tw = x.measureText(tag).width;
	const fx = (W - mw - tw) / 2, fy = Math.max(ly + lh + 170, 1690);
	x.textAlign = 'left';
	x.font = `italic 400 36px ${SERIF}`;
	x.fillStyle = INK2;
	x.fillText(made, fx, fy);
	x.font = `500 26px ${SANS}`;
	x.fillStyle = INK3;
	x.fillText(tag, fx + mw, fy);
	x.textAlign = 'center';
}

export function storyCardBlob(d: StoryCardData): Promise<Blob | null> {
	const c = document.createElement('canvas');
	drawStoryCard(c, d);
	return new Promise((res) => {
		try {
			c.toBlob((b) => res(b), 'image/png');
		} catch {
			res(null);
		}
	});
}

// ═══════════════════════════════════════════════════════════════════════════
// "Creator Wrapped" 1080×1920 IG Story Card (Monthly Milestone Flex + Bio Link)
// ═══════════════════════════════════════════════════════════════════════════
export type WrappedTheme = 'aurora' | 'noir' | 'sunset';

export type WrappedCardData = {
	monthLabel: string; // e.g. "November 2026"
	name: string;
	handle: string;
	link: string; // "priya.miracleapp.live"
	photo: HTMLImageElement | null;
	initials: string;
	totalViews: number;
	collabsCount: number;
	topBrand: string;
	topViews: number;
	followerGrowth: number | null;
	earnedLabel: string | null; // null unless creator explicitly enables revenue display
	accepting: boolean;
	theme: WrappedTheme;
};

const WRAPPED_THEMES: Record<WrappedTheme, { bg: string; g1: string; g2: string; g3: string; glow1: string; glow2: string; chip: string }> = {
	aurora: {
		bg: '#110D14',
		g1: '#9C7BFF',
		g2: '#F25A90',
		g3: '#FFAE6B',
		glow1: 'rgba(156,123,255,0.34)',
		glow2: 'rgba(242,90,144,0.28)',
		chip: 'rgba(156,123,255,0.20)'
	},
	noir: {
		bg: '#0D0C10',
		g1: '#F6D88B',
		g2: '#E5A854',
		g3: '#FFF0C2',
		glow1: 'rgba(246,216,139,0.24)',
		glow2: 'rgba(229,168,84,0.18)',
		chip: 'rgba(246,216,139,0.16)'
	},
	sunset: {
		bg: '#160D12',
		g1: '#FF7A59',
		g2: '#F25A90',
		g3: '#FFD166',
		glow1: 'rgba(255,122,89,0.32)',
		glow2: 'rgba(242,90,144,0.28)',
		chip: 'rgba(255,122,89,0.20)'
	}
};

function roundRect(x: CanvasRenderingContext2D, rx: number, ry: number, rw: number, rh: number, r: number) {
	x.beginPath();
	x.moveTo(rx + r, ry);
	x.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
	x.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
	x.arcTo(rx, ry + rh, rx, ry, r);
	x.arcTo(rx, ry, rx + rw, ry, r);
	x.closePath();
}

export function drawWrappedCard(canvas: HTMLCanvasElement, d: WrappedCardData) {
	const W = STORY_W;
	const H = STORY_H;
	canvas.width = W;
	canvas.height = H;
	const x = canvas.getContext('2d')!;
	const t = WRAPPED_THEMES[d.theme] ?? WRAPPED_THEMES.aurora;
	x.textBaseline = 'alphabetic';

	// Background + atmospheric mesh glows
	x.fillStyle = t.bg;
	x.fillRect(0, 0, W, H);

	const r1 = x.createRadialGradient(W * 0.18, H * 0.16, 40, W * 0.18, H * 0.16, 620);
	r1.addColorStop(0, t.glow1);
	r1.addColorStop(1, 'transparent');
	x.fillStyle = r1;
	x.fillRect(0, 0, W, H);

	const r2 = x.createRadialGradient(W * 0.86, H * 0.72, 40, W * 0.86, H * 0.72, 640);
	r2.addColorStop(0, t.glow2);
	r2.addColorStop(1, 'transparent');
	x.fillStyle = r2;
	x.fillRect(0, 0, W, H);

	const accentGrad = x.createLinearGradient(120, 0, W - 120, 0);
	accentGrad.addColorStop(0, t.g1);
	accentGrad.addColorStop(0.52, t.g2);
	accentGrad.addColorStop(1, t.g3);

	// Top pill: Month Wrapped
	const pillText = `${d.monthLabel.toUpperCase()}  ·  CREATOR WRAPPED`;
	x.font = `700 28px ${SANS}`;
	const pw = Math.min(W - 140, x.measureText(pillText).width + 72);
	roundRect(x, (W - pw) / 2, 148, pw, 64, 32);
	x.fillStyle = t.chip;
	x.fill();
	x.strokeStyle = 'rgba(255,255,255,0.18)';
	x.lineWidth = 2;
	x.stroke();
	x.fillStyle = INK;
	x.textAlign = 'center';
	x.fillText(pillText, W / 2, 190);

	// Avatar inside gradient ring
	const cx = W / 2;
	const cy = 358;
	const ar = 96;
	x.beginPath();
	x.arc(cx, cy, ar + 10, 0, Math.PI * 2);
	x.fillStyle = accentGrad;
	x.fill();
	x.beginPath();
	x.arc(cx, cy, ar + 3, 0, Math.PI * 2);
	x.fillStyle = t.bg;
	x.fill();

	x.save();
	x.beginPath();
	x.arc(cx, cy, ar, 0, Math.PI * 2);
	x.clip();
	if (d.photo) {
		const s = Math.max((ar * 2) / d.photo.width, (ar * 2) / d.photo.height);
		const dw = d.photo.width * s;
		const dh = d.photo.height * s;
		x.drawImage(d.photo, cx - dw / 2, cy - dh / 2, dw, dh);
	} else {
		x.fillStyle = '#251D2A';
		x.fillRect(cx - ar, cy - ar, ar * 2, ar * 2);
		x.fillStyle = INK;
		x.font = `400 72px ${SERIF}`;
		x.textAlign = 'center';
		x.fillText(d.initials, cx, cy + 24);
	}
	x.restore();

	// Creator Name & Handle
	const namePx = fit(x, d.name, (px) => `italic 400 ${px}px ${SERIF}`, 92, W - 160, 52);
	x.font = `italic 400 ${namePx}px ${SERIF}`;
	x.fillStyle = INK;
	x.textAlign = 'center';
	x.fillText(d.name, W / 2, 558);

	if (d.handle) {
		x.font = `600 32px ${SANS}`;
		x.fillStyle = INK2;
		x.fillText(`@${d.handle.replace(/^@/, '')}`, W / 2, 608);
	}

	// Giant Hero Reach Number
	const heroNum = d.totalViews > 0 ? compact(d.totalViews) : `${d.collabsCount}`;
	const heroSub = d.totalViews > 0 ? 'VERIFIED COLLAB VIEWS' : `BRAND COLLAB${d.collabsCount === 1 ? '' : 'S'} LIVE`;
	x.font = `400 184px ${SERIF}`;
	x.fillStyle = accentGrad;
	x.fillText(heroNum, W / 2, 854);

	x.font = `700 30px ${SANS}`;
	x.fillStyle = INK2;
	x.fillText(heroSub, W / 2, 912);

	// 2-Column Stat Strip
	const cardY = 984;
	const cardW = 424;
	const cardH = 210;
	const gap = 36;
	const leftX = (W - (cardW * 2 + gap)) / 2;
	const rightX = leftX + cardW + gap;

	const s1Val = `${d.collabsCount}`;
	const s1Lbl = `Collab${d.collabsCount === 1 ? '' : 's'} shipped`;
	const s2Val = d.earnedLabel
		? d.earnedLabel
		: d.followerGrowth !== null
			? `${d.followerGrowth >= 0 ? '+' : ''}${compact(d.followerGrowth)}`
			: d.accepting
				? 'Open'
				: 'Booked';
	const s2Lbl = d.earnedLabel ? 'Earned this month' : d.followerGrowth !== null ? 'New followers' : 'Collab slots';

	for (const [bx, val, lbl] of [
		[leftX, s1Val, s1Lbl],
		[rightX, s2Val, s2Lbl]
	] as const) {
		roundRect(x, bx, cardY, cardW, cardH, 32);
		x.fillStyle = 'rgba(255,255,255,0.055)';
		x.fill();
		x.strokeStyle = 'rgba(255,255,255,0.14)';
		x.lineWidth = 2;
		x.stroke();
		x.textAlign = 'center';
		const vpx = fit(x, val, (px) => `italic 400 ${px}px ${SERIF}`, 76, cardW - 48, 44);
		x.font = `italic 400 ${vpx}px ${SERIF}`;
		x.fillStyle = INK;
		x.fillText(val, bx + cardW / 2, cardY + 114);
		x.font = `600 26px ${SANS}`;
		x.fillStyle = INK2;
		x.fillText(lbl, bx + cardW / 2, cardY + 166);
	}

	// Top Collab Spotlight Strip
	if (d.topBrand) {
		const spY = 1244;
		const spW = cardW * 2 + gap;
		roundRect(x, leftX, spY, spW, 152, 32);
		x.fillStyle = t.chip;
		x.fill();
		x.strokeStyle = 'rgba(255,255,255,0.18)';
		x.lineWidth = 2;
		x.stroke();
		x.textAlign = 'center';
		x.font = `700 24px ${SANS}`;
		x.fillStyle = t.g3;
		x.fillText('★  TOP COLLAB OF THE MONTH', W / 2, spY + 56);
		const topLine = d.topViews > 0 ? `${d.topBrand}  ·  ${compact(d.topViews)} views` : d.topBrand;
		const tpx = fit(x, topLine, (px) => `italic 400 ${px}px ${SERIF}`, 54, spW - 64, 34);
		x.font = `italic 400 ${tpx}px ${SERIF}`;
		x.fillStyle = INK;
		x.fillText(topLine, W / 2, spY + 118);
	}

	// Bottom CTA Pill (Bio Storefront Link)
	const ctaY = 1520;
	const ctaW = W - 160;
	roundRect(x, 80, ctaY, ctaW, 148, 36);
	x.fillStyle = 'rgba(255,255,255,0.07)';
	x.fill();
	x.strokeStyle = accentGrad;
	x.lineWidth = 3;
	x.stroke();

	x.textAlign = 'center';
	x.font = `700 26px ${SANS}`;
	x.fillStyle = d.accepting ? '#86E6A1' : INK2;
	x.fillText(d.accepting ? '●  OPEN FOR BRAND COLLABS & STOREFRONT' : 'VIEW LIVE MEDIA KIT & STOREFRONT', W / 2, ctaY + 56);

	const lpx = fit(x, d.link, (px) => `700 ${px}px ${SANS}`, 38, ctaW - 60, 24);
	x.font = `700 ${lpx}px ${SANS}`;
	x.fillStyle = INK;
	x.fillText(d.link, W / 2, ctaY + 112);

	// Footer viral attribution
	x.font = `600 26px ${SANS}`;
	x.fillStyle = INK3;
	x.fillText('Wrapped with Miracle  ·  @themiracleapp', W / 2, 1810);
}

export async function wrappedCardBlob(d: WrappedCardData): Promise<Blob | null> {
	const c = document.createElement('canvas');
	drawWrappedCard(c, d);
	return await new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}
