// A brand's own Instagram (Settings > Company & Instagram): the profile creators see as "Verified on Instagram".
import { supabase } from './supabase';
import { errMessage } from './util';

export type BrandIg = { username: string; name: string; picture: string; followers: number | null; media_count: number | null; connected_at: string; synced_at: string };

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

export async function refreshBrandIg() {
	await call({ action: 'refresh' });
	await loadBrandIg();
}

export async function disconnectBrandIg() {
	const { error } = await supabase.rpc('brand_ig_disconnect');
	if (error) throw new Error(errMessage(error));
	brandIg.data = null;
}
