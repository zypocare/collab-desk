import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
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

test('phone invoices keep payment compact and show readable items without sideways scrolling', async ({ page }) => {
	await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36' }));
	await page.route('**/rest/v1/rpc/public_invoice', (route) => route.fulfill({ json: {
		...invoice, due_date: '2026-11-11',
		seller: { ...invoice.seller, name: 'Niveditha Prakash', upi_id: 'nivedithadevegowda@ybl' },
		items: [{ description: 'Content collaboration: one Instagram Reel with a detailed campaign description and usage rights (BROWN-001)', qty: 1, rate: 10000 }]
	} }));
	for (const width of [320, 390]) {
		await page.setViewportSize({ width, height: 844 });
		await page.goto('/invoice/test-invoice');
		await expect(page.locator('.inv-doc h1')).toHaveText('Niveditha Prakash');
		await expect(page.locator('.upi-qr')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Hide payment QR' })).toHaveAttribute('aria-expanded', 'true');
		await noSidewaysScroll(page);
		await expect(page.locator('.doc-table tbody tr')).toHaveCSS('display', 'grid');
		await expect(page.getByRole('link', { name: 'Pay with UPI app' })).toBeVisible();
		for (const theme of ['dark', 'light']) {
			await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, theme);
			await noSidewaysScroll(page);
			await page.screenshot({ path: test.info().outputPath(`invoice-${width}-${theme}.png`), fullPage: true });
		}
		await page.getByRole('button', { name: 'Hide payment QR' }).click();
		await expect(page.locator('.upi-qr')).not.toBeVisible();
		await page.getByRole('button', { name: 'Scan or download payment QR' }).click();
		await expect(page.getByRole('img', { name: /UPI QR code/ })).toBeVisible();
		await noSidewaysScroll(page);
		await page.emulateMedia({ media: 'print' });
		await expect(page.locator('.doc-table tbody tr')).toHaveCSS('display', 'table-row');
		await page.emulateMedia({ media: 'screen' });
	}
});

test('browser invoice PDF still downloads as a valid PDF', async ({ page }) => {
	await page.route('**/rest/v1/rpc/public_invoice', (route) => route.fulfill({ json: invoice }));
	await page.goto('/invoice/test-invoice');
	const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()]);
	expect(download.suggestedFilename()).toBe('INV-26-27-001.pdf');
	const pdf = await PDFDocument.load(readFileSync((await download.path())!));
	expect(pdf.getPageCount()).toBeGreaterThan(0);
});

test('native invoice PDF and QR go to the phone saver and wait for completion', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.addInitScript(() => {
		const state = window as any;
		sessionStorage.setItem('mc-intro', '1');
		state.__savedFiles = [];
		state.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
			FileSharer: { save: (options: unknown) => new Promise((resolve) => {
				state.__savedFiles.push(options);
				state.__finishSave = resolve;
			}) }
		} };
	});
	await page.route('**/rest/v1/rpc/public_invoice', (route) => route.fulfill({ json: invoice }));
	await page.goto('/invoice/test-invoice');
	await page.getByRole('button', { name: 'Download PDF' }).click();
	await expect.poll(() => page.evaluate(() => (window as any).__savedFiles.length)).toBe(1);
	await expect(page.getByRole('button', { name: 'Saving PDF…' })).toBeDisabled();
	const pdfFile = await page.evaluate(() => (window as any).__savedFiles[0]);
	expect(pdfFile.filename).toBe('INV-26-27-001.pdf');
	expect(pdfFile.contentType).toBe('application/pdf');
	expect(pdfFile.android.saveDirectory).toBe('downloads');
	expect((await PDFDocument.load(Buffer.from(pdfFile.base64Data, 'base64'))).getPageCount()).toBeGreaterThan(0);
	await page.evaluate(() => (window as any).__finishSave({ uri: 'content://downloads/invoice' }));
	await expect(page.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
	await expect(page.locator('.toasts')).toContainText('Saved to Downloads');
	await expect(page.locator('.upi-qr')).toBeVisible();
	await page.getByRole('button', { name: 'Download UPI QR' }).click();
	await expect.poll(() => page.evaluate(() => (window as any).__savedFiles.length)).toBe(2);
	const qrFile = await page.evaluate(() => (window as any).__savedFiles[1]);
	expect(qrFile.contentType).toBe('image/png');
	expect([...Buffer.from(qrFile.base64Data, 'base64').subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
	await page.evaluate(() => (window as any).__finishSave({ uri: 'content://downloads/qr' }));
	await expect(page.getByRole('button', { name: 'Download UPI QR' })).toBeEnabled();
});

test('native save errors reach the invoice UI and iPhone cancellation is quiet', async ({ page }) => {
	await page.addInitScript(() => {
		const state = window as any;
		sessionStorage.setItem('mc-intro', '1');
		state.__saveError = 'Storage is full';
		state.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {
			FileSharer: { save: async () => { throw new Error(state.__saveError); } }
		} };
	});
	await page.route('**/rest/v1/rpc/public_invoice', (route) => route.fulfill({ json: invoice }));
	await page.goto('/invoice/test-invoice');
	await page.getByRole('button', { name: 'Download PDF' }).click();
	await expect(page.locator('.toasts')).toContainText('Storage is full');
	await expect(page.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
	await expect(page.locator('.toasts .toast')).toHaveCount(0);
	await page.evaluate(() => { (window as any).__saveError = 'USER_CANCELLED'; });
	await page.getByRole('button', { name: 'Download PDF' }).click();
	await expect(page.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
	await expect(page.locator('.toasts')).toBeEmpty();
});

test('older Android phones use file sharing without requesting storage access', async ({ page }) => {
	await page.addInitScript(() => {
		const state = window as any;
		sessionStorage.setItem('mc-intro', '1');
		Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 9) Mobile MiracleApp' });
		state.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
			FileSharer: {
				save: async () => { throw new Error('Legacy storage should not be used'); },
				share: async (file: unknown) => { state.__sharedFile = file; }
			}
		} };
	});
	await page.route('**/rest/v1/rpc/public_invoice', (route) => route.fulfill({ json: invoice }));
	await page.goto('/invoice/test-invoice');
	await page.getByRole('button', { name: 'Download PDF' }).click();
	await expect.poll(() => page.evaluate(() => (window as any).__sharedFile?.filename)).toBe('INV-26-27-001.pdf');
	await expect(page.locator('.toasts')).toBeEmpty();
});
