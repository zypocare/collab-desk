/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Shows push notifications (new requests, messages, payments…) and opens the right screen when
// one is tapped. It also keeps a copy of the app itself, so it opens without a connection:
// pages always try the network first (a new deploy is picked up straight away) and fall back to
// the saved copy only when offline. The data is saved separately by the app (lib/offline.ts).
import { assets, immutable } from '$app/manifest';
import { version } from '$app/env';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `app-${version}`;
// The app's code (file names change with every deploy), the icons and fonts, and the page itself.
const SHELL = [...immutable.map((f) => `/${f.path}`.replace(/^\/+/, '/')), ...assets.map((f) => `/${f.path}`.replace(/^\/+/, '/')).filter((f) => !f.endsWith('.map')), '/'];

sw.addEventListener('install', (e) => {
	e.waitUntil(
		caches
			.open(CACHE)
			.then((c) => c.addAll(SHELL))
			.catch(() => {
				/* a file failed: the app still works online, and the next deploy tries again */
			})
			.then(() => sw.skipWaiting())
	);
});
sw.addEventListener('activate', (e) =>
	e.waitUntil(
		(async () => {
			for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
			await sw.clients.claim();
		})()
	)
);

// Android "Share → Collab Desk" with a screenshot: keep it for a moment and open the share screen,
// which hands it to Add collab.
async function shared(req: Request) {
	try {
		const form = await req.formData();
		const text = ['title', 'text', 'url'].map((k) => form.get(k)).filter((v): v is string => typeof v === 'string' && !!v.trim()).join('\n');
		const shot = form.getAll('shot').find((f): f is File => f instanceof File && f.size > 0);
		const c = await caches.open('shared');
		await c.put('/__shared/text', new Response(text));
		if (shot) await c.put('/__shared/shot', new Response(shot, { headers: { 'content-type': shot.type || 'image/jpeg' } }));
		else await c.delete('/__shared/shot');
	} catch {
		/* the share screen opens empty */
	}
	return Response.redirect('/studio/share?shared=1', 303);
}

sw.addEventListener('fetch', (e) => {
	const req = e.request;
	const url = new URL(req.url);
	if (req.method === 'POST' && url.origin === sw.location.origin && url.pathname === '/studio/share') return e.respondWith(shared(req));
	if (req.method !== 'GET') return;
	if (url.origin !== sw.location.origin) return; // Supabase, Instagram images… go straight to the network.
	// Opening any screen: the network first, the saved app when offline.
	if (req.mode === 'navigate') {
		e.respondWith(
			fetch(req).catch(async () => (await caches.match('/', { ignoreSearch: true })) ?? Response.error())
		);
		return;
	}
	// The app's own files: from the saved copy when there is one (their names change on every deploy).
	if (SHELL.includes(url.pathname)) {
		e.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(req)));
	}
});

sw.addEventListener('push', (e) => {
	let data: { title?: string; body?: string; url?: string; tag?: string } = {};
	try {
		data = e.data?.json() ?? {};
	} catch {
		data = { body: e.data?.text() };
	}
	e.waitUntil(
		sw.registration.showNotification(data.title || 'Collab Desk', {
			body: data.body || '',
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			tag: data.tag,
			data: { url: data.url || '/studio' }
		})
	);
});

sw.addEventListener('notificationclick', (e) => {
	e.notification.close();
	const url = new URL((e.notification.data?.url as string) || '/studio', sw.location.origin).href;
	e.waitUntil(
		(async () => {
			const tabs = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const open = tabs.find((t) => t.url.startsWith(sw.location.origin));
			if (open) {
				await open.focus();
				return (open as WindowClient).navigate(url);
			}
			return sw.clients.openWindow(url);
		})()
	);
});
