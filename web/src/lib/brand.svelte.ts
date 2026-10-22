// The signed-in brand's own requests (via the my_requests() database function).
import { supabase } from './supabase';
import type { BrandCreator, BrandDashboard, BrandRequest, BrandRow, CreatorRating, DiscoverCreator } from './types';
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

/** Every creator this brand can reach, with the audience they share, their rates, what they did with
 * this brand and its private rating (Discover, fit scores and creator pages). Loaded once, kept fresh on demand. */
export const discover = $state<{ list: DiscoverCreator[]; loaded: boolean; error: string }>({ list: [], loaded: false, error: '' });
export async function loadDiscover() {
	const { data, error } = await supabase.rpc('discover_audience');
	if (error) {
		discover.error = errMessage(error);
		return;
	}
	discover.list = (data as DiscoverCreator[]) ?? [];
	discover.loaded = true;
	discover.error = '';
}

/** The brand's private rating of a creator. Creators never see it. */
export async function rateCreator(id: number, onTime: number, quality: number, results: number, note: string) {
	const { data, error } = await supabase.rpc('creator_rate', { p_creator: id, p_on_time: onTime, p_quality: quality, p_results: results, p_note: note });
	if (error) throw new Error(errMessage(error));
	const c = discover.list.find((x) => x.id === id);
	if (c) c.rating = data as CreatorRating;
	return data as CreatorRating;
}

/** Every request of this login across all creators: the Requests list and the inbox. */
export const allRequests = $state<{ list: BrandRow[]; loaded: boolean; error: string }>({ list: [], loaded: false, error: '' });
export async function loadAllRequests() {
	const { data, error } = await supabase.rpc('brand_requests_all');
	if (error) allRequests.error = errMessage(error);
	else {
		allRequests.list = ((data as BrandRow[]) ?? []).map((r) => ({ ...r, fee: Number(r.fee) || 0, product_value: Number(r.product_value) || 0 }));
		allRequests.error = '';
	}
	allRequests.loaded = true;
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
