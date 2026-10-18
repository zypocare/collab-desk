// Fingerprint / face sign-in (passkeys, through Supabase) and the devices signed in to her account.
import { supabase } from './supabase';

export type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };
export type Device = { id: string; created_at: string; last_at: string; agent: string; ip: string; current: boolean };

/** Can this browser use passkeys at all? */
export const passkeysHere = () => typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';

/** Her passkeys, or null when passkeys aren't switched on for the app (Supabase setting). */
export async function listPasskeys(): Promise<Passkey[] | null> {
	try {
		const { data, error } = await supabase.auth.passkey.list();
		if (error) return null;
		return (data ?? []) as Passkey[];
	} catch {
		return null;
	}
}

/** "Chrome on an Android phone" from a browser's description. */
export function describe(ua: string) {
	const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
	const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android phone' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : 'device';
	const phone = /iPhone|Android|Mobile/.test(ua);
	return { browser, os, phone, label: `${browser} on ${os === 'device' ? 'a device' : os}` };
}

/** How the app names a passkey made here ("Chrome on Mac"). */
export const deviceName = () => (typeof navigator === 'undefined' ? 'This device' : describe(navigator.userAgent).label);
