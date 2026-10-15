import { supabase } from './supabase';
import type { PublicPage } from './types';

export const pub = $state<{ data: PublicPage | null; error: string }>({ data: null, error: '' });

export async function loadPublicPage() {
	const { data, error } = await supabase.rpc('public_page');
	if (error) pub.error = error.message;
	else pub.data = data as PublicPage;
	return pub.data;
}
