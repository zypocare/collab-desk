import { onNavigate } from '$app/navigation';
import { onMount } from 'svelte';

// CRED-style motion for the phone studio. A tapped wallet card grows into the collab it opens, cards tilt under the finger and spring back, sheets close with a
// swipe down, and search boxes roll through things to search for. Laptop is left as it is.
const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const onPhone = () => matchMedia('(max-width: 760px)').matches;
const IOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// What tilts when pressed.
const TILT = '.wc, .hero-card, .md-hero, .cr-it, .m-ccard, .qr-item, .ct-mini, .tk, .dk2-sc';
// What rises in as it comes on screen.
const RISE = ['.hs', '.wc', '.md-card', '.m-hero', '.md-hero', '.set-list', '.set-group', '.m-ccard', '.cr-ring', '.cr-ticker', '.qr-item', '.ct-mini', '.m-group', '.pf-tile', '.dr-sec']
	.map((s) => `main ${s}`)
	.join(', ');

type DocVT = Document & { startViewTransition?: unknown };

/** Call once from the studio layout while it sets up. */
export function lively() {
	let lastCard: HTMLElement | null = null;

	// The page slide itself is started by the root layout; this only names the tapped card so the
	// browser grows it into the collab's header on the next screen.
	onNavigate((nav) => {
		const card = lastCard;
		lastCard = null;
		if (!(document as DocVT).startViewTransition || REDUCED || IOS || !onPhone() || !nav.to) return;
		if (!card?.isConnected || !nav.to.url.pathname.startsWith('/studio/c/')) return;
		card.style.viewTransitionName = 'cr-card';
		const root = document.documentElement;
		root.classList.add('cr-grow');
		nav.complete.finally(() => setTimeout(() => root.classList.remove('cr-grow'), 700));
	});

	onMount(() => {
		if (REDUCED) return;
		// Press: the card leans toward the finger, then springs back.
		let pressed: HTMLElement | null = null;
		const down = (e: PointerEvent) => {
			if (!onPhone()) return;
			const t = e.target as Element | null;
			const el = t?.closest?.(TILT) as HTMLElement | null;
			if (!el || t?.closest('.btn, input, textarea, select, .gm')) return;
			const r = el.getBoundingClientRect();
			const k = el.matches('.wc, .cr-it, .m-ccard, .qr-item') ? 7 : 4;
			el.style.setProperty('--rx', `${(((e.clientY - r.top) / r.height) - 0.5) * -k}deg`);
			el.style.setProperty('--ry', `${(((e.clientX - r.left) / r.width) - 0.5) * k}deg`);
			el.dataset.press = '';
			pressed = el;
			if (el.matches('.wc')) lastCard = el;
		};
		const up = () => {
			if (pressed) delete pressed.dataset.press;
			pressed = null;
		};
		addEventListener('pointerdown', down, { passive: true });
		for (const ev of ['pointerup', 'pointercancel', 'blur'] as const) addEventListener(ev, up, { passive: true });

		// Sheets: drag the top of a sheet down to close it (sheets close on Escape).
		let sheet: HTMLElement | null = null;
		let y0 = 0;
		let dy = 0;
		const tStart = (e: TouchEvent) => {
			if (!onPhone() || e.touches.length !== 1) return;
			const s = (e.target as Element | null)?.closest?.('.dialog-scrim > .dialog') as HTMLElement | null;
			if (!s || s.scrollTop > 0) return;
			const top = s.getBoundingClientRect().top;
			if (e.touches[0].clientY - top > 64) return;
			sheet = s;
			y0 = e.touches[0].clientY;
			dy = 0;
		};
		const tMove = (e: TouchEvent) => {
			if (!sheet) return;
			dy = Math.max(0, e.touches[0].clientY - y0);
			if (dy > 0) e.preventDefault();
			sheet.style.transition = 'none';
			sheet.style.transform = `translateY(${dy}px)`;
		};
		const tEnd = () => {
			const s = sheet;
			sheet = null;
			if (!s) return;
			s.style.transition = 'transform .45s cubic-bezier(.2,1.3,.35,1)';
			if (dy > 110) {
				s.style.transition = 'transform .2s ease-in';
				s.style.transform = 'translateY(100%)';
				setTimeout(() => {
					dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
					// Still open (this sheet doesn't close on Escape): bring it back.
					setTimeout(() => s.isConnected && ((s.style.transition = 'transform .45s cubic-bezier(.2,1.3,.35,1)'), (s.style.transform = '')), 60);
				}, 190);
			} else s.style.transform = '';
		};
		addEventListener('touchstart', tStart, { passive: true });
		addEventListener('touchmove', tMove, { passive: false });
		addEventListener('touchend', tEnd, { passive: true });
		addEventListener('touchcancel', tEnd, { passive: true });

		// Arrivals: sections and cards rise in, a few at a time, as they come on screen.
		const io = typeof IntersectionObserver !== 'undefined'
			? new IntersectionObserver((entries) => {
					const come = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
					come.forEach((e, n) => {
						const el = e.target as HTMLElement;
						io!.unobserve(el);
						el.style.setProperty('--rvd', `${Math.min(n, 6) * 55}ms`);
						el.dataset.rv = 'in';
						setTimeout(() => {
							delete el.dataset.rv;
							el.style.removeProperty('--rvd');
						}, 1200 + Math.min(n, 6) * 55);
					});
				}, { rootMargin: '0px 0px -6% 0px' })
			: null;
		const seen = new WeakSet<Element>();
		let queued = 0;
		const scan = () => {
			queued = 0;
			if (!io || !onPhone() || document.documentElement.dataset.side !== 'studio') return;
			for (const el of document.querySelectorAll<HTMLElement>(RISE)) {
				if (seen.has(el)) continue;
				seen.add(el);
				el.dataset.rv = '';
				io.observe(el);
			}
		};
		const mo = new MutationObserver(() => (queued ||= requestAnimationFrame(scan)));
		mo.observe(document.body, { childList: true, subtree: true });
		scan();
		return () => {
			mo.disconnect();
			io?.disconnect();
			cancelAnimationFrame(queued);
			removeEventListener('pointerdown', down);
			for (const ev of ['pointerup', 'pointercancel', 'blur'] as const) removeEventListener(ev, up);
			removeEventListener('touchstart', tStart);
			removeEventListener('touchmove', tMove);
			removeEventListener('touchend', tEnd);
			removeEventListener('touchcancel', tEnd);
		};
	});
}

