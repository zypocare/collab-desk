// The public creator directory (www.miracleapp.live/creators, also app.miracleapp.live/creators): creators
// who chose to be listed, by niche and city, with their live Instagram numbers, starting price and
// reviews. Answered as finished HTML by the server so search engines read it (the app isn't loaded).
//   /creators                         everyone, ?q= to search, ?page=
//   /creators/skincare                a niche
//   /creators/in/bengaluru            a city
//   /creators/skincare/in/bengaluru   both
//   /creators/sitemap.xml             every page above that has someone on it
// Only public data, with the website's own public key.

import type { PageEnv } from './page';

declare const caches: { default: { match: (k: Request) => Promise<Response | undefined>; put: (k: Request, r: Response) => Promise<void> } };
type Ctx = { waitUntil: (p: Promise<unknown>) => void };
type Facet = { slug: string; label: string; n: number };
type Facets = { total: number; niches: Facet[]; cities: Facet[]; pairs: { niche: string; city: string }[] };
type Card = {
	slug: string; name: string; handle: string | null; niche: string | null; city: string | null; bio: string | null; languages: string[] | null;
	accepting: boolean; verified: boolean; photo: string | null; followers: number | null; engagement: number | null; avg_views: number | null;
	from_price: number | null; rating: number | null; reviews: number; collabs: number;
};

