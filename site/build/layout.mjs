// The website's content pages (guides, help, landing pages): one look, one header and footer, and the
// tags search engines read. Everything is plain HTML written by build.mjs; nothing runs in the browser
// except the small help search.

export const SITE = 'https://www.miracleapp.live';
export const APP = 'https://app.miracleapp.live';
export const JOIN = `${APP}/signup?as=creator`;
export const JOIN_BRAND = `${APP}/signup?as=brand`;

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Inline formatting in content: **bold** and [text](href). Everything else is escaped. */
export const md = (s) =>
	esc(s)
		.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
		.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, h) => `<a href="${h}">${t}</a>`);


export function page({ path, title, description, body, ld = [], crumbs = [], noindex = false, ogType = 'website' }) {
	const url = `${SITE}${path}`;
	const bc = crumbs.length
		? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ name: 'Miracle', path: '/' }, ...crumbs].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${SITE}${c.path}` })) }]
		: [];
	const json = [...ld, ...bc].map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n');
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
  <a class="brand" href="/" aria-label="Miracle home"><img src="/icon.svg" alt="" width="30" height="30"><b>Miracle</b></a>
  <nav aria-label="Main"><a href="/get-brand-deals">For creators</a><a class="hide-xs" href="/find-influencers-india">For brands</a><a class="hide-s" href="/guides">Guides</a><a class="hide-s" href="/help">Help</a><a class="hide-xs" href="/pricing">Pricing</a><a class="btn sm" href="${JOIN}">Join free</a></nav>
</div></header>
<main>
${crumbs.length ? `<nav class="crumbs wrap" aria-label="You are here"><a href="/">Miracle</a>${crumbs.map((c, i) => (i === crumbs.length - 1 ? ` <span>›</span> <span aria-current="page">${esc(c.name)}</span>` : ` <span>›</span> <a href="${c.path}">${esc(c.name)}</a>`)).join('')}</nav>` : ''}
${body}
</main>
<footer class="foot wrap">
  <div class="cols">
    <nav aria-label="For creators"><b>For creators</b><a href="/get-brand-deals">Get brand deals</a><a href="/pitch-brands">Pitch brands with AI</a><a href="/link-in-bio-for-creators">Link in bio that books deals</a><a href="/influencer-media-kit">Live media kit</a><a href="/influencer-rate-card">Rate card</a><a href="/brand-collaboration-management">Manage collabs</a><a href="/get-paid-by-brands">Get paid on time</a></nav>
    <nav aria-label="For brands"><b>For brands</b><a href="/find-influencers-india">Find influencers in India</a><a href="/creators">Creator directory</a><a href="/influencer-marketing-no-commission">No-commission influencer marketing</a><a href="${JOIN_BRAND}">Join as a brand</a></nav>
    <nav aria-label="Learn"><b>Learn</b><a href="/guides">Guides</a><a href="/help">Help centre</a><a href="/tools/rate-calculator">Rate calculator</a><a href="/tools/engagement-calculator">Engagement calculator</a></nav>
    <nav aria-label="Company"><b>Company</b><a href="/pricing">Pricing</a><a href="mailto:support@miracleapp.live">support@miracleapp.live</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/refund-policy">Refunds &amp; cancellation</a><a href="/data-deletion">Data deletion</a></nav>
  </div>
  <p class="legal">© 2026 Miracle is a product of Zyposoft Technologies Private Limited, Bengaluru, India. No commission on any deal: brands pay creators directly.</p>
</footer>
</body>
</html>
`;
}

/** The closing call to action, the same everywhere. */
export const cta = (h = 'Get more brand deals.', p = 'Your own page brands book you from, AI that finds brands and writes the pitch, and payments that arrive on time. Free, and no commission on any deal.', who = 'creator') => `
<section class="cta wrap"><div><span class="eb">Miracle</span><h2>${h.replace(/(\S+\.)$/, '<em>$1</em>')}</h2><p>${p}</p></div><a class="btn grad" href="${who === 'brand' ? JOIN_BRAND : JOIN}">${who === 'brand' ? 'Join as a brand' : 'Join free'}</a></section>`;

