import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Account } from './types';
import { forgetAll, isNetworkError } from './offline.svelte';

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
	const uid = auth.session?.user.id ?? '';
	if (error) {
		// Offline: who this is was saved last time.
		if (isNetworkError(error)) {
			try {
				const saved = JSON.parse(localStorage.getItem('cd-account') ?? 'null') as { uid: string; account: Account } | null;
				if (saved?.uid === uid) return (auth.account = saved.account);
			} catch {
				/* nothing saved */
			}
		}
		console.error(error);
		auth.account = null;
		return null;
	}
	auth.account = data as Account | null;
	try {
		localStorage.setItem('cd-account', JSON.stringify({ uid, account: auth.account }));
	} catch {
		/* storage blocked */
	}
	return auth.account;
}

/** Agencies: work as another of their brands. */
export async function switchBrand(id: string) {
	const { data, error } = await supabase.rpc('switch_brand', { p_brand: id });
	if (error) throw error;
	auth.account = data as Account;
}

export const homeFor = (a: Account | null) => (a?.role === 'creator' ? '/studio' : '/brand');

export async function signOut() {
	await forgetAll();
	// This device only: signing out on her phone must not sign her laptop out too.
	await supabase.auth.signOut({ scope: 'local' });
	auth.session = null;
	auth.account = null;
}