const SITE = 'https://www.miracleapp.live';
const APP = 'https://app.miracleapp.live';
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const compact = (n: number) => (n >= 1e7 ? `${(n / 1e7).toFixed(1).replace(/\.0$/, '')}Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1).replace(/\.0$/, '')}L` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}K` : String(n));
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'M';
const slugOk = (s: string) => /^[a-z0-9-]{1,60}$/.test(s);

async function rpc<T>(env: PageEnv, fn: string, args: Record<string, unknown>): Promise<T> {
	const key = env.SUPABASE_ANON_KEY!;
	const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
		method: 'POST',
		headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
		body: JSON.stringify(args),
		signal: AbortSignal.timeout(5000)
	});
	if (!r.ok) throw new Error(`${fn}: ${r.status}`);
	return (await r.json()) as T;
}

export async function directory(req: Request, env: PageEnv, url: URL, ctx: Ctx): Promise<Response> {
	if (!env.SUPABASE_ANON_KEY) return new Response('Not set up', { status: 503 });
	// It lives on the website; a creator's own address sends people there.
	const host = (req.headers.get('host') || url.host).toLowerCase().replace(/:\d+$/, '');
	if (host.endsWith('.miracleapp.live') && host !== 'app.miracleapp.live') return new Response(null, { status: 301, headers: { location: `${SITE}${url.pathname}${url.search}` } });
	// The same page answers for a few minutes from Cloudflare's cache.
	const key = new Request(`${url.origin}${url.pathname}${url.search}`, { method: 'GET' });
	const hit = await caches.default.match(key).catch(() => undefined);
	if (hit) return hit;
	const res = await build(env, url).catch((e) => html(page({ title: 'Creator directory · Miracle', desc: '', canonical: `${SITE}/creators`, noindex: true, body: `<section class="wrap empty"><h1>Something went wrong</h1><p>Try again in a minute.</p><p><a class="btn" href="/creators">All creators</a></p></section>` }), 503, String((e as Error).message)));
	if (res.status === 200) ctx.waitUntil(caches.default.put(key, res.clone()).catch(() => {}));
	return res;
}

async function build(env: PageEnv, url: URL): Promise<Response> {
	const parts = url.pathname.replace(/\/+$/, '').split('/').slice(2).map((p) => decodeURIComponent(p).toLowerCase());
	if (parts[0] === 'sitemap.xml') return sitemap(env);
	let niche = '', city = '';
	if (parts.length === 0) {
		/* everyone */
	} else if (parts.length === 2 && parts[0] === 'in') city = parts[1];
	else if (parts.length === 1) niche = parts[0];
	else if (parts.length === 3 && parts[1] === 'in') ((niche = parts[0]), (city = parts[2]));
	else return notFound();
	if ((niche && !slugOk(niche)) || (city && !slugOk(city))) return notFound();
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
	const pageN = Math.max(0, Math.min(200, Number(url.searchParams.get('page') ?? '0') || 0));

	const [facets, found] = await Promise.all([
		rpc<Facets>(env, 'directory_facets', {}),
		rpc<{ total: number; items: Card[] }>(env, 'directory_search', { p_niche: niche, p_city: city, p_q: q, p_page: pageN })
	]);
	const nicheF = facets.niches.find((x) => x.slug === niche);
	const cityF = facets.cities.find((x) => x.slug === city);
	if ((niche && !nicheF) || (city && !cityF)) {
		// Nobody there (yet): a helpful page, not indexed.
		if (!found.total) return notFound(niche, city);
	}
	const nL = nicheF?.label ?? niche.replace(/-/g, ' ');
	const cL = cityF?.label ?? city.replace(/-/g, ' ');
	const what = niche ? `${cap(nL)} creators` : 'Creators';
	const where = city ? ` in ${cap(cL)}` : ' in India';
	const title = `${what}${where} for brand collabs · Miracle`;
	const desc = found.total
		? `${found.total} ${niche ? nL.toLowerCase() + ' ' : ''}creator${found.total === 1 ? '' : 's'}${where}, with live Instagram numbers, starting prices and reviews. Send a collab request in a minute; brands pay creators directly, no commission.`
		: `Find Instagram creators${where} by niche and city, with live Instagram numbers, audience health, starting prices and reviews. Book a collab in a minute; brands pay creators directly, no commission.`;
	// The main page is always for search engines; an empty niche or city page, a page past the end or a search isn't.
	const main = !niche && !city && !q && !pageN;
	const path = `/creators${niche ? `/${niche}` : ''}${city ? `/in/${city}` : ''}`;
	const canonical = `${SITE}${path}${pageN ? `?page=${pageN}` : ''}`;

	const chips = (list: Facet[], kind: 'niche' | 'city') =>
		list.slice(0, 14).map((f) => {
			const on = kind === 'niche' ? f.slug === niche : f.slug === city;
			const href = kind === 'niche' ? `/creators${on ? '' : `/${f.slug}`}${city ? `/in/${city}` : ''}` : `/creators${niche ? `/${niche}` : ''}${on ? '' : `/in/${f.slug}`}`;
			return `<a class="chip${on ? ' on' : ''}" href="${esc(href)}">${esc(f.label)} <small>${f.n}</small></a>`;
		}).join('');

	const cards = found.items.map(card).join('');
	const pages = Math.ceil(found.total / 24);
	const nav = pages > 1
		? `<nav class="pager" aria-label="Pages">${pageN > 0 ? `<a class="btn ghost" href="${esc(withPage(url, pageN - 1))}">← Previous</a>` : '<span></span>'}<span>Page ${pageN + 1} of ${pages}</span>${pageN + 1 < pages ? `<a class="btn ghost" href="${esc(withPage(url, pageN + 1))}">Next →</a>` : '<span></span>'}</nav>`
		: '';
	const ld = {
		'@context': 'https://schema.org', '@type': 'ItemList', name: `${what}${where}`, numberOfItems: found.total,
		itemListElement: found.items.map((c, i) => ({ '@type': 'ListItem', position: pageN * 24 + i + 1, url: `https://${c.slug}.miracleapp.live/`, name: c.name }))
	};
	const body = `
<section class="hero wrap">
	<span class="eb">Creator directory${found.total ? ` · ${found.total} listed` : ''}</span>
	<h1>${esc(what)}<em>${esc(where)}.</em></h1>
	<p class="lede">Real numbers, live from Instagram. Open a creator's page to see their rates and packages and send a request; brands pay creators directly, with no commission.</p>
	<form class="search" action="${esc(path)}" method="get" role="search">
		<input name="q" value="${esc(q)}" placeholder="Search by name, niche or city" aria-label="Search creators" maxlength="60" />
		<button class="btn grad">Search</button>
	</form>
	${facets.niches.length ? `<div class="chips" aria-label="Niches">${chips(facets.niches, 'niche')}</div>` : ''}
	${facets.cities.length ? `<div class="chips" aria-label="Cities">${chips(facets.cities, 'city')}</div>` : ''}
</section>
<section class="wrap">
	${q ? `<p class="note">${found.total} result${found.total === 1 ? '' : 's'} for “${esc(q)}”. <a href="${esc(path)}">Clear</a></p>` : ''}
	${cards ? `<div class="grid">${cards}</div>` : main ? OPENING : `<div class="empty"><h2>Nobody here yet</h2><p>${q ? 'Try fewer words, or another niche or city.' : 'Creators join every week. Look at all creators, or list yourself.'}</p><p><a class="btn" href="/creators">All creators</a></p></div>`}
	${nav}
</section>
<section class="wrap cta">
	<div><span class="eb">For creators</span><h2>Get listed <em>free.</em></h2><p>One link with your rates, packages and live media kit. Brands find you here and book you in a minute. No commission, ever.</p></div>
	<a class="btn grad" href="${APP}/signup?as=creator">Join as a creator</a>
</section>
<section class="wrap tools"><span class="eb">Free tools</span><a href="${SITE}/tools/rate-calculator">Instagram rate calculator →</a><a href="${SITE}/tools/engagement-calculator">Engagement rate calculator →</a></section>`;
	return html(page({ title, desc, canonical, noindex: !main && (!!q || !found.items.length), body, ld }));
}

