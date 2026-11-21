import { expect, test, type Page } from '@playwright/test';

declare global {
	interface Window {
		homeTest: { received: (value: number) => void; destroy: () => Promise<void> };
	}
}

async function mountHome(page: Page) {
	await page.setViewportSize({ width: 393, height: 852 });
	// Keep this component test independent of accounts and live services.
	await page.route('https://**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
	await page.route('**/__home-motion', (route) => route.fulfill({
		contentType: 'text/html',
		body: '<!doctype html><html data-side="studio" data-desk="studio" data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main style="padding:16px;overflow:clip"></main></body></html>'
	}));
	await page.goto('/__home-motion');
	await page.evaluate(async () => {
		for (const file of ['app', 'brand', 'studio', 'desk', 'pro', 'mobile-type', 'mobile', 'atelier', 'dash', 'cred', 'today']) await import(`/src/${file}.css`);
		const statePath = '/src/lib/studio.svelte.ts';
		const { studio } = await import(statePath);
		const utilPath = '/src/lib/util.ts';
		const { rel } = await import(utilPath);
		studio.settings = { id: 'motion-test', handle: 'asha', display_name: 'Asha Sharma', monthly_goal: 100000, weekly_capacity: 3, rates: {}, site_url: 'https://example.test/asha' };
		localStorage.setItem('cd-setup-hide-motion-test', '1');
		studio.extras = true;
		studio.leads = [{ igsid: 'lead-1', username: 'north.studio', name: 'North Studio', collab_flag: 'likely', collab_hint: 'Interested in a café reel', last_at: new Date().toISOString(), unread: 1 }];
		studio.collabs = [
			{ name: 'Lumière', fee: 48000, stage: 'wrapped', pay_status: 'paid', pay_received: 48000, paid_on: rel(0) },
			{ name: 'FLO', fee: 15000, stage: 'live', pay_status: 'invoiced', pay_due: rel(-3) },
			{ name: 'Dot & Key', fee: 20000, stage: 'creating', draft_date: rel(0), live_date: rel(2), pay_due: rel(4) },
			{ name: 'Hairspeak', fee: 12000, stage: 'confirmed', shoot_date: rel(1), pay_due: rel(5) },
			{ name: 'Food Fest', fee: 5000, stage: 'negotiating', follow_date: rel(0), follow_note: 'Confirm the brief' }
		].map((data, i) => ({
			id: `collab-${i}`, code: `code-${i}`, brand_id: `brand-${i}`, brand: { id: `brand-${i}`, name: data.name },
			type: 'paid', pay_status: 'pending', pay_received: 0, received_on: rel(-4),
			deliverables: [{ id: `d-${i}`, kind: 'Reel', qty: 1, done: false }],
			quotes: [], drafts: [], invoices: [], messages: [], reads: [], reports: [], posts: [], expenses: [], events: [], ...data
		}));
		const checksPath = '/src/lib/checkup.svelte.ts';
		const { checkups } = await import(checksPath);
		checkups.loaded = true;
		const phonePath = '/src/lib/phone.svelte.ts';
		const { startPhone } = await import(phonePath);
		const stopPhone = startPhone(async () => {});
		const componentPath = '/src/routes/studio/+page.svelte';
		const { default: Home } = await import(componentPath);
		const source = await (await fetch('/src/lib/components/PhoneToday.svelte')).text();
		const runtime = source.match(/from\s+["']([^"']*\/svelte\.js[^"']*)["']/)?.[1];
		if (!runtime) throw new Error('Could not find the component runtime');
		const { mount, unmount } = await import(runtime);
		const component = mount(Home, { target: document.querySelector('main')! });
		window.homeTest = { received: (value) => studio.collabs[0].pay_received = value, destroy: async () => { stopPhone(); await unmount(component); } };
	});
	await expect(page.locator('.phone-today')).toBeVisible();
}

test('creator story rings open account summaries and the visible collab rail filters real next steps and DMs', async ({ page }) => {
	await mountHome(page);
	const stories = page.getByRole('navigation', { name: 'Creator stories' });
	await expect(stories.getByRole('button')).toHaveText(['Wrapped', 'AI Tips', 'Due soon', 'Top Reel', 'Briefs']);
	for (const [label, content] of [
		['Wrapped', '₹48,000'], ['AI Tips', 'posting time'], ['Due soon', '₹15,000 overdue'],
		['Top Reel', 'Your reel highlights'], ['Briefs', 'Open brand briefs']
	]) {
		const trigger = stories.getByRole('button', { name: label, exact: true });
		await trigger.click();
		await expect(page.getByRole('dialog')).toContainText(content);
		await page.getByRole('button', { name: 'Got it' }).click();
		await expect(trigger).toBeFocused();
	}
	const rail = page.getByRole('region', { name: 'Your collabs' });
	await expect(rail).toBeVisible();
	await expect(rail.getByRole('link', { name: 'See board' })).toHaveAttribute('href', '/studio/collabs');
	await expect(rail.getByRole('button', { name: 'All active 4' })).toHaveAttribute('aria-pressed', 'true');
	await expect(rail.locator('.tix-row a')).toHaveCount(4);
	await rail.getByRole('button', { name: /Needs action/ }).click();
	await expect(rail.getByRole('link', { name: /Dot & Key/ })).toHaveAccessibleName(/Send draft/);
	await rail.getByRole('button', { name: 'DM leads 1' }).click();
	await expect(rail.locator('.tix-row a')).toHaveCount(1);
	await expect(rail.getByRole('link', { name: /North Studio/ })).toHaveAttribute('href', '/studio/inbox/ig/lead-1');
	await expect(rail.locator('.lead-meta')).toContainText('@north.studio');
	await page.evaluate(async () => {
		const path = '/src/lib/studio.svelte.ts';
		(await import(path)).studio.leads = [];
	});
	await expect(rail.getByRole('button', { name: 'DM leads 0' })).toHaveAttribute('aria-pressed', 'true');
	await expect(rail.locator('.rail-empty')).toHaveText('No Instagram leads to review.');
});

test('Needs you shows one next action and the latest conversation message per collaboration', async ({ page }) => {
	await mountHome(page);
	await page.evaluate(async () => {
		const path = '/src/lib/studio.svelte.ts';
		const { studio } = await import(path);
		const thread = [
			{ id: 'm1', sender: 'brand', body: 'First draft received', created_at: '2026-11-19T10:00:00Z' },
			{ id: 'm2', sender: 'brand', body: 'Please update the caption', created_at: '2026-11-19T10:30:00Z' }
		];
		studio.collabs[2].messages = thread;
		// A completed collaboration with an already-read conversation needs no action.
		studio.collabs[0].messages = thread;
		studio.collabs[0].reads = [{ side: 'creator', read_at: '2026-11-20T10:00:00Z' }];
	});
	const needs = page.locator('#sec-needs');
	await needs.getByRole('button', { name: 'Show all 4' }).click();
	await expect(needs.locator('.tk')).toHaveCount(4);
	const ticket = needs.locator('.tk').filter({ has: page.locator('.tk-who', { hasText: 'Dot & Key' }) });
	await expect(ticket).toHaveCount(1);
	await expect(ticket.locator('.tk-latest')).toHaveText('Dot & Key: Please update the caption');
	await expect(ticket.locator('.tk-latest')).toHaveAttribute('href', '/studio/inbox/code-2');
	await expect(needs).not.toContainText('First draft received');
	await expect(needs).not.toContainText('Lumière');
	await page.evaluate(async () => {
		const path = '/src/lib/studio.svelte.ts';
		const { studio } = await import(path);
		studio.collabs[2].messages.push({ id: 'm3', sender: 'creator', body: 'Caption updated', created_at: '2026-11-20T11:00:00Z' });
		studio.collabs[2].reads = [{ side: 'creator', read_at: '2026-11-20T11:00:00Z' }];
	});
	await expect(ticket.locator('.tk-latest')).toHaveText('You: Caption updated');
	await expect(ticket.locator('.tk-task')).toContainText('Send draft');
	await expect(needs.locator('.tk')).toHaveCount(4);
});

test('money swipes, real balances, ticket expansion and day changes respond without accidental navigation', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await mountHome(page);
	const card = page.locator('.m-hero');
	await card.scrollIntoViewIfNeeded();
	await expect(card.locator('.hc-val')).toHaveText('₹48,000');
	await expect(card.locator('.g-txt b')).toHaveText('48%');
	const box = (await card.boundingBox())!;
	await page.mouse.move(box.x + box.width - 40, box.y + 80);
	await page.mouse.down();
	await page.mouse.move(box.x + 35, box.y + 80, { steps: 12 });
	await page.mouse.up();
	await expect(card.locator('.hc-eb')).toHaveText('Yet to come');
	await expect(card.locator('.hc-val')).toHaveText('₹47,000');
	await expect(page).toHaveURL(/__home-motion$/);
	await card.getByRole('button', { name: 'Overdue payments', exact: true }).click();
	await expect(card.locator('.hc-val')).toHaveText('₹15,000');
	await card.getByRole('button', { name: 'Next payout', exact: true }).click();
	await expect(card.locator('.hc-val')).toHaveText('₹20,000');
	await expect(card.locator('.hc-sub')).toContainText('Dot & Key');
	await card.getByRole('button', { name: /^Received in/ }).click();
	await page.evaluate(() => window.homeTest.received(55000));
	await expect(card.locator('.hc-val')).toHaveText('₹55,000');
	await expect(card.locator('.g-txt b')).toHaveText('55%');
	await expect(card.locator('.glass-chip')).toHaveAttribute('href', '/studio/settings?s=payments');
	await expect(page.locator('.tk')).toHaveCount(2);
	const more = page.getByRole('button', { name: /more$/ });
	await more.click();
	await expect(page.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
	expect(await page.locator('.tk').count()).toBeGreaterThan(2);
	await page.getByRole('button', { name: 'Show less' }).click();
	await expect(page.locator('.tk')).toHaveCount(2);
	await page.getByRole('tab').nth(1).click();
	await expect(page.getByRole('tabpanel')).toContainText('Hairspeak');
	await expect(page.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
	// A normal tap still follows the card's original Money link.
	await card.getByRole('button', { name: /^Received in/ }).click();
	await page.route('**/studio/money', (route) => route.fulfill({ contentType: 'text/html', body: '<p>Money opened</p>' }));
	await card.locator('.hc-go').click({ position: { x: 40, y: 80 } });
	await expect(page).toHaveURL(/\/studio\/money$/);
	expect(errors).toEqual([]);
});

test('ambient motion runs visibly, pauses off screen and in the background, and the ticker can pause', async ({ page }) => {
	await mountHome(page);
	await expect(page.locator('.ht')).toHaveAttribute('data-home-active', 'true');
	const ring = page.locator('.orb-ring');
	expect(await ring.evaluate((node) => getComputedStyle(node).animationPlayState)).toBe('running');
	const transform = await ring.evaluate((node) => getComputedStyle(node).transform);
	await expect.poll(() => ring.evaluate((node) => getComputedStyle(node).transform)).not.toBe(transform);
	const story = page.locator('.story-ring').first();
	const orbit = () => story.evaluate((node) => getComputedStyle(node, '::before').transform);
	const start = await orbit();
	await expect.poll(orbit).not.toBe(start);
	await page.getByRole('button', { name: 'Pause numbers ticker' }).click();
	expect(await page.locator('.cr-ticker > div').evaluate((node) => getComputedStyle(node).animationPlayState)).toBe('paused');
	await page.getByRole('button', { name: 'Resume numbers ticker' }).click();
	await page.locator('.wk2').scrollIntoViewIfNeeded();
	await expect(page.locator('.ht')).toHaveAttribute('data-home-active', 'false');
	await expect.poll(() => story.evaluate(node => getComputedStyle(node, '::before').animationPlayState)).toBe('paused');
	expect(await ring.evaluate((node) => getComputedStyle(node).animationPlayState)).toBe('paused');
	await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
	await expect(page.locator('.phone-today')).toHaveAttribute('data-home-paused', 'true');
	await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
	await expect(page.locator('.phone-today')).toHaveAttribute('data-home-paused', 'false');
});

test('phone touch swipes browse collabs and money horizontally and scroll the page vertically', async ({ page }) => {
	await mountHome(page);
	const card = page.locator('.m-hero');
	await card.scrollIntoViewIfNeeded();
	await expect(card.locator('.hc-val')).toHaveText('₹48,000');
	const touch = await page.context().newCDPSession(page);
	const swipe = async (target: typeof card, dx: number, dy: number) => {
		const rect = (await target.boundingBox())!;
		const x = rect.x + rect.width * .7, y = rect.y + Math.min(105, rect.height / 2);
		await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
		for (let i = 1; i <= 10; i++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 10, y: y + dy * i / 10 }] });
		await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	};
	await swipe(card, -150, 3);
	await expect(card.locator('.hc-eb')).toHaveText('Yet to come');
	await expect(page).toHaveURL(/__home-motion$/);
	const before = await page.evaluate(() => scrollY);
	await swipe(card, 2, -170);
	await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 30);
	await expect(card.locator('.hc-eb')).toHaveText('Yet to come');
	const rail = page.locator('#sec-collabs .tix-row');
	await rail.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
	await expect.poll(() => rail.evaluate(node => node.scrollHeight - node.clientHeight)).toBe(0);
	await swipe(rail, -160, 6);
	await expect.poll(() => rail.evaluate(node => node.scrollLeft)).toBeGreaterThan(30);
	const pageY = await page.evaluate(() => scrollY);
	await swipe(rail, -18, -165);
	await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(pageY + 60);
	expect(await rail.evaluate(node => node.scrollTop)).toBe(0);
	await expect(page).toHaveURL(/__home-motion$/);
	await touch.detach();
});

