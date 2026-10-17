import { expect, type Page } from '@playwright/test';

// The local email catcher (Mailpit) that comes with `npx supabase start`.
const MAIL = process.env.MAIL_URL ?? 'http://127.0.0.1:54324';
export const CREATOR = 'creator@example.test';

async function codeFor(email: string, after: Date) {
	for (let i = 0; i < 40; i++) {
		const list = (await (await fetch(`${MAIL}/api/v1/messages?limit=20`)).json()) as { messages: { ID: string; To: { Address: string }[]; Created: string }[] };
		const m = list.messages.find((x) => x.To.some((t) => t.Address === email) && new Date(x.Created) > after);
		if (m) {
			const body = (await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json()) as { Text: string };
			const code = body.Text.match(/\b\d{6}\b/)?.[0];
			if (code) return code;
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`No sign-in code arrived for ${email}`);
}

/** Sign in with an email code, the way she does. */
export async function signIn(page: Page, email = CREATOR) {
	const t0 = new Date(Date.now() - 3000);
	await page.goto('/login');
	await page.fill('input[type=email]', email);
	await page.press('input[type=email]', 'Enter');
	await expect(page.getByText('Check your email')).toBeVisible();
	const box = page.locator('input:visible').first();
	await box.fill(await codeFor(email, t0));
	await box.press('Enter');
	await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** Fail the test on any uncaught error in the page. */
export function watchErrors(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	return () => expect(errors, 'errors in the page').toEqual([]);
}

/** The AI only runs on the live site: answer like it would, so flows that use it can be tested. */
export async function fakeAi(page: Page) {
	await page.route('**/api/ai/**', async (route) => {
		const kind = new URL(route.request().url()).pathname.split('/').pop();
		const body =
			kind === 'status'
				? { pct: 90, gemini: false }
				: kind === 'fit'
					? { ai: { visit: false, outfit: 'own', makeup: 'natural', looks: 1, fit: 7, red_flags: [], good_signs: [], questions: [], summary: 'Test read.' }, travel: null, read_at: new Date().toISOString() }
					: kind === 'summary'
						? { headline: 'A steady month', wins: ['Test win'], watch: [], actions: ['Test action'] }
						: { error: 'Not in tests.' };
		await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
	});
}

/** No sideways scrolling: nothing wider than the screen. */
export async function noSidewaysScroll(page: Page) {
	const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
	expect(w[0], 'page is wider than the screen').toBeLessThanOrEqual(w[1] + 1);
}