// The main page before the first creators switch their listing on: what the directory is, for both sides.
const OPENING = `<div class="opening">
	<div class="op-card"><span class="eb">For brands</span><h2>Creators who <em>deliver.</em></h2>
		<p>Every creator here chose to be listed. You see their real Instagram reach and audience, an audience health check, what they charge and what brands say about them, and you book them in a minute. You pay creators directly; Miracle takes no commission.</p>
		<p><a class="btn" href="${SITE}/find-influencers-india">How it works for brands</a></p></div>
	<div class="op-card"><span class="eb">For creators</span><h2>Get listed <em>free.</em></h2>
		<p>Switch on your listing in Miracle (Settings › Get found by brands) and brands find you here by niche and city, with a verified tick when your Instagram is connected. Never your email or phone.</p>
		<p><a class="btn grad" href="${APP}/signup?as=creator">Join as a creator</a></p></div>
</div>
<div class="op-more"><span class="eb">Guides</span>
	<a href="${SITE}/guides/how-to-find-influencers-india">How to find the right influencers in India →</a>
	<a href="${SITE}/guides/how-to-get-brand-deals-instagram-india">How to get brand deals on Instagram →</a>
	<a href="${SITE}/guides/how-much-to-charge-instagram-reel-india">How much to charge for a reel →</a>
</div>`;

