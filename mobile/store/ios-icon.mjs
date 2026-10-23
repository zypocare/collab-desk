// The iPhone app icon: Miracle's icon edge to edge (iPhone rounds the corners itself), 1024 × 1024 with no
// transparency, as Apple requires. Run: node mobile/store/ios-icon.mjs (PW_CHROME = a Chromium's path).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Playwright comes from the web app's packages.
const { chromium } = createRequire(path.join(root, 'web/package.json'))('playwright-core');
const svg = fs.readFileSync(path.join(root, 'web/static/icon.svg'), 'utf8').replaceAll('rx="112"', 'rx="0"');
const out = path.join(root, 'mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const page = await b.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.setContent(`<html><body style="margin:0;background:#1c1219">${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`);
await page.screenshot({ path: out, omitBackground: false });
await b.close();
console.log('written', out);
