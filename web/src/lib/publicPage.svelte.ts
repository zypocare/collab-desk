import { supabase } from './supabase';
import type { PublicInsights } from './insights';
import type { PublicPage } from './types';

export type PublicYoutube = { title: string; subscribers: number | null; shorts_avg_views: number | null; videos_avg_views: number | null; shorts: number } | null;
export const pub = $state<{ data: PublicPage | null; ins: PublicInsights | null; yt: PublicYoutube; error: string }>({ data: null, ins: null, yt: null, error: '' });

export async function loadPublicPage() {
	// Insights (null when she has the page off) feed the "what you can expect" numbers.
	const [page, ins, yt] = await Promise.all([supabase.rpc('public_page'), supabase.rpc('public_insights'), supabase.rpc('public_youtube')]);
	if (page.error) pub.error = page.error.message;
	else pub.data = page.data as PublicPage;
	pub.ins = (ins.data as PublicInsights | null) ?? null;
	pub.yt = (yt.data as PublicYoutube) ?? null;
	return pub.data;
}
