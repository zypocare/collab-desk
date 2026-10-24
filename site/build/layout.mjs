// The website's content pages (landing pages, guides, help, pricing, waitlist): one look, the same header
// and footer as the home page, and the tags search engines read. Everything is plain HTML written by
// build.mjs; the only scripts are the help search, the pricing switch and the waitlist form.
import { footerCss, SITE_FOOTER } from './footer.mjs';

export const SITE = 'https://www.miracleapp.live';
export const APP = 'https://app.miracleapp.live';
// Before launch (Meta's review and the Play Store), every Join goes to the waitlist. At launch, point these back to
// `${APP}/signup?as=creator` and `${APP}/signup?as=brand`.
export const PRELAUNCH = true;
export const JOIN = PRELAUNCH ? '/waitlist?as=creator' : `${APP}/signup?as=creator`;
export const JOIN_BRAND = PRELAUNCH ? '/waitlist?as=brand' : `${APP}/signup?as=brand`;
export const JOIN_AGENCY = PRELAUNCH ? '/waitlist?as=agency' : `${APP}/signup?as=brand`;
export const JOIN_LABEL = PRELAUNCH ? 'Join the waitlist' : 'Join free';
// The one line under every Join button.
export const FINE = PRELAUNCH ? 'Opening soon · free plan · no commission on any deal' : 'Free plan · 14 days of Pro free · no commission';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Inline formatting in content: **bold** and [text](href). Everything else is escaped. */
export const md = (s) =>
	esc(s)
		.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
		.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, h) => `<a href="${h}">${t}</a>`);
export const slugify = (s) => String(s).toLowerCase().replace(/<[^>]+>|\*\*/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// Main menu: [label, href, section]. The page's own section is marked as current.
const NAV = [
	['Creators', '/get-brand-deals', 'creator'],
	['Brands', '/find-influencers-india', 'brand'],
	['Agencies', '/influencer-agency-software', 'agency'],
	['Pricing', '/pricing', 'pricing'],
	['Guides', '/guides', 'guides'],
	['Help', '/help', 'help']
];

export function page({ path, title, description, body, ld = [], crumbs = [], noindex = false, ogType = 'website', section = '' }) {
	const url = `${SITE}${path}`;
	const bc = crumbs.length
		? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ name: 'Miracle', path: '/' }, ...crumbs].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${SITE}${c.path}` })) }]
		: [];
	const json = [...ld, ...bc].map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n');
	const links = NAV.map(([l, h, s]) => `<a href="${h}"${s === section ? ' aria-current="page"' : ''}>${l}</a>`).join('');
	return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="${noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large'}">
<meta property="og:type" content="${ogType}"><meta property="og:site_name" content="Miracle"><meta property="og:locale" content="en_IN">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${SITE}/og.jpg">
<meta name="theme-color" content="#110D11">
<link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap">
<link rel="stylesheet" href="/assets/site.css">
${json}
</head>
<body>
<header class="top"><div class="bar wrap">
  <a class="brand" href="/" aria-label="Miracle home"><img src="/icon.svg" alt="" width="34" height="34"><b>Miracle</b></a>
  <nav class="nav" aria-label="Main">${links}</nav>
  <a class="signin" href="/signin">Sign in</a>
  <a class="btn sm" href="${JOIN}">${PRELAUNCH ? 'Join waitlist' : 'Join free'}</a>
  <details class="menu"><summary aria-label="Menu"><i></i><i></i></summary><nav class="menu-p" aria-label="Menu">${links}<a href="/signin">Sign in</a></nav></details>
</div></header>
<main>
${crumbs.length ? `<nav class="crumbs wrap" aria-label="You are here"><a href="/">Miracle</a>${crumbs.map((c, i) => (i === crumbs.length - 1 ? ` <span>›</span> <span aria-current="page">${esc(c.name)}</span>` : ` <span>›</span> <a href="${c.path}">${esc(c.name)}</a>`)).join('')}</nav>` : ''}
${body}
</main>
${SITE_FOOTER}
</body>
</html>
`;
}

