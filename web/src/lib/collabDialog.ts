export const COLLAB_DIALOG_CHANGE = 'miracle:collab-dialog';
export const collabDialogOpen = () => document.documentElement.hasAttribute('data-collab-dialog');

/** Keep the page and its scroll position still while the keyboard resizes the sheet. */
export function holdCollabPage(scrim: HTMLElement) {
	const root = document.documentElement, body = document.body;
	const x = scrollX, y = scrollY;
	const opener = document.activeElement;
	const previousMarker = root.getAttribute('data-collab-dialog');
	const save = (style: CSSStyleDeclaration, keys: string[]) => keys.map((key) => ({ key, value: style.getPropertyValue(key), priority: style.getPropertyPriority(key) }));
	const rootStyles = save(root.style, ['overflow', 'scroll-behavior']);
	const bodyStyles = save(body.style, ['position', 'top', 'left', 'width', 'height', 'overflow', 'padding-right']);
	const gap = innerWidth - root.clientWidth;
	const padding = gap > 0 ? parseFloat(getComputedStyle(body).paddingRight) || 0 : 0;
	const background = Array.from(body.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el !== scrim && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)).map((el) => ({ el, inert: el.inert }));
	root.setAttribute('data-collab-dialog', '');
	document.dispatchEvent(new Event(COLLAB_DIALOG_CHANGE));
	root.style.setProperty('scroll-behavior', 'auto', 'important');
	root.style.overflow = 'hidden';
	body.style.position = 'fixed';
	body.style.top = `${-y}px`;
	body.style.left = `${-x}px`;
	body.style.width = '100%';
	body.style.height = `${innerHeight}px`;
	body.style.overflow = 'hidden';
	if (gap > 0) body.style.paddingRight = `${padding + gap}px`;
	background.forEach(({ el }) => { el.inert = true; });
	// Focus the dialog, without opening the keyboard or scrolling to an input on entry.
	queueMicrotask(() => {
		if (scrim.isConnected) scrim.querySelector<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true });
	});
	const trapFocus = (event: KeyboardEvent) => {
		if (event.key !== 'Tab' || !scrim.contains(event.target as Node)) return;
		const items = Array.from(scrim.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex]')).filter((el) => el.tabIndex >= 0 && !el.matches(':disabled, [hidden]') && !el.closest('[inert]') && el.getClientRects().length);
		const first = items[0], last = items.at(-1);
		if (!first || !last) return;
		if (event.shiftKey && (document.activeElement === first || (document.activeElement as Element)?.matches('[role="dialog"]'))) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	};
	scrim.addEventListener('keydown', trapFocus);
	return { destroy() {
		scrim.removeEventListener('keydown', trapFocus);
		if (scrim.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
		const restore = (style: CSSStyleDeclaration, saved: typeof bodyStyles) => saved.forEach(({ key, value, priority }) => value ? style.setProperty(key, value, priority) : style.removeProperty(key));
		restore(body.style, bodyStyles);
		// Keep instant scrolling until the original position has been restored.
		const overflow = rootStyles.find((item) => item.key === 'overflow')!;
		if (overflow.value) root.style.setProperty('overflow', overflow.value, overflow.priority); else root.style.removeProperty('overflow');
		window.scrollTo({ left: x, top: y, behavior: 'instant' });
		restore(root.style, rootStyles);
		background.forEach(({ el, inert }) => { el.inert = inert; });
		if (previousMarker === null) root.removeAttribute('data-collab-dialog'); else root.setAttribute('data-collab-dialog', previousMarker);
		document.dispatchEvent(new Event(COLLAB_DIALOG_CHANGE));
		if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
	} };
}
