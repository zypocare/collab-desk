import { expect, test } from '@playwright/test';

test('public profile explains audience engagement and respects Insights sharing', async ({ page }) => {
	const profile = { display_name: 'Test Creator', handle: 'test', accepting: true, worked_with: [], engagement: '2.58%', instagram: { followers: 20045 } };
	const totals = { accounts_engaged: 3159, reach: 27150 };
	const insights = { totals, from: '2026-10-23', to: '2026-11-22', formats: { reels: { er: 2.58, posts: 12 } } };
	let shared = true;
	await page.route('**/rest/v1/rpc/public_page', route => route.fulfill({ json: profile }));
	await page.route('**/rest/v1/rpc/page_extras', route => route.fulfill({ json: {} }));
	await page.route('**/rest/v1/rpc/public_insights', route => route.fulfill({
		contentType: 'application/json',
		body: JSON.stringify(shared ? { ...profile, insights, followers: 20045, history: [], top: [], demographics: {} } : null)
	}));
	await page.goto('/?preview=1');
	const card = page.locator('.mp-card').filter({ hasText: 'Instagram today' });
	const summary = card.locator('summary').filter({ hasText: '11.6% engagement rate' });
	const calculation = card.getByText('3,159 accounts engaged ÷ 27,150 accounts reached × 100 = 11.6%');
	for (const width of [1440, 320]) {
		await page.setViewportSize({ width, height: 900 });
		await expect(summary).toContainText('Last 30 days');
		await expect(page.locator('.audience-rate')).toHaveCount(1);
		const followers = await card.locator('.mp-num').boundingBox();
		const badge = await summary.boundingBox();
		expect(followers!.x + followers!.width).toBeLessThanOrEqual(badge!.x);
		await summary.click();
		await expect(calculation).toBeVisible();
		const insets = await calculation.evaluate(el => {
			const card = el.closest('.mp-card')!.getBoundingClientRect();
			const formula = el.getBoundingClientRect();
			return { left: formula.left - card.left, right: card.right - formula.right };
		});
		expect(insets.left).toBeGreaterThanOrEqual(0);
		expect(insets.right).toBeGreaterThanOrEqual(-1);
		expect(await calculation.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
		await summary.press('Enter');
		await expect(calculation).toBeHidden();
	}
	await page.goto('/insights');
	const reelKpi = page.locator('.ins-kpi').filter({ hasText: 'Reels engagement by followers' });
	await expect(reelKpi).toContainText('2.58%');
	await expect(reelKpi).toContainText('Last 12 Reels');
	shared = false;
	await page.goto('/?preview=1');
	await expect(page.getByText('Open for collabs', { exact: true })).toBeVisible();
	await expect(page.locator('.audience-rate')).toHaveCount(0);
});
