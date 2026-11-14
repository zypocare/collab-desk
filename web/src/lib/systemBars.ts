type BarStyle = 'DARK' | 'LIGHT';
export const NATIVE_APPEARANCE = 'mc:native-appearance';

/** Follow page changes without reading layout for every viewport or motion style update. */
export function followSystemBars(setStyle: (options: { style: BarStyle }) => Promise<void>) {
	const root = document.documentElement;
	let frame = 0;
	let stopped = false;
	let last: BarStyle | '' = '';
	let inset = root.style.getPropertyValue('--safe-area-inset-top');
	const bright = (color: string) => {
		const m = color.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
		if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return null;
		return (0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3])) / 255;
	};
	const check = () => {
		frame = 0;
		if (stopped || document.hidden) return;
		let dark = true;
		if (parseFloat(getComputedStyle(root).getPropertyValue('--safe-area-inset-top')) > 0) {
			let el: Element | null = document.elementFromPoint(innerWidth / 2, 2);
			let brightness: number | null = null;
			while (el && brightness === null) {
				brightness = bright(getComputedStyle(el).backgroundColor);
				el = el.parentElement;
			}
			dark = (brightness ?? (root.dataset.theme === 'dark' ? 0 : 1)) < 0.55;
		}
		const style = dark ? 'DARK' : 'LIGHT';
		if (style === last) return;
		last = style;
		setStyle({ style }).catch(() => {
			// Retry on the next appearance change if the native bridge was unavailable.
			if (last === style) last = '';
		});
	};
	const schedule = () => {
		if (!stopped && !document.hidden && !frame) frame = requestAnimationFrame(check);
	};
	const observer = new MutationObserver((changes) => {
		const nextInset = root.style.getPropertyValue('--safe-area-inset-top');
		// --tx/--ty and --vv-h/--vv-top change frequently. They do not change icon colour.
		const appearanceChanged = changes.some((change) => change.attributeName !== 'style');
		if (appearanceChanged || nextInset !== inset) schedule();
		inset = nextInset;
	});
	observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-desk', 'data-side', 'style'] });
	document.addEventListener(NATIVE_APPEARANCE, schedule);
	document.addEventListener('visibilitychange', schedule);
	window.addEventListener('resize', schedule, { passive: true });
	schedule();
	return () => {
		stopped = true;
		observer.disconnect();
		cancelAnimationFrame(frame);
		document.removeEventListener(NATIVE_APPEARANCE, schedule);
		document.removeEventListener('visibilitychange', schedule);
		window.removeEventListener('resize', schedule);
	};
}
