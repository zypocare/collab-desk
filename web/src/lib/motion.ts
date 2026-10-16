// Motion helpers for the Studio, built on the `motion` library. Each one is a Svelte action
// and does nothing for people who prefer reduced motion or on touch screens (where hover effects don't apply).
import { animate, stagger } from 'motion';
import autoAnimateFn from '@formkit/auto-animate';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Card follows the pointer in 3D, with a light sheen. */
export function tilt(node: HTMLElement, opts: { max?: number } = {}) {
	if (reduced() || !fine()) return {};
	const max = opts.max ?? 5;
	node.style.transformStyle = 'preserve-3d';
	let frame = 0;
	const move = (e: PointerEvent) => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			const r = node.getBoundingClientRect();
			const px = (e.clientX - r.left) / r.width - 0.5;
			const py = (e.clientY - r.top) / r.height - 0.5;
			animate(node, { transformPerspective: 1100, rotateX: -py * max, rotateY: px * max }, { type: 'spring', stiffness: 160, damping: 20, mass: 0.6 });
			node.style.setProperty('--sx', `${(px + 0.5) * 100}%`);
			node.style.setProperty('--sy', `${(py + 0.5) * 100}%`);
		});
	};
	const leave = () => {
		cancelAnimationFrame(frame);
		animate(node, { transformPerspective: 1100, rotateX: 0, rotateY: 0 }, { type: 'spring', stiffness: 120, damping: 16 });
	};
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerleave', leave);
	return {
		destroy() {
			cancelAnimationFrame(frame);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerleave', leave);
		}
	};
}

/** Button is gently pulled toward the pointer. Uses the `translate` property, so it never fights the button's own press animation. */
export function magnetic(node: HTMLElement, opts: { strength?: number } = {}) {
	if (reduced() || !fine()) return {};
	const k = opts.strength ?? 0.22;
	const move = (e: PointerEvent) => {
		const r = node.getBoundingClientRect();
		const dx = (e.clientX - (r.left + r.width / 2)) * k;
		const dy = (e.clientY - (r.top + r.height / 2)) * k;
		animate(node, { translate: `${dx}px ${dy}px` }, { type: 'spring', stiffness: 260, damping: 18, mass: 0.5 });
	};
	const leave = () => animate(node, { translate: '0px 0px' }, { type: 'spring', stiffness: 220, damping: 12 });
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerleave', leave);
	return {
		destroy() {
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerleave', leave);
		}
	};
}

/** Children rise in one after another when the element appears. */
export function cascade(node: HTMLElement, opts: { selector?: string; delay?: number; gap?: number } = {}) {
	if (reduced()) return {};
	const kids = Array.from(node.querySelectorAll<HTMLElement>(opts.selector ?? ':scope > *'));
	if (!kids.length) return {};
	animate(
		kids,
		{ opacity: [0, 1], y: [14, 0], filter: ['blur(6px)', 'blur(0px)'] },
		{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1], delay: stagger(opts.gap ?? 0.05, { startDelay: opts.delay ?? 0.05 }) }
	);
	return {};
}

/** Lists animate when items are added, removed or re-ordered. */
export function flip(node: HTMLElement, opts: { duration?: number } = {}) {
	if (reduced()) return {};
	const ctl = autoAnimateFn(node, { duration: opts.duration ?? 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
	return { destroy: () => ctl.disable() };
}
