// Shared UI state and small motion helpers: toasts, confetti, theme, count-up numbers.
import { inr } from './util';

export const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Toast = { id: number; msg: string; icon: string; out: boolean };
/** holdRedirect: a guest's sign-in code is being checked; don't move them off the request form yet. */
export const ui = $state<{ toasts: Toast[]; openCollab: string | null; newCollab: boolean; pendingNext: string | null; pasteText: string; /** A screenshot shared into the app (Android Share). */ pasteImage?: File | null; fromIg: string; holdRedirect?: boolean; /** The Instagram account it came from (username, name). */ fromIgUser?: string; fromIgName?: string; /** "Ask your desk" is open. */ askOpen?: boolean; /** The money-in moment (phone). */ moneyIn?: { amount: number; brand: string } | null }>({
	toasts: [],
	openCollab: null,
	newCollab: false,
	/** A next-step action to run as soon as the collab panel opens (from a card's button). */
	pendingNext: null,
	/** Text shared into the app (Android share sheet), for Add collab to read. */
	pasteText: '',
	/** The Instagram chat (igsid) that Add collab was opened from, so the chat links to the new collab. */
	fromIg: ''
});

let toastId = 0;
export function toast(msg: string, icon = 'check') {
	const t: Toast = { id: ++toastId, msg, icon, out: false };
	ui.toasts.push(t);
	setTimeout(() => {
		const x = ui.toasts.find((y) => y.id === t.id);
		if (x) x.out = true;
		setTimeout(() => (ui.toasts = ui.toasts.filter((y) => y.id !== t.id)), 320);
	}, 3200);
}

export const pointer = { x: 0, y: 0 };
if (typeof window !== 'undefined') {
	pointer.x = innerWidth / 2;
	pointer.y = innerHeight / 3;
	document.addEventListener('pointerdown', (e) => ((pointer.x = e.clientX), (pointer.y = e.clientY)), { passive: true });
	// Spotlight that follows the cursor on .glow surfaces.
	document.addEventListener(
		'pointermove',
		(e) => {
			const g = (e.target as Element | null)?.closest?.('.glow') as HTMLElement | null;
			if (!g) return;
			const r = g.getBoundingClientRect();
			g.style.setProperty('--mx', e.clientX - r.left + 'px');
			g.style.setProperty('--my', e.clientY - r.top + 'px');
		},
		{ passive: true }
	);
}

export function confetti(x = pointer.x, y = pointer.y) {
	if (REDUCED || typeof document === 'undefined') return;
	let cv = document.getElementById('confetti') as HTMLCanvasElement | null;
	if (!cv) return;
	const ctx = cv.getContext('2d')!;
	const dpr = devicePixelRatio || 1, W = innerWidth, H = innerHeight;
	cv.width = W * dpr;
	cv.height = H * dpr;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	const cs = getComputedStyle(document.documentElement);
	const cols = ['--g1', '--g2', '--g3', '--h-live', '--h-nego', '--accent'].map((v) => cs.getPropertyValue(v).trim());
	const ps = Array.from({ length: 150 }, () => {
		const a = Math.random() * Math.PI * 2, sp = Math.random() * 11 + 4;
		return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 7, s: Math.random() * 7 + 4, r: Math.random() * 6.28,
			vr: (Math.random() - 0.5) * 0.35, c: cols[(Math.random() * cols.length) | 0], round: Math.random() < 0.3, wob: Math.random() * 10 };
	});
	const t0 = performance.now();
	const step = (t: number) => {
		ctx.clearRect(0, 0, W, H);
		const a = Math.max(0, 1 - (t - t0) / 2400);
		let alive = 0;
		for (const p of ps) {
			p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985;
			p.x += p.vx + Math.sin(t / 120 + p.wob) * 0.6; p.y += p.vy; p.r += p.vr;
			if (p.y > H + 30 || a <= 0) continue;
			alive++;
			ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
			if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2.5, 0, 6.29); ctx.fill(); } else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2.2);
			ctx.restore();
		}
		if (alive) requestAnimationFrame(step);
		else ctx.clearRect(0, 0, W, H);
	};
	requestAnimationFrame(step);
}

// ---- theme ----
const TKEY = 'cd.theme';
export const theme = $state<{ value: 'light' | 'dark' }>({ value: 'light' });
export function initTheme() {
	let saved: string | null = null;
	try { saved = localStorage.getItem(TKEY); } catch { /* storage blocked */ }
	if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
	theme.value = (document.documentElement.dataset.theme as 'light' | 'dark') ||
		(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
export function toggleTheme() {
	const next = theme.value === 'dark' ? 'light' : 'dark';
	const apply = () => {
		document.documentElement.dataset.theme = next;
		theme.value = next;
		try { localStorage.setItem(TKEY, next); } catch { /* storage blocked */ }
	};
	const d = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
	const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	if (!d.startViewTransition || REDUCED || ios) return apply();
	const { x, y } = pointer;
	const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
	document.documentElement.classList.add('vt-theme');
	const vt = d.startViewTransition(apply);
	vt.ready
		.then(() =>
			document.documentElement.animate(
				{ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
				{ duration: 700, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' }
			)
		)
		.catch(() => {});
	vt.finished.finally(() => document.documentElement.classList.remove('vt-theme'));
}

// ---- actions ----
type CountOpts = { value: number; money?: boolean; suffix?: string; decimals?: number };
export function countUp(node: HTMLElement, opts: CountOpts) {
	let current = 0;
	let raf = 0;
	const out = (v: number, o: CountOpts) =>
		o.money ? inr(v) : (o.decimals ? v.toFixed(o.decimals) : Math.round(v).toLocaleString('en-IN')) + (o.suffix ?? '');
	function run(o: CountOpts) {
		cancelAnimationFrame(raf);
		const from = current, to = Number(o.value) || 0;
		if (REDUCED || from === to) { current = to; node.textContent = out(to, o); return; }
		const t0 = performance.now() + (from === 0 ? 150 : 0), dur = from === 0 ? 1300 : 700;
		const tick = (t: number) => {
			const k = Math.max(0, Math.min(1, (t - t0) / dur));
			const e = k === 1 ? 1 : 1 - Math.pow(2, -10 * k);
			current = from + (to - from) * e;
			node.textContent = out(current, o);
			if (k < 1) raf = requestAnimationFrame(tick);
			else current = to;
		};
		raf = requestAnimationFrame(tick);
	}
	run(opts);
	return { update: run, destroy: () => cancelAnimationFrame(raf) };
}

export function parseStat(s: string): CountOpts & { prefix: string } | null {
	const m = String(s ?? '').match(/^([^\d]*)([\d.]+)(.*)$/);
	if (!m) return null;
	return { prefix: m[1], value: Number(m[2]), decimals: (m[2].split('.')[1] || '').length, suffix: m[3] };
}

export async function copyText(text: string, msg = 'Copied') {
	try {
		await navigator.clipboard.writeText(text);
		toast(msg);
	} catch {
		toast(`Copy this: ${text}`, 'copy');
	}
}

/** CRED's money-in moment on the phone: a coin flip and a buzz. False on a laptop (it shows confetti). */
export function moneyIn(amount: number, brand: string) {
	if (typeof window === 'undefined' || !matchMedia('(max-width: 760px)').matches || !(amount > 0)) return false;
	ui.moneyIn = { amount, brand };
	try {
		navigator.vibrate?.([30, 40, 60]);
	} catch {
		/* no vibration here */
	}
	return true;
}
