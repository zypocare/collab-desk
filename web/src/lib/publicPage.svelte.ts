import { supabase } from './supabase';
import type { PublicInsights } from './insights';
import type { PublicPage } from './types';

export const pub = $state<{ data: PublicPage | null; ins: PublicInsights | null; error: string }>({ data: null, ins: null, error: '' });

export async function loadPublicPage() {
	// Insights (null when she has the page off) feed the "what you can expect" numbers.
	const [page, ins, extra] = await Promise.all([supabase.rpc('public_page'), supabase.rpc('public_insights'), supabase.rpc('page_extras')]);
	if (page.error) pub.error = page.error.message;
	else {
		const d = { ...(page.data as PublicPage), ...((extra.data as Partial<PublicPage> | null) ?? {}) };
		// Her coming weeks are nearly full: packages cost her % more (the database charges the same).
		const f = Number(d.demand_factor) || 1;
		if (f > 1) d.packages = (d.packages ?? []).map((k) => ({ ...k, price: Math.ceil((k.price * f) / 500) * 500 }));
		pub.data = d;
	}
	pub.ins = (ins.data as PublicInsights | null) ?? null;
	return pub.data;
}
