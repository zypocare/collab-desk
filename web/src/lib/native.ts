// The phone app (Android and iPhone, built with Capacitor in mobile/) loads this same web app. Inside it,
// the app adds native pieces: the back button, opening outside links in the phone's browser, the status
// bar, and alerts through Firebase (Android) and Apple's push service (iPhone) instead of web push.
// In a normal browser none of this runs.

type Listener = { remove: () => Promise<void> };
type Plugin = Record<string, (...args: never[]) => Promise<unknown>> & { addListener: (event: string, fn: (data: never) => void) => Promise<Listener> };
type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: Record<string, Plugin> };

const cap = (): Cap | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: Cap }).Capacitor);
export const isNative = () => !!cap()?.isNativePlatform?.();
export const nativePlatform = () => (isNative() ? (cap()?.getPlatform?.() ?? 'web') : 'web');
const plugin = (name: string) => cap()?.Plugins?.[name] as Plugin | undefined;

const OWN = /(^|\.)miracleapp\.live$/;

/** Called once when the app starts. */
export function startNative() {
	if (!isNative()) return;
	document.documentElement.classList.add('native', `native-${nativePlatform()}`);
	const app = plugin('App');
	// Android's back button: back in the app's history, or out of the app from the first screen.
	app?.addListener('backButton', ((e: { canGoBack: boolean }) => {
		if (e.canGoBack || history.length > 1) history.back();
		else (app.exitApp as () => Promise<void>)();
	}) as never);
	// A Miracle link opened from another app (WhatsApp, email): go straight there.
	app?.addListener('appUrlOpen', ((e: { url: string }) => {
		try {
			const u = new URL(e.url);
			if (OWN.test(u.hostname)) location.href = u.href;
		} catch {
			/* not a link we know */
		}
	}) as never);
	// Links to other sites (WhatsApp, Instagram posts, UPI apps) open outside the app.
	document.addEventListener(
		'click',
		(ev) => {
			const a = (ev.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
			if (!a) return;
			const href = a.getAttribute('href') ?? '';
			if (/^(mailto|tel|sms|upi|whatsapp|intent):/i.test(href)) return; // the phone handles these
			let u: URL;
			try {
				u = new URL(a.href);
			} catch {
				return;
			}
			if (!/^https?:$/.test(u.protocol) || OWN.test(u.hostname)) return;
			ev.preventDefault();
			openOutside(u.href);
		},
		true
	);
	const bar = plugin('StatusBar');
	(bar?.setBackgroundColor as ((o: { color: string }) => Promise<void>) | undefined)?.({ color: '#110D11' }).catch(() => {});
	(bar?.setStyle as ((o: { style: string }) => Promise<void>) | undefined)?.({ style: 'DARK' }).catch(() => {});
	// Tapping an alert opens what it is about.
	const push = plugin('PushNotifications');
	push?.addListener('pushNotificationActionPerformed', ((e: { notification?: { data?: { url?: string } } }) => {
		const url = e.notification?.data?.url;
		if (url) location.href = url.startsWith('http') ? url : new URL(url, location.origin).href;
	}) as never);
	if (nativePlatform() === 'android')
		(push?.createChannel as ((c: Record<string, unknown>) => Promise<void>) | undefined)?.({ id: 'alerts', name: 'Alerts', description: 'New requests, messages and payments', importance: 5, visibility: 1, vibration: true }).catch(() => {});
}

/** Opens a link in the phone's browser (or the app that handles it, like WhatsApp). */
export function openOutside(url: string) {
	const browser = plugin('Browser');
	if (browser?.open) (browser.open as (o: { url: string }) => Promise<void>)({ url }).catch(() => (location.href = url));
	else window.open(url, '_blank');
}

const TOKEN_KEY = 'mc-native-push-token';
const savedToken = () => {
	try {
		return localStorage.getItem(TOKEN_KEY) ?? '';
	} catch {
		return '';
	}
};

/** The phone's alert address ("fcm:<token>"), asking permission first. */
export async function nativePushEndpoint(): Promise<string> {
	const push = plugin('PushNotifications');
	if (!push) throw new Error('Alerts are not available in this version of the app.');
	const perm = (await (push.requestPermissions as () => Promise<{ receive: string }>)()).receive;
	if (perm !== 'granted') throw new Error('Notifications are off for Miracle. Turn them on in your phone settings.');
	const token = await new Promise<string>((resolve, reject) => {
		const done: Listener[] = [];
		const stop = () => done.forEach((l) => l.remove());
		push.addListener('registration', ((t: { value: string }) => (stop(), resolve(t.value))) as never).then((l) => done.push(l));
		push.addListener('registrationError', ((e: { error: string }) => (stop(), reject(new Error(e.error || 'The phone could not set up alerts.')))) as never).then((l) => done.push(l));
		(push.register as () => Promise<void>)().catch(reject);
		setTimeout(() => (stop(), reject(new Error('The phone took too long to set up alerts. Try again.'))), 15000);
	});
	try {
		localStorage.setItem(TOKEN_KEY, token);
	} catch {
		/* storage blocked */
	}
	return `fcm:${token}`;
}

/** The alert address this phone registered before, if any. */
export const nativePushSaved = () => (savedToken() ? `fcm:${savedToken()}` : '');
export const nativeDevice = () => (nativePlatform() === 'ios' ? 'iPhone app' : 'Android app');
