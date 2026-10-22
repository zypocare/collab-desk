// Which creator an address belongs to: name.miracleapp.live (or name.localhost while testing) is
// that creator's. The app's first address, collab-desk.zypocare.workers.dev, stays Niveditha's.
// Shared by the app and the Worker; an empty answer means "not a creator's address".
export const ROOT_DOMAIN = 'miracleapp.live';
const LEGACY: Record<string, string> = { 'collab-desk.zypocare.workers.dev': 'nivy' };

/** The same page on another creator's address (name.miracleapp.live, or name.localhost while testing). */
export function addressFor(slug: string, path = '/'): string {
	if (typeof location === 'undefined') return `https://${slug}.${ROOT_DOMAIN}${path}`;
	const host = location.host.toLowerCase();
	const root = host.replace(/^[^.]+\./, '');
	const known = !LEGACY[location.hostname.toLowerCase()] && (root.startsWith(ROOT_DOMAIN) || root.startsWith('localhost'));
	return known ? `${location.protocol}//${slug}.${root}${path}` : `https://${slug}.${ROOT_DOMAIN}${path}`;
}

/** Miracle's own address (app.miracleapp.live, or app.localhost while testing): sign-up and brands, no creator. */
export const APP_NAME = 'app';
export function isAppHost(hostname: string): boolean {
	const host = hostname.toLowerCase().replace(/:\d+$/, '');
	return host === `${APP_NAME}.${ROOT_DOMAIN}` || host === `${APP_NAME}.localhost`;
}

/** A page on Miracle's own address (sign-up, a brand's home). */
export const appAddress = (path = '/') => addressFor(APP_NAME, path);

export function slugFromHost(hostname: string): string {
	const host = hostname.toLowerCase().replace(/:\d+$/, '');
	if (LEGACY[host]) return LEGACY[host];
	for (const root of [ROOT_DOMAIN, 'localhost']) {
		if (host.endsWith('.' + root)) {
			const name = host.slice(0, -(root.length + 1));
			return name !== APP_NAME && /^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$/.test(name) ? name : '';
		}
	}
	return '';
}
