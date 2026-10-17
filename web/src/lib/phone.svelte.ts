// The Studio on a phone behaves like an installed app: an app bar that shows the title once the
// big one scrolls away, sheets that slide down to close, and pull down to refresh.
export const PHONE_Q = '(max-width: 760px)';

export const phone = $state({ on: false, scrolled: false, titled: false });

/** Starts the phone behaviours for the Studio. Returns a clean-up function. */
export function startPhone(refresh: () => Promise<unknown>) {
	const mq = matchMedia(PHONE_Q);
	const onMq = () => (phone.on = mq.matches);
	onMq();
	mq.addEventListener('change', onMq);

	const onScroll = () => {
		phone.scrolled = scrollY > 4;
		phone.titled = scrollY > 64;
	};
	onScroll();
	addEventListener('scroll', onScroll, { passive: true });

	const offSheet = sheetSwipe();
	const offPull = pullToRefresh(refresh);
	return () => {
		mq.removeEventListener('change', onMq);
		removeEventListener('scroll', onScroll);
		offSheet();
		offPull();
	};
}

const isField = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('input,textarea,select,[contenteditable],.sel-content');

/** Bottom sheets: drag down from the top of the sheet (or anywhere while it's scrolled to the top) to close. */
function sheetSwipe() {
	let el: HTMLElement | null = null;
	let y0 = 0;
	let dy = 0;
	let t0 = 0;
	const start = (e: TouchEvent) => {
		if (!phone.on || isField(e.target)) return;
		const d = (e.target as Element).closest?.('.dialog') as HTMLElement | null;
		if (!d || d.closest('.cmdk-scrim')) return;
		const y = e.touches[0].clientY;
		if (d.scrollTop > 0 && y - d.getBoundingClientRect().top > 56) return;
		el = d;
		y0 = y;
		dy = 0;
		t0 = Date.now();
	};
	const move = (e: TouchEvent) => {
		if (!el) return;
		dy = Math.max(0, e.touches[0].clientY - y0);
		el.style.transition = 'none';
		el.style.transform = dy ? `translateY(${dy}px)` : '';
	};
	const end = () => {
		if (!el) return;
		const d = el;
		el = null;
		d.style.transition = 'transform .3s cubic-bezier(.2,.8,.2,1)';
		if (dy > 130 || (dy > 50 && Date.now() - t0 < 260)) {
			d.style.transform = 'translateY(105%)';
			setTimeout(() => {
				d.parentElement?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				// Still open (a sheet that can't be dismissed): bring it back.
				setTimeout(() => d.isConnected && (d.style.transform = ''), 120);
			}, 220);
		} else d.style.transform = '';
	};
	addEventListener('touchstart', start, { passive: true });
	addEventListener('touchmove', move, { passive: true });
	addEventListener('touchend', end);
	addEventListener('touchcancel', end);
	return () => {
		removeEventListener('touchstart', start);
		removeEventListener('touchmove', move);
		removeEventListener('touchend', end);
		removeEventListener('touchcancel', end);
	};
}

/** Pull down at the top of a screen to fetch the latest. */
function pullToRefresh(refresh: () => Promise<unknown>) {
	const ind = document.createElement('div');
	ind.className = 'ptr';
	ind.setAttribute('aria-hidden', 'true');
	ind.innerHTML = '<span></span>';
	document.body.appendChild(ind);
	const MAX = 84;
	let y0 = -1;
	let dy = 0;
	let busy = false;
	const set = (p: number) => {
		ind.style.setProperty('--p', String(p));
		ind.classList.toggle('on', p > 0);
	};
	const start = (e: TouchEvent) => {
		if (!phone.on || busy || scrollY > 0 || isField(e.target)) return;
		if ((e.target as Element).closest?.('.dialog-scrim,.m-stages,.cx-nav,.board,.sh')) return;
		y0 = e.touches[0].clientY;
		dy = 0;
	};
	const move = (e: TouchEvent) => {
		if (y0 < 0) return;
		dy = e.touches[0].clientY - y0;
		if (dy <= 0 || scrollY > 0) return set(0);
		set(Math.min(1, dy / MAX));
	};
	const end = async () => {
		if (y0 < 0) return;
		y0 = -1;
		if (dy < MAX) return set(0);
		busy = true;
		ind.classList.add('spin');
		navigator.vibrate?.(8);
		try {
			await Promise.all([refresh(), new Promise((r) => setTimeout(r, 600))]);
		} finally {
			busy = false;
			ind.classList.remove('spin');
			set(0);
		}
	};
	addEventListener('touchstart', start, { passive: true });
	addEventListener('touchmove', move, { passive: true });
	addEventListener('touchend', end);
	addEventListener('touchcancel', end);
	return () => {
		ind.remove();
		removeEventListener('touchstart', start);
		removeEventListener('touchmove', move);
		removeEventListener('touchend', end);
		removeEventListener('touchcancel', end);
	};
}

/** How deep a Studio address is: 1 for the tab screens, more for screens opened from them. */
export function depth(u: URL) {
	const p = u.pathname;
	if (/^\/studio\/inbox\/./.test(p)) return 3;
	if (p === '/studio/settings') return u.searchParams.get('s') ? 3 : 2;
	if (/^\/studio\/(c|import|instagram|share|inbox)(\/|$)/.test(p) || /^\/studio\/brands\/./.test(p)) return 2;
	return 1;
}
