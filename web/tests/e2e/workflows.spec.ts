import { expect, test } from '@playwright/test';
import { fakeAi, noSidewaysScroll, signIn, watchErrors } from './helpers';

test.beforeEach(async ({ page }) => {
	// Optional isolated PostgREST instance; authentication still uses the local email catcher.
	if (process.env.WORKFLOW_REST_URL) {
		await page.route('**/rest/v1/**', async (route) => {
			const url = new URL(route.request().url());
			const response = await route.fetch({ url: `${process.env.WORKFLOW_REST_URL}${url.pathname.replace('/rest/v1', '')}${url.search}` });
			await route.fulfill({ response });
		});
	}
	await fakeAi(page);
	await signIn(page);
});

test.afterEach(async ({ page }) => {
	await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('individual progress persists through live, pause, resume and cancellation', async ({ page }) => {
	const noErrors = watchErrors(page);
	await page.goto('/studio');
	await expect(page.locator('nav[aria-label="Main"]').first()).toBeVisible();
	const fixture = await page.evaluate(async () => {
		// @ts-expect-error Browser-only Vite module URL.
		const { supabase } = await import('/src/lib/supabase.ts');
		const { data: b, error: be } = await supabase.from('brands').insert({ name: `Workflow ${Date.now()}` }).select('id').single();
		if (be) throw be;
		const { data: c, error: ce } = await supabase.from('collabs').insert({ brand_id: b.id, code: '', stage: 'creating', fee: 1000, notify_brand: false }).select('id, code').single();
		if (ce) throw ce;
		const { error: de } = await supabase.from('deliverables').insert({ collab_id: c.id, kind: 'Story', qty: 3 });
		if (de) throw de;
		const { error: ie } = await supabase.from('invoices').insert({ collab_id: c.id, items: [{ description: 'Story package', qty: 1, rate: 1000 }], status: 'sent', tax_mode: 'none' });
		if (ie) throw ie;
		return c;
	});
	await page.goto(`/studio/c/${fixture.code}`);
	await expect(page.getByRole('heading', { name: /Deliverables.*0 of 3 done/ })).toBeVisible();
	const first = page.getByRole('group', { name: 'Story 1', exact: true });
	await first.getByLabel('Status', { exact: true }).click();
	await page.getByRole('option', { name: 'Published', exact: true }).click();
	await expect(page.getByRole('heading', { name: /Deliverables.*1 of 3 done/ })).toBeVisible();
	await first.getByLabel('Assigned to').fill('Editor');
	await first.getByLabel('Assigned to').press('Tab');
	await expect(first.getByLabel('Assigned to')).toBeEnabled();
	await page.reload();
	await expect(page.getByRole('heading', { name: /Deliverables.*1 of 3 done/ })).toBeVisible();
	await expect(first.getByLabel('Assigned to')).toHaveValue('Editor');
	await page.getByRole('button', { name: 'Live', exact: true }).click();
	const force = page.getByRole('button', { name: 'Move to Live anyway' });
	if (await force.isVisible()) await force.click();
	await expect(page.getByRole('heading', { name: /Deliverables.*1 of 3 done/ })).toBeVisible();
	await page.getByRole('button', { name: 'Pause collaboration', exact: true }).click();
	let dialog = page.getByRole('dialog', { name: 'Pause collaboration' });
	await dialog.getByLabel('Reason').fill('Waiting for the next shipment');
	await dialog.getByRole('button', { name: 'Pause collaboration' }).click();
	await expect(page.getByRole('button', { name: 'Resume collaboration' })).toBeVisible();
	await expect(first.getByLabel('Status', { exact: true })).toBeDisabled();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Resume collaboration' })).toBeVisible();
	await page.getByRole('button', { name: 'Resume collaboration' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Resume', exact: true }).click();
	await expect(first.getByLabel('Status', { exact: true })).toBeEnabled();
	await page.getByRole('button', { name: 'Cancel collaboration', exact: true }).click();
	dialog = page.getByRole('dialog', { name: 'Cancel collaboration' });
	await dialog.getByLabel('Reason').fill('Campaign ended');
	await dialog.getByRole('button', { name: 'Cancel collaboration' }).click();
	await expect(page.getByRole('button', { name: 'Reopen collaboration' })).toBeVisible();
	await expect(page.getByRole('heading', { name: /Deliverables.*1 of 3 done/ })).toBeVisible();
	await expect(page.locator('#sec-pay')).toContainText('1,000');
	await page.setViewportSize({ width: 390, height: 844 });
	await noSidewaysScroll(page);
	await page.screenshot({ path: 'test-results/workflow-mobile.png' });
	noErrors();
});

// Needs more than 25 collabs for the test creator: supabase/tests/fixtures/pagination.sql adds them (the
// nightly Checks run does it before the tests; run it once by hand after a local `supabase db reset`).
test('list pagination keeps all records available and reports request complete server totals', async ({ page }) => {
	const noErrors = watchErrors(page);
	await page.goto('/studio/collabs');
	await page.getByRole('button', { name: 'List', exact: true }).click();
	const pagination = page.getByRole('navigation', { name: 'Collaboration pages' });
	await expect(pagination).toBeVisible();
	await expect(page.locator('.ct tbody tr')).toHaveCount(25);
	await pagination.getByRole('button', { name: 'Next' }).click();
	await expect(pagination).toContainText('Page 2');
	const response = page.waitForResponse((r) => r.url().includes('/rpc/financial_report') && r.request().postDataJSON()?.p_start);
	await page.goto('/studio/reports');
	expect((await response).ok()).toBeTruthy();
	await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
	noErrors();
});