function card(c: Card) {
	const stats = [
		c.followers ? `<span><b>${compact(c.followers)}</b>followers</span>` : '',
		c.engagement ? `<span><b>${(c.engagement < 1 ? c.engagement * 100 : c.engagement).toFixed(1)}%</b>engagement</span>` : '',
		c.avg_views ? `<span><b>${compact(c.avg_views)}</b>views a reel</span>` : ''
	].filter(Boolean).join('');
	const meta = [c.niche?.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3).join(' · '), c.city].filter(Boolean).join(' · ');
	const href = `https://${c.slug}.miracleapp.live/?utm_source=directory`;
	return `<article class="card">
	<a class="cover" href="${esc(href)}" aria-label="${esc(c.name)}'s page"></a>
	<div class="who">
		<span class="av">${esc(initials(c.name))}${c.photo ? `<img src="${esc(c.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>
		<div><h3>${esc(c.name)}${c.verified ? ` <span class="ok" title="Instagram connected through Meta, so the numbers are real"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7.9-2.9-.9-2.9 2.5-1.7.9-2.9 3 .2z"/><path class="tick" d="M8.2 12.3l2.5 2.5 5.1-5.2"/></svg><span class="sr">Verified</span></span>` : ''}</h3>
		<small>${c.handle ? `@${esc(c.handle.replace(/^@/, ''))}` : ''}${c.handle && meta ? ' · ' : ''}${esc(meta)}</small></div>
	</div>
	${c.bio ? `<p class="bio">${esc(c.bio.slice(0, 160))}${c.bio.length > 160 ? '…' : ''}</p>` : ''}
	${stats ? `<div class="stats">${stats}</div>` : ''}
	<div class="foot">
		<span>${c.from_price ? `From <b>${inr(c.from_price)}</b>` : 'Rates on request'}${c.rating && c.reviews ? ` · ★ ${c.rating} (${c.reviews})` : c.collabs ? ` · ${c.collabs} collab${c.collabs === 1 ? '' : 's'} done` : ''}</span>
		<span class="go">${c.accepting ? 'View page' : 'Booked up'} →</span>
	</div>
	${c.languages?.length ? `<div class="langs">${c.languages.slice(0, 4).map((l) => `<span>${esc(l)}</span>`).join('')}</div>` : ''}
</article>`;
}

async function sitemap(env: PageEnv) {
	const f = await rpc<Facets>(env, 'directory_facets', {});
	const urls = [
		'/creators',
		...f.niches.map((n) => `/creators/${n.slug}`),
		...f.cities.map((c) => `/creators/in/${c.slug}`),
		...f.pairs.map((p) => `/creators/${p.niche}/in/${p.city}`),
		'/tools/rate-calculator',
		'/tools/engagement-calculator'
	];
	// Each listed creator's own page (her address), up to 20 pages of the directory.
	const pages: string[] = [];
	for (let n = 0; n < Math.min(20, Math.ceil(f.total / 24)); n++) {
		const r = await rpc<{ items: Card[] }>(env, 'directory_search', { p_niche: '', p_city: '', p_q: '', p_page: n }).catch(() => ({ items: [] as Card[] }));
		for (const c of r.items) pages.push(`https://${c.slug}.miracleapp.live/`);
	}
	const locs = [...[...new Set(urls)].map((u) => `${SITE}${u}`), ...pages];
	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs.map((u) => `<url><loc>${esc(u)}</loc><changefreq>daily</changefreq></url>`).join('\n')}\n</urlset>`;
	return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

function notFound(niche = '', city = '') {
	const what = [niche && cap(niche.replace(/-/g, ' ')), city && `in ${cap(city.replace(/-/g, ' '))}`].filter(Boolean).join(' ');
	return html(page({ title: 'Not found · Miracle creators', desc: '', canonical: `${SITE}/creators`, noindex: true, body: `<section class="wrap empty"><span class="eb">Creator directory</span><h1>No ${esc(what || 'such page')} <em>yet.</em></h1><p>Creators join every week. See everyone, or search by niche and city.</p><p><a class="btn grad" href="/creators">All creators</a></p></section>` }), 404);
}

const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
function withPage(url: URL, n: number) {
	const u = new URL(url.pathname, 'https://x');
	const q = url.searchParams.get('q');
	if (q) u.searchParams.set('q', q);
	if (n) u.searchParams.set('page', String(n));
	return u.pathname + u.search;
}
function html(body: string, status = 200, error = '') {
	return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': status === 200 ? 'public, max-age=300' : 'no-store', ...(error ? { 'x-error': error.slice(0, 100) } : {}) } });
}

function page(p: { title: string; desc: string; canonical: string; noindex: boolean; body: string; ld?: unknown }) {
	return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.title)}</title>${p.desc ? `<meta name="description" content="${esc(p.desc)}">` : ''}
<link rel="canonical" href="${esc(p.canonical)}">${p.noindex ? '<meta name="robots" content="noindex,follow">' : ''}
<meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.desc)}"><meta property="og:url" content="${esc(p.canonical)}"><meta property="og:image" content="${SITE}/og.jpg"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${SITE}/icon.svg"><meta name="theme-color" content="#110D11">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
${p.ld ? `<script type="application/ld+json">${JSON.stringify(p.ld).replace(/</g, '\\u003c')}</script>` : ''}
<style>${CSS}</style></head><body>
<header class="top wrap"><a class="logo" href="${SITE}/"><img src="${SITE}/icon.svg" alt="" width="30" height="30"><b>Miracle</b></a><nav><a href="/creators">Find creators</a><a href="${SITE}/tools/rate-calculator">Free tools</a><a class="btn sm" href="${APP}/signup?as=creator">Join free</a></nav></header>
<main>${p.body}</main>
<footer class="wrap foot-site"><span>© Zyposoft Technologies Private Limited</span><a href="${SITE}/privacy">Privacy</a><a href="${SITE}/terms">Terms</a><a href="${SITE}/">miracleapp.live</a></footer>
</body></html>`;
}

