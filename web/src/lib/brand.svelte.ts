// The signed-in brand's own requests (via the my_requests() database function).
import { supabase } from './supabase';
import type { BrandRequest } from './types';
import { errMessage } from './util';

export const brandData = $state<{ loaded: boolean; error: string; requests: BrandRequest[] }>({
	loaded: false,
	error: '',
	requests: []
});

export async function loadRequests() {
	const { data, error } = await supabase.rpc('my_requests');
	if (error) brandData.error = errMessage(error);
	else {
		brandData.requests = (data as BrandRequest[]).map((r) => ({ ...r, fee: Number(r.fee) || 0, product_value: Number(r.product_value) || 0 }));
		brandData.error = '';
	}
	brandData.loaded = true;
}
