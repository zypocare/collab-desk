import { expect, test } from '@playwright/test';
import { fakeAi, noSidewaysScroll, signIn, watchErrors } from './helpers';

test('phone: main screens fit the screen', async ({ page }) => {
	await fakeAi(page);
	await signIn(page);
	const noErrors = watchErrors(page);
	for (const path of ['/studio', '/studio/collabs', '/studio/calendar', '/studio/payments', '/studio/profile', '/studio/inbox', '/studio/reports']) {
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		await noSidewaysScroll(page);
	}
	noErrors();
});

test('phone: confirm sheet buttons are full size', async ({ page }) => {
	await fakeAi(page);
	await signIn(page);
	await page.goto('/studio/collabs');
	await page.waitForLoadState('networkidle');
	// Open the first new request and start declining it (then cancel).
	await page.locator('a[href^="/studio/c/"], .m-crow').first().click();
	const decline = page.getByRole('button', { name: /Decline this request/ });
	if (await decline.count()) {
		await decline.click();
		const btns = page.locator('.confirm-dlg .row .btn');
		await expect(btns).toHaveCount(2);
		for (const b of await btns.all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
		await page.locator('.confirm-dlg').getByRole('button', { name: 'Cancel' }).click();
	}
});
