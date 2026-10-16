import { supabase } from './supabase';
import type { PublicInsights } from './insights';
import type { PublicPage } from './types';

export const pub = $state<{ data: PublicPage | null; ins: PublicInsights | null; error: string }>({ data: null, ins: null, error: '' });

export async function loadPublicPage() {
	// Insights (null when she has the page off) feed the "what you can expect" numbers.
	const [page, ins] = await Promise.all([supabase.rpc('public_page'), supabase.rpc('public_insights')]);
	if (page.error) pub.error = page.error.message;
	else pub.data = page.data as PublicPage;
	pub.ins = (ins.data as PublicInsights | null) ?? null;
	return pub.data;
}