const CSS = `
:root{--bg:#110d11;--surface:#1a151a;--surface-2:#231d23;--line:#2e262e;--line-2:#3e343e;--ink:#f4eef2;--ink-2:#c9bfc6;--ink-3:#a39aa1;--g1:#9c7bff;--g2:#f25a90;--g3:#ffae6b;--ok:#6fd08c;--grad:linear-gradient(115deg,var(--g1),var(--g2) 52%,var(--g3));color-scheme:dark}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:radial-gradient(60% 40% at 10% 0%,rgba(156,123,255,.22),transparent 70%),radial-gradient(50% 35% at 95% 20%,rgba(242,90,144,.16),transparent 70%),var(--bg);background-attachment:fixed;color:var(--ink);font:400 16px/1.55 Geist,ui-sans-serif,system-ui,sans-serif}
a{color:inherit}
.wrap{width:min(1160px,100%);margin:0 auto;padding-left:max(18px,env(safe-area-inset-left,0px));padding-right:max(18px,env(safe-area-inset-right,0px))}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:calc(env(safe-area-inset-top,0px) + 18px);padding-bottom:10px}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none}.logo img{border-radius:8px}.logo b{font:italic 400 28px/1 'Instrument Serif',Georgia,serif}
.top nav{display:flex;align-items:center;gap:18px;font-size:14.5px}.top nav a:not(.btn){text-decoration:none;color:var(--ink-2)}.top nav a:not(.btn):hover{color:var(--ink)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;padding:0 22px;border:0;border-radius:0;background:var(--ink);color:var(--bg);font:700 13px/1 Geist,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;cursor:pointer;box-shadow:4px 4px 0 var(--g2);transition:transform .12s,box-shadow .12s}
.btn:hover{transform:translate(-2px,-2px)}.btn:active{transform:translate(4px,4px);box-shadow:none}
.btn.grad{background:var(--grad);color:#fff;box-shadow:4px 4px 0 #6a4bc9}.btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--line-2),4px 4px 0 var(--line)}.btn.sm{height:38px;padding:0 14px;font-size:12px}
.eb{font:700 11.5px/1 Geist,system-ui,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:var(--ink-2)}
h1,h2{margin:0;font-weight:400;font-family:'Instrument Serif',Georgia,serif;letter-spacing:-.01em;text-wrap:balance}
h1{font-size:clamp(42px,6.4vw,84px);line-height:.98}h2{font-size:clamp(30px,4vw,48px);line-height:1}
h1 em,h2 em{font-style:italic;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.08em}
.hero{display:grid;gap:18px;padding-top:48px;padding-bottom:28px}
.lede{margin:0;max-width:62ch;color:var(--ink-3);font-size:clamp(15.5px,1.4vw,18px)}
.search{display:flex;gap:10px;max-width:640px;margin-top:6px}.search input{flex:1;min-width:0;height:52px;padding:0 16px;border:0;background:#0c090c;box-shadow:inset 0 0 0 1px var(--line-2);color:var(--ink);font:500 16px Geist,system-ui,sans-serif;outline:0}.search input:focus{box-shadow:inset 0 0 0 1.5px var(--g2),4px 4px 0 var(--g2)}.search .btn{height:52px}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:99px;box-shadow:inset 0 0 0 1px var(--line-2);font-size:14px;text-decoration:none;color:var(--ink-2)}.chip small{color:var(--ink-3)}.chip:hover{color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink-3)}.chip.on{background:var(--ink);color:var(--bg);box-shadow:none}.chip.on small{color:var(--bg);opacity:.7}
.note{color:var(--ink-3)}.note a{color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;padding-bottom:20px}
.card{position:relative;display:grid;gap:14px;align-content:start;padding:20px;border-radius:24px;background:radial-gradient(120% 70% at 0% 0%,rgba(242,90,144,.12),transparent 60%),var(--surface);box-shadow:inset 0 0 0 1px var(--line-2);transition:transform .18s,box-shadow .18s}
.card:hover{transform:translateY(-3px);box-shadow:inset 0 0 0 1.5px var(--g2),0 30px 60px -40px rgba(242,90,144,.6)}
.cover{position:absolute;inset:0;z-index:1;border-radius:inherit}
.who{display:flex;align-items:center;gap:12px;min-width:0}.who>div{min-width:0}
.av{position:relative;flex:none;display:grid;place-items:center;width:54px;height:54px;border-radius:50%;overflow:hidden;background:var(--grad);font:700 18px Geist,system-ui,sans-serif;color:#fff}.av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
h3{margin:0;display:flex;align-items:center;gap:6px;font-size:17px;font-weight:600;line-height:1.25}
.who small{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--ink-3);font-size:13px}
.ok{display:inline-grid;width:18px;height:18px;flex:none}.ok svg{width:18px;height:18px}.ok path{fill:#5aa7ff}.ok .tick{fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.bio{margin:0;color:var(--ink-2);font-size:14px;line-height:1.5}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.stats span{display:grid;gap:2px;padding:10px 12px;border-radius:14px;background:var(--surface-2);font-size:12px;color:var(--ink-3)}.stats b{font:400 22px/1 'Instrument Serif',Georgia,serif;color:var(--ink)}
.foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:12px;border-top:1px dashed var(--line-2);font-size:14px;color:var(--ink-2)}.foot b{color:var(--ink)}.go{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink)}
.langs{display:flex;flex-wrap:wrap;gap:6px}.langs span{padding:3px 10px;border-radius:99px;background:var(--surface-2);font-size:12px;color:var(--ink-3)}
.pager{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0 30px;color:var(--ink-3)}
.empty{display:grid;gap:12px;justify-items:start;padding:50px 0}
.opening{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:10px 0 20px}.op-card{display:grid;gap:12px;align-content:start;padding:26px;border-radius:24px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-2)}.op-card p{margin:0;color:var(--ink-2)}
.op-more{display:flex;flex-wrap:wrap;gap:10px 24px;align-items:center;padding:10px 0 20px}.op-more a{color:var(--ink-2)}
@media (max-width:760px){.opening{grid-template-columns:minmax(0,1fr)}}.empty p{margin:0;color:var(--ink-3)}
.cta{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px;margin-top:30px;padding-top:34px;padding-bottom:34px;border-top:1px solid var(--line)}.cta>div{display:grid;gap:10px;max-width:560px}.cta p{margin:0;color:var(--ink-3)}
.tools{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center;padding-bottom:30px}.tools a{color:var(--ink-2)}
.foot-site{display:flex;flex-wrap:wrap;gap:10px 20px;padding-top:24px;padding-bottom:calc(env(safe-area-inset-bottom,0px) + 30px);border-top:1px solid var(--line);font-size:13px;color:var(--ink-3)}.foot-site a{color:var(--ink-3)}
@media (max-width:640px){.top nav a:not(.btn){display:none}.top nav a[href="/creators"]{display:inline}.hero{padding-top:28px}.search{flex-direction:column}.search input{flex:none}.grid{grid-template-columns:minmax(0,1fr)}}
`;
