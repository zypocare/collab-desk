// Builds the website's content pages into site/: the public help centre (from the app's own help
// articles), landing pages, guides, a 404 page, the shared stylesheet and the sitemap.
// Run from the repo:  node site/build/build.mjs   (Node 22.6+ reads the app's TypeScript directly)
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTICLES, CATEGORIES } from '../../web/src/lib/help/articles.ts';
import { APP, CSS, cta, esc, JOIN, JOIN_BRAND, JOIN_LABEL, md, page, PRELAUNCH, SITE } from './layout.mjs';
import { LANDING } from './landing.mjs';
import { GUIDES } from './guides.mjs';
import { pricingPage, refundPage } from './pricing.mjs';
import { waitlistPage } from './waitlist.mjs';

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
for (const l of LANDING) {
	const related = (l.related ?? []).map((s) => landBySlug[s]).filter(Boolean);
	const guides = (l.guides ?? []).map((s) => guideBySlug[s]).filter(Boolean);
	const body = `
<section class="hero wrap">
  <span class="eb">${esc(l.eb)}</span>
  <h1>${esc(l.h1[0])}<em>${esc(l.h1[1])}</em></h1>
  <p class="lede">${md(l.lede)}</p>
  <div class="acts"><a class="btn grad" href="${l.who === 'brand' ? JOIN_BRAND : JOIN}">${PRELAUNCH ? JOIN_LABEL : l.who === 'brand' ? 'Join as a brand' : 'Join free'}</a><small>${PRELAUNCH ? 'Opening soon · free plan · no commission on any deal' : 'Free · no commission on any deal'}</small></div>
</section>
<section class="sec wrap"><div class="grid3">${l.features.map(([h, p]) => `<div class="card"><h3>${esc(h)}</h3><p>${md(p)}</p></div>`).join('')}</div></section>
<section class="sec wrap"><h2>How to <em>start.</em></h2><ol class="steps">${l.steps.map((s) => `<li><span>${md(s)}</span></li>`).join('')}</ol></section>
<section class="sec wrap"><h2>Questions</h2>${faqHtml(l.faq)}</section>
${guides.length || related.length ? `<section class="sec wrap grid2">${guides.length ? `<div><h2>Read next</h2><div class="links">${guides.map((g) => `<a href="/guides/${g.slug}"><b>${esc(g.title)}</b><small>${esc(g.summary)}</small></a>`).join('')}</div></div>` : ''}${related.length ? `<div><h2>Also in Miracle</h2><div class="links">${related.map((r) => `<a href="/${r.slug}"><b>${esc(r.h1.join(''))}</b><small>${esc(r.description)}</small></a>`).join('')}</div></div>` : ''}</section>` : ''}
${cta(...(l.cta ?? []), l.who)}`;
	write(`${l.slug}.html`, page({ path: `/${l.slug}`, title: l.title, description: l.description, body, ld: [faqLd(l.faq)], crumbs: [{ name: l.who === 'brand' ? 'For brands' : 'For creators', path: l.who === 'brand' ? '/find-influencers-india' : '/get-brand-deals' }, { name: l.h1.join('').replace(/\.$/, ''), path: `/${l.slug}` }].filter((c, i, a) => a.findIndex((x) => x.path === c.path) === i) }));
	urls.push([`/${l.slug}`, 'weekly', 0.9]);
}

// ------------------------------------------------------------------ guides
const block = (b) =>
	b.h ? `<h2>${md(b.h)}</h2>`
	: b.p ? `<p>${md(b.p)}</p>`
	: b.list ? `<ul>${b.list.map((x) => `<li>${md(x)}</li>`).join('')}</ul>`
	: b.steps ? `<ol>${b.steps.map((x) => `<li>${md(x)}</li>`).join('')}</ol>`
	: b.tip ? `<p class="tip">${md(b.tip)}</p>`
	: b.tpl ? `<pre class="tpl">${esc(b.tpl)}</pre>`
	: b.table ? `<div class="table"><table><thead><tr>${b.table[0].map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.table.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
	: '';
const when = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
for (const g of GUIDES) {
	const land = landBySlug[g.cta];
	const more = GUIDES.filter((x) => x.slug !== g.slug && x.who === g.who).slice(0, 3);
	const body = `
