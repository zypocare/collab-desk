// Automatic checks of the main flows, run against the local database (npx supabase start) with
// its seed data. Locally: start the dev server, then `npm run test:e2e`. On GitHub: see
// .github/workflows/checks.yml. Set BASE_URL to test another address, PW_CHROME to use an
// already-installed Chrome.
import { defineConfig, devices } from '@playwright/test';

const chrome = process.env.PW_CHROME;

export default defineConfig({
	testDir: './tests/e2e',
	timeout: 60_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		...(chrome ? { launchOptions: { executablePath: chrome } } : {})
	},
	// Uses the dev server if it's already running, otherwise starts one.
	webServer: process.env.BASE_URL ? undefined : { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 120_000 },
	projects: [
		{ name: 'laptop', use: { viewport: { width: 1440, height: 950 } }, testIgnore: /phone\.spec/ },
		{ name: 'phone', use: { ...devices['Pixel 7'], ...(chrome ? { launchOptions: { executablePath: chrome } } : {}) }, testMatch: /phone\.spec/ }
	]
});
