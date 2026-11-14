// Run after `cap sync android` and `gradlew assembleDebug`, with the web dev server on port 5173:
// node tests/android/collab-keyboard.mjs emulator-5560
// Uses a disposable emulator only. No account, personal data or live backend is used.
import { expect, request } from '@playwright/test';
import { _android } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountCollabHarness } from '../helpers/collab-harness.mjs';

const serial = process.argv[2];
if (!serial?.startsWith('emulator-')) throw new Error('Pass the serial of a disposable Android emulator.');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sdk = process.env.ANDROID_HOME || join(process.env.LOCALAPPDATA, 'Android/Sdk');
const adbPath = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const adb = (...args) => execFileSync(adbPath, ['-s', serial, ...args], { encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'] });
const out = join(repo, 'web/test-results/android-keyboard');
mkdirSync(out, { recursive: true });
const apk = process.env.KEYBOARD_TEST_APK || join(repo, 'mobile/android/app/build/outputs/apk/debug/app-debug.apk');
await expect.poll(() => { try { return adb('shell', 'getprop', 'sys.boot_completed').trim(); } catch { return ''; } }, { timeout: 180000 }).toBe('1');
adb('install', '-r', apk);
console.log('Installed the test build.');
adb('shell', 'settings', 'put', 'system', 'screen_off_timeout', '2147483647');
adb('shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1');
adb('shell', 'input', 'keyevent', '82');
adb('shell', 'am', 'force-stop', 'live.miracleapp.app');
adb('shell', 'am', 'start', '-n', 'live.miracleapp.app/.MainActivity');
await expect.poll(() => { try { return adb('shell', 'pidof', 'live.miracleapp.app').trim(); } catch { return ''; } }, { timeout: 30000 }).not.toBe('');
const api = await request.newContext();
const device = (await _android.devices()).find(device => device.serial() === serial);
if (!device) throw new Error(`Emulator ${serial} is not connected.`);
const webview = await device.webView({ pkg: 'live.miracleapp.app' });
const page = await webview.page();
console.log('Connected to the native WebView.');
const devtools = await page.context().newCDPSession(page);
await devtools.send('Network.setBypassServiceWorker', { bypass: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', async route => {
	const url = new URL(route.request().url());
	if (url.pathname === '/__keyboard-regression') {
		return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en" data-side="studio" data-desk="studio" data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body></body></html>' });
	}
	if (/^\/(src|node_modules|@|\.svelte-kit)/.test(url.pathname)) {
		const response = await api.get(`http://127.0.0.1:5173${url.pathname}${url.search}`);
		return route.fulfill({ response });
	}
	return route.fulfill({ contentType: 'application/json', body: '[]' });
});
await page.goto('https://app.miracleapp.live/__keyboard-regression', { waitUntil: 'domcontentloaded' });
await page.evaluate(mountCollabHarness, { mode: 'device' });
console.log('Mounted the real drawer with fixture data.');
await expect(page.locator('.dialog.nc')).toBeVisible();
const initialHeight = await page.evaluate(() => Math.min(innerHeight, visualViewport?.height ?? innerHeight));
const metadata = {
	android: adb('shell', 'getprop', 'ro.build.version.release').trim(),
	webview: adb('shell', 'dumpsys', 'webviewupdate').split('\n').find(line => line.includes('Current WebView package'))?.trim(),
	app: adb('shell', 'dumpsys', 'package', 'live.miracleapp.app').split('\n').find(line => line.includes('versionName='))?.trim()
};
const results = [];
for (let cycle = 0; cycle < 3; cycle++) {
	const rect = await page.locator('#nc-paste').boundingBox();
	const dpr = await page.evaluate(() => devicePixelRatio);
	adb('shell', 'uiautomator', 'dump', '/sdcard/miracle-keyboard-test.xml');
	const hierarchy = adb('shell', 'cat', '/sdcard/miracle-keyboard-test.xml');
	const bounds = /class="android\.webkit\.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(hierarchy);
	if (!bounds) throw new Error('Cannot locate the native WebView on the emulator display.');
	const left = Number(bounds[1]), top = Number(bounds[2]);
	adb('shell', 'input', 'tap', String(Math.round(left + (rect.x + 25) * dpr)), String(Math.round(top + (rect.y + 25) * dpr)));
	await expect.poll(() => /mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method')), { timeout: 15000 }).toBe(true);
	await expect.poll(() => page.evaluate(() => Math.min(innerHeight, visualViewport?.height ?? innerHeight)), { timeout: 20000 }).toBeLessThan(initialHeight - 120);
	await expect(page.locator('#nc-paste')).toBeFocused();
	adb('shell', 'input', 'text', 'Hello%sthis%sis%sa%scollab%smessage');
	const frames = await page.evaluate(() => new Promise(resolve => {
		const start = performance.now(), values = [];
		function frame() {
			const intro = document.querySelector('.nc-intro').getBoundingClientRect();
			const footer = document.querySelector('.nc-foot').getBoundingClientRect();
			const compose = document.querySelector('.nc-compose').getBoundingClientRect();
			values.push({ time: performance.now() - start, height: innerHeight, visualHeight: visualViewport.height, titleY: intro.y, composeY: compose.y, composeBottom: compose.bottom, footerBottom: footer.bottom, footerTop: footer.y, scroll: document.querySelector('.nc-body').scrollTop, focused: document.activeElement?.id });
			if (performance.now() - start < 1800) requestAnimationFrame(frame); else resolve(values);
		}
		requestAnimationFrame(frame);
	}));
	const settled = frames.filter(frame => frame.time > 700);
	for (const key of ['height', 'visualHeight', 'titleY', 'composeY', 'footerBottom', 'scroll']) {
		const values = settled.map(frame => frame[key]);
		expect(Math.max(...values) - Math.min(...values), `Cycle ${cycle + 1}: ${key} must settle`).toBeLessThanOrEqual(1);
	}
	for (const frame of settled) {
		expect(frame.focused).toBe('nc-paste');
		expect(frame.composeBottom).toBeLessThanOrEqual(frame.footerTop + 1);
		expect(frame.footerBottom).toBeLessThanOrEqual(Math.min(frame.height, frame.visualHeight) + 1);
	}
	results.push({ cycle: cycle + 1, frames });
	await page.screenshot({ path: join(out, `keyboard-open-${cycle + 1}.png`) });
	adb('shell', 'input', 'keyevent', '4');
	await expect.poll(() => page.evaluate(() => Math.min(innerHeight, visualViewport?.height ?? innerHeight)), { timeout: 20000 }).toBe(initialHeight);
}
await page.evaluate(() => window.collabTest.close());
await expect.poll(() => page.evaluate(() => scrollY)).toBe(await page.evaluate(() => window.collabTest.original.y));
expect(errors.filter(error => !error.includes('WebSocket'))).toEqual([]);
writeFileSync(join(out, 'measurements.json'), JSON.stringify({ metadata, initialHeight, results }, null, 2));
console.log(JSON.stringify({ ...metadata, cycles: results.length, result: 'PASS: real IME opening, typing, closing, stable layout and preserved home position.' }));
await page.unrouteAll({ behavior: 'wait' });
await device.close();
await api.dispose();