<article class="hero wrap prose">
  <span class="eb">${g.who === 'brand' ? 'Guide for brands' : 'Guide for creators'}</span>
  <h1>${esc(g.title)}</h1>
  <p class="meta">Updated ${when(g.updated)} · by the Miracle team</p>
  <p class="lede">${md(g.description)}</p>
  ${g.body.map(block).join('\n  ')}
  <h2>Questions</h2>
  ${faqHtml(g.faq)}
</article>
<section class="sec wrap grid2">
  <div><h2>More guides</h2><div class="links">${more.map((m) => `<a href="/guides/${m.slug}"><b>${esc(m.title)}</b><small>${esc(m.summary)}</small></a>`).join('')}</div></div>
  ${land ? `<div><h2>Do it with Miracle</h2><div class="links"><a href="/${land.slug}"><b>${esc(land.h1.join(''))}</b><small>${esc(land.description)}</small></a></div></div>` : ''}
</section>
${cta(undefined, undefined, g.who)}`;
	const ld = [
		{ '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description, datePublished: g.updated, dateModified: g.updated, inLanguage: 'en-IN', mainEntityOfPage: `${SITE}/guides/${g.slug}`, image: `${SITE}/og.jpg`, author: { '@type': 'Organization', name: 'Miracle', url: SITE }, publisher: { '@type': 'Organization', name: 'Miracle', logo: { '@type': 'ImageObject', url: `${SITE}/icon-192.png` } } },
		faqLd(g.faq)
	];
	write(`guides/${g.slug}.html`, page({ path: `/guides/${g.slug}`, title: `${g.title} · Miracle`, description: g.description, body, ld, ogType: 'article', crumbs: [{ name: 'Guides', path: '/guides' }, { name: g.title, path: `/guides/${g.slug}` }] }));
	urls.push([`/guides/${g.slug}`, 'monthly', 0.8]);
}
write('guides/index.html', page({
	path: '/guides',
	title: 'Guides for creators and brands in India · Miracle',
	description: 'Practical guides on getting brand deals, pitching brands, what to charge, media kits, ASCI ad rules and finding influencers in India.',
	crumbs: [{ name: 'Guides', path: '/guides' }],
	body: `
