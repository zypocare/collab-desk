import { createClient } from '@supabase/supabase-js';
import { slugFromHost } from './creatorHost.ts';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
	console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy web/.env.example to web/.env and fill it in.');
}

/** The creator whose address this is (name.miracleapp.live), or '' on any other address. */
export const pageSlug = typeof location === 'undefined' ? '' : slugFromHost(location.hostname);

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
	auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
	// Public pages, the request form and questions are for the creator whose address this is.
	global: { headers: pageSlug ? { 'x-creator': pageSlug } : {} },
	// The live connection's heartbeat runs in a worker, so a background tab doesn't silently lose it.
	realtime: { worker: true }
});

export const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string) || '';
