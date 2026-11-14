import { expect, test, type Page } from '@playwright/test';

declare global {
	interface Window {
		collabTest: {
			isOpen: () => boolean; open: () => void; close: () => Promise<void>; destroy: () => Promise<void>;
			original: { y: number; moneyTop: number; drift: string; phone: { scrolled: boolean; titled: boolean; hide: boolean } };
			phone: () => { scrolled: boolean; titled: boolean; hide: boolean };
		};
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
		body: '<!doctype html><html data-side="studio" data-desk="studio" data-theme="dark" style="overflow:auto"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="app"><main style="min-height:2600px;padding:16px"><button id="dialog-opener">Add collab</button><div id="home"></div></main></div></body></html>'
	}));
	await page.route('https://**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
	await page.goto('/__new-collab');
	await page.evaluate(async () => {
		for (const file of ['app', 'brand', 'studio', 'desk', 'pro', 'mobile-type', 'mobile', 'atelier', 'dash', 'cred', 'today']) {
			await import(`/src/${file}.css`);
		}
		const statePath = '/src/lib/studio.svelte.ts';
		const { studio } = await import(statePath);
		studio.settings = { id: 'drawer-test', handle: 'preview', display_name: 'Asha Sharma', rates: {}, monthly_goal: 100000 };
		studio.extras = true;
		localStorage.setItem('cd-setup-hide-drawer-test', '1');
		studio.brands = ['Beacon Circle', 'Brown Boy Café', 'Burger Brewery', 'Cafe Champakam', 'Copper Finch', 'DesiClans', 'Flipkart Auto Fest', 'Flipkart Food Fest', 'FLO', 'Gobi Maps', 'Hairspeak', 'Karnataka Bar Association'].map((name, i) => ({ id: String(i), name }));
		const uiPath = '/src/lib/ui.svelte.ts';
		const { ui } = await import(uiPath);
		const componentPath = '/src/lib/components/NewCollabDialog.svelte';
		const { default: NewCollabDialog } = await import(componentPath);
		// Use the component's exact runtime URL, including Vite's dependency version.
		const source = await (await fetch(componentPath)).text();
		const runtime = source.match(/from\s+["']([^"']*\/svelte\.js[^"']*)["']/)?.[1];
		if (!runtime) throw new Error('Could not find the component runtime');
		const { mount, unmount } = await import(runtime);
		const homePath = '/src/lib/components/PhoneToday.svelte';
		const { default: Home } = await import(homePath);
		const checksPath = '/src/lib/checkup.svelte.ts';
		const { checkups } = await import(checksPath);
		checkups.loaded = true;
		const home = mount(Home, { target: document.querySelector('#home')! });
		const phonePath = '/src/lib/phone.svelte.ts';
		const { startPhone, phone } = await import(phonePath);
		const stop = startPhone(async () => {});
		await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		window.scrollTo({ top: 220, behavior: 'instant' });
		await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		await Promise.all(document.querySelector('.m-hero')!.getAnimations().filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity).map((animation) => animation.finished.catch(() => {})));
		(document.querySelector('#dialog-opener') as HTMLElement).focus({ preventScroll: true });
		const phoneState = () => ({ scrolled: phone.scrolled, titled: phone.titled, hide: phone.hide });
		const original = { y: scrollY, moneyTop: document.querySelector('.m-hero')!.getBoundingClientRect().top, drift: (document.querySelector('.ht') as HTMLElement).style.getPropertyValue('--sy'), phone: phoneState() };
		let component: ReturnType<typeof mount> | undefined;
		const open = () => { ui.newCollab = true; component = mount(NewCollabDialog, { target: document.body }); };
		const close = async () => { ui.newCollab = false; if (component) { await unmount(component); component = undefined; } };
		window.collabTest = { isOpen: () => ui.newCollab, original, phone: phoneState, open, close, destroy: async () => { await close(); stop(); await unmount(home); } };
		open();
	});
	await expect(page.getByRole('dialog', { name: 'Add a collab' })).toBeVisible();
	await paint(page);
});