<section class="hero wrap"><span class="eb">Guides</span><h1>Learn the <em>business.</em></h1><p class="lede">How to get brand deals, what to charge, how to pitch and how to work with creators, in plain words.</p></section>
${[['creator', 'For creators'], ['brand', 'For brands']].map(([w, label]) => `<section class="sec wrap"><h2>${label}</h2><div class="links">${GUIDES.filter((g) => g.who === w).map((g) => `<a href="/guides/${g.slug}"><b>${esc(g.title)}</b><small>${esc(g.summary)}</small></a>`).join('')}</div></section>`).join('')}
<section class="sec wrap"><h2>Free tools</h2><div class="links"><a href="/tools/rate-calculator"><b>Instagram rate calculator</b><small>What to charge for a reel, post or story.</small></a><a href="/tools/engagement-calculator"><b>Engagement rate calculator</b><small>By followers and by views, compared with accounts your size.</small></a></div></section>
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
	const more = ARTICLES.filter((x) => x.category === a.category && x.slug !== a.slug).slice(0, 4);
	const body = `
<article class="hero wrap prose">
  <span class="eb">Help · ${esc(cat?.label ?? '')}</span>
  <h1>${esc(a.title)}</h1>
  <p class="lede">${md(a.summary)}</p>
  ${a.body.map(hblock).join('\n  ')}
  ${a.links?.length ? `<div class="acts">${a.links.map((l) => `<a class="btn ghost sm" href="${appLink(l.href)}">${esc(l.label)}</a>`).join('')}</div>` : ''}
  <p class="tip">Still stuck? In the app, open <b>Help › Contact support</b>, or email <a href="mailto:support@miracleapp.live">support@miracleapp.live</a>.</p>
</article>
${more.length ? `<section class="sec wrap"><h2>More on ${esc((cat?.label ?? 'this').toLowerCase())}</h2><div class="links">${more.map((m) => `<a href="/help/${m.slug}"><b>${esc(m.title)}</b><small>${esc(m.summary)}</small></a>`).join('')}</div></section>` : ''}
${cta(undefined, undefined, a.audience === 'brand' ? 'brand' : 'creator')}`;
	const ld = [{ '@context': 'https://schema.org', '@type': 'TechArticle', headline: a.title, description: a.summary, inLanguage: 'en-IN', mainEntityOfPage: `${SITE}/help/${a.slug}`, publisher: { '@type': 'Organization', name: 'Miracle', logo: { '@type': 'ImageObject', url: `${SITE}/icon-192.png` } } }];
	write(`help/${a.slug}.html`, page({ path: `/help/${a.slug}`, title: `${a.title} · Miracle help`, description: a.summary, body, ld, crumbs: [{ name: 'Help', path: '/help' }, { name: a.title, path: `/help/${a.slug}` }] }));
	urls.push([`/help/${a.slug}`, 'monthly', 0.6]);
}
write('help/index.html', page({
	path: '/help',
	title: 'Miracle help centre: guides for creators and brands',
	description: 'How to use Miracle: your page, Instagram, alerts, requests, quotes, drafts, invoices, payments, growth tools and your account. Or contact support.',
	crumbs: [{ name: 'Help', path: '/help' }],
	body: `
<section class="hero wrap"><span class="eb">Help centre</span><h1>How can we <em>help?</em></h1>
  <form class="search" role="search" onsubmit="return false"><input id="hq" placeholder="Search the help centre" aria-label="Search the help centre" autocomplete="off"></form>
  <p class="meta">Signed in? Ask Miracle’s AI in the app (Help), or email <a href="mailto:support@miracleapp.live">support@miracleapp.live</a>.</p>
</section>
${CATEGORIES.map((c) => {
	const list = ARTICLES.filter((a) => a.category === c.id);
	return list.length ? `<section class="sec wrap cat" data-cat><h2>${esc(c.label)}</h2><div class="links">${list.map((a) => `<a href="/help/${a.slug}" data-k="${esc([a.title, a.summary, ...a.keywords].join(' ').toLowerCase())}"><b>${esc(a.title)}</b><small>${esc(a.summary)}</small></a>`).join('')}</div></section>` : '';
}).join('')}
<script>
document.getElementById('hq').addEventListener('input', function (e) {
  var q = e.target.value.toLowerCase().trim().split(/\\s+/).filter(Boolean);
  document.querySelectorAll('[data-cat]').forEach(function (s) {
    var any = false;
    s.querySelectorAll('a[data-k]').forEach(function (a) { var ok = q.every(function (w) { return a.dataset.k.indexOf(w) >= 0; }); a.hidden = !ok; any = any || ok; });
    s.hidden = !any;
  });
});
</script>
${cta()}`
}));
urls.push(['/help', 'weekly', 0.7]);

// ------------------------------------------------------------------ 404, stylesheet, sitemap
write('404.html', page({ path: '/404', title: 'Page not found · Miracle', description: 'This page isn’t here.', noindex: true, body: `<section class="hero wrap"><span class="eb">404</span><h1>Not <em>here.</em></h1><p class="lede">That page moved or never existed.</p><div class="acts"><a class="btn" href="/">Miracle home</a><a class="btn ghost" href="/guides">Guides</a><a class="btn ghost" href="/help">Help</a></div></section>` }));
write('pricing.html', pricingPage());
write('waitlist.html', waitlistPage());
write('refund-policy.html', refundPage());
write('assets/site.css', CSS.trim() + '\n');

const fixed = [['/', 'weekly', 1.0], ['/creators', 'daily', 0.9], ['/pricing', 'monthly', 0.9], ['/waitlist', 'weekly', 0.8], ['/refund-policy', 'yearly', 0.3], ['/tools/rate-calculator', 'monthly', 0.8], ['/tools/engagement-calculator', 'monthly', 0.8], ['/privacy', 'yearly', 0.2], ['/terms', 'yearly', 0.2], ['/data-deletion', 'yearly', 0.2]];
const today = new Date().toISOString().slice(0, 10);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...fixed, ...urls].map(([u, f, p]) => `<url><loc>${SITE}${u === '/' ? '/' : u}</loc><lastmod>${today}</lastmod><changefreq>${f}</changefreq><priority>${p.toFixed(1)}</priority></url>`).join('\n')}
</urlset>
`);
console.log(`built ${LANDING.length} landing pages, ${GUIDES.length} guides, ${ARTICLES.length} help articles; sitemap ${fixed.length + urls.length} urls`);
