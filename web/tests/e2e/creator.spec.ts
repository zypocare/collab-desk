import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fakeAi, signIn, watchErrors } from './helpers';

test.beforeEach(async ({ page }) => {
	await fakeAi(page);
	await signIn(page);
});

test('Today loads with the AI assistant', async ({ page }) => {
	const noErrors = watchErrors(page);
	await page.goto('/studio');
	await expect(page.getByRole('heading', { name: 'Needs you' })).toBeVisible();
	await expect(page.getByText(/^Desk AI/).first()).toBeVisible();
	noErrors();
});

test('add a collab from a pasted DM, score it, and send a quote', async ({ page }) => {
	const noErrors = watchErrors(page);
	const brand = `Testbrand${Date.now().toString().slice(-6)}`;
	await page.goto('/studio');
	await page.locator('button:has-text("New collab"), button:has-text("Add collab")').first().click();
	await page.fill('#nc-paste', `Team ${brand} here! We'd love 1 reel and 2 stories for our launch. Budget 30k, live by 25 Dec. Write to us at ${brand.toLowerCase()}@example.test`);
	await expect(page.locator('#nc-brand')).toHaveValue(brand);
	await expect(page.locator('.dm-found')).toContainText('1 Reel');
	await expect(page.locator('.dm-found')).toContainText(`${brand.toLowerCase()}@example.test`);
	await page.locator('.dialog button[type=submit]').click();

	// It opens, with the "Should you take it?" score.
	await expect(page.getByText(brand).first()).toBeVisible();
	await expect(page.locator('.dec-sec')).toBeVisible();
	await expect(page.locator('.dec-sec .score-ring b')).toHaveText(/\d+/);
	await page.getByRole('button', { name: 'See the full report' }).click();
	await expect(page.locator('.dec-report')).toContainText('The money');
	await page.keyboard.press('Escape');

	// Quote: build it and send it.
	await page.getByRole('button', { name: /Build quote/ }).first().click();
	await expect(page.locator('.quote-dialog')).toBeVisible();
	await page.locator('.quote-dialog').getByRole('button', { name: /Send/ }).last().click();
	await expect(page.getByText('Waiting for brand').first()).toBeVisible();
	noErrors();
});

test('reports: month review and quarter pack', async ({ page }) => {
	const noErrors = watchErrors(page);
	await page.goto('/studio/reports');
	await expect(page.locator('#month-review')).toBeVisible();
	await expect(page.getByText('Quarter pack for your CA')).toBeVisible();
	const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download quarter pack' }).click()]);
	const zip = readFileSync((await download.path())!);
	expect(zip.subarray(0, 2).toString()).toBe('PK');
	expect(zip.toString('latin1')).toContain('0 Summary.csv');
	noErrors();
});

test('settings pages open', async ({ page }) => {
	const noErrors = watchErrors(page);
	for (const s of ['rates', 'bookings', 'payments', 'account']) {
		await page.goto(`/studio/settings?s=${s}`);
		await expect(page.locator('main h2:visible').first()).toBeVisible();
	}
	await page.goto('/studio/settings?s=bookings');
	await expect(page.getByText('Deciding on a collab')).toBeVisible();
	noErrors();
});

test('QR codes: make one, style it, download it, and a scan opens the page', async ({ page }) => {
	const noErrors = watchErrors(page);
	await page.goto('/studio/qr');
	await page.getByRole('button', { name: /New QR code|Make a QR code/ }).first().click();
	await expect(page.locator('.qr-stage canvas')).toBeVisible();
	await page.getByRole('button', { name: 'Soft squares', exact: true }).click();
	await page.getByRole('button', { name: 'Cerise', exact: true }).click();
	const [svg] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'SVG for print' }).click()]);
	expect(readFileSync((await svg.path())!).toString()).toContain('<svg');
	const link = (await page.locator('.qr-url').textContent())!.trim();
	const slug = link.split('/q/')[1];
	await page.goto(`/q/${slug}`);
	await page.waitForURL((u) => u.searchParams.get('qr') === slug);
	noErrors();
});
