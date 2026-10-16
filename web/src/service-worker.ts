/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Shows push notifications (new requests, messages, payments…) and opens the right screen when
// one is tapped. It deliberately caches nothing, so a new deploy is always picked up straight away.
const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => sw.skipWaiting());
sw.addEventListener('activate', (e) => e.waitUntil(sw.clients.claim()));

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

// A network-only fetch handler, so phones offer "Install app".
sw.addEventListener('fetch', () => {});
