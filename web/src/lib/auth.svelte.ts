import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Account } from './types';

export const auth = $state<{ ready: boolean; session: Session | null; account: Account | null }>({
	ready: false,
	session: null,
	account: null
});

let started = false;

export async function initAuth() {
	if (started) return;
	started = true;
	const { data } = await supabase.auth.getSession();
	auth.session = data.session;
	if (data.session) await refreshAccount();
	auth.ready = true;

	supabase.auth.onAuthStateChange((event, session) => {
		auth.session = session;
		if (event === 'SIGNED_OUT') auth.account = null;
	});
}

export async function refreshAccount() {
	const { data, error } = await supabase.rpc('my_account');
	if (error) {
		console.error(error);
		auth.account = null;
		return null;
	}
	auth.account = data as Account | null;
	return auth.account;
}

export const homeFor = (a: Account | null) => (a?.role === 'creator' ? '/studio' : '/brand');

export async function signOut() {
	await supabase.auth.signOut();
	auth.session = null;
	auth.account = null;
}
