// The signed-in brand's own requests (via the my_requests() database function).
import { supabase } from './supabase';
import type { BrandRequest } from './types';
import { errMessage } from './util';

export const brandData = $state<{ loaded: boolean; error: string; requests: BrandRequest[]; unread: Record<string, number> }>({
	loaded: false,
	error: '',
	requests: [],
	unread: {}
});

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
