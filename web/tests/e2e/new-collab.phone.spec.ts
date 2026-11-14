import { expect, test, type Page } from '@playwright/test';
import { mountCollabHarness } from '../helpers/collab-harness.mjs';

declare global {
	interface Window {
		collabTest: {
			isOpen: () => boolean; destroy: () => Promise<void>; close: () => Promise<void>; open: () => void;
			original: { y: number; moneyTop: number; phone: { scrolled: boolean; titled: boolean; hide: boolean } };
			phone: () => { scrolled: boolean; titled: boolean; hide: boolean };
		};
	}
}

async function paint(page: Page) {
	await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
}

test.beforeEach(async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 393, height: 852 });
	await page.addInitScript(() => {
		// Deliberately independent of window.innerHeight, as during native IME inset updates.
		const viewport = Object.assign(new EventTarget(), { height: 852, width: 393, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
		Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
	});
	await page.route('**/__new-collab', (route) => route.fulfill({
		contentType: 'text/html',
		body: '<!doctype html><html data-side="studio" data-desk="studio" data-theme="dark" style="overflow:auto"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>'
	}));
	await page.route('https://**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
	await page.goto('/__new-collab');
	await page.evaluate(mountCollabHarness, { mode: testInfo.title.startsWith('PWA') ? 'browser' : 'native' });
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

test('native window resizing keeps the title, composer and footer in the visible area', async ({ page }) => {
	for (const height of [460, 430, 380, 852]) {
		await page.setViewportSize({ width: 393, height });
		await paint(page);
		const footer = (await page.locator('.nc-foot').boundingBox())!;
		const drawer = (await page.locator('.nc').boundingBox())!;
		expect(footer.y + footer.height).toBeLessThanOrEqual(height + 1);
		expect(drawer.y).toBeGreaterThanOrEqual(0);
		const compose = (await page.locator('.nc-compose').boundingBox())!;
		const intro = (await page.locator('.nc-intro').boundingBox())!;
		expect(compose.y).toBeGreaterThanOrEqual(intro.y + intro.height);
		expect(compose.y + compose.height).toBeLessThanOrEqual(footer.y + 1);
		expect((await page.locator('#nc-paste').boundingBox())!.height).toBeGreaterThanOrEqual(80);
	}
	await expect(page.locator('#nc-paste')).toHaveCSS('height', '240px');
});

test('native visual viewport noise never resizes or pans a sheet already sized by Android', async ({ page }) => {
	await page.setViewportSize({ width: 393, height: 430 });
	await paint(page);
	const before = (await page.locator('.nc').boundingBox())!;
	await page.evaluate(() => {
		const viewport = window.visualViewport as unknown as { height: number; offsetTop: number; dispatchEvent: (event: Event) => boolean };
		viewport.height = 170; viewport.offsetTop = 85;
		viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll'));
	});
	await paint(page);
	expect(await page.locator('.nc').boundingBox()).toEqual(before);
	await expect(page.locator('html')).toHaveCSS('--vv-h', '430px');
	await expect(page.locator('html')).toHaveCSS('--vv-top', '0px');
});

test('focus and typing do not undo the WebView caret scroll adjustment', async ({ page }) => {
	await page.setViewportSize({ width: 393, height: 430 });
	await paint(page);
	const intro = (await page.locator('.nc-intro').boundingBox())!;
	const scroll = await page.evaluate(async () => {
		const input = document.querySelector<HTMLTextAreaElement>('#nc-paste')!;
		const body = document.querySelector<HTMLElement>('.nc-body')!;
		input.focus({ preventScroll: true });
		await new Promise((resolve) => setTimeout(resolve, 40));
		body.scrollTop = 60; // The IME scrolls to the caret after focus, not in the focus event itself.
		const adjusted = body.scrollTop;
		await new Promise((resolve) => setTimeout(resolve, 220));
		return { adjusted, after: body.scrollTop };
	});
	expect(scroll.adjusted).toBe(60);
	expect(scroll.after).toBe(scroll.adjusted);
	await page.locator('#nc-paste').pressSequentially('A message for the brand');
	await expect(page.locator('#nc-paste')).toBeFocused();
	expect(await page.locator('.nc-intro').boundingBox()).toEqual(intro);
});

test('the underlying home stays fixed and resumes at the same place after repeated opens', async ({ page }) => {
	const original = await page.evaluate(() => window.collabTest.original);
	await expect(page.locator('.phone-today')).toHaveAttribute('data-home-paused', 'true');
	for (const height of [430, 852, 460, 852]) {
		await page.setViewportSize({ width: 393, height });
		await paint(page);
		expect(await page.locator('.m-hero').evaluate((node) => node.getBoundingClientRect().top)).toBeCloseTo(original.moneyTop, 0);
		expect(await page.evaluate(() => window.collabTest.phone())).toEqual(original.phone);
	}
	for (let i = 0; i < 2; i++) {
		await page.evaluate(() => window.collabTest.close());
		await expect.poll(() => page.evaluate(() => scrollY)).toBe(original.y);
		await expect(page.locator('.phone-today')).toHaveAttribute('data-home-paused', 'false');
		await expect(page.locator('#dialog-opener')).toBeFocused();
		await page.evaluate(() => window.collabTest.open());
		await expect(page.locator('.dialog.nc')).toBeVisible();
	}
});

test('PWA keyboards still follow the visual viewport when the layout viewport is unchanged', async ({ page }) => {
	await page.evaluate(() => {
		const viewport = window.visualViewport as unknown as { height: number; offsetTop: number; dispatchEvent: (event: Event) => boolean };
		viewport.height = 430; viewport.offsetTop = 24; viewport.dispatchEvent(new Event('resize'));
	});
	await paint(page);
	expect(await page.evaluate(() => innerHeight)).toBe(852);
	const footer = (await page.locator('.nc-foot').boundingBox())!;
	expect(footer.y + footer.height).toBeLessThanOrEqual(454);
});

test('brand suggestions are contained below their field and still allow manual names', async ({ page }) => {
	await expect(page.locator('datalist, input[list]')).toHaveCount(0);
	const brand = page.locator('#nc-brand');
	await brand.fill('Flipkart');
	const list = page.getByRole('listbox', { name: 'Existing brands' });
	await expect(list.getByRole('option')).toHaveCount(2);
	const rect = (await brand.boundingBox())!;
	expect((await list.boundingBox())!.y).toBeGreaterThanOrEqual(rect.y + rect.height);
	await list.getByRole('option', { name: 'Flipkart Food Fest', exact: true }).click();
	await expect(brand).toHaveValue('Flipkart Food Fest');
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await page.locator('#nc-brand2').fill('A new brand');
	await expect(page.getByRole('listbox')).toHaveCount(0);
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
