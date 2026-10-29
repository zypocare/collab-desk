// Builds the website's content pages into site/: the public help centre (from the app's own help
// articles), landing pages, guides, a 404 page, the shared stylesheet and the sitemap.
// Run from the repo:  node site/build/build.mjs   (Node 22.6+ reads the app's TypeScript directly)
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTICLES, CATEGORIES } from '../../web/src/lib/help/articles.ts';
import { APP, CSS, cta, esc, joinRow, md, mock, page, phone, SITE, slugify } from './layout.mjs';
import { LANDING } from './landing.mjs';
import { GUIDES } from './guides.mjs';
import { pricingPage, refundPage } from './pricing.mjs';
import { waitlistPage } from './waitlist.mjs';
import { DIRECTORY_FOOTER, footerCss, SITE_FOOTER } from './footer.mjs';
import { STATS_SCRIPT } from './stats.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = (rel, html) => {
	const f = join(OUT, rel);
	mkdirSync(dirname(f), { recursive: true });
	writeFileSync(f, html.replace(/\r?\n/g, '\n'));
};
const faqLd = (faq) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') } })) });
const faqHtml = (faq) => `<div class="faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${md(a)}</p></details>`).join('')}</div>`;
const guideBySlug = Object.fromEntries(GUIDES.map((g) => [g.slug, g]));
const landBySlug = Object.fromEntries(LANDING.map((l) => [l.slug, l]));
const urls = [];

// ------------------------------------------------------------------ landing pages
// The plan a feature needs, shown as a tag. Creators are free, so creator features carry none.
const PLAN = { creator: '', brand: 'Brand Pro', agency: 'Agency' };
const tile = (href, b, small, go = 'Read') => `<a class="tile" href="${href}"><b>${esc(b)}</b><small>${esc(small)}</small><span class="go">${go} →</span></a>`;
const sideOf = (who) => (who === 'brand' ? 'brand' : who === 'agency' ? 'agency' : 'creator');
const crumbOf = { creator: { name: 'For creators', path: '/get-brand-deals' }, brand: { name: 'For brands', path: '/find-influencers-india' }, agency: { name: 'For agencies', path: '/influencer-agency-software' } };
for (const l of LANDING) {
	const related = (l.related ?? []).map((s) => landBySlug[s]).filter(Boolean);
	const guides = (l.guides ?? []).map((s) => guideBySlug[s]).filter(Boolean);
	const side = sideOf(l.who);
	const visual = l.shot ? phone(l.shot[0], l.shot[1], l.shot[2]) : l.mock ? mock(l.mock) : '';
	const body = `
