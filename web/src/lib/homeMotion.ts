import { inr } from './util';
import { COLLAB_DIALOG_CHANGE, collabDialogOpen } from './collabDialog';

/** Run work only while its element is visible and the user permits motion. */
export function whileVisible(node: Element, change: (active: boolean, reduced: boolean) => void) {
	const preference = matchMedia('(prefers-reduced-motion: reduce)');
	let visible = false;
	const sync = () => change(visible && !document.hidden && !preference.matches && !collabDialogOpen(), preference.matches);
	const observer = new IntersectionObserver(([entry]) => {
		visible = entry.isIntersecting;
		sync();
	});
	observer.observe(node);
	preference.addEventListener('change', sync);
	document.addEventListener('visibilitychange', sync);
	document.addEventListener(COLLAB_DIALOG_CHANGE, sync);
	sync();
	return () => {
		observer.disconnect();
		preference.removeEventListener('change', sync);
		document.removeEventListener('visibilitychange', sync);
		document.removeEventListener(COLLAB_DIALOG_CHANGE, sync);
	};
}

/** One observer for the home page's ambient motion and card arrivals. */
export function homeMotion(root: HTMLElement) {
	const preference = matchMedia('(prefers-reduced-motion: reduce)');
	const selector = '.ht, .tix-t, .cr-ticker, .m-hero, .tk, .dk2, .wk2';
	const seen = new WeakSet<Element>();
	const arrived = new WeakSet<Element>();
	const entrances = new Map<Element, Animation>();
	const sync = () => {
		root.dataset.homePaused = String(document.hidden || preference.matches || collabDialogOpen());
		for (const animation of entrances.values()) {
			if (preference.matches) animation.finish();
			else if (document.hidden || collabDialogOpen()) animation.pause();
			else animation.play();
		}
	};
	const observer = new IntersectionObserver((entries) => {
		let stagger = 0;
		for (const entry of entries) {
			const node = entry.target as HTMLElement;
			node.dataset.homeActive = String(entry.isIntersecting);
			if (!entry.isIntersecting || arrived.has(node)) continue;
			arrived.add(node);
			if (preference.matches || document.hidden || collabDialogOpen() || node.matches('.cr-ticker')) continue;
			const animation = node.animate([
				{ opacity: 0.35, translate: '0 22px', scale: '0.97' },
				{ opacity: 1, translate: '0 -3px', scale: '1.005', offset: 0.78 },
				{ opacity: 1, translate: '0 0', scale: '1' }
			], { duration: 620, delay: Math.min(stagger++, 4) * 65, easing: 'cubic-bezier(.2,.8,.2,1)' });
			entrances.set(node, animation);
			animation.onfinish = () => { entrances.delete(node); animation.cancel(); };
		}
	}, { threshold: 0.06 });
	const scan = (parent: Element) => {
		const nodes = [...(parent.matches(selector) ? [parent] : []), ...parent.querySelectorAll(selector)];
		for (const node of nodes) {
			if (seen.has(node)) continue;
			seen.add(node);
			(node as HTMLElement).dataset.homeActive = 'false';
			observer.observe(node);
		}
	};
	const mutations = new MutationObserver((records) => {
		for (const record of records) {
			for (const node of record.removedNodes) {
				if (!(node instanceof Element)) continue;
				for (const el of [node, ...node.querySelectorAll(selector)]) {
					observer.unobserve(el);
					entrances.get(el)?.cancel();
					entrances.delete(el);
				}
			}
			for (const node of record.addedNodes) if (node instanceof Element) scan(node);
		}
	});
	scan(root);
	mutations.observe(root, { childList: true, subtree: true });
	preference.addEventListener('change', sync);
	document.addEventListener('visibilitychange', sync);
	document.addEventListener(COLLAB_DIALOG_CHANGE, sync);
	sync();
	return { destroy() {
		observer.disconnect();
		mutations.disconnect();
		preference.removeEventListener('change', sync);
		document.removeEventListener('visibilitychange', sync);
		document.removeEventListener(COLLAB_DIALOG_CHANGE, sync);
		for (const animation of entrances.values()) animation.cancel();
	} };
}

type CountOptions = { value: number; money?: boolean; suffix?: string; ring?: boolean };

