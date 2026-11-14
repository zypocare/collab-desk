import { expect, test, type Page } from '@playwright/test';

declare global {
	interface Window {
		collabTest: { isOpen: () => boolean; destroy: () => Promise<void> };
	}
}

async function paint(page: Page) {
	await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 393, height: 852 });
	await page.addInitScript(() => {
		// Model a keyboard that resizes only the visible area, as on a phone.
		const viewport = Object.assign(new EventTarget(), { height: 852, width: 393, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
		Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
	});
	await page.route('**/__new-collab', (route) => route.fulfill({
		contentType: 'text/html',
		body: '<!doctype html><html data-side="studio" data-desk="studio" data-theme="dark" style="overflow:auto"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>'
	}));
	await page.goto('/__new-collab');
	await page.evaluate(async () => {
		for (const file of ['app', 'brand', 'studio', 'desk', 'pro', 'mobile-type', 'mobile', 'atelier', 'dash', 'cred', 'today']) {
			await import(`/src/${file}.css`);
		}
		const statePath = '/src/lib/studio.svelte.ts';
		const { studio } = await import(statePath);
		studio.settings = { handle: 'preview', rates: {} };
		studio.brands = [];
		const uiPath = '/src/lib/ui.svelte.ts';
		const { ui } = await import(uiPath);
		ui.newCollab = true;
		const componentPath = '/src/lib/components/NewCollabDialog.svelte';
		const { default: NewCollabDialog } = await import(componentPath);
		// Use the component's exact runtime URL, including Vite's dependency version.
		const source = await (await fetch(componentPath)).text();
		const runtime = source.match(/from\s+["']([^"']*\/svelte\.js[^"']*)["']/)?.[1];
		if (!runtime) throw new Error('Could not find the component runtime');
		const { mount, unmount } = await import(runtime);
		const component = mount(NewCollabDialog, { target: document.body });
		const phonePath = '/src/lib/phone.svelte.ts';
		const { startPhone } = await import(phonePath);
		const stop = startPhone(async () => {});
		window.collabTest = { isOpen: () => ui.newCollab, destroy: async () => { stop(); await unmount(component); } };
	});
	await expect(page.getByRole('dialog', { name: 'Add a collab' })).toBeVisible();
	await paint(page);
});

test('the taller drawer and message box keep their size while typing a long message', async ({ page }) => {
	const drawer = page.locator('.dialog.nc');
	const box = page.locator('#nc-paste');
	const initial = (await drawer.boundingBox())!;
	expect(initial.height).toBeGreaterThan(820);
	expect((await box.boundingBox())!.height).toBe(240);
	const message = 'Hi, I am Asha from Lumiere Skin. We would love 1 reel and 3 stories, budget Rs 30000.\n'.repeat(30);
	await box.fill(message);
	const footer = (await page.locator('.nc-foot').boundingBox())!;
	for (const word of [' More', ' details', ' about', ' our', ' launch', '.']) {
		await box.press('End');
		await box.pressSequentially(word);
		expect((await drawer.boundingBox())!.height).toBeCloseTo(initial.height, 0);
		expect((await box.boundingBox())!.height).toBe(240);
		expect((await page.locator('.nc-foot').boundingBox())!.y).toBeCloseTo(footer.y, 0);
	}
	await expect(box).toBeFocused();
	expect(await box.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
});

test('the footer stays above the keyboard without shrinking the message box', async ({ page }) => {
	for (const [height, top] of [[460, 0], [430, 24], [852, 0]]) {
		await page.evaluate(({ height, top }) => {
			const viewport = window.visualViewport as unknown as { height: number; offsetTop: number; dispatchEvent: (event: Event) => boolean };
			viewport.height = height;
			viewport.offsetTop = top;
			viewport.dispatchEvent(new Event('resize'));
			viewport.dispatchEvent(new Event('scroll'));
		}, { height, top });
		await paint(page);
		const footer = (await page.locator('.nc-foot').boundingBox())!;
		const drawer = (await page.locator('.nc').boundingBox())!;
		expect(footer.y + footer.height).toBeLessThanOrEqual(top + height + 1);
		expect(drawer.y).toBeGreaterThanOrEqual(top);
		expect((await page.locator('#nc-paste').boundingBox())!.height).toBe(240);
	}
	// Android WebView can resize the layout viewport as well.
	await page.setViewportSize({ width: 393, height: 460 });
	await page.evaluate(() => {
		const viewport = window.visualViewport as unknown as { height: number; dispatchEvent: (event: Event) => boolean };
		viewport.height = 460;
		viewport.dispatchEvent(new Event('resize'));
	});
	await paint(page);
	expect((await page.locator('#nc-paste').boundingBox())!.height).toBe(240);
	const footer = (await page.locator('.nc-foot').boundingBox())!;
	expect(footer.y + footer.height).toBeLessThanOrEqual(461);
});

test('form scrolling never drags the drawer; cancelled header drags reset and a header swipe closes it', async ({ page }) => {
	const drag = async (selector: string, cancel: boolean) => page.evaluate(({ selector, cancel }) => {
		const node = document.querySelector(selector)!;
		const rect = node.getBoundingClientRect();
		const touch = (y: number) => new Touch({ identifier: 1, target: node, clientX: rect.left + 30, clientY: y });
		const start = touch(rect.top + 10);
		const end = touch(rect.top + 170);
		node.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [start] }));
		node.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [end] }));
		const transform = (document.querySelector('.nc') as HTMLElement).style.transform;
		node.dispatchEvent(new TouchEvent(cancel ? 'touchcancel' : 'touchend', { bubbles: true, touches: [], changedTouches: [end] }));
		return transform;
	}, { selector, cancel });
	expect(await drag('.nc-body', false)).toBe('');
	expect(await drag('#nc-paste', false)).toBe('');
	expect(await drag('.nc-grow', true)).toContain('translateY');
	expect(await page.locator('.nc').evaluate((node) => node.style.transform)).toBe('');
	await expect(page.locator('.nc')).toBeVisible();
	expect(await drag('.nc-grow', false)).toContain('translateY');
	await expect.poll(() => page.evaluate(() => window.collabTest.isOpen())).toBe(false);
	await page.evaluate(() => window.collabTest.destroy());
	await expect(page.locator('.nc')).toHaveCount(0);
	expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('auto');
});
