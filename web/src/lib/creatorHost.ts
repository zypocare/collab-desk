// Which creator an address belongs to: name.miracleapp.live (or name.localhost while testing) is
// that creator's. The app's first address, collab-desk.zypocare.workers.dev, stays Niveditha's.
// Shared by the app and the Worker; an empty answer means "not a creator's address".
export const ROOT_DOMAIN = 'miracleapp.live';
const LEGACY: Record<string, string> = { 'collab-desk.zypocare.workers.dev': 'nivy' };

export function slugFromHost(hostname: string): string {
	const host = hostname.toLowerCase().replace(/:\d+$/, '');
	if (LEGACY[host]) return LEGACY[host];
	for (const root of [ROOT_DOMAIN, 'localhost']) {
		if (host.endsWith('.' + root)) {
			const name = host.slice(0, -(root.length + 1));
			return /^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$/.test(name) ? name : '';
		}
	}
	return '';
}