export const CSS = `
:root{--bg:#110D11;--surface:#1A151A;--surface-2:#231D23;--line:#2E262E;--line-2:#3E343E;--ink:#F4EEF2;--ink-2:#C9BFC6;--ink-3:#A39AA1;--g1:#9C7BFF;--g2:#F25A90;--g3:#FFAE6B;--ok:#6FD08C;--grad:linear-gradient(115deg,var(--g1),var(--g2) 52%,var(--g3));--f-display:'Instrument Serif',Georgia,'Times New Roman',serif;--f-body:'Geist',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color-scheme:dark}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:radial-gradient(60% 40% at 10% 0%,rgba(156,123,255,.18),transparent 70%),radial-gradient(50% 35% at 95% 15%,rgba(242,90,144,.12),transparent 70%),var(--bg);background-attachment:fixed;color:var(--ink-2);font:400 16.5px/1.65 var(--f-body);-webkit-font-smoothing:antialiased}
a{color:var(--ink)}:focus-visible{outline:2px solid var(--g3);outline-offset:3px}
.wrap{width:min(1120px,100%);margin:0 auto;padding-left:max(18px,env(safe-area-inset-left,0px));padding-right:max(18px,env(safe-area-inset-right,0px))}
.top{position:sticky;top:0;z-index:5;background:color-mix(in oklab,var(--bg) 90%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;height:66px}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);text-decoration:none}.brand b{font:italic 400 27px/1 var(--f-display)}
.bar nav{display:flex;align-items:center;gap:20px;font-size:14.5px;white-space:nowrap}.bar nav a:not(.btn){color:var(--ink-2);text-decoration:none}.bar nav a:not(.btn):hover{color:var(--ink)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:50px;padding:14px 24px;border:0;background:var(--ink);color:var(--bg);font:700 13px/1.25 var(--f-body);letter-spacing:.12em;text-transform:uppercase;text-decoration:none;text-align:center;box-shadow:4px 4px 0 var(--g2);transition:transform .12s,box-shadow .12s}
.btn:hover{transform:translate(-2px,-2px)}.btn:active{transform:translate(4px,4px);box-shadow:none}
.btn.grad{background:var(--grad);color:#fff;box-shadow:4px 4px 0 #6a4bc9}.btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--line-2),4px 4px 0 var(--line)}.btn.sm{min-height:38px;padding:8px 14px;font-size:12px}
.eb{font:700 11.5px/1.2 var(--f-body);letter-spacing:.26em;text-transform:uppercase;color:var(--ink-3)}
h1,h2,h3{color:var(--ink);text-wrap:balance}
h1{margin:12px 0 16px;font:400 clamp(42px,6.6vw,78px)/1 var(--f-display);letter-spacing:-.015em}
h2{margin:0 0 12px;font:400 clamp(30px,4vw,44px)/1.06 var(--f-display)}
h3{margin:0 0 6px;font:600 18px/1.3 var(--f-body)}
h1 em,h2 em{font-style:italic;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.08em}
.crumbs{padding-top:18px;font-size:13px;color:var(--ink-3)}.crumbs a{color:var(--ink-3);text-decoration:none}.crumbs a:hover{color:var(--ink)}
.hero{padding-top:44px;padding-bottom:34px}.lede{max-width:64ch;margin:0 0 26px;font-size:clamp(16.5px,1.5vw,19px);color:var(--ink-2)}
.acts{display:flex;flex-wrap:wrap;gap:14px;align-items:center}.acts small{color:var(--ink-3)}
.sec{padding-top:36px;padding-bottom:36px}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.card{padding:22px;border-radius:22px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line)}.card p{margin:0;font-size:15px}
.plans{align-items:stretch}.plan{display:flex;flex-direction:column;gap:10px}.plan.hot{background:radial-gradient(110% 70% at 0% 0%,rgba(242,90,144,.16),transparent 60%),var(--surface);box-shadow:inset 0 0 0 1px rgba(242,90,144,.45)}.plan h3{margin:0}.plan .btn{margin-top:auto;align-self:flex-start}.price{display:flex;align-items:baseline;gap:6px;margin:0!important}.price b{font:400 44px/1 var(--f-display);color:var(--ink)}.price small{color:var(--ink-3)}.plan .alt{font-size:13.5px!important;color:var(--ink-3)}.ticks{display:grid;gap:7px;margin:4px 0 8px;padding:0;list-style:none;font-size:14.5px}.ticks li{padding-left:24px;position:relative}.ticks li::before{content:'✓';position:absolute;left:0;color:var(--ok);font-weight:700}.small{font-size:13.5px;color:var(--ink-3)}
.card .n{display:inline-grid;place-items:center;width:30px;height:30px;margin-bottom:12px;background:var(--ink);color:var(--bg);font:400 18px/1 var(--f-display)}
.steps{counter-reset:s;display:grid;gap:12px;margin:0;padding:0;list-style:none;max-width:760px}
.steps li{counter-increment:s;display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;padding:16px 18px;border-radius:18px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line)}
.steps li::before{content:counter(s);display:grid;place-items:center;width:30px;height:30px;background:var(--ink);color:var(--bg);font:400 18px/1 var(--f-display)}
.prose{max-width:740px}.prose p,.prose li{font-size:17px;line-height:1.72}.prose h2{margin-top:44px}.prose h3{margin-top:28px;font-size:19px}
.prose ul,.prose ol{padding-left:22px}.prose li{margin:6px 0}.prose b{color:var(--ink)}
.prose .tip{margin:22px 0;padding:16px 18px;border-radius:16px;background:color-mix(in oklab,var(--g3) 10%,var(--surface));box-shadow:inset 0 0 0 1px color-mix(in oklab,var(--g3) 25%,var(--line))}
.prose .note{font-size:14px;color:var(--ink-3)}
.table{overflow-x:auto;margin:20px 0;border-radius:16px;box-shadow:inset 0 0 0 1px var(--line)}table{width:100%;border-collapse:collapse;font-size:15px}th,td{padding:11px 14px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--ink);font-weight:600}tr:last-child td{border-bottom:0}
.tpl{margin:18px 0;padding:18px 20px;border-radius:16px;background:#0c090c;box-shadow:inset 0 0 0 1px var(--line-2);font-size:15px;line-height:1.65;white-space:pre-wrap;color:var(--ink-2)}
.faq{display:grid;gap:10px;max-width:820px}
.faq details{border-radius:16px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line)}
.faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:14px;padding:16px 20px;font-weight:600;color:var(--ink)}
.faq summary::-webkit-details-marker{display:none}.faq summary::after{content:"+";font:400 24px/1 var(--f-display);color:var(--ink-3)}.faq details[open] summary::after{content:"–"}
.faq details p{margin:0;padding:0 20px 18px}
.links{display:grid;gap:0;border-radius:20px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
.links a{display:grid;gap:2px;padding:15px 18px;border-top:1px solid var(--line);text-decoration:none}.links a:first-child{border-top:0}.links a:hover{background:var(--surface-2)}
.links b{color:var(--ink);font-weight:600}.links small{font-size:13.5px;color:var(--ink-3)}
.cta{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px;margin-top:36px;padding-top:36px;padding-bottom:44px;border-top:1px solid var(--line)}.cta>div{max-width:600px}.cta p{margin:0}
.search{display:flex;gap:10px;max-width:620px;margin:6px 0 8px}.search input{flex:1;min-width:0;height:54px;padding:0 16px;border:0;background:#0c090c;box-shadow:inset 0 0 0 1px var(--line-2);color:var(--ink);font:500 16px var(--f-body);outline:0}.search input:focus{box-shadow:inset 0 0 0 1.5px var(--g2),4px 4px 0 var(--g2)}
.cat{margin-top:30px}.cat h2{font-size:28px}
.meta{font-size:13.5px;color:var(--ink-3)}
.foot{padding-top:30px;padding-bottom:calc(env(safe-area-inset-bottom,0px) + 36px);border-top:1px solid var(--line);margin-top:20px}
.foot .cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}.foot nav{display:grid;gap:8px;align-content:start;font-size:14px}.foot nav b{color:var(--ink);margin-bottom:4px}.foot nav a{color:var(--ink-3);text-decoration:none}.foot nav a:hover{color:var(--ink)}
.legal{margin:26px 0 0;font-size:13px;color:var(--ink-3)}
@media (max-width:860px){.grid3,.grid2{grid-template-columns:minmax(0,1fr)}.foot .cols{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:420px){.bar nav a.hide-xs{display:none}}
@media (max-width:560px){.bar nav{gap:12px;font-size:13px}.bar nav a.hide-s{display:none}.brand b{font-size:24px}.search{flex-direction:column}.search input{flex:none}}
`;