/** A search box on a phone that rolls through things to search for: search "Glowberry". */
export function rollHints(label: HTMLElement, list: string[]) {
	const input = label.querySelector('input');
	if (!input || !onPhone() || typeof document === 'undefined') return { update() {}, destroy() {} };
	const placeholder = input.placeholder;
	if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', placeholder);
	input.placeholder = '';
	const box = document.createElement('span');
	box.className = 'sh-hint';
	box.setAttribute('aria-hidden', 'true');
	const lead = document.createElement('span');
	lead.textContent = 'search ';
	const roll = document.createElement('span');
	roll.className = 'sh-roll';
	box.append(lead, roll);
	label.append(box);
	let items = list.filter(Boolean);
	let k = 0;
	const place = () => (box.style.left = `${input.offsetLeft}px`);
	const show = () => (box.hidden = !!input.value);
	const put = (text: string, first = false) => {
		const old = roll.lastElementChild;
		const i = document.createElement('i');
		i.textContent = `“${text}”`;
		if (first || REDUCED) i.style.animation = 'none';
		roll.append(i);
		if (old) {
			old.classList.add('out');
			setTimeout(() => old.remove(), 400);
		}
	};
	place();
	show();
	put(items[0] ?? placeholder.replace(/^Search\s*/i, '') ?? '', true);
	input.addEventListener('input', show);
	const timer = setInterval(() => {
		show();
		if (document.hidden || input.value || items.length < 2) return;
		k = (k + 1) % items.length;
		put(items[k]);
	}, 2600);
	addEventListener('resize', place);
	return {
		update(next: string[]) {
			items = next.filter(Boolean);
		},
		destroy() {
			clearInterval(timer);
			removeEventListener('resize', place);
			input.removeEventListener('input', show);
			input.placeholder = placeholder;
			box.remove();
		}
	};
}