/** Join and see-pricing buttons, with the fine print. */
export const joinRow = (who = 'creator', fine = true) => `<div class="acts"><a class="btn grad" href="${who === 'brand' ? JOIN_BRAND : who === 'agency' ? JOIN_AGENCY : JOIN}">${PRELAUNCH ? JOIN_LABEL : who === 'brand' ? 'Join as a brand' : 'Join free'}</a><a class="btn ghost" href="/pricing">See pricing</a></div>${fine ? `<p class="fine">${FINE}</p>` : ''}`;

/** The closing call to action, the same everywhere. */
export const cta = (h = 'Get more brand deals.', p = 'Your own page brands book you from, AI that finds brands and writes the pitch, and payments that arrive on time. Start on the free plan; Pro is ₹299 a month. No commission on any deal.', who = 'creator') => `
<section class="wrap cta-w"><div class="cta">
  <div><span class="eb">${PRELAUNCH ? 'Opening soon' : 'Miracle'}</span><h2>${esc(h).replace(/(\S+\.)$/, '<em>$1</em>')}</h2><p>${md(p)}</p></div>
  ${joinRow(who, false)}
</div></section>`;

/** A phone showing a real screen of the app. */
export const phone = (src, alt, chip) => `
<div class="phone-w"><figure class="dev"><div class="dev-frame"><span class="dev-island" aria-hidden="true"></span><img src="/img/${src}" alt="${esc(alt)}" width="390" height="844"></div><span class="dev-shine" aria-hidden="true"></span></figure>${chip ? `<span class="chip"><i aria-hidden="true">✦</i><span><b>${esc(chip[0])}</b><small>${esc(chip[1])}</small></span></span>` : ''}</div>`;

/** A ticket-style card that shows what a feature looks like in the app: a title, a big line and rows. */
export const mock = (m) => `
<div class="mock-w"><div class="mock">
  <div class="mock-h"><span class="eb">${esc(m.eb)}</span>${m.tag ? `<span class="mock-tag">${esc(m.tag)}</span>` : ''}</div>
  <p class="mock-big">${esc(m.big)}</p>${m.sub ? `<p class="mock-sub">${esc(m.sub)}</p>` : ''}
  <ul class="mock-rows">${m.rows.map(([a, b, s, st]) => `<li><span class="av" aria-hidden="true">${esc(a.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase())}</span><span class="mr-t"><b>${esc(a)}</b><small>${esc(b)}</small></span><span class="st ${st ?? ''}">${esc(s)}</span></li>`).join('')}</ul>
  ${m.foot ? `<p class="mock-foot">${esc(m.foot)}</p>` : ''}
</div></div>`;

