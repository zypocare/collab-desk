// Sections fade and rise in as they scroll into view (brand pages). Without IntersectionObserver, with
// reduced motion, or when printing, everything simply shows.
let started = false;

export function startReveal() {
	if (started || typeof window === 'undefined') return;
	started = true;
	const root = document.documentElement;
	if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	root.dataset.io = '';

	const io = new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				if (!e.isIntersecting) continue;
				e.target.classList.add('in');
				io.unobserve(e.target);
			}
		},
		{ rootMargin: '0px 0px -6% 0px', threshold: 0.06 }
	);
	const watch = (el: Element) => {
		if (!el.classList.contains('in')) io.observe(el);
	};
	document.querySelectorAll('.rv').forEach(watch);
	// New sections as pages load and change.
	new MutationObserver((muts) => {
		for (const m of muts)
			for (const n of m.addedNodes) {
				if (!(n instanceof Element)) continue;
				if (n.classList.contains('rv')) watch(n);
				n.querySelectorAll?.('.rv').forEach(watch);
			}
	}).observe(document.body, { childList: true, subtree: true });
	// Never leave anything hidden (e.g. a tab opened in the background).
	addEventListener('beforeprint', () => document.querySelectorAll('.rv').forEach((el) => el.classList.add('in')));
}