<section class="lhero"><div class="wrap lhero-in">
  <div class="lhero-t">
    <span class="eb">${esc(l.eb)}</span>
    <h1>${esc(l.h1[0])}<em>${esc(l.h1[1])}</em></h1>
    <p class="lede">${md(l.lede)}</p>
    ${joinRow(side)}
    <ul class="trust">${(l.trust ?? ['No commission on any deal', 'Instagram’s official API', 'Made in India, for India']).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
  </div>
  <div class="lhero-v">${visual}</div>
</div></section>
<section class="sec wrap">
  <div class="sec-h"><span class="eb">What you get</span><h2>${md(l.fh ?? 'Everything it does *for you.*').replace(/\*(.+?)\*/g, '<em>$1</em>')}</h2></div>
  <div class="feats">${l.features.map(([h, p, pro], i) => `<div class="feat"><span class="feat-n">${String(i + 1).padStart(2, '0')}${pro && PLAN[pro === true ? side : pro] ? `<span class="tag">${PLAN[pro === true ? side : pro]}</span>` : ''}</span><h3>${esc(h)}</h3><p>${md(p)}</p></div>`).join('')}</div>
</section>
<section class="sec wrap">
  <div class="sec-h"><span class="eb">How it works</span><h2>Up and running <em>in a day.</em></h2></div>
  <ol class="flow">${l.steps.map((x) => `<li><span>${md(x)}</span></li>`).join('')}</ol>
</section>
<section class="sec wrap split">
  <div class="sec-h"><span class="eb">Questions</span><h2>Good to <em>know.</em></h2><p>More answers in the <a href="/help">help centre</a>, or write to <a href="mailto:support@miracleapp.live">support@miracleapp.live</a>.</p></div>
  ${faqHtml(l.faq)}
</section>
${guides.length || related.length ? `<section class="sec wrap"><div class="sec-h"><span class="eb">Keep reading</span><h2>More from <em>Miracle.</em></h2></div><div class="tiles">${((t) => t.slice(0, t.length >= 6 ? 6 : 3))([...related.map((r) => tile(`/${r.slug}`, r.h1.join(''), r.description, 'See how')), ...guides.map((g) => tile(`/guides/${g.slug}`, g.title, g.summary))]).join('')}</div></section>` : ''}
${cta(l.cta?.[0], l.cta?.[1], side)}`;
	write(`${l.slug}.html`, page({ path: `/${l.slug}`, title: l.title, description: l.description, body, ld: [faqLd(l.faq)], section: side, crumbs: [crumbOf[side], { name: l.h1.join('').replace(/\.$/, ''), path: `/${l.slug}` }].filter((c, i, a) => a.findIndex((x) => x.path === c.path) === i) }));
	urls.push([`/${l.slug}`, 'weekly', 0.9]);
}

// ------------------------------------------------------------------ guides
const block = (b) =>
	b.h ? `<h2 id="${slugify(b.h)}">${md(b.h)}</h2>`
	: b.p ? `<p>${md(b.p)}</p>`
	: b.list ? `<ul>${b.list.map((x) => `<li>${md(x)}</li>`).join('')}</ul>`
	: b.steps ? `<ol>${b.steps.map((x) => `<li>${md(x)}</li>`).join('')}</ol>`
	: b.tip ? `<p class="tip">${md(b.tip)}</p>`
	: b.tpl ? `<pre class="tpl">${esc(b.tpl)}</pre>`
	: b.table ? `<div class="table"><table><thead><tr>${b.table[0].map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.table.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
	: '';
const when = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
const words = (g) => JSON.stringify(g.body).split(/\s+/).length;
for (const g of GUIDES) {
	const land = landBySlug[g.cta];
	const more = GUIDES.filter((x) => x.slug !== g.slug && x.who === g.who).slice(0, 2);
	const heads = g.body.filter((b) => b.h);
	const body = `
<header class="ahead wrap">
  <span class="eb">${g.who === 'brand' ? 'Guide for brands' : 'Guide for creators'}</span>
  <h1>${esc(g.title)}</h1>
  <p class="lede">${md(g.description)}</p>
  <p class="byline"><span>Updated ${when(g.updated)}</span><span>By the Miracle team</span><span>${Math.max(3, Math.round(words(g) / 220))} min read</span></p>
</header>
<div class="wrap adoc">
  <nav class="aside" aria-label="On this page"><b>On this page</b>${heads.map((h) => `<a href="#${slugify(h.h)}">${esc(h.h.replace(/\*\*/g, ''))}</a>`).join('')}<a href="#questions">Questions</a>${land ? `<div class="box"><b>Do it with Miracle</b><br>${esc(land.h1.join(''))} <a href="/${land.slug}">See how</a></div>` : ''}</nav>
  <article class="prose">
  ${g.body.map(block).join('\n  ')}
  <h2 id="questions">Questions</h2>
  ${faqHtml(g.faq)}
  </article>
</div>
<section class="sec wrap"><div class="sec-h"><span class="eb">Keep reading</span><h2>More <em>guides.</em></h2></div><div class="tiles">${[...(land ? [tile(`/${land.slug}`, land.h1.join(''), land.description, 'See how')] : []), ...more.map((m) => tile(`/guides/${m.slug}`, m.title, m.summary))].join('')}</div></section>
${cta(undefined, undefined, g.who)}`;
	const ld = [
		{ '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description, datePublished: g.updated, dateModified: g.updated, inLanguage: 'en-IN', mainEntityOfPage: `${SITE}/guides/${g.slug}`, image: `${SITE}/og.jpg`, author: { '@type': 'Organization', name: 'Miracle', url: SITE }, publisher: { '@type': 'Organization', name: 'Miracle', logo: { '@type': 'ImageObject', url: `${SITE}/icon-192.png` } } },
		faqLd(g.faq)
	];
	write(`guides/${g.slug}.html`, page({ path: `/guides/${g.slug}`, title: `${g.title} · Miracle`, description: g.description, body, ld, ogType: 'article', section: 'guides', crumbs: [{ name: 'Guides', path: '/guides' }, { name: g.title, path: `/guides/${g.slug}` }] }));
	urls.push([`/guides/${g.slug}`, 'monthly', 0.8]);
}
write('guides/index.html', page({
	path: '/guides',
	title: 'Guides for creators and brands in India · Miracle',
	description: 'Practical guides on getting brand deals, pitching brands, what to charge, media kits, ASCI ad rules and finding influencers in India.',
	crumbs: [{ name: 'Guides', path: '/guides' }],
	section: 'guides',
	body: `
<section class="hero wrap"><span class="eb">Guides</span><h1>Learn the <em>business.</em></h1><p class="lede">How to get brand deals, what to charge, how to pitch and how to work with creators, in plain words. Written for India, updated for 2026.</p></section>
${[['creator', 'For creators', 'Deals, rates and pitching.'], ['brand', 'For brands', 'Finding and working with creators.']].map(([w, label, sub]) => `<section class="sec wrap"><div class="sec-h"><span class="eb">${label}</span><h2>${sub.replace(/(\S+\.)$/, '<em>$1</em>')}</h2></div><div class="tiles">${GUIDES.filter((g) => g.who === w).map((g) => tile(`/guides/${g.slug}`, g.title, g.summary)).join('')}</div></section>`).join('')}
<section class="sec wrap"><div class="sec-h"><span class="eb">Free tools</span><h2>Work it <em>out.</em></h2></div><div class="tiles">${tile('/tools/rate-calculator', 'Instagram rate calculator', 'What to charge for a reel, post or story, with the formula shown.', 'Open')}${tile('/tools/engagement-calculator', 'Engagement rate calculator', 'By followers and by views, compared with accounts your size.', 'Open')}</div></section>
${cta()}`
}));
urls.push(['/guides', 'weekly', 0.8]);

// ------------------------------------------------------------------ help centre (public copy of the in-app help)
const appLink = (href) => (href.startsWith('/brand/') ? `${APP}${href}` : href.startsWith('/studio/') ? `${APP}/login` : href);
const hblock = (b) =>
	'p' in b ? `<p>${md(b.p)}</p>`
	: 'steps' in b ? `<ol>${b.steps.map((x) => `<li>${md(x)}</li>`).join('')}</ol>`
	: 'list' in b ? `<ul>${b.list.map((x) => `<li>${md(x)}</li>`).join('')}</ul>`
	: `<p class="tip">${md(b.tip)}</p>`;
const catOf = (id) => CATEGORIES.find((c) => c.id === id);
for (const a of ARTICLES) {
	const cat = catOf(a.category);
	const inCat = ARTICLES.filter((x) => x.category === a.category);
	const more = inCat.filter((x) => x.slug !== a.slug).slice(0, 3);
	const body = `
<header class="ahead wrap">
  <span class="eb">Help · ${esc(cat?.label ?? '')}</span>
  <h1>${esc(a.title)}</h1>
  <p class="lede">${md(a.summary)}</p>
</header>
<div class="wrap adoc">
  <nav class="aside" aria-label="${esc(cat?.label ?? 'Help')}"><b>${esc(cat?.label ?? 'Help')}</b>${inCat.map((x) => `<a href="/help/${x.slug}"${x.slug === a.slug ? ' aria-current="page"' : ''}>${esc(x.title)}</a>`).join('')}<a href="/help">All help topics</a><div class="box"><b>Still stuck?</b><br>In the app, open Help › Contact support, or email <a href="mailto:support@miracleapp.live">support@miracleapp.live</a>.</div></nav>
  <article class="prose">
  ${a.body.map(hblock).join('\n  ')}
  ${a.links?.length ? `<div class="acts">${a.links.map((l) => `<a class="btn ghost sm" href="${appLink(l.href)}">${esc(l.label)}</a>`).join('')}</div>` : ''}
  <p class="tip">Still stuck? In the app, open <b>Help › Contact support</b>, or email <a href="mailto:support@miracleapp.live">support@miracleapp.live</a>. We reply within a working day.</p>
  </article>
</div>
${more.length ? `<section class="sec wrap"><div class="sec-h"><span class="eb">${esc(cat?.label ?? 'Help')}</span><h2>Related <em>articles.</em></h2></div><div class="tiles">${more.map((m) => tile(`/help/${m.slug}`, m.title, m.summary)).join('')}</div></section>` : ''}
${cta(undefined, undefined, a.audience === 'brand' ? 'brand' : 'creator')}`;
	const ld = [{ '@context': 'https://schema.org', '@type': 'TechArticle', headline: a.title, description: a.summary, inLanguage: 'en-IN', mainEntityOfPage: `${SITE}/help/${a.slug}`, publisher: { '@type': 'Organization', name: 'Miracle', logo: { '@type': 'ImageObject', url: `${SITE}/icon-192.png` } } }];
	write(`help/${a.slug}.html`, page({ path: `/help/${a.slug}`, title: `${a.title} · Miracle help`, description: a.summary, body, ld, section: 'help', crumbs: [{ name: 'Help', path: '/help' }, { name: a.title, path: `/help/${a.slug}` }] }));
	urls.push([`/help/${a.slug}`, 'monthly', 0.6]);
}
write('help/index.html', page({
	path: '/help',
	title: 'Miracle help centre: guides for creators and brands',
	description: 'How to use Miracle: your page, Instagram, alerts, requests, quotes, drafts, invoices, payments, growth tools and your account. Or contact support.',
	crumbs: [{ name: 'Help', path: '/help' }],
	section: 'help',
	body: `
<section class="hhero wrap"><span class="eb">Help centre</span><h1>How can we <em>help?</em></h1>
  <form class="search" role="search" onsubmit="return false"><input id="hq" placeholder="Search: invoice, Instagram, quote…" aria-label="Search the help centre" autocomplete="off"></form>
  <p class="meta">Signed in? Ask Miracle’s AI in the app (Help), or email <a href="mailto:support@miracleapp.live">support@miracleapp.live</a>.</p>
</section>
<section class="sec wrap"><div class="hcats">
${CATEGORIES.map((c) => {
	const list = ARTICLES.filter((a) => a.category === c.id);
	const aud = new Set(list.map((a) => a.audience ?? 'creator'));
	return list.length ? `<div class="hcat" data-cat><h2>${esc(c.label)}</h2><p class="who">${aud.has('all') ? 'For everyone' : aud.has('brand') && !aud.has('creator') ? 'For brands' : aud.has('brand') ? 'For creators and brands' : 'For creators'} · ${list.length} articles</p><ul>${list.map((a) => `<li><a href="/help/${a.slug}" data-k="${esc([a.title, a.summary, ...a.keywords].join(' ').toLowerCase())}">${esc(a.title)}</a></li>`).join('')}</ul></div>` : '';
}).join('')}
</div><p class="none" id="hnone" hidden>Nothing found. Try another word, or email <a href="mailto:support@miracleapp.live">support@miracleapp.live</a>.</p></section>
<script>
document.getElementById('hq').addEventListener('input', function (e) {
  var q = e.target.value.toLowerCase().trim().split(/\\s+/).filter(Boolean), all = false;
  document.querySelectorAll('[data-cat]').forEach(function (s) {
    var any = false;
    s.querySelectorAll('a[data-k]').forEach(function (a) { var ok = q.every(function (w) { return a.dataset.k.indexOf(w) >= 0; }); a.parentNode.hidden = !ok; any = any || ok; });
    s.hidden = !any; all = all || any;
  });
  document.getElementById('hnone').hidden = all;
});
</script>
${cta()}`
}));
urls.push(['/help', 'weekly', 0.7]);

// ------------------------------------------------------------------ 404, stylesheet, sitemap
write('404.html', page({ path: '/404', title: 'Page not found · Miracle', description: 'This page isn’t here.', noindex: true, body: `<section class="hhero wrap"><span class="eb">404</span><h1>Not <em>here.</em></h1><p class="lede">That page moved or never existed.</p><div class="acts" style="justify-content:center"><a class="btn" href="/">Miracle home</a><a class="btn ghost" href="/guides">Guides</a><a class="btn ghost" href="/help">Help</a></div></section>` }));
write('pricing.html', pricingPage());
write('waitlist.html', waitlistPage());
write('refund-policy.html', refundPage());
write('assets/site.css', CSS.trim() + '\n');

// ------------------------------------------------------------------ the same footer on the hand-written pages
// Home, legal, sign-in and the calculators keep their own markup; their footer and its CSS are stamped in here
// between markers, so every page's footer stays the same. The creator directory (in the web app's worker) gets
// a copy too.
const HAND = ['index.html', 'privacy.html', 'terms.html', 'data-deletion.html', 'signin.html', 'tools/rate-calculator.html', 'tools/engagement-calculator.html'];
const FOOT_A = '<!-- site footer -->', FOOT_B = '<!-- /site footer -->';
const STATS_A = '<!-- site stats -->', STATS_B = '<!-- /site stats -->';
const CSS_TAG = `<style id="sf-css">${footerCss.trim()}</style>`;
for (const rel of HAND) {
	const f = join(OUT, rel);
	const raw = readFileSync(f, 'utf8');
	const crlf = raw.includes('\r\n');
	let h = raw.replace(/\r\n/g, '\n');
	const block = `${FOOT_A}\n${SITE_FOOTER}\n${FOOT_B}`;
	if (h.includes(FOOT_A)) h = h.slice(0, h.indexOf(FOOT_A)) + block + h.slice(h.indexOf(FOOT_B) + FOOT_B.length);
	else if (/<footer[\s>][\s\S]*?<\/footer>/.test(h)) h = h.replace(/<footer[\s>][\s\S]*?<\/footer>/, () => block);
	else h = h.replace(/<\/body>/, () => `${block}\n</body>`);
	h = /<style id="sf-css">[\s\S]*?<\/style>/.test(h) ? h.replace(/<style id="sf-css">[\s\S]*?<\/style>/, () => CSS_TAG) : h.replace('</head>', () => `${CSS_TAG}\n</head>`);
	// The visitor counter (stats.mjs), between its own markers, just before </body>.
	const stats = `${STATS_A}\n${STATS_SCRIPT}\n${STATS_B}`;
	h = h.includes(STATS_A) ? h.slice(0, h.indexOf(STATS_A)) + stats + h.slice(h.indexOf(STATS_B) + STATS_B.length) : h.replace(/<\/body>/, () => `${stats}\n</body>`);
	if (h !== raw.replace(/\r\n/g, '\n')) writeFileSync(f, crlf ? h.replace(/\n/g, '\r\n') : h);
}
writeFileSync(join(OUT, '../web/worker/siteFooter.ts'), `// Written by site/build/build.mjs from site/build/footer.mjs: the website's footer, for the creator directory.\n// Don't edit by hand; change footer.mjs and run \`node site/build/build.mjs\`.\nexport const SITE_FOOTER = ${JSON.stringify(DIRECTORY_FOOTER)};\nexport const SITE_FOOTER_CSS = ${JSON.stringify(footerCss.trim())};\n`);

const fixed = [['/', 'weekly', 1.0], ['/creators', 'daily', 0.9], ['/pricing', 'monthly', 0.9], ['/waitlist', 'weekly', 0.8], ['/refund-policy', 'yearly', 0.3], ['/tools/rate-calculator', 'monthly', 0.8], ['/tools/engagement-calculator', 'monthly', 0.8], ['/privacy', 'yearly', 0.2], ['/terms', 'yearly', 0.2], ['/data-deletion', 'yearly', 0.2]];
const today = new Date().toISOString().slice(0, 10);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...fixed, ...urls].map(([u, f, p]) => `<url><loc>${SITE}${u === '/' ? '/' : u}</loc><lastmod>${today}</lastmod><changefreq>${f}</changefreq><priority>${p.toFixed(1)}</priority></url>`).join('\n')}
</urlset>
`);
console.log(`built ${LANDING.length} landing pages, ${GUIDES.length} guides, ${ARTICLES.length} help articles; sitemap ${fixed.length + urls.length} urls`);
