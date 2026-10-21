import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy admin/.env.example to admin/.env and fill it in.');

// The same Supabase project as the app. The panel's data comes only from the admin_* functions,
// which check that the signed-in email is one of Miracle's admins.
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing', {
	auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'miracle-admin-auth' }
});

export const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string) || '';

/** A database or network error as a sentence. */
export function errMessage(e: unknown): string {
	if (!e) return 'Something went wrong.';
	if (typeof e === 'string') return e;
	const msg = String((e as { message?: unknown })?.message ?? '');
	if ((typeof navigator !== 'undefined' && !navigator.onLine) || /failed to fetch|networkerror|load failed/i.test(msg)) return "You're offline. Try again when you're connected.";
	return msg || 'Something went wrong.';
}