export const CSS = `
:root{--bg:#110D11;--bg-2:#0C090C;--surface:#1A151A;--surface-2:#231D23;--line:#2E262E;--line-2:#3E343E;--ink:#F4EEF2;--ink-2:#C9BFC6;--ink-3:#A39AA1;--on-light:#1E171C;--g1:#9C7BFF;--g2:#F25A90;--g3:#FFAE6B;--ok:#6FD08C;--grad:linear-gradient(115deg,var(--g1),var(--g2) 52%,var(--g3));--f-display:'Instrument Serif',Georgia,'Times New Roman',serif;--f-body:'Geist',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;--ease:cubic-bezier(.2,.8,.2,1);color-scheme:dark}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}[hidden]{display:none!important}
body{margin:0;background:var(--bg);color:var(--ink-2);font:400 16.5px/1.65 var(--f-body);-webkit-font-smoothing:antialiased;overflow-x:hidden}
main{position:relative;isolation:isolate;overflow-x:clip}
main::before{content:"";position:absolute;z-index:-1;inset:0 0 auto;height:760px;pointer-events:none;background:radial-gradient(55% 60% at 82% 18%,rgba(156,123,255,.2),transparent 65%),radial-gradient(45% 50% at 62% 48%,rgba(242,90,144,.13),transparent 65%),radial-gradient(40% 40% at 6% 4%,rgba(255,174,107,.07),transparent 60%)}
a{color:var(--ink)}:focus-visible{outline:2px solid var(--g3);outline-offset:3px}
img{max-width:100%}
.wrap{width:min(1200px,100%);margin:0 auto;padding-left:max(20px,env(safe-area-inset-left,0px));padding-right:max(20px,env(safe-area-inset-right,0px))}

/* Header */
.top{position:sticky;top:0;z-index:20;padding-top:env(safe-area-inset-top,0px);background:rgba(17,13,17,.78);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 1px 0 var(--line)}
.bar{display:flex;align-items:center;gap:26px;height:72px}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);text-decoration:none;flex:none}.brand img{display:block;border-radius:9px}.brand b{font:italic 400 28px/1 var(--f-display);letter-spacing:-.01em}
.nav{display:flex;gap:24px;margin-left:auto;font-size:14.5px;white-space:nowrap}
.nav a{position:relative;padding:6px 0;color:var(--ink-2);text-decoration:none}
.nav a::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1.5px;background:var(--grad);transform:scaleX(0);transform-origin:left;transition:transform .35s var(--ease)}
.nav a:hover,.nav a[aria-current]{color:var(--ink)}.nav a:hover::after,.nav a[aria-current]::after{transform:scaleX(1)}
.signin{font-weight:600;font-size:14.5px;color:var(--ink-2);text-decoration:none;white-space:nowrap}.signin:hover{color:var(--ink)}
.menu{display:none;position:relative}
.menu summary{display:grid;place-content:center;gap:6px;width:44px;height:44px;cursor:pointer;list-style:none;box-shadow:inset 0 0 0 1.5px var(--line-2)}
.menu summary::-webkit-details-marker{display:none}
.menu summary i{display:block;width:18px;height:1.5px;background:var(--ink);transition:transform .2s}
.menu[open] summary i:first-child{transform:translateY(3.75px) rotate(45deg)}.menu[open] summary i:last-child{transform:translateY(-3.75px) rotate(-45deg)}
.menu-p{position:absolute;right:0;top:54px;display:grid;min-width:220px;padding:8px;border-radius:18px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-2),0 30px 60px -20px rgba(0,0,0,.9)}
.menu-p a{padding:12px 14px;border-radius:12px;color:var(--ink-2);text-decoration:none;font-size:15.5px}.menu-p a:hover,.menu-p a[aria-current]{background:var(--surface-2);color:var(--ink)}

/* Buttons (NeoPOP, as on the home page) */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:54px;padding:0 26px;border:0;background:var(--ink);color:var(--on-light);font:700 13px/1.25 var(--f-body);letter-spacing:.14em;text-transform:uppercase;text-decoration:none;text-align:center;white-space:nowrap;box-shadow:5px 5px 0 var(--g2);cursor:pointer;transition:transform .12s var(--ease),box-shadow .12s var(--ease)}
.btn:hover{transform:translate(-2px,-2px);box-shadow:7px 7px 0 var(--g2)}.btn:active{transform:translate(5px,5px);box-shadow:none}
.btn.grad{background:var(--grad);color:#fff;box-shadow:5px 5px 0 #6a4bc9;text-shadow:0 1px 0 rgba(0,0,0,.15)}.btn.grad:hover{box-shadow:7px 7px 0 #6a4bc9}
.btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--line-2),5px 5px 0 var(--line)}.btn.ghost:hover{box-shadow:inset 0 0 0 1.5px var(--ink-3),7px 7px 0 var(--line)}
.btn.sm{min-height:42px;padding:0 16px;font-size:12px;box-shadow:4px 4px 0 var(--g2)}

/* Type */
.eb{font:700 11.5px/1.2 var(--f-body);letter-spacing:.28em;text-transform:uppercase;color:var(--ink-3)}
h1,h2,h3{color:var(--ink);text-wrap:balance}
h1{margin:14px 0 18px;font:400 clamp(44px,6.4vw,84px)/.98 var(--f-display);letter-spacing:-.02em}
h2{margin:0 0 12px;font:400 clamp(32px,4.2vw,52px)/1.02 var(--f-display);letter-spacing:-.01em}
h3{margin:0 0 6px;font:600 18px/1.3 var(--f-body)}
h1 em,h2 em{font-style:italic;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.08em}
.lede{max-width:58ch;margin:0 0 28px;font-size:clamp(17px,1.5vw,19.5px);line-height:1.6;color:var(--ink-2)}
.crumbs{padding-top:22px;font-size:13px;color:var(--ink-3)}.crumbs a{color:var(--ink-3);text-decoration:none}.crumbs a:hover{color:var(--ink)}.crumbs span[aria-current]{color:var(--ink-2)}
.acts{display:flex;flex-wrap:wrap;gap:16px 18px;align-items:center}
.fine{margin:16px 0 0;font-size:13.5px;color:var(--ink-3)}
.small{font-size:13.5px;color:var(--ink-3)}
.meta{font-size:13.5px;color:var(--ink-3)}
.tag{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;font:700 10.5px/1 var(--f-body);letter-spacing:.12em;text-transform:uppercase;color:var(--g3);box-shadow:inset 0 0 0 1px rgba(255,174,107,.45);background:rgba(255,174,107,.08);white-space:nowrap}

/* Sections */
.hero{padding-top:40px;padding-bottom:30px}
.sec{padding-top:56px;padding-bottom:56px}
.sec-h{max-width:720px;margin-bottom:30px}.sec-h p{margin:0;color:var(--ink-3)}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.card{padding:24px;border-radius:24px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line)}.card p{margin:0;font-size:15px}

/* Landing hero: words on the left, the app on the right */
.lhero{padding-top:44px;padding-bottom:40px}
.lhero-in{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);gap:40px;align-items:center}
.lhero-t{min-width:0}
.lhero-v{display:grid;place-items:center;min-width:0}
.trust{display:flex;flex-wrap:wrap;gap:10px 22px;margin:30px 0 0;padding:20px 0 0;list-style:none;border-top:1px solid var(--line);font-size:14px;color:var(--ink-3)}
.trust li{display:flex;align-items:center;gap:8px}.trust li::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--grad)}

/* Phone */
.phone-w{position:relative;padding:10px 0 20px;perspective:1600px}
.dev{position:relative;margin:0;width:min(310px,70vw);aspect-ratio:390/844;transform:rotateY(-9deg) rotateX(3deg);transform-style:preserve-3d}
.dev-frame{position:absolute;inset:0;border-radius:48px;padding:9px;background:linear-gradient(150deg,#4a3d46 0%,#120d12 30%,#0b080b 70%,#3a2f37 100%);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.14),inset 0 0 0 4px #050405,0 60px 120px -40px rgba(0,0,0,.95),0 30px 70px -30px rgba(242,90,144,.32)}
.dev-frame img{display:block;width:100%;height:100%;object-fit:cover;object-position:top;border-radius:40px;background:var(--bg-2);padding-top:38px}
.dev-frame::after{content:"9:41";position:absolute;z-index:2;top:22px;left:34px;font:600 12.5px/1 var(--f-body);color:var(--ink)}
.dev-frame::before{content:"";position:absolute;z-index:2;top:23px;right:32px;width:34px;height:11px;border-radius:3px;background:linear-gradient(90deg,var(--ink) 70%,transparent 70%);box-shadow:inset 0 0 0 1.5px var(--ink);opacity:.85}
.dev-island{position:absolute;z-index:2;top:19px;left:50%;width:88px;height:26px;margin-left:-44px;border-radius:20px;background:#000}
.dev-shine{position:absolute;inset:0;border-radius:48px;pointer-events:none;background:linear-gradient(115deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,.04) 22%,transparent 40%)}
.chip{position:absolute;z-index:3;left:-34px;bottom:70px;display:flex;align-items:center;gap:11px;padding:10px 18px 10px 10px;border-radius:999px;background:rgba(26,21,26,.9);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 0 0 1px var(--line-2) inset,0 24px 50px -20px rgba(0,0,0,.9);font-size:12.5px;white-space:nowrap}
.chip i{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--grad);color:#fff;font-style:normal;font-size:15px}
.chip b{display:block;color:var(--ink);font-size:13.5px}.chip small{color:var(--ink-3)}

/* Mock card (a feature, drawn the way the app shows it) */
.mock-w{position:relative;width:min(440px,100%);padding:14px 0}
.mock-w::before{content:"";position:absolute;inset:8% -6% -4% 10%;z-index:-1;border-radius:40px;background:var(--grad);filter:blur(60px);opacity:.28}
.mock{padding:26px;border-radius:28px;background:radial-gradient(100% 70% at 0% 0%,rgba(242,90,144,.16),transparent 60%),radial-gradient(80% 60% at 100% 100%,rgba(156,123,255,.14),transparent 60%),var(--surface);box-shadow:inset 0 0 0 1px var(--line-2),0 40px 80px -40px rgba(0,0,0,.9);transform:rotate(-1.2deg)}
.mock-h{display:flex;justify-content:space-between;align-items:center;gap:10px}
.mock-tag{padding:5px 10px;font:700 10.5px/1 var(--f-body);letter-spacing:.14em;text-transform:uppercase;background:var(--ink);color:var(--on-light);box-shadow:3px 3px 0 var(--g2)}
.mock-big{margin:14px 0 2px;font:400 clamp(40px,5vw,54px)/1 var(--f-display);color:var(--ink)}
.mock-sub{margin:0;font-size:14px;color:var(--ink-3)}
.mock-rows{display:grid;gap:8px;margin:20px 0 0;padding:0;list-style:none}
.mock-rows li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:11px 12px;border-radius:16px;background:rgba(12,9,12,.55);box-shadow:inset 0 0 0 1px var(--line)}
.av{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:conic-gradient(from 200deg,var(--g1),var(--g2),var(--g3),var(--g1));color:#fff;font:700 12px/1 var(--f-body)}
.mr-t{min-width:0}.mr-t b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink);font-size:14.5px;font-weight:600}.mr-t small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;color:var(--ink-3)}
.st{padding:5px 9px;border-radius:999px;font:600 11.5px/1 var(--f-body);white-space:nowrap;color:var(--ink-2);box-shadow:inset 0 0 0 1px var(--line-2)}
.st.ok{color:var(--ok);box-shadow:inset 0 0 0 1px rgba(111,208,140,.4);background:rgba(111,208,140,.08)}.st.wait{color:var(--g3);box-shadow:inset 0 0 0 1px rgba(255,174,107,.4);background:rgba(255,174,107,.08)}.st.hot{color:#fff;background:var(--g2);box-shadow:none}
.mock-foot{margin:16px 0 0;font-size:13px;color:var(--ink-3)}

/* Features */
.feats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.feat{position:relative;display:grid;align-content:start;gap:8px;padding:26px;border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.02),transparent),var(--surface);box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow .3s,transform .3s var(--ease)}
.feat:hover{box-shadow:inset 0 0 0 1px var(--line-2);transform:translateY(-2px)}
.feat-n{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font:italic 400 30px/1 var(--f-display);background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.feat-n .tag{-webkit-text-fill-color:var(--g3);font-style:normal}
.feat h3{font-size:18.5px}.feat p{margin:0;font-size:15px;line-height:1.6;color:var(--ink-3)}

/* How it works */
.flow{counter-reset:s;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin:0;padding:0;list-style:none}
.flow li{counter-increment:s;position:relative;padding:26px 22px 24px;border-top:1.5px solid var(--line-2)}
.flow li::before{content:counter(s,decimal-leading-zero);display:block;margin-bottom:14px;font:400 44px/1 var(--f-display);color:var(--ink)}
.flow li::after{content:"";position:absolute;top:-1.5px;left:0;width:40%;height:1.5px;background:var(--grad)}
.flow li span{display:block;font-size:15.5px;color:var(--ink-2)}
.steps{counter-reset:s;display:grid;gap:12px;margin:0;padding:0;list-style:none;max-width:760px}
.steps li{counter-increment:s;display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;padding:16px 18px;border-radius:18px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line)}
.steps li::before{content:counter(s);display:grid;place-items:center;width:30px;height:30px;background:var(--ink);color:var(--bg);font:400 18px/1 var(--f-display)}

/* Questions: heading on the left, answers on the right */
.split{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:40px;align-items:start}
.split .sec-h{position:sticky;top:110px}
.faq{display:grid;gap:10px}
.faq details{border-radius:18px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow .2s}
.faq details[open]{box-shadow:inset 0 0 0 1px var(--line-2)}
.faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:14px;padding:18px 22px;font-weight:600;color:var(--ink)}
.faq summary::-webkit-details-marker{display:none}.faq summary::after{content:"+";flex:none;font:400 26px/1 var(--f-display);color:var(--ink-3);transition:transform .2s}.faq details[open] summary::after{transform:rotate(45deg)}
.faq details p{margin:0;padding:0 22px 20px;font-size:15.5px}

/* Tiles: guides, related pages, help categories */
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.tile{display:grid;align-content:start;gap:10px;padding:24px;border-radius:24px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line);text-decoration:none;transition:box-shadow .25s,transform .25s var(--ease)}
.tile:hover{box-shadow:inset 0 0 0 1px var(--line-2);transform:translateY(-2px)}
.tile b{color:var(--ink);font-size:17.5px;font-weight:600;line-height:1.35;text-wrap:balance}.tile small{font-size:14.5px;line-height:1.55;color:var(--ink-3)}
.tile .go{margin-top:6px;font:700 11.5px/1 var(--f-body);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2)}.tile:hover .go{color:var(--g3)}
.links{display:grid;border-radius:22px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
.links a{display:grid;gap:2px;padding:15px 20px;border-top:1px solid var(--line);text-decoration:none}.links a:first-child{border-top:0}.links a:hover{background:var(--surface-2)}
.links b{color:var(--ink);font-weight:600}.links small{font-size:13.5px;color:var(--ink-3)}

/* Closing call to action */
.cta-w{padding-top:30px;padding-bottom:80px}
.cta{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:28px 40px;align-items:center;padding:clamp(28px,4vw,52px);border-radius:32px;background:radial-gradient(90% 140% at 0% 0%,rgba(156,123,255,.22),transparent 55%),radial-gradient(80% 120% at 100% 100%,rgba(242,90,144,.18),transparent 55%),var(--surface);box-shadow:inset 0 0 0 1px var(--line-2)}
.cta h2{margin:12px 0 10px}.cta p{margin:0;max-width:56ch;color:var(--ink-2)}

/* Articles: guides and help */
.ahead{padding-top:40px;padding-bottom:10px;max-width:980px}.ahead h1{font-size:clamp(40px,5.4vw,68px)}
.ahead .lede{max-width:64ch}
.adoc{display:grid;grid-template-columns:240px minmax(0,1fr);gap:56px;align-items:start;padding-top:20px;padding-bottom:40px}
.aside{position:sticky;top:104px;display:grid;gap:4px;font-size:14px}
.aside b{margin-bottom:8px;font:700 11.5px/1.2 var(--f-body);letter-spacing:.2em;text-transform:uppercase;color:var(--ink-3)}
.aside a{padding:7px 0 7px 14px;border-left:1.5px solid var(--line);color:var(--ink-3);text-decoration:none;line-height:1.4}.aside a:hover{color:var(--ink)}.aside a[aria-current]{border-left-color:var(--g2);color:var(--ink)}
.aside .box{margin-top:22px;padding:16px;border-radius:18px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line);font-size:13.5px;line-height:1.5}
.aside .box a{padding:0;border:0;color:var(--ink);text-decoration:underline}
.prose{max-width:720px;min-width:0}.prose>:first-child{margin-top:0}.prose p,.prose li{font-size:17.5px;line-height:1.75}.prose h2{margin-top:52px;font-size:clamp(30px,3.2vw,40px);scroll-margin-top:100px}.prose h3{margin-top:30px;font-size:19px}
.prose ul,.prose ol{padding-left:22px}.prose li{margin:7px 0}.prose b{color:var(--ink)}.prose li::marker{color:var(--g2)}
.prose .tip{margin:26px 0;padding:18px 20px;border-radius:18px;background:color-mix(in oklab,var(--g3) 9%,var(--surface));box-shadow:inset 0 0 0 1px color-mix(in oklab,var(--g3) 26%,var(--line));font-size:16px}
.prose .note{font-size:14px;color:var(--ink-3)}
.prose .faq{margin-top:16px}
.prose .acts{margin:26px 0}
.table{overflow-x:auto;margin:22px 0;border-radius:18px;box-shadow:inset 0 0 0 1px var(--line)}table{width:100%;border-collapse:collapse;font-size:15px}th,td{padding:12px 16px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--ink);font-weight:600;background:var(--surface)}tr:last-child td{border-bottom:0}
.tpl{margin:20px 0;padding:20px 22px;border-radius:18px;background:var(--bg-2);box-shadow:inset 0 0 0 1px var(--line-2);font:15px/1.7 var(--f-body);white-space:pre-wrap;color:var(--ink-2)}
.byline{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0;font-size:13.5px;color:var(--ink-3)}

/* Help */
.hhero{padding-top:50px;padding-bottom:20px;text-align:center}.hhero .lede{margin-left:auto;margin-right:auto}
.search{display:flex;max-width:640px;margin:8px auto 12px}.search input{flex:1;min-width:0;height:60px;padding:0 22px;border:0;border-radius:0;background:var(--bg-2);box-shadow:inset 0 0 0 1.5px var(--line-2),5px 5px 0 var(--line);color:var(--ink);font:500 16.5px var(--f-body);outline:0}.search input:focus{box-shadow:inset 0 0 0 1.5px var(--g2),5px 5px 0 var(--g2)}
.hcats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.hcat{padding:24px;border-radius:24px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line)}
.hcat h2{margin:0 0 4px;font-size:28px}.hcat .who{margin:0 0 14px;font-size:13px;color:var(--ink-3)}
.hcat ul{display:grid;gap:2px;margin:0;padding:0;list-style:none}
.hcat a{display:block;padding:8px 0;border-top:1px solid var(--line);color:var(--ink-2);text-decoration:none;font-size:15px}.hcat li:first-child a{border-top:0}.hcat a:hover{color:var(--ink)}
.none{text-align:center;color:var(--ink-3)}

/* Pricing */
.plans{align-items:stretch}.plan{display:flex;flex-direction:column;gap:10px;padding:28px}.plan.hot{background:radial-gradient(110% 70% at 0% 0%,rgba(242,90,144,.16),transparent 60%),var(--surface);box-shadow:inset 0 0 0 1px rgba(242,90,144,.45)}.plan h3{margin:0}.plan .btn{margin-top:auto;align-self:flex-start}.price{display:flex;align-items:baseline;gap:6px;margin:0!important}.price b{font:400 50px/1 var(--f-display);color:var(--ink)}.price small{color:var(--ink-3)}.plan .alt{font-size:13.5px!important;color:var(--ink-3)}.ticks{display:grid;gap:8px;margin:6px 0 12px;padding:0;list-style:none;font-size:15px}.ticks li{padding-left:26px;position:relative}.ticks li::before{content:'✓';position:absolute;left:0;color:var(--ok);font-weight:700}
.cmp-more{margin-top:18px}.cmp-more summary{cursor:pointer;font-weight:600;color:var(--ink-2)}
.cmp{width:100%;border-collapse:collapse;font-size:14.5px}.cmp th,.cmp td{padding:11px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.cmp thead th{font:700 12px var(--f-body);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}.cmp td:not(:first-child),.cmp th:not(:first-child){text-align:center;width:22%}.cmp .y{color:var(--ok);font-weight:700}.cmp .n{color:var(--ink-3)}.cmp tr.grp td{padding-top:22px;font:700 12px var(--f-body);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2);border-bottom:0;background:none}
.ptoggle{display:inline-flex;border:1px solid var(--line-2);border-radius:999px;padding:3px;margin-top:6px}.ptoggle button{border:0;border-radius:999px;padding:9px 18px;background:none;color:var(--ink-2);font:600 14px var(--f-body);cursor:pointer}.ptoggle button[aria-pressed=true]{background:var(--ink);color:var(--bg)}.ptoggle em{font-style:normal;font-size:12px;opacity:.8}
.soon{display:flex;gap:12px;align-items:center;margin:0 0 22px;padding:14px 18px;border-radius:16px;background:rgba(242,90,144,.1);box-shadow:inset 0 0 0 1px rgba(242,90,144,.35);color:var(--ink);font-size:14.5px;max-width:760px}

/* Waitlist */
.wl-in{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:48px;align-items:start}
.wl-box{margin-top:6px}.wl-form,.wl-done{display:grid;gap:18px;padding:28px}.wl-roles{display:inline-flex;justify-self:start;border:1px solid var(--line-2);border-radius:999px;padding:3px}.wl-roles button{border:0;border-radius:999px;padding:9px 18px;background:none;color:var(--ink-2);font:600 14px var(--f-body);cursor:pointer}.wl-roles button[aria-checked=true]{background:var(--ink);color:var(--bg)}.wl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px}.wl-grid label{display:grid;gap:7px;font-size:13px;color:var(--ink-3);font-weight:600}.wl-grid label[hidden]{display:none}.wl-grid .wide{grid-column:1/-1}.wl-grid input,.wl-grid select{width:100%;height:50px;padding:0 14px;border:1px solid var(--line-2);border-radius:14px;background:var(--surface-2);color:var(--ink);font:500 15.5px var(--f-body)}.wl-grid input:focus,.wl-grid select:focus{outline:0;border-color:var(--g2)}.wl-slug{display:flex;align-items:center;gap:8px}.wl-slug em{font-style:normal;color:var(--ink-3);white-space:nowrap}.wl-hp{position:absolute!important;left:-9999px;width:1px;height:1px;overflow:hidden}.wl-err{margin:0;color:#ff8a9a}.wl-go{justify-self:start}.wl-pos{display:flex;align-items:baseline;gap:8px;margin:0}.wl-pos b{font:400 72px/1 var(--f-display);color:var(--ink)}.wl-share{display:flex;flex-wrap:wrap;gap:12px}.wl-share input{flex:1;min-width:220px;height:54px;padding:0 14px;border:1px solid var(--line-2);border-radius:14px;background:var(--surface-2);color:var(--ink);font:500 14px var(--f-body)}
.perks{display:grid;gap:14px;margin:0;padding:0;list-style:none}
.perks li{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;padding:18px;border-radius:20px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line)}
.perks li>i{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--grad);color:#fff;font:italic 400 19px/1 var(--f-display)}
.perks b{display:block;color:var(--ink);margin-bottom:2px}.perks span{font-size:14.5px;color:var(--ink-3)}

@media (max-width:1100px){.nav{gap:18px}.signin{display:none}}
@media (max-width:980px){
  .nav{display:none}.menu{display:block}.bar .btn.sm{margin-left:auto}.signin{display:none}
  .lhero-in,.wl-in,.split{grid-template-columns:minmax(0,1fr)}.split .sec-h{position:static}
  .lhero-v{order:2}.feats,.tiles,.hcats{grid-template-columns:repeat(2,minmax(0,1fr))}.flow{grid-template-columns:repeat(2,minmax(0,1fr))}
  .adoc{grid-template-columns:minmax(0,1fr);gap:0}.aside{display:none}
  .cta{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:640px){
  .bar{height:64px;gap:12px}.brand b{font-size:25px}.brand img{width:30px;height:30px}
  .grid3,.grid2,.feats,.tiles,.hcats,.flow{grid-template-columns:minmax(0,1fr)}
  .sec{padding-top:40px;padding-bottom:40px}.lhero{padding-top:28px}
  .chip{left:auto;right:-6px;bottom:40px}
  .wl-grid{grid-template-columns:minmax(0,1fr)}.wl-form,.wl-done{padding:22px}
  .cmp{font-size:13px}.cmp th,.cmp td{padding:9px 6px}
  .acts .btn{flex:1 1 auto}
  .mock{padding:20px;transform:none}
  .feat{padding:20px;gap:6px}.feat-n{font-size:24px;margin-bottom:4px}
  .flow{gap:0}.flow li{display:grid;grid-template-columns:52px minmax(0,1fr);align-items:baseline;padding:16px 0}.flow li::before{margin:0;font-size:30px}
  .tile{padding:20px}.cta-w{padding-bottom:56px}
  .dev{width:min(270px,68vw)}
}
@media (max-width:380px){.bar .btn.sm{padding:0 12px;letter-spacing:.08em}}
` + footerCss;