test('existing brand suggestions stay below the field, work in both steps, and allow new brands', async ({ page }) => {
	await expect(page.locator('#nc-paste')).not.toBeFocused();
	await expect(page.getByRole('dialog', { name: 'Add a collab' })).toBeFocused();
	await expect(page.locator('datalist, input[list]')).toHaveCount(0);
	await expect(page.getByRole('listbox', { name: 'Existing brands' })).toHaveCount(0);
	const brand = page.locator('#nc-brand');
	await brand.fill('Flipkart');
	const suggestions = page.getByRole('listbox', { name: 'Existing brands' });
	await expect(suggestions.getByRole('option')).toHaveCount(2);
	const field = (await brand.boundingBox())!;
	expect((await suggestions.boundingBox())!.y).toBeGreaterThanOrEqual(field.y + field.height);
	expect(await suggestions.evaluate((node) => getComputedStyle(node).position)).toBe('relative');
	await suggestions.getByRole('option', { name: 'Flipkart Food Fest', exact: true }).click();
	await expect(brand).toHaveValue('Flipkart Food Fest');
	await expect(brand).toBeFocused();
	await expect(suggestions).toHaveCount(0);
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(page.locator('#nc-brand2')).toHaveValue('Flipkart Food Fest');
	await page.locator('#nc-brand2').fill('My entirely new brand');
	await expect(suggestions).toHaveCount(0);
	await expect(page.locator('.nc-hint').filter({ hasText: 'New brand:' })).toBeVisible();
});

test('brand suggestions support the keyboard and dismiss before the drawer', async ({ page }) => {
	const brand = page.locator('#nc-brand');
	await brand.fill('F');
	await expect(page.getByRole('option')).toHaveCount(4);
	await brand.press('ArrowDown');
	await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
	await brand.press('Escape');
	await expect(page.getByRole('listbox')).toHaveCount(0);
	expect(await page.evaluate(() => window.collabTest.isOpen())).toBe(true);
	await brand.press('ArrowDown');
	await brand.press('Enter');
	await expect(brand).toHaveValue('Brown Boy Café');
	await expect(page.getByRole('listbox')).toHaveCount(0);
	await brand.fill('Cafe');
	await expect(page.getByRole('option', { name: 'Brown Boy Café', exact: true })).toBeVisible();
});

test('the home page keeps its position and pauses motion through opening, keyboard resizing and closing', async ({ page }) => {
	const original = await page.evaluate(() => window.collabTest.original);
	expect(original.y).toBe(220);
	await expect(page.locator('.phone-today')).toHaveAttribute('data-home-paused', 'true');
	await expect(page.locator('body')).toHaveCSS('position', 'fixed');
	await expect(page.locator('.app')).toHaveAttribute('inert', '');
	for (const height of [460, 430, 500, 852]) {
		await page.evaluate((height) => {
			const viewport = window.visualViewport as unknown as { height: number; dispatchEvent: (event: Event) => void };
			viewport.height = height;
			viewport.dispatchEvent(new Event('resize'));
			window.dispatchEvent(new Event('scroll'));
		}, height);
		await paint(page);
		expect(await page.locator('.m-hero').evaluate((node) => node.getBoundingClientRect().top)).toBeCloseTo(original.moneyTop, 0);
		expect(await page.locator('.ht').evaluate((node) => (node as HTMLElement).style.getPropertyValue('--sy'))).toBe(original.drift);
		expect(await page.evaluate(() => window.collabTest.phone())).toEqual(original.phone);
	}
	await page.evaluate(() => window.collabTest.close());
	await expect.poll(() => page.evaluate(() => scrollY)).toBe(original.y);
	await expect(page.locator('.phone-today')).toHaveAttribute('data-home-paused', 'false');
	await expect(page.locator('.app')).not.toHaveAttribute('inert', '');
	await expect(page.locator('#dialog-opener')).toBeFocused();
	await page.evaluate(() => window.collabTest.open());
	await expect(page.locator('.dialog.nc')).toBeVisible();
	await page.evaluate(() => window.collabTest.close());
	await expect.poll(() => page.evaluate(() => scrollY)).toBe(original.y);
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
