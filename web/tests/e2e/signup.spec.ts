import { expect, test } from '@playwright/test';
import { codeFor, watchErrors } from './helpers';

// Sign-up from the website's Join buttons: a brand fills its company and lands on its dashboard;
// a creator sends a profile for review (the link comes after approval).
async function startSignup(page: import('@playwright/test').Page, as: 'creator' | 'brand', email: string) {
	await page.goto(`/signup?as=${as}`);
	await page.fill('#su-email', email);
	const t0 = new Date(Date.now() - 3000);
	await page.click('button:has-text("Send my code")');
	await page.locator('#su-code').fill(await codeFor(email, t0));
}

test('a brand signs up and reaches its dashboard', async ({ page }) => {
	const noErrors = watchErrors(page);
	await startSignup(page, 'brand', `signup-brand${Date.now()}@example.test`);
	await page.fill('#bf-n', 'Test Botanicals');
	await page.fill('#bf-you', 'Test Person');
	await page.click('button:has-text("Create my brand account")');
	await page.waitForURL((u) => u.pathname.startsWith('/brand'));
	await page.waitForLoadState('networkidle');
	await expect(page.locator('h1').first()).toBeVisible();
	noErrors();
});

test('a creator signs up and waits for review', async ({ page }) => {
	const noErrors = watchErrors(page);
	const n = Date.now().toString(36);
	await startSignup(page, 'creator', `signup-creator${n}@example.test`);
	await page.fill('#cf-name', 'Test Creator');
	await page.fill('#cf-ig', `test.creator.${n}`);
	await page.fill('#cf-wa', '+91 98450 00000');
	await page.fill('#cf-city', 'Bengaluru');
	await page.click('button.su-chip:has-text("Travel")');
	await page.selectOption('#cf-f', 'Under 10K');
	await page.click('button:has-text("Create my page")');
	// (The test database approves by hand; live approves straight away, migration 163.)
	await expect(page.getByText('is in.')).toBeVisible();
	noErrors();
});
