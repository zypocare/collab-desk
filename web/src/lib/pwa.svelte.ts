// Installing the app on her phone, and phone notifications for this device.
import { isNative, nativeDevice, nativePushEndpoint, nativePushSaved, startNative } from './native';
import { supabase } from './supabase';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export const pwa = $state<{ installEvent: InstallEvent | null; installed: boolean }>({ installEvent: null, installed: false });

/** Called once from the root layout. Keeps the browser's install offer for our own button. */
export function watchInstall() {
	if (typeof window === 'undefined') return;
	// Inside the Android or iPhone app: it is already installed, and the native pieces start.
	if (isNative()) {
		pwa.installed = true;
		startNative();
		return;
	}
	if (!import.meta.env.DEV && 'serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch((e) => console.error('[sw]', e));
	pwa.installed = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
	addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault();
		pwa.installEvent = e as InstallEvent;
	});
	addEventListener('appinstalled', () => {
		pwa.installed = true;
		pwa.installEvent = null;
	});
}

export async function install() {
	const e = pwa.installEvent;
	if (!e) return false;
	await e.prompt();
	const { outcome } = await e.userChoice;
	pwa.installEvent = null;
	return outcome === 'accepted';
}

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const pushSupported = () => isNative() || ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);

const b64ToBytes = (b64: string) => {
	const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const bytesToB64 = (buf: ArrayBuffer | null) =>
	buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';

/** Is this device already getting notifications? */
export async function pushState(): Promise<'unsupported' | 'blocked' | 'on' | 'off'> {
	if (isNative()) {
		const ep = nativePushSaved();
		if (!ep) return 'off';
		const { data } = await supabase.from('push_subscriptions').select('id').eq('endpoint', ep).maybeSingle();
		return data ? 'on' : 'off';
	}
	if (!pushSupported()) return 'unsupported';
	if (Notification.permission === 'denied') return 'blocked';
	const reg = await navigator.serviceWorker.getRegistration();
	const sub = await reg?.pushManager.getSubscription();
	return sub ? 'on' : 'off';
}

/** The service worker, registering it if needed, and waiting (at most 10 s) until it is active. */
async function worker(): Promise<ServiceWorkerRegistration> {
	const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/service-worker.js'));
	if (reg.active) return reg;
	return Promise.race([
		navigator.serviceWorker.ready,
		new Promise<never>((_, no) => setTimeout(() => no(new Error('The app is still setting up on this phone. Close it, open it again, then try once more.')), 10_000))
	]);
}

export async function enablePush() {
	if (isNative()) {
		const endpoint = await nativePushEndpoint();
		const { error } = await supabase.from('push_subscriptions').upsert({ endpoint, p256dh: '', auth: '', device: nativeDevice() }, { onConflict: 'endpoint' });
		if (error) throw new Error(error.message);
		return;
	}
	// Ask first, straight from her tap (iPhones only allow the question then).
	const perm = await Notification.requestPermission();
	if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for this site. Allow them in the browser settings.' : 'Notifications were not allowed.');
	const { data: key, error } = await supabase.rpc('push_public_key');
	if (error || !key) throw new Error('Notifications are not set up on the server yet.');
	const reg = await worker();
	let sub = await reg.pushManager.getSubscription();
	// A subscription made with an older key can't receive from the new one: replace it.
	if (sub && sub.options.applicationServerKey && bytesToB64(sub.options.applicationServerKey) !== String(key).replace(/=+$/, '')) {
		await sub.unsubscribe();
		sub = null;
	}
	sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key as string) });
	const device = /android/i.test(navigator.userAgent) ? 'Android' : isIos() ? 'iPhone / iPad' : /mac/i.test(navigator.userAgent) ? 'Mac' : /windows/i.test(navigator.userAgent) ? 'Windows' : 'This device';
	const { error: e2 } = await supabase
		.from('push_subscriptions')
		.upsert({ endpoint: sub.endpoint, p256dh: bytesToB64(sub.getKey('p256dh')), auth: bytesToB64(sub.getKey('auth')), device }, { onConflict: 'endpoint' });
	if (e2) throw new Error(e2.message);
}

/** Note what happened when turning alerts on (so a problem on her phone can be seen remotely). */
export function logAlerts(kind: 'alerts_on' | 'alerts_failed' | 'alerts_unsupported', detail = '') {
	const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
	const device = `${standalone ? 'home screen app' : 'browser tab'} · permission ${'Notification' in window ? Notification.permission : 'n/a'} · push ${'PushManager' in window ? 'yes' : 'no'} · ${navigator.userAgent}`.slice(0, 300);
	supabase.from('app_events').insert({ kind, detail: detail.slice(0, 500), device }).then(() => {});
}

