// Referrals: a brand that worked with her shares a link (/?ref=abc123). The code is kept on this
// device for 30 days and attached to the first request sent from here.
import { supabase } from './supabase';

const KEY = 'cd-ref';
export function keepReferral(url: URL) {
	const ref = url.searchParams.get('ref');
	if (!ref || !/^[a-z0-9]{4,12}$/i.test(ref)) return;
	try {
		localStorage.setItem(KEY, JSON.stringify({ ref: ref.toLowerCase(), at: Date.now() }));
	} catch {
		/* storage blocked */
	}
}
export async function useReferral(code: string) {
	try {
		const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { ref: string; at: number } | null;
		if (!saved || Date.now() - saved.at > 30 * 864e5) return;
		const { data } = await supabase.rpc('set_referral', { p_code: code, p_ref: saved.ref });
		if ((data as { ok?: boolean } | null)?.ok) localStorage.removeItem(KEY);
	} catch {
		/* nothing saved */
	}
}
