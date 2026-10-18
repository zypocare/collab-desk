// Branded QR codes: her colours, rounded dots, her photo (or initials) in the middle and a line
// of text under the code. Drawn on a canvas for the screen and PNG downloads, and as SVG for print.
import qrcode from 'qrcode-generator';

export type QrLook = {
	style: 'dots' | 'soft' | 'classic';
	color: 'brand' | 'plum' | 'cerise' | 'ink';
	middle: 'photo' | 'icon' | 'none';
	caption: string;
};
export const DEFAULT_LOOK: QrLook = { style: 'dots', color: 'brand', middle: 'photo', caption: 'Scan to work with me' };

export const QR_COLORS: Record<QrLook['color'], { label: string; stops: [string, string, string] }> = {
	brand: { label: 'Gradient', stops: ['#6B3FD4', '#D4296A', '#F2994A'] },
	plum: { label: 'Plum', stops: ['#6B3FD4', '#6B3FD4', '#4E2AA8'] },
	cerise: { label: 'Cerise', stops: ['#D4296A', '#D4296A', '#A81E52'] },
	ink: { label: 'Ink', stops: ['#1D1626', '#1D1626', '#3A2D48'] }
};

export function look(v: unknown): QrLook {
	const o = (v && typeof v === 'object' ? v : {}) as Partial<QrLook>;
	return {
		style: o.style === 'soft' || o.style === 'classic' ? o.style : 'dots',
		color: o.color && o.color in QR_COLORS ? o.color : 'brand',
		middle: o.middle === 'icon' || o.middle === 'none' ? o.middle : 'photo',
		caption: typeof o.caption === 'string' ? o.caption.slice(0, 34) : DEFAULT_LOOK.caption
	};
}

