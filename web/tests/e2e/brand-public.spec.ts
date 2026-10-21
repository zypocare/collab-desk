import { expect, test } from '@playwright/test';
import { signIn, watchErrors } from './helpers';

test('public pages load', async ({ page }) => {
	const noErrors = watchErrors(page);
	for (const path of ['/', '/privacy', '/data-deletion']) {
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		await expect(page.locator('h1').first()).toBeVisible();
	}
	noErrors();
});

test('a new brand can sign in and reach the request form', async ({ page }) => {
	const noErrors = watchErrors(page);
	await signIn(page, `brand${Date.now()}@example.test`);
	for (const path of ['/brand', '/brand/requests', '/brand/creators', '/brand/creators?tab=discover']) {
		await page.goto(path);
		await page.waitForLoadState('networkidle');
	}
	await page.goto('/brand/new');
	await page.waitForLoadState('networkidle');
	await expect(page.locator('form, .dialog, .panel').first()).toBeVisible();
	noErrors();
});