/** Counters resume from their displayed value rather than running below the fold. */
export function homeCount(node: HTMLElement | SVGElement, initial: CountOptions) {
	let options = initial, current = 0, frame = 0, active = false, reduced = false;
	const draw = () => {
		if (options.ring) node.style.strokeDashoffset = String(100 - Math.min(1, Math.max(0, current)) * 100);
		else node.textContent = (options.money ? inr(Math.round(current)) : Math.round(current).toLocaleString('en-IN')) + (options.suffix ?? '');
	};
	const run = () => {
		cancelAnimationFrame(frame);
		if (reduced) { current = options.value; draw(); return; }
		if (!active || current === options.value) return;
		const from = current, target = options.value, start = performance.now();
		const tick = (time: number) => {
			const p = Math.min(1, (time - start) / 1050);
			current = from + (target - from) * (1 - (1 - p) ** 4);
			draw();
			if (p < 1) frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
	};
	draw();
	const stop = whileVisible(node, (on, less) => { active = on; reduced = less; run(); });
	return {
		update(next: CountOptions) { options = next; draw(); run(); },
		destroy() { stop(); cancelAnimationFrame(frame); }
	};
}

/** A bounded content change, without animating or snapshotting the whole screen. */
export function homeChange(node: HTMLElement, key: unknown) {
	let previous = key, animation: Animation | undefined;
	return {
		update(next: unknown) {
			if (next === previous) return;
			previous = next;
			animation?.cancel();
			if (document.hidden || collabDialogOpen() || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			animation = node.animate([
				{ opacity: 0.3, translate: '12px 8px' },
				{ opacity: 1, translate: '0 0' }
			], { duration: 380, easing: 'cubic-bezier(.2,.9,.25,1)' });
		},
		destroy() { animation?.cancel(); }
	};
}

/** Horizontal swipes leave vertical page scrolling and ordinary link taps intact. */
export function moneySwipe(node: HTMLElement, change: (direction: number) => void) {
	let pointer: number | null = null, x = 0, y = 0, dx = 0, dragging = false, suppressUntil = 0;
	const down = (event: PointerEvent) => {
		suppressUntil = 0;
		if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('button, .hc-foot, .glass-chip')) return;
		pointer = event.pointerId; x = event.clientX; y = event.clientY; dx = 0;
	};
	const move = (event: PointerEvent) => {
		if (event.pointerId !== pointer) return;
		dx = event.clientX - x;
		if (!dragging && Math.abs(event.clientY - y) > Math.abs(dx) + 8) { pointer = null; return; }
		if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(event.clientY - y)) {
			dragging = true;
			node.setPointerCapture(pointer!);
			node.style.setProperty('--money-drag', `${Math.max(-32, Math.min(32, dx * .16))}px`);
		}
	};
	const end = (event: PointerEvent) => {
		if (event.pointerId !== pointer) return;
		if (dragging) {
			suppressUntil = performance.now() + 500;
			if (event.type === 'pointerup' && Math.abs(dx) >= 42) change(dx < 0 ? 1 : -1);
		}
		if (node.hasPointerCapture(pointer!)) node.releasePointerCapture(pointer!);
		pointer = null; dragging = false; node.style.removeProperty('--money-drag');
	};
	const click = (event: MouseEvent) => {
		if (performance.now() >= suppressUntil) return;
		event.preventDefault(); event.stopPropagation();
	};
	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', end);
	node.addEventListener('pointercancel', end);
	node.addEventListener('click', click, true);
	return { destroy() {
		node.removeEventListener('pointerdown', down);
		node.removeEventListener('pointermove', move);
		node.removeEventListener('pointerup', end);
		node.removeEventListener('pointercancel', end);
		node.removeEventListener('click', click, true);
	} };
}

export function visibleCycle(node: HTMLElement, advance: () => void, delay: number) {
	let timer: ReturnType<typeof setTimeout> | undefined, first = true;
	const stop = whileVisible(node, (active) => {
		clearTimeout(timer);
		if (!active) return;
		const next = () => { advance(); first = false; timer = setTimeout(next, 3600); };
		timer = setTimeout(next, first ? delay : 3600);
	});
	return () => { stop(); clearTimeout(timer); };
}