type Mods = { n: number; dark: (r: number, c: number) => boolean };
function modules(text: string): Mods {
	// Strongest error correction, so the picture in the middle never stops it scanning.
	const q = qrcode(0, 'H');
	q.addData(text);
	q.make();
	return { n: q.getModuleCount(), dark: (r, c) => q.isDark(r, c) };
}
const isFinder = (n: number, r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
const holeOf = (n: number, l: QrLook) => {
	const size = l.middle === 'none' ? 0 : Math.ceil(n * 0.24);
	const a = Math.floor((n - size) / 2);
	return { size, a, b: a + size };
};

/** Width and height of the drawing for a given width (room for the caption under the code). */
export const qrHeight = (w: number, l: QrLook) => Math.round(w * (l.caption.trim() ? 1.2 : 1.06));

export type QrExtras = { handle: string; initials: string; photo?: CanvasImageSource | null };

function rr(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number) {
	x.beginPath();
	x.moveTo(X + r, Y);
	x.arcTo(X + w, Y, X + w, Y + h, r);
	x.arcTo(X + w, Y + h, X, Y + h, r);
	x.arcTo(X, Y + h, X, Y, r);
	x.arcTo(X, Y, X + w, Y, r);
	x.closePath();
}

export function drawQr(canvas: HTMLCanvasElement, text: string, l: QrLook, e: QrExtras, width = 880) {
	const { n, dark } = modules(text);
	const W = width, H = qrHeight(W, l);
	canvas.width = W;
	canvas.height = H;
	const x = canvas.getContext('2d')!;
	const pad = W * 0.08, size = W - pad * 2, m = size / n;
	const [c0, c1, c2] = QR_COLORS[l.color].stops;
	x.clearRect(0, 0, W, H);
	rr(x, 0, 0, W, H, W * 0.07);
	x.fillStyle = '#ffffff';
	x.fill();
	const g = x.createLinearGradient(pad, pad, pad + size, pad + size);
	g.addColorStop(0, c0);
	g.addColorStop(0.6, c1);
	g.addColorStop(1, c2);
	x.fillStyle = g;
	const h = holeOf(n, l);
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (!dark(r, c) || isFinder(n, r, c)) continue;
			if (h.size && r >= h.a && r < h.b && c >= h.a && c < h.b) continue;
			const X = pad + c * m, Y = pad + r * m;
			if (l.style === 'dots') {
				x.beginPath();
				x.arc(X + m / 2, Y + m / 2, m * 0.42, 0, Math.PI * 2);
				x.fill();
			} else if (l.style === 'soft') {
				rr(x, X + m * 0.06, Y + m * 0.06, m * 0.88, m * 0.88, m * 0.3);
				x.fill();
			} else x.fillRect(X, Y, m + 0.5, m + 0.5);
		}
	const round = l.style !== 'classic';
	for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
		const X = pad + c * m, Y = pad + r * m;
		rr(x, X, Y, 7 * m, 7 * m, round ? m * 2.2 : 0.01);
		x.fill();
		rr(x, X + m, Y + m, 5 * m, 5 * m, round ? m * 1.5 : 0.01);
		x.fillStyle = '#ffffff';
		x.fill();
		x.fillStyle = g;
		rr(x, X + 2 * m, Y + 2 * m, 3 * m, 3 * m, round ? m : 0.01);
		x.fill();
	}
	if (h.size) {
		const cx = pad + size / 2, cy = pad + size / 2, rad = (h.size * m) / 2 - m * 0.4;
		x.beginPath();
		x.arc(cx, cy, rad + m * 0.35, 0, Math.PI * 2);
		x.fillStyle = '#ffffff';
		x.fill();
		if (l.middle === 'photo' && e.photo) {
			x.save();
			x.beginPath();
			x.arc(cx, cy, rad, 0, Math.PI * 2);
			x.clip();
			x.drawImage(e.photo, cx - rad, cy - rad, rad * 2, rad * 2);
			x.restore();
		} else if (l.middle === 'photo') {
			const pg = x.createRadialGradient(cx - rad * 0.3, cy - rad * 0.4, rad * 0.1, cx, cy, rad);
			pg.addColorStop(0, '#F2994A');
			pg.addColorStop(0.55, '#D4296A');
			pg.addColorStop(1, '#6B3FD4');
			x.beginPath();
			x.arc(cx, cy, rad, 0, Math.PI * 2);
			x.fillStyle = pg;
			x.fill();
			x.fillStyle = '#ffffff';
			x.font = `italic ${Math.round(rad * (e.initials.length > 1 ? 0.85 : 1.1))}px "Instrument Serif", Georgia, serif`;
			x.textAlign = 'center';
			x.textBaseline = 'middle';
			x.fillText(e.initials, cx, cy + rad * 0.06);
		} else {
			rr(x, cx - rad, cy - rad, rad * 2, rad * 2, rad * 0.45);
			x.fillStyle = g;
			x.fill();
			x.strokeStyle = '#ffffff';
			x.lineWidth = rad * 0.14;
			x.beginPath();
			x.arc(cx, cy, rad * 0.55, 0, Math.PI * 2);
			x.stroke();
			x.beginPath();
			x.arc(cx, cy, rad * 0.22, 0, Math.PI * 2);
			x.stroke();
		}
	}
	const cap = l.caption.trim();
	x.textAlign = 'center';
	x.textBaseline = 'alphabetic';
	if (cap) {
		x.fillStyle = l.color === 'ink' ? c0 : g;
		x.font = `600 ${Math.round(W * 0.052)}px Geist, system-ui, sans-serif`;
		x.fillText(cap, W / 2, pad + size + W * 0.093);
	}
	if (e.handle) {
		x.fillStyle = '#7B7189';
		x.font = `500 ${Math.round(W * 0.032)}px "Geist Mono", ui-monospace, monospace`;
		x.fillText(`@${e.handle}`, W / 2, pad + size + (cap ? W * 0.148 : W * 0.05));
	}
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** The same design as SVG (for printing at any size). The middle uses her initials. */
export function qrSvg(text: string, l: QrLook, e: QrExtras) {
	const { n, dark } = modules(text);
	const W = 1000, H = qrHeight(W, l), pad = W * 0.08, size = W - pad * 2, m = size / n;
	const [c0, c1, c2] = QR_COLORS[l.color].stops;
	const h = holeOf(n, l);
	const f = (v: number) => +v.toFixed(2);
	let dots = '';
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (!dark(r, c) || isFinder(n, r, c)) continue;
			if (h.size && r >= h.a && r < h.b && c >= h.a && c < h.b) continue;
			const X = pad + c * m, Y = pad + r * m;
			if (l.style === 'dots') dots += `<circle cx="${f(X + m / 2)}" cy="${f(Y + m / 2)}" r="${f(m * 0.42)}"/>`;
			else if (l.style === 'soft') dots += `<rect x="${f(X + m * 0.06)}" y="${f(Y + m * 0.06)}" width="${f(m * 0.88)}" height="${f(m * 0.88)}" rx="${f(m * 0.3)}"/>`;
			else dots += `<rect x="${f(X)}" y="${f(Y)}" width="${f(m + 0.3)}" height="${f(m + 0.3)}"/>`;
		}
	const round = l.style !== 'classic';
	let eyes = '';
	for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
		const X = pad + c * m, Y = pad + r * m;
		eyes += `<rect x="${f(X)}" y="${f(Y)}" width="${f(7 * m)}" height="${f(7 * m)}" rx="${round ? f(m * 2.2) : 0}"/>`;
		eyes += `<rect x="${f(X + m)}" y="${f(Y + m)}" width="${f(5 * m)}" height="${f(5 * m)}" rx="${round ? f(m * 1.5) : 0}" fill="#fff"/>`;
		eyes += `<rect x="${f(X + 2 * m)}" y="${f(Y + 2 * m)}" width="${f(3 * m)}" height="${f(3 * m)}" rx="${round ? f(m) : 0}"/>`;
	}
	let mid = '';
	if (h.size) {
		const cx = pad + size / 2, cy = pad + size / 2, rad = (h.size * m) / 2 - m * 0.4;
		mid += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad + m * 0.35)}" fill="#fff"/>`;
		if (l.middle === 'photo')
			mid += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}" fill="url(#p)"/><text x="${f(cx)}" y="${f(cy + rad * 0.36)}" text-anchor="middle" font-family="Instrument Serif, Georgia, serif" font-style="italic" font-size="${f(rad * (e.initials.length > 1 ? 0.85 : 1.1))}" fill="#fff">${esc(e.initials)}</text>`;
		else
			mid += `<rect x="${f(cx - rad)}" y="${f(cy - rad)}" width="${f(rad * 2)}" height="${f(rad * 2)}" rx="${f(rad * 0.45)}" fill="url(#g)"/><g fill="none" stroke="#fff" stroke-width="${f(rad * 0.14)}"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad * 0.55)}"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad * 0.22)}"/></g>`;
	}
	const cap = l.caption.trim();
	const capY = pad + size + W * 0.093, handleY = pad + size + (cap ? W * 0.148 : W * 0.05);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c0}"/><stop offset=".6" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<radialGradient id="p" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#F2994A"/><stop offset=".55" stop-color="#D4296A"/><stop offset="1" stop-color="#6B3FD4"/></radialGradient></defs>
