// Installing the app on her phone, and phone notifications for this device.
import { supabase } from './supabase';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export const pwa = $state<{ installEvent: InstallEvent | null; installed: boolean }>({ installEvent: null, installed: false });

/** Called once from the root layout. Keeps the browser's install offer for our own button. */
export function watchInstall() {
	if (typeof window === 'undefined') return;
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
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const b64ToBytes = (b64: string) => {
	const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const bytesToB64 = (buf: ArrayBuffer | null) =>
	buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';

/** Is this device already getting notifications? */
export async function pushState(): Promise<'unsupported' | 'blocked' | 'on' | 'off'> {
	if (!pushSupported()) return 'unsupported';
	if (Notification.permission === 'denied') return 'blocked';
	const reg = await navigator.serviceWorker.getRegistration();
	const sub = await reg?.pushManager.getSubscription();
	return sub ? 'on' : 'off';
}

export async function enablePush() {
	const perm = await Notification.requestPermission();
	if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for this site. Allow them in the browser settings.' : 'Notifications were not allowed.');
	const { data: key, error } = await supabase.rpc('push_public_key');
	if (error || !key) throw new Error('Notifications are not set up on the server yet.');
	const reg = await navigator.serviceWorker.ready;
	const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key as string) }));
	const device = /android/i.test(navigator.userAgent) ? 'Android' : isIos() ? 'iPhone / iPad' : /mac/i.test(navigator.userAgent) ? 'Mac' : /windows/i.test(navigator.userAgent) ? 'Windows' : 'This device';
	const { error: e2 } = await supabase
		.from('push_subscriptions')
		.upsert({ endpoint: sub.endpoint, p256dh: bytesToB64(sub.getKey('p256dh')), auth: bytesToB64(sub.getKey('auth')), device }, { onConflict: 'endpoint' });
	if (e2) throw new Error(e2.message);
}

export async function disablePush() {
	const reg = await navigator.serviceWorker.getRegistration();
	const sub = await reg?.pushManager.getSubscription();
	if (sub) {
		await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
		await sub.unsubscribe();
	}
}
