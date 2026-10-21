import { supabase } from './supabase';
import type { PublicInsights } from './insights';
import type { PublicPage } from './types';

// missing: nobody has this address (name.miracleapp.live) yet.
export const pub = $state<{ data: PublicPage | null; ins: PublicInsights | null; error: string; missing: boolean }>({ data: null, ins: null, error: '', missing: false });

function apply(page: unknown, extra: unknown, ins: unknown) {
	const d = { ...(page as PublicPage), ...((extra as Partial<PublicPage> | null) ?? {}) };
	// Her coming weeks are nearly full: packages cost her % more (the database charges the same).
	const f = Number(d.demand_factor) || 1;
	if (f > 1) d.packages = (d.packages ?? []).map((k) => ({ ...k, price: Math.ceil((k.price * f) / 500) * 500 }));
	pub.data = d;
	pub.ins = (ins as PublicInsights | null) ?? null;
}

// On the live site the server puts her page data into the page itself, so it shows at once.
// It's used only for the first screen; the fresh copy from the database replaces it right after.
let booted = false;
function fromServer() {
	if (booted || typeof document === 'undefined') return;
	booted = true;
	try {
		const el = document.getElementById('pp-boot');
		if (!el?.textContent) return;
		const b = JSON.parse(el.textContent) as { page: unknown; ins: unknown; extra: unknown; at: number };
		if (b.page && Date.now() - b.at < 10 * 60e3) apply(b.page, b.extra, b.ins);
	} catch {
		/* ignore and wait for the database */
	}
}

export async function loadPublicPage() {
	fromServer();
	// Insights (null when she has the page off) feed the "what you can expect" numbers.
	const [page, ins, extra] = await Promise.all([supabase.rpc('public_page'), supabase.rpc('public_insights'), supabase.rpc('page_extras')]);
	if (page.error) {
		if (!pub.data) pub.error = page.error.message;
	} else if (!page.data) pub.missing = true;
	else apply(page.data, extra.data, ins.data);
	return pub.data;
}