<rect width="${W}" height="${H}" rx="${W * 0.07}" fill="#fff"/>
<g fill="url(#g)">${dots}${eyes}</g>${mid}
${cap ? `<text x="${W / 2}" y="${f(capY)}" text-anchor="middle" font-family="Geist, system-ui, sans-serif" font-weight="600" font-size="${Math.round(W * 0.052)}" fill="${l.color === 'ink' ? c0 : 'url(#g)'}">${esc(cap)}</text>` : ''}
${e.handle ? `<text x="${W / 2}" y="${f(handleY)}" text-anchor="middle" font-family="Geist Mono, ui-monospace, monospace" font-weight="500" font-size="${Math.round(W * 0.032)}" fill="#7B7189">@${esc(e.handle)}</text>` : ''}
</svg>`;
}

/** Her Instagram photo, if the picture allows being drawn into a downloadable image. */
export function loadPhoto(url: string | null | undefined): Promise<HTMLImageElement | null> {
	if (!url) return Promise.resolve(null);
	return new Promise((res) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.referrerPolicy = 'no-referrer';
		img.onload = () => {
			try {
				const c = document.createElement('canvas');
				c.width = c.height = 4;
				const x = c.getContext('2d')!;
				x.drawImage(img, 0, 0, 4, 4);
				x.getImageData(0, 0, 1, 1);
				res(img);
			} catch {
				res(null);
			}
		};
		img.onerror = () => res(null);
		img.src = url;
	});
}
