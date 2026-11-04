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
