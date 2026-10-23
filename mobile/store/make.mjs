// Store graphics: five phone screenshots for Play (1080x1920) and the App Store (1320x2868), and Play's
// feature graphic (1024x500), drawn from the real app screens in site/img. Run: node mobile/store/make.mjs
// (needs a Chromium for Playwright; set PW_CHROME to its path). Output: docs/store/android/ and docs/store/ios/.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
// Playwright comes from the web app's packages.
const { chromium } = createRequire(path.join(root, 'web/package.json'))('playwright-core');
const img = (n) => 'data:image/webp;base64,' + fs.readFileSync(path.join(root, 'site/img', n)).toString('base64');
const icon = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'web/static/icon.svg')).toString('base64');
const out = path.join(root, 'docs/store/android');
fs.mkdirSync(out, { recursive: true });

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Geist:wght@500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">`;
const BASE = `
*{box-sizing:border-box}body{margin:0;background:#110D11;color:#F4EEF2;font-family:Geist,system-ui,sans-serif;overflow:hidden}
.bg{position:absolute;inset:0;background:radial-gradient(60% 40% at 15% 10%,rgba(156,123,255,.55),transparent 70%),radial-gradient(55% 40% at 90% 45%,rgba(242,90,144,.45),transparent 70%),radial-gradient(60% 40% at 20% 100%,rgba(255,174,107,.3),transparent 70%),#110D11}
em{font-style:italic;background:linear-gradient(115deg,#9C7BFF,#F25A90 52%,#FFAE6B);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.06em}
.dev{position:absolute;border-radius:76px;padding:15px;background:linear-gradient(150deg,#4a3d46,#120d12 30%,#0b080b 70%,#3a2f37);box-shadow:inset 0 0 0 2px rgba(255,255,255,.14),inset 0 0 0 6px #050405,0 80px 160px -50px rgba(0,0,0,.95),0 40px 100px -40px rgba(242,90,144,.45)}
.dev img{display:block;width:100%;height:100%;object-fit:cover;object-position:top;border-radius:62px;background:#0c090c}
.isl{position:absolute;top:30px;left:50%;width:140px;height:40px;margin-left:-70px;border-radius:30px;background:#000}
`;

const SHOTS = [
  { file: '1-get-found.png', screen: 'screen-nivy-page.webp', eb: 'Get found', h: 'One link brands <em>book</em> you from.', p: 'Rates, packages and your live media kit on one page.' },
  { file: '2-offers.png', screen: 'screen-offer.webp', eb: 'Close better deals', h: 'Know what to say <em>yes</em> to.', p: 'Every request scored. Every agreement checked.' },
  { file: '3-get-paid.png', screen: 'screen-paid.webp', eb: 'Get paid on time', h: 'No more chasing <em>brands</em>.', p: 'GST invoices, UPI, reminders that go by themselves.' },
  { file: '4-grow.png', screen: 'screen-grow.webp', eb: 'Grow', h: 'Know what to <em>post next</em>.', p: 'A check-up of your own reels, every two weeks.' },
  { file: '5-tax.png', screen: 'screen-tax.webp', eb: 'Stay tax-ready', h: 'GST and TDS, <em>already</em> done.', p: 'Barter counted, TDS by brand, your 26AS matched.' }
];

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const page = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
for (const s of SHOTS) {
  await page.setContent(`<html><head>${FONTS}<style>${BASE}
    .eb{position:absolute;left:84px;top:140px;font-weight:700;font-size:30px;letter-spacing:.24em;text-transform:uppercase;color:#F25A90}
    h1{position:absolute;left:84px;right:84px;top:196px;margin:0;font:400 104px/1 'Instrument Serif',serif;letter-spacing:-.01em}
    p{position:absolute;left:84px;right:120px;top:430px;margin:0;font-size:38px;line-height:1.35;color:#C9BFC6}
    .dev{left:50%;top:620px;width:640px;height:1385px;margin-left:-320px;transform:rotate(-3deg)}
  </style></head><body><div class="bg"></div><div class="eb">${s.eb}</div><h1>${s.h}</h1><p>${s.p}</p>
  <div class="dev"><span class="isl"></span><img src="${img(s.screen)}"></div></body></html>`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(out, s.file) });
}
// Feature graphic: the mark, the promise, and two phones.
await page.setViewportSize({ width: 1024, height: 500 });
await page.setContent(`<html><head>${FONTS}<style>${BASE}
  .logo{position:absolute;left:64px;top:70px;display:flex;align-items:center;gap:16px}
  .logo img{width:72px;height:72px;border-radius:18px}
  .logo b{font:italic 400 52px/1 'Instrument Serif',serif}
  h1{position:absolute;left:64px;top:180px;width:520px;margin:0;font:400 64px/1 'Instrument Serif',serif}
  p{position:absolute;left:64px;top:340px;width:460px;margin:0;font-size:22px;line-height:1.4;color:#C9BFC6}
  .dev{border-radius:40px;padding:8px}.dev img{border-radius:32px}.isl{top:16px;width:70px;height:20px;margin-left:-35px}
  .d1{left:640px;top:70px;width:200px;height:433px;transform:rotate(-8deg)}
  .d2{left:790px;top:40px;width:200px;height:433px;transform:rotate(6deg)}
</style></head><body><div class="bg"></div>
  <div class="logo"><img src="${icon}"><b>Miracle</b></div>
  <h1>Brand deals, done properly. <em>Paid on time.</em></h1>
  <p>For Indian creators. No commission, ever.</p>
  <div class="dev d1"><span class="isl"></span><img src="${img('screen-offer.webp')}"></div>
  <div class="dev d2"><span class="isl"></span><img src="${img('screen-paid.webp')}"></div>
</body></html>`, { waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(out, 'feature-graphic.png') });
fs.copyFileSync(path.join(root, 'web/static/icon-512.png'), path.join(out, 'icon-512.png'));
// App Store: the same five on a 6.9-inch iPhone screen (1320 × 2868), in docs/store/ios/.
const outIos = path.join(root, 'docs/store/ios');
fs.mkdirSync(outIos, { recursive: true });
const ios = await b.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
for (const s of SHOTS) {
  await ios.setContent(`<html><head>${FONTS}<style>${BASE}
    .eb{position:absolute;left:34px;top:74px;font-weight:700;font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#F25A90}
    h1{position:absolute;left:34px;right:34px;top:98px;margin:0;font:400 44px/1 'Instrument Serif',serif;letter-spacing:-.01em}
    p{position:absolute;left:34px;right:44px;top:200px;margin:0;font-size:16px;line-height:1.35;color:#C9BFC6}
    .dev{left:50%;top:286px;width:290px;height:628px;margin-left:-145px;transform:rotate(-3deg);border-radius:34px;padding:7px}
    .dev img{border-radius:28px}.isl{top:14px;width:62px;height:18px;margin-left:-31px}
  </style></head><body><div class="bg"></div><div class="eb">${s.eb}</div><h1>${s.h}</h1><p>${s.p}</p>
  <div class="dev"><span class="isl"></span><img src="${img(s.screen)}"></div></body></html>`, { waitUntil: 'networkidle' });
  await ios.screenshot({ path: path.join(outIos, s.file) });
}
await b.close();
console.log('written to', out);
