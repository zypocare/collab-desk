// How the phone app feels in the hand, CRED-style: a light tick under the finger on every tap, and a
// success buzz when money or a yes comes in (confetti() in ui.svelte.ts buzzes too). In the
// phone app the tick comes from the Haptics plugin (Android and iPhone); in a phone browser from
// navigator.vibrate where it exists. Laptops get none of it, and Settings › This device turns it off.

type Haptics = {
	impact?: (o: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }) => Promise<void>;
	notification?: (o: { type: 'SUCCESS' | 'WARNING' | 'ERROR' }) => Promise<void>;
	selectionChanged?: () => Promise<void>;
};
const haptics = (): Haptics | undefined =>
	typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: { Plugins?: { Haptics?: Haptics } } }).Capacitor?.Plugins?.Haptics;
const touch = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: none) and (pointer: coarse)').matches;
const KEY = 'mc-feel';

/** Vibration on taps is on (the default on phones) or switched off for this device. */
export const feelOn = () => {
	try {
		return localStorage.getItem(KEY) !== 'off';
	} catch {
		return true;
	}
};
export function setFeel(on: boolean) {
	try {
		if (on) localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, 'off');
	} catch {
		/* storage blocked */
	}
	if (on) haptic('success');
}

export type Feel = 'tap' | 'soft' | 'select' | 'success' | 'warn';
const VIBE: Record<Feel, number | number[]> = { tap: 6, soft: 4, select: 5, success: [12, 60, 22], warn: [20, 50, 20] };
let last = 0;
let lastNews = 0;

/** A tick, a buzz or a double-tap from the phone. */
export function haptic(kind: Feel = 'tap') {
	if (!touch() || !feelOn()) return;
	// Never a rattle: at most one every 40 ms.
	const now = Date.now();
	if (now - last < 40 && (kind === 'tap' || kind === 'soft' || kind === 'select')) return;
	// One buzz per piece of good news, even when the toast and the confetti both ask.
	if ((kind === 'success' || kind === 'warn') && now - lastNews < 700) return;
	if (kind === 'success' || kind === 'warn') lastNews = now;
	last = now;
	const h = haptics();
	try {
		if (h?.impact && (kind === 'tap' || kind === 'soft')) return void h.impact({ style: 'LIGHT' }).catch(() => {});
		if (h?.selectionChanged && kind === 'select') return void h.selectionChanged().catch(() => {});
		if (h?.notification && (kind === 'success' || kind === 'warn')) return void h.notification({ type: kind === 'success' ? 'SUCCESS' : 'WARNING' }).catch(() => {});
		navigator.vibrate?.(VIBE[kind]);
	} catch {
		/* no vibration here */
	}
}

// Good news worth a buzz: money in, a yes from a brand, things saved in bulk.
const GOOD = /\b(marked (as )?paid|marked received|accepted|imported|came in|payment received|booked|signed|is live|you're live|approved)\b/i;
const NOT = /couldn|can't|cannot|first|failed|no unpaid|isn't|not yet/i;

/** Called for every toast: good news buzzes, problems buzz twice, the rest stays quiet. */
export function feelToast(msg: string, icon: string) {
	if (icon === 'alert') haptic('warn');
	else if (GOOD.test(msg) && !NOT.test(msg)) haptic('success');
}

// What counts as a tap worth a tick: buttons, links that look like buttons, tabs, rows, switches.
const TAPPABLE = 'button, .btn, [role="tab"], [role="button"], [role="switch"], .cs-row, .m-seg a, .subtabs a, .rail a, .tk, .chip, .pill, input[type="checkbox"], input[type="radio"], summary, .wc, .cr-it, .m-ccard';

/** Starts the tap ticks for the whole app (call once). */
export function startFeel() {
	if (typeof document === 'undefined') return () => {};
	const onClick = (e: MouseEvent) => {
		const t = e.target as Element | null;
		const el = t?.closest?.(TAPPABLE);
		if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
		haptic(el.matches('[role="tab"], .m-seg a, .subtabs a, .rail a, input[type="checkbox"], input[type="radio"], [role="switch"]') ? 'select' : 'tap');
	};
	document.addEventListener('click', onClick, { capture: true, passive: true });
	return () => document.removeEventListener('click', onClick, { capture: true });
}
