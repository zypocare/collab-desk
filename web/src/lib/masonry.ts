// Masonry for a CSS grid: each card spans as many 2px rows as it is tall, so cards of different
// heights pack into balanced columns (left to right, top to bottom) with no gaps.
// Re-fits whenever a card changes size (a package added, a section opened) or cards come and go.
const ROW = 2;
const GAP = 18;

export function masonry(node: HTMLElement) {
	const fit = (el: Element) => {
		const h = (el as HTMLElement).offsetHeight; // layout height, unaffected by entrance animations
		(el as HTMLElement).style.gridRowEnd = `span ${Math.max(1, Math.ceil((h + GAP) / ROW))}`;
	};
	const ro = new ResizeObserver((entries) => entries.forEach((e) => fit(e.target)));
	const fitAll = () => [...node.children].forEach(fit);
	const watch = () => {
		[...node.children].forEach((c) => ro.observe(c));
		fitAll();
	};
	const mo = new MutationObserver(watch);
	watch();
	// Fonts and images can change heights after the first paint.
	requestAnimationFrame(fitAll);
	document.fonts?.ready.then(fitAll);
	mo.observe(node, { childList: true });
	addEventListener('resize', fitAll);
	return {
		destroy() {
			ro.disconnect();
			mo.disconnect();
			removeEventListener('resize', fitAll);
		}
	};
}
