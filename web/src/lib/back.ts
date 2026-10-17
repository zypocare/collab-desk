// Going back on phones, made dependable on iPhone.
// - history.back() does nothing when there's nothing behind (an app opened from the Home Screen or
//   a notification), so if the page hasn't changed shortly after, go to the screen above instead.
// - Home Screen apps on iPhone have no swipe-back gesture: a swipe in from the left edge goes back.
import { goto } from '$app/navigation';

/** iPhone / iPad (every browser there is Safari underneath). Page transitions misbehave there. */
export const isIOS = () =>
	typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Back to the previous screen in the app, or to `fallback` when there isn't one. */
export function goBackOr(fallback: string, canGoBack: boolean) {
	if (!canGoBack || history.length <= 1) return goto(fallback || '/');
	const before = location.href;
	history.back();
	setTimeout(() => {
		if (location.href === before && fallback) goto(fallback);
	}, 400);
}

/** A swipe in from the left edge calls `back` (Home Screen app only; the browser has its own). */
export function edgeSwipeBack(back: () => void, enabled: () => boolean) {
	const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
	if (!standalone) return () => {};
	let x0 = -1, y0 = 0, t0 = 0;
	const start = (e: TouchEvent) => {
		const t = e.touches[0];
		x0 = e.touches.length === 1 && t.clientX < 24 ? t.clientX : -1;
		y0 = t.clientY;
		t0 = Date.now();
	};
	const end = (e: TouchEvent) => {
		if (x0 < 0) return;
		const t = e.changedTouches[0];
		const dx = t.clientX - x0, dy = Math.abs(t.clientY - y0);
		x0 = -1;
		// A clear, quick sideways swipe, with no sheet or dialog open.
		if (dx > 70 && dy < 60 && Date.now() - t0 < 700 && enabled() && !document.querySelector('.dialog-scrim, .sheet-scrim, [aria-modal="true"]')) back();
	};
	document.addEventListener('touchstart', start, { passive: true });
	document.addEventListener('touchend', end, { passive: true });
	return () => {
		document.removeEventListener('touchstart', start);
		document.removeEventListener('touchend', end);
	};
}