export async function disablePush() {
	if (isNative()) {
		const ep = nativePushSaved();
		if (ep) await supabase.from('push_subscriptions').delete().eq('endpoint', ep);
		return;
	}
	const reg = await navigator.serviceWorker.getRegistration();
	const sub = await reg?.pushManager.getSubscription();
	if (sub) {
		await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
		await sub.unsubscribe();
	}
}

/**
 * This phone stops getting a studio's alerts: on sign-out (the next person to sign in here may not be
 * her), and when someone who isn't a creator signs in on a phone that still has one. With `serverToo`
 * the device is also taken off the studio's list (only possible while she is still signed in); without
 * it, the next alert finds the device gone and the server drops it then. Never holds up signing out.
 */
export async function dropPush(serverToo: boolean) {
	if (isNative()) {
		const ep = nativePushSaved();
		if (ep && serverToo) {
			await Promise.race([
				Promise.all([supabase.from('push_subscriptions').delete().eq('endpoint', ep), supabase.from('brand_push_subscriptions').delete().eq('endpoint', ep)]).catch(() => {}),
				new Promise((r) => setTimeout(r, 3000))
			]);
		}
		return;
	}
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	const work = (async () => {
		const reg = await navigator.serviceWorker.getRegistration();
		const sub = await reg?.pushManager?.getSubscription();
		if (!sub) return;
		if (serverToo) {
			await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
			await supabase.from('brand_push_subscriptions').delete().eq('endpoint', sub.endpoint);
		}
		await sub.unsubscribe();
	})().catch(() => {});
	await Promise.race([work, new Promise((r) => setTimeout(r, 3000))]);
}

/** Brands: alerts on this phone go to this brand login (Settings > Emails & alerts). */
export async function enableBrandPush() {
	if (isNative()) {
		const endpoint = await nativePushEndpoint();
		const { error } = await supabase.from('brand_push_subscriptions').upsert({ endpoint, p256dh: '', auth: '', device: nativeDevice() }, { onConflict: 'endpoint' });
		if (error) throw new Error(error.message);
		return;
	}
	const perm = await Notification.requestPermission();
	if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for this site. Allow them in the browser settings.' : 'Notifications were not allowed.');
	const { data: key, error } = await supabase.rpc('push_public_key');
	if (error || !key) throw new Error('Notifications are not set up on the server yet.');
	const reg = await worker();
	let sub = await reg.pushManager.getSubscription();
	if (sub && sub.options.applicationServerKey && bytesToB64(sub.options.applicationServerKey) !== String(key).replace(/=+$/, '')) {
		await sub.unsubscribe();
		sub = null;
	}
	sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key as string) });
	const device = /android/i.test(navigator.userAgent) ? 'Android' : isIos() ? 'iPhone / iPad' : /mac/i.test(navigator.userAgent) ? 'Mac' : /windows/i.test(navigator.userAgent) ? 'Windows' : 'This device';
	const { error: e2 } = await supabase
		.from('brand_push_subscriptions')
		.upsert({ endpoint: sub.endpoint, p256dh: bytesToB64(sub.getKey('p256dh')), auth: bytesToB64(sub.getKey('auth')), device }, { onConflict: 'endpoint' });
	if (e2) throw new Error(e2.message);
}

export async function disableBrandPush() {
	if (isNative()) {
		const ep = nativePushSaved();
		if (ep) await supabase.from('brand_push_subscriptions').delete().eq('endpoint', ep);
		return;
	}
	const reg = await navigator.serviceWorker.getRegistration();
	const sub = await reg?.pushManager.getSubscription();
	if (sub) {
		await supabase.from('brand_push_subscriptions').delete().eq('endpoint', sub.endpoint);
		await sub.unsubscribe();
	}
}

/** Is this phone getting this brand's alerts? */
export async function brandPushOn(): Promise<boolean> {
	if (isNative()) {
		const ep = nativePushSaved();
		if (!ep) return false;
		const { data } = await supabase.from('brand_push_subscriptions').select('id').eq('endpoint', ep).maybeSingle();
		return !!data;
	}
	if (!pushSupported()) return false;
	const reg = await navigator.serviceWorker.getRegistration();
	const sub = await reg?.pushManager.getSubscription();
	if (!sub) return false;
	const { data } = await supabase.from('brand_push_subscriptions').select('id').eq('endpoint', sub.endpoint).maybeSingle();
	return !!data;
}

/** A brand signed in: keep its own alerts on this phone, drop any left from someone else's sign-in. */
export async function keepOnlyBrandPush() {
	if (isNative()) {
		try {
			if (!(await brandPushOn())) await dropPush(false);
		} catch {
			/* nothing to do */
		}
		return;
	}
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	try {
		if (!(await brandPushOn())) await dropPush(false);
	} catch {
		/* nothing to do */
	}
}