test('reduced motion gives final numbers and narrow screens keep every action accessible', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await mountHome(page);
	await expect(page.locator('.hc-val')).toHaveText('₹48,000');
	await expect(page.locator('.g-prog')).toHaveCSS('stroke-dashoffset', '52px');
	await expect(page.locator('.phone-today')).toHaveAttribute('data-home-paused', 'true');
	expect(await page.locator('.orb-ring').evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
	expect(await page.locator('.story-ring').first().evaluate(node => getComputedStyle(node, '::before').animationName)).toBe('none');
	for (const theme of ['light', 'dark']) {
		await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
		for (const width of [320, 360, 430]) {
			await page.setViewportSize({ width, height: 852 });
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
			const pills = page.locator('.ht-chips');
			await expect(pills.locator('a')).toHaveCount(3);
			expect(await pills.evaluate(row => row.scrollWidth - row.clientWidth)).toBeLessThanOrEqual(1);
			const pillTops = await pills.locator('a').evaluateAll(links => links.map(link => link.getBoundingClientRect().top));
			expect(new Set(pillTops).size).toBe(1);
			for (const button of await page.locator('.home-money-dots button').all()) {
				const rect = (await button.boundingBox())!;
				expect(rect.width).toBeGreaterThanOrEqual(44);
				expect(rect.x).toBeGreaterThanOrEqual(0);
				expect(rect.x + rect.width).toBeLessThanOrEqual(width);
			}
		}
	}
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await expect(page.locator('.phone-today')).toHaveAttribute('data-home-paused', 'false');
	await page.evaluate(() => window.homeTest.destroy());
	await expect(page.locator('.phone-today')).toHaveCount(0);
});
