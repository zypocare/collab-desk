// Phone pages with many parts (a creator's collab page, a brand's request page): the stage and the next step stay
// open; every other part is one row (an icon, its name and a short summary) in a group (the work, the money, the
// other side, more), and a row opens as its own sheet over the page. Used as `use:folds` on the parts' container,
// inside an element with class `drawer as-page` or `fold-page`. A part is a `section.sec` with an `h3`; `data-g` and
// `data-ic` on it (or on its wrapper) give its group and icon; `data-open` keeps it open; one with nothing in it
// but its heading (a component that had nothing to show) is left out.
export type FoldOpts = { on: boolean; labels?: Partial<Record<string, string>> };

const ORDER: Record<string, number> = { work: 10, money: 20, brand: 30, more: 40 };
const LABEL: Record<string, string> = { work: 'The work', money: 'The money', brand: 'The brand', more: 'More' };
const PAGE = '.drawer.as-page, .fold-page';

const sheetOpen = (sec: HTMLElement, on: boolean) => {
	sec.classList.toggle('open', on);
	sec.querySelector(':scope > h3')?.setAttribute('aria-expanded', String(on));
};
const lockPage = () => document.documentElement.classList.toggle('cd-sheet', !!document.querySelector(':is(.drawer.as-page, .fold-page) .sec.fold.open'));

/** One sheet at a time; the page behind doesn't scroll while one is up. */
export function openOnly(sec: HTMLElement | null | undefined) {
	if (!sec) return;
	for (const o of document.querySelectorAll<HTMLElement>(':is(.drawer.as-page, .fold-page) .sec.fold.open')) if (o !== sec) sheetOpen(o, false);
	sheetOpen(sec, true);
	lockPage();
}

export function folds(node: HTMLElement, opts: boolean | FoldOpts) {
	let o: FoldOpts = typeof opts === 'boolean' ? { on: opts } : opts;
	const label = (g: string) => o.labels?.[g] ?? LABEL[g] ?? '';
	// Only an element node counts as content: a component with nothing to show leaves just the heading.
	const empty = (sec: HTMLElement) => ![...sec.children].some((ch) => ch.tagName !== 'H3');
	const prep = () => {
		const active = o.on;
		// Groups: each grouped part takes its group's place; the rest keep theirs (before the groups, or after them).
		let seen = false;
		const kids = [...node.children] as HTMLElement[];
		for (const el of kids) {
			const g = el.dataset.g;
			// A part in its own component sits in a wrapper the layout looks through, so its section takes the place too.
			for (const t of [el, el.querySelector<HTMLElement>(':scope.sec-wrap > section.sec')])
				if (!t) continue;
				else if (active) t.style.order = g && ORDER[g] ? String(ORDER[g]) : seen ? '90' : '0';
				else t.style.removeProperty('order');
			if (g) seen = true;
		}
		// The first and last row showing in each group round off its card; the first carries the group's name.
		const rows = kids
			.filter((el) => el.dataset.g && !el.hidden)
			.map((el) => ({ g: el.dataset.g!, sec: el.matches('section.sec') ? el : el.querySelector<HTMLElement>(':scope > section.sec') }))
			.filter((r): r is { g: string; sec: HTMLElement } => !!r.sec && !(active && empty(r.sec)))
			.sort((a, b) => (ORDER[a.g] ?? 0) - (ORDER[b.g] ?? 0));
		for (const el of node.querySelectorAll<HTMLElement>('section.sec')) {
			el.classList.remove('g-first', 'g-last');
			el.removeAttribute('data-gl');
			el.classList.toggle('f-empty', active && !!el.dataset.g && empty(el));
		}
		if (active)
			rows.forEach((r, k) => {
				if (rows[k - 1]?.g !== r.g) r.sec.classList.add('g-first'), r.sec.setAttribute('data-gl', label(r.g));
				if (rows[k + 1]?.g !== r.g) r.sec.classList.add('g-last');
				const ic = (r.sec.closest('[data-ic]') as HTMLElement | null)?.dataset.ic;
				if (ic) r.sec.setAttribute('data-ri', `${r.g}-${ic}`);
			});
		// The parts written on the page, and the ones in their own component.
		for (const sec of node.querySelectorAll<HTMLElement>(':scope > section.sec, :scope > .sec-wrap > section.sec')) {
			const h = sec.querySelector<HTMLElement>(':scope > h3');
			// The stage and the "Should you take it?" score stay open.
			const fold = active && !!h && !sec.hasAttribute('data-open') && !sec.classList.contains('dec-sec');
			sec.classList.toggle('fold', fold);
			if (!h) continue;
			if (fold) {
				h.tabIndex = 0;
				h.setAttribute('role', 'button');
				h.setAttribute('aria-expanded', String(sec.classList.contains('open')));
				// A part without its own summary shows the count in its heading ("2 linked").
				if (!h.hasAttribute('data-sum') || h.dataset.auto) {
					const t = h.querySelector(':scope > span, :scope > small')?.textContent?.trim() ?? '';
					if (t) (h.dataset.sum = t), (h.dataset.auto = '1');
				}
			} else for (const a of ['tabindex', 'role', 'aria-expanded']) h.removeAttribute(a);
		}
		lockPage();
	};
	const toggle = (h: HTMLElement) => {
		const sec = h.parentElement;
		if (!sec?.classList.contains('fold')) return;
		if (sec.classList.contains('open')) sheetOpen(sec, false), lockPage();
		else openOnly(sec);
	};
	const click = (e: MouseEvent) => {
		const t = e.target as HTMLElement;
		if (t.closest('button, a, input, select, textarea, label')) return;
		const h = t.closest('h3');
		if (h instanceof HTMLElement && h.parentElement?.classList.contains('fold') && node.contains(h)) toggle(h);
	};
	const key = (e: KeyboardEvent) => {
		const h = e.target as HTMLElement;
		if ((e.key === 'Enter' || e.key === ' ') && h.tagName === 'H3' && h.parentElement?.classList.contains('fold')) {
			e.preventDefault();
			toggle(h);
		}
		if (e.key === 'Escape') for (const s of node.querySelectorAll<HTMLElement>('.sec.fold.open')) sheetOpen(s, false), lockPage();
	};
	// A tap on the page behind an open sheet closes it (and does nothing else). Dialogs opened from a sheet
	// live outside the page, so taps in them leave the sheet alone.
	const outside = (e: MouseEvent) => {
		const s = node.querySelector<HTMLElement>('.sec.fold.open');
		const t = e.target as HTMLElement;
		// The app around the page counts too (a brand's top bar sits outside the page); dialogs are outside the app.
		if (!o.on || !s || s.contains(t) || !t.closest(`${PAGE}, .app`)) return;
		e.preventDefault();
		e.stopPropagation();
		sheetOpen(s, false);
		lockPage();
	};
	const mo = new MutationObserver(prep);
	mo.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
	node.addEventListener('click', click);
	node.addEventListener('keydown', key);
	document.addEventListener('click', outside, true);
	prep();
	return {
		update(v: boolean | FoldOpts) {
			o = typeof v === 'boolean' ? { on: v } : v;
			prep();
		},
		destroy() {
			mo.disconnect();
			node.removeEventListener('click', click);
			node.removeEventListener('keydown', key);
			document.removeEventListener('click', outside, true);
			document.documentElement.classList.remove('cd-sheet');
		}
	};
}
