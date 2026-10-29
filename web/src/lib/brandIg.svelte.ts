// A brand's own Instagram (Settings > Company & Instagram): the profile creators see as "Verified on Instagram".
import { supabase } from './supabase';
import { errMessage } from './util';

/** One of the brand's own posts, with Instagram's figures (brand-ig-sync). */
export type BrandPost = {
	id: string; caption: string; media_type: string; product_type: string; permalink: string; posted_at: string; thumbnail_url: string;
	likes: number | null; comments: number | null; saves: number | null; shares: number | null; reach: number | null; views: number | null; interactions: number | null;
};
export type BrandIg = {
	username: string; name: string; picture: string; followers: number | null; media_count: number | null; connected_at: string; synced_at: string;
	/** The nightly sync (brand-ig-sync): posts, follower history, the last 30 days and the audience. */
	media?: BrandPost[];
	history?: { day: string; followers: number }[];
	insights?: import('./insights').InsightsData & { er?: number | null };
	demographics?: Partial<Record<'age' | 'gender' | 'city' | 'country', Record<string, number>>>;
	engagement_rate?: number | null;
	last_error?: string;
};

export const brandIg = $state<{ data: BrandIg | null; loaded: boolean }>({ data: null, loaded: false });

export async function loadBrandIg() {
	const { data } = await supabase.rpc('brand_ig_get');
	brandIg.data = (data as BrandIg | null) ?? null;
	brandIg.loaded = true;
}

/** The server function, with its own error message when it sends one. */
async function call(body: Record<string, unknown>) {
	const { data, error } = await supabase.functions.invoke('instagram-auth', { body: { ...body, as: 'brand' } });
	if (error) {
		let msg = errMessage(error);
		try {
			const b = await (error as { context?: Response }).context?.json();
			if (b?.error) msg = b.error;
		} catch {
			/* keep the generic message */
		}
		throw new Error(msg);
	}
	return data as { url?: string; ok?: boolean };
}

/** Off to Instagram's sign-in; it comes back to /brand/settings on Miracle's own address. */
export async function connectBrandIg() {
	const r = await call({ action: 'start' });
	if (!r.url) throw new Error('Instagram sign-in could not start. Try again.');
	location.href = r.url;
}

/** Fresh numbers from Instagram now (anyone on the team); the nightly run does the same. */
export async function syncBrandIg() {
	const { data, error } = await supabase.functions.invoke('brand-ig-sync', { body: {} });
	if (error) {
		let msg = errMessage(error);
		try {
			const b = await (error as { context?: Response }).context?.json();
			if (b?.error) msg = b.error;
		} catch {
			/* keep the generic message */
		}
		throw new Error(msg);
	}
	if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
	await loadBrandIg();
}

export async function refreshBrandIg() {
	await call({ action: 'refresh' });
	await loadBrandIg();
}

export async function disconnectBrandIg() {
	const { error } = await supabase.rpc('brand_ig_disconnect');
	if (error) throw new Error(errMessage(error));
	brandIg.data = null;
}
