// The phone app (Android and iPhone, built with Capacitor in mobile/) loads this same web app. Inside it,
// the app adds native pieces: the back button, opening outside links in the phone's browser, the status
// bar, and alerts through Firebase (Android) and Apple's push service (iPhone) instead of web push.
// In a normal browser none of this runs.

type Listener = { remove: () => Promise<void> };
// addListener hands back the listener itself or a promise of it, depending on how the plugin is reached.
type Plugin = Record<string, (...args: never[]) => Promise<unknown>> & { addListener: (event: string, fn: (data: never) => void) => Listener | Promise<Listener> };
type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: Record<string, Plugin> };

const cap = (): Cap | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: Cap }).Capacitor);
export const isNative = () => !!cap()?.isNativePlatform?.();
export const nativePlatform = () => (isNative() ? (cap()?.getPlatform?.() ?? 'web') : 'web');
const plugin = (name: string) => cap()?.Plugins?.[name] as Plugin | undefined;

const OWN = /(^|\.)miracleapp\.live$/;
// The website (miracleapp.live, www.) is not part of the app: it opens in the browser.
const WEBSITE = /^(www\.)?miracleapp\.live$/;

/** The phone app's own version and build, like "1.0.1 (12)" (mobile/package.json and the build number), once
 * known; '' in a browser. Shown in Settings and sent with problem reports. */
export const native = { version: '' };

/** Called once when the app starts. */
export function startNative() {
	if (!isNative()) return;
	document.documentElement.classList.add('native', `native-${nativePlatform()}`);
	// The welcome animation takes over from the launch screen.
	(plugin('SplashScreen')?.hide as ((o: { fadeOutDuration: number }) => Promise<void>) | undefined)?.({ fadeOutDuration: 200 }).catch(() => {});
	const app = plugin('App');
	(app?.getInfo as (() => Promise<{ version: string; build: string }>) | undefined)?.()
		.then((i) => (native.version = `${i.version} (${i.build})`))
		.catch(() => {});
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
			if (!/^https?:$/.test(u.protocol)) return;
			if (OWN.test(u.hostname) && !WEBSITE.test(u.hostname)) {
				// The app has no second window: a Miracle page meant for a new tab (Preview, an invoice) opens
				// right here, and the back button comes back.
				if (a.target === '_blank') {
					ev.preventDefault();
					location.assign(u.href);
				}
				return;
			}
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

/** This build of the app can get alerts: on Android, it was built with the Firebase setup (it says so in its
 * user agent); on iPhone, every store build can (Apple's push service). */
export const nativePushReady = () => isNative() && !!plugin('PushNotifications') && (nativePlatform() === 'ios' || /MiraclePush/.test(navigator.userAgent));
// Android's alerts go through Firebase ("fcm:<token>"), the iPhone's through Apple ("apns:<device token>").
const pushPrefix = () => (nativePlatform() === 'ios' ? 'apns:' : 'fcm:');

/** The phone's alert address ("fcm:<token>" or "apns:<token>"), asking permission first. */
export async function nativePushEndpoint(): Promise<string> {
	const push = plugin('PushNotifications');
	if (!push || !nativePushReady()) throw new Error("Alerts aren't switched on in this version of the app yet. They come with the next update.");
	const perm = (await (push.requestPermissions as () => Promise<{ receive: string }>)()).receive;
	if (perm !== 'granted') throw new Error('Notifications are off for Miracle. Turn them on in your phone settings.');
	const done: Listener[] = [];
	const stop = () => done.forEach((l) => Promise.resolve(l?.remove?.()).catch(() => {}));
	try {
		const token = await new Promise<string>((resolve, reject) => {
			Promise.resolve(push.addListener('registration', ((t: { value: string }) => resolve(t.value)) as never)).then((l) => done.push(l));
			Promise.resolve(push.addListener('registrationError', ((e: { error: string }) => reject(new Error(e.error || 'The phone could not set up alerts.'))) as never)).then((l) => done.push(l));
			Promise.resolve((push.register as () => Promise<void>)()).catch(reject);
			setTimeout(() => reject(new Error('The phone took too long to set up alerts. Try again.')), 15000);
		});
		try {
			localStorage.setItem(TOKEN_KEY, token);
		} catch {
			/* storage blocked */
		}
		return pushPrefix() + token;
	} finally {
		stop();
	}
}
/** The alert address this phone registered before, if any. */
export const nativePushSaved = () => (savedToken() ? pushPrefix() + savedToken() : '');
export const nativeDevice = () => (nativePlatform() === 'ios' ? 'iPhone app' : 'Android app');
