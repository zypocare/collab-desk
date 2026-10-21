// Signed in on one creator's address, signed in on all of them: on miracleapp.live the sign-in is
// kept in a cookie for the whole domain instead of this one address's browser storage. A cookie
// holds about 4 KB, so the saved sign-in is split over a few. Anywhere else (tests, the old
// address) the normal browser storage is used.
import { ROOT_DOMAIN } from './creatorHost.ts';

type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

const PART = 3000;
const LIFE = 400 * 24 * 3600; // the longest browsers keep a cookie

function jar(): Record<string, string> {
	const out: Record<string, string> = {};
	for (const c of document.cookie.split('; ')) {
		const i = c.indexOf('=');
		if (i > 0) out[c.slice(0, i)] = c.slice(i + 1);
	}
	return out;
}

export function sharedStorage(hostname: string): Storage | undefined {
	const host = hostname.toLowerCase();
	if (host !== ROOT_DOMAIN && !host.endsWith('.' + ROOT_DOMAIN)) return undefined;
	const tail = `; Domain=.${ROOT_DOMAIN}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
	const put = (name: string, value: string, age: number) => (document.cookie = `${name}=${value}; Max-Age=${age}${tail}`);
	const parts = (key: string) => {
		const all = jar();
		const out: string[] = [];
		for (let i = 0; all[`${key}.${i}`] !== undefined; i++) out.push(all[`${key}.${i}`]);
		return out;
	};
	const store: Storage = {
		getItem(key) {
			const p = parts(key);
			if (p.length) {
				try {
					return decodeURIComponent(p.join(''));
				} catch {
					return null;
				}
			}
			// Signed in on this address before sign-ins were shared: move it over once.
			try {
				const old = localStorage.getItem(key);
				if (old) {
					store.setItem(key, old);
					localStorage.removeItem(key);
				}
				return old;
			} catch {
				return null;
			}
		},
		setItem(key, value) {
			const enc = encodeURIComponent(value);
			const n = Math.ceil(enc.length / PART);
			for (let i = 0; i < n; i++) put(`${key}.${i}`, enc.slice(i * PART, (i + 1) * PART), LIFE);
			const had = parts(key).length;
			for (let i = n; i < had; i++) put(`${key}.${i}`, '', 0);
		},
		removeItem(key) {
			const had = parts(key).length;
			for (let i = 0; i < had; i++) put(`${key}.${i}`, '', 0);
			try {
				localStorage.removeItem(key);
			} catch {
				/* storage blocked */
			}
		}
	};
	return store;
}
