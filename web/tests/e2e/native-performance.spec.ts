import { expect, test, type Page } from '@playwright/test';

declare global {
	interface Window {
		nativePerf: { calls: string[]; reads: number; stop: () => void; event: string };
	}
}

async function paint(page: Page) {
	await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test.beforeEach(async ({ page }) => {
	// Exercise the real DOM and observer without signing in or connecting to a database.
	await page.route('**/__native-performance', (route) => route.fulfill({
		contentType: 'text/html',
		body: '<!doctype html><html style="--safe-area-inset-top:24px"><body style="margin:0"><header style="height:80px;background:rgb(255,255,255)">Miracle</header></body></html>'
	}));
	await page.goto('/__native-performance');
	await page.evaluate(async () => {
		const path = '/src/lib/systemBars.ts';
		const { followSystemBars, NATIVE_APPEARANCE } = await import(path);
		const state = window.nativePerf = { calls: [] as string[], reads: 0, stop: () => {}, event: NATIVE_APPEARANCE as string };
		const original = window.getComputedStyle.bind(window);
		window.getComputedStyle = (...args) => {
			state.reads++;
			return original(...args);
		};
		state.stop = followSystemBars(async ({ style }: { style: string }) => {
			state.calls.push(style);
			// Native SystemBars can write insets back after changing icon colour.
			document.documentElement.style.setProperty('--safe-area-inset-top', '24px');
		});
	});
	await paint(page);
});

test('motion and keyboard styles do not trigger status bar layout reads or bridge feedback', async ({ page }) => {
	const before = await page.evaluate(() => ({ reads: window.nativePerf.reads, calls: [...window.nativePerf.calls] }));
	expect(before.calls).toEqual(['LIGHT']);
	await page.evaluate(async () => {
		for (let i = 0; i < 10; i++) {
			const root = document.documentElement;
			root.style.setProperty('--tx', String(i / 10));
			root.style.setProperty('--ty', String(i / 20));
			root.style.setProperty('--vv-h', `${600 - i * 10}px`);
			root.style.setProperty('--vv-top', `${i}px`);
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		}
	});
	await paint(page);
	expect(await page.evaluate(() => ({ reads: window.nativePerf.reads, calls: window.nativePerf.calls }))).toEqual(before);
});

test('theme and navigation changes share one appearance check per frame and update icon contrast', async ({ page }) => {
	const before = await page.evaluate(() => window.nativePerf.reads);
	await page.evaluate(() => {
		document.querySelector('header')!.style.background = 'rgb(17,13,17)';
		document.documentElement.dataset.theme = 'dark';
		for (let i = 0; i < 20; i++) document.dispatchEvent(new Event(window.nativePerf.event));
	});
	await paint(page);
	expect(await page.evaluate(() => window.nativePerf.calls)).toEqual(['LIGHT', 'DARK']);
	expect((await page.evaluate(() => window.nativePerf.reads)) - before).toBe(2);
});

test('background work pauses and contrast refreshes when the app resumes', async ({ page }) => {
	const before = await page.evaluate(() => window.nativePerf.reads);
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, value: true });
		document.querySelector('header')!.style.background = 'rgb(17,13,17)';
		document.documentElement.dataset.theme = 'dark';
		document.dispatchEvent(new Event(window.nativePerf.event));
	});
	await paint(page);
	expect(await page.evaluate(() => window.nativePerf.reads)).toBe(before);
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, value: false });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await paint(page);
	expect(await page.evaluate(() => window.nativePerf.calls)).toEqual(['LIGHT', 'DARK']);
});

test('cleanup cancels queued work and removes appearance listeners', async ({ page }) => {
	const before = await page.evaluate(() => window.nativePerf.reads);
	await page.evaluate(() => {
		document.dispatchEvent(new Event(window.nativePerf.event));
		window.nativePerf.stop();
		document.documentElement.dataset.theme = 'dark';
		document.dispatchEvent(new Event(window.nativePerf.event));
		window.dispatchEvent(new Event('resize'));
	});
	await paint(page);
	expect(await page.evaluate(() => window.nativePerf.reads)).toBe(before);
});
