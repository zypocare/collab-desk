// Her brand page (/) and QR scans (/q/abc1234), answered by the server before the app loads.
// - QR scans: count the scan and send the phone straight on, with no app loading in between.
// - Brand page: add the link-preview tags WhatsApp, Instagram and LinkedIn read (they don't run the
//   app), and put her page data into the page so it shows without waiting for the database.
// Only public data is used, with the same public key the website itself uses.

type Assets = { fetch: (req: Request) => Promise<Response> };
export type PageEnv = { ASSETS: Assets; SUPABASE_URL: string; SUPABASE_ANON_KEY?: string };
type Ctx = { waitUntil: (p: Promise<unknown>) => void };

declare class HTMLRewriter {
	on(selector: string, handlers: { element: (el: { append: (html: string, opts: { html: boolean }) => void }) => void }): HTMLRewriter;
	transform(res: Response): Response;
}
declare const caches: { default: { match: (k: Request) => Promise<Response | undefined>; put: (k: Request, r: Response) => Promise<void> } };

async function rpc(env: PageEnv, fn: string, args: Record<string, unknown> = {}, ms = 1500) {
	const key = env.SUPABASE_ANON_KEY!;
	const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
		method: 'POST',
		headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
		body: JSON.stringify(args),
		signal: AbortSignal.timeout(ms)
	});
	if (!r.ok) throw new Error(`${fn}: ${r.status}`);
	return r.json();
}

export async function qrScan(req: Request, env: PageEnv, url: URL): Promise<Response> {
	const slug = url.pathname.slice('/q/'.length).replace(/\/+$/, '').toLowerCase();
	if (!env.SUPABASE_ANON_KEY || !/^[a-z0-9]{4,12}$/.test(slug)) return env.ASSETS.fetch(req);
	const to = await rpc(env, 'qr_go', { p_slug: slug }, 4000).catch(() => null);
	if (to === '/' || to === '/brand/new') return new Response(null, { status: 302, headers: { location: `${url.origin}${to}?qr=${slug}`, 'cache-control': 'no-store' } });
	// Unknown or removed code: the app shows a friendly page.
	return env.ASSETS.fetch(req);
}

type Boot = { page: Record<string, unknown>; ins: unknown; extra: unknown; card: { v?: number } | null };

async function bootData(env: PageEnv, origin: string, ctx: Ctx): Promise<Boot> {
	// Kept for 30 seconds where Cloudflare's cache is available (on a custom domain); the app
	// always refreshes it in the background, so an edit shows up within seconds either way.
	const key = new Request(`${origin}/__brand-page-data`);
	const hit = await caches.default.match(key).catch(() => undefined);
	if (hit) return hit.json();
	const [page, ins, extra, card] = await Promise.all([rpc(env, 'public_page'), rpc(env, 'public_insights').catch(() => null), rpc(env, 'page_extras').catch(() => null), rpc(env, 'page_card').catch(() => null)]);
	const boot = { page, ins, extra, card } as Boot;
	ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(boot), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=30' } })).catch(() => {}));
	return boot;
}

const attr = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function brandPage(req: Request, env: PageEnv, url: URL, ctx: Ctx): Promise<Response> {
	const res = await env.ASSETS.fetch(req);
	if (!env.SUPABASE_ANON_KEY || !(res.headers.get('content-type') ?? '').includes('text/html')) return res;
	const boot = await bootData(env, url.origin, ctx).catch(() => null);
	if (!boot?.page) return res;

	const p = boot.page as { display_name?: string; handle?: string; niche?: string; city?: string; app_name?: string; accepting?: boolean };
	const name = p.display_name || (p.handle ? `@${p.handle}` : 'this creator');
	const title = `Work with ${name}`;
	const desc = [[p.niche, p.city].map((x) => String(x ?? '').trim()).filter(Boolean).join(' · '), p.accepting === false ? 'See past work and rates.' : 'Rates, open weeks and past work. Send a collab request.'].filter(Boolean).join('. ');
	const v = Number(boot.card?.v) || 0;
	const image = v ? `${env.SUPABASE_URL}/storage/v1/object/public/cards/page.jpg?v=${v}` : `${url.origin}/icon-512.png`;
	const meta = [
		['description', desc],
		['og:type', 'website'],
		['og:site_name', p.app_name || 'Miracle'],
		['og:title', title],
		['og:description', desc],
		['og:url', `${url.origin}/`],
		['og:image', image],
		...(v ? [['og:image:width', '1200'], ['og:image:height', '630'], ['og:image:alt', `${name}: followers, engagement and brands worked with`]] : []),
		['twitter:card', v ? 'summary_large_image' : 'summary'],
		['twitter:title', title],
		['twitter:description', desc],
		['twitter:image', image]
	]
		.map(([k, c]) => (k.startsWith('og:') ? `<meta property="${k}" content="${attr(c)}" />` : `<meta name="${k}" content="${attr(c)}" />`))
		.join('');
	// The page data, ready for the app (no "<" inside, so it can't end the script early).
	const data = JSON.stringify({ page: boot.page, ins: boot.ins, extra: boot.extra, at: Date.now() }).replace(/</g, '\\u003c');
	const head = `<title>${attr(title)}</title>${meta}<script id="pp-boot" type="application/json">${data}</script>`;

	const out = new HTMLRewriter().on('head', { element: (el) => el.append(head, { html: true }) }).transform(res);
	const h = new Headers(out.headers);
	h.set('cache-control', 'no-cache');
	return new Response(out.body, { status: out.status, headers: h });
}
