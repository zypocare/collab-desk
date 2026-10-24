/** Phones: long help text under a setting shows two lines, and a tap opens the rest. */
export function clampHints(node: HTMLElement) {
	const SEL = '.switch-row small, p.hint, .f > small.hint, .panel > p';
	const mark = () => {
		if (!matchMedia('(max-width: 760px)').matches) return;
		for (const el of node.querySelectorAll<HTMLElement>(SEL)) {
			if (el.dataset.clamp || (el.textContent ?? '').trim().length < 110 || el.querySelector('a, button, input, select')) continue;
			el.dataset.clamp = '1';
			el.classList.add('hint-clamp');
		}
	};
	const click = (e: MouseEvent) => (e.target as HTMLElement).closest<HTMLElement>('.hint-clamp')?.classList.toggle('open');
	mark();
	const mo = new MutationObserver(mark);
	mo.observe(node, { childList: true, subtree: true });
	node.addEventListener('click', click);
	return {
		destroy() {
			mo.disconnect();
			node.removeEventListener('click', click);
		}
	};
}
