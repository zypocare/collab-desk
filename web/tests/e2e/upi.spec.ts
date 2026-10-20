import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { noSidewaysScroll, watchErrors } from './helpers';

const invoice = {
	number: 'INV/26-27/001', kind: 'full', currency: 'INR', issue_date: '2026-10-20', due_date: null,
	items: [{ description: 'Collaboration', qty: 1, rate: 10000 }], subtotal: 10000,
	tax_mode: 'none', gst_rate: 0, cgst: 0, sgst: 0, igst: 0, total: 10000,
	tds_rate: 10, tds_amount: 1000, payable: 9000, amount_received: 3000, tds_deducted: 1000,
	paid_on: null, status: 'partly_paid', notes: '', token: 'test-invoice',
	seller: { name: 'Test Creator', display_name: 'Test Creator', handle: '', pan: '', gstin: '', sac: '', address: '', state: '', email: 'creator@example.test', upi_id: 'creator@upi', bank_details: '', footer: '', gst_registered: false },
	bill_to: { name: 'Test Brand', gstin: '', address: '', state: '', contact: '', email: 'brand@example.test', code: 'TEST-1' }
};

test('invoice offers a free downloadable PNG for its exact unpaid UPI amount', async ({ page }) => {
	const noErrors = watchErrors(page);
	await page.route('**/rest/v1/rpc/public_invoice', (route) => route.fulfill({ json: invoice }));
	await page.goto('/invoice/test-invoice');
	await expect(page.getByRole('img', { name: 'UPI QR code for INR 6000.00 payable to creator@upi' })).toBeVisible();
	const [download] = await Promise.all([
		page.waitForEvent('download'), page.getByRole('button', { name: 'Download UPI QR' }).click()
	]);
	expect(download.suggestedFilename()).toBe('upi-payment-6000.00.png');
	const png = readFileSync((await download.path())!);
	expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
	expect(png.readUInt32BE(16)).toBe(png.readUInt32BE(20));
	expect(png.readUInt32BE(16)).toBeGreaterThan(300);
	await page.setViewportSize({ width: 390, height: 844 });
	await noSidewaysScroll(page);
	noErrors();
});

test('settled and foreign invoices do not display UPI payment QR codes', async ({ page }) => {
	for (const change of [{ status: 'paid' }, { status: 'cancelled' }, { currency: 'USD' }]) {
		await page.route('**/rest/v1/rpc/public_invoice', (route) => route.fulfill({ json: { ...invoice, ...change } }));
		await page.goto('/invoice/test-invoice');
		await expect(page.getByRole('heading', { name: 'Test Creator', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Download UPI QR' })).toHaveCount(0);
		await page.unrouteAll({ behavior: 'ignoreErrors' });
	}
});
