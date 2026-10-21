// The signed-in brand's own requests (via the my_requests() database function).
import { supabase } from './supabase';
import type { BrandCreator, BrandDashboard, BrandRequest } from './types';
import { errMessage } from './util';

export const brandData = $state<{ loaded: boolean; error: string; requests: BrandRequest[]; unread: Record<string, number> }>({
	loaded: false,
	error: '',
	requests: [],
	unread: {}
});

/** Across every creator this brand works with (the brand dashboard). */
export const brandHome = $state<{ dash: BrandDashboard | null; error: string }>({ dash: null, error: '' });

export async function loadDashboard() {
	const { data, error } = await supabase.rpc('brand_dashboard');
	if (error) brandHome.error = errMessage(error);
	else {
		const d = data as BrandDashboard;
		brandHome.dash = { ...d, spent_month: Number(d.spent_month) || 0, to_pay: Number(d.to_pay) || 0 };
		brandHome.error = '';
	}
}

/** Creators who chose to be listed for brands. */
export async function discoverCreators(q = '', niche = ''): Promise<BrandCreator[]> {
	const { data, error } = await supabase.rpc('discover_creators', { p_q: q, p_niche: niche });
	if (error) throw new Error(errMessage(error));
	return (data as BrandCreator[]) ?? [];
}

/** Unread messages from the creator, by request code. */
export async function loadUnread() {
	const { data } = await supabase.rpc('my_unread');
	brandData.unread = (data as Record<string, number>) ?? {};
}

export async function loadRequests() {
	loadUnread();
	const { data, error } = await supabase.rpc('my_requests');
	if (error) brandData.error = errMessage(error);
	else {
		brandData.requests = (data as BrandRequest[]).map((r) => ({ ...r, fee: Number(r.fee) || 0, product_value: Number(r.product_value) || 0 }));
		brandData.error = '';
	}
	brandData.loaded = true;
}
