// A creator's link (name.miracleapp.live): what it may look like, ideas from her name and handle, and the
// name she typed on the website's "Claim your link" (kept on this device until she signs up).
import { firstName } from './util';

export const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$/;

/** "Priya.Sharma_" → "priya-sharma": letters, numbers and single hyphens, up to 30. */
export const cleanSlug = (v: string) =>
	v.toLowerCase().replace(/[._\s]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

/** Up to three links to suggest, from her Instagram handle and name. */
export const slugIdeas = (name: string, handle: string) =>
	[...new Set([cleanSlug(handle), cleanSlug(firstName(name)), cleanSlug(name), cleanSlug(handle).replace(/-/g, '')])]
		.filter((x) => SLUG_RE.test(x) && !x.startsWith('new-'))
		.slice(0, 3);

const WANTED = 'mc-wanted-link';
export function keepWantedSlug(v: string) {
	try {
		localStorage.setItem(WANTED, v);
	} catch {
		/* storage blocked */
	}
}
export function wantedSlug() {
	try {
		return cleanSlug(localStorage.getItem(WANTED) ?? '');
	} catch {
		return '';
	}
}
export function forgetWantedSlug() {
	try {
		localStorage.removeItem(WANTED);
	} catch {
		/* storage blocked */
	}
}
