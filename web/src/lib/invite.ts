// Invite and earn (migration 162): a creator's own address is her invite link. The sign-up page keeps
// the link it was opened with, and hands it over once the account is made; she gets a month of Pro when
// they join properly (a creator approved, a brand's first request).
import { appAddress } from './creatorHost';
import { pageSlug, supabase } from './supabase';

const KEY = 'mc-invite';
const KEEP = 30 * 86400e3;

/** Sign-up opened with ?invite=her-link: remember it (30 days) for when the account is made. */
export function keepInvite(ref: string | null) {
	const slug = (ref ?? '').trim().toLowerCase();
	if (!/^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$/.test(slug)) return;
	try {
		localStorage.setItem(KEY, JSON.stringify({ slug, at: Date.now() }));
	} catch {
		/* storage blocked */
	}
}

/** The account is made: tell Miracle who invited them (once). */
export async function claimInvite(kind: 'creator' | 'brand', name: string) {
	let slug = '';
	try {
		const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { slug: string; at: number } | null;
		if (v && Date.now() - v.at < KEEP) slug = v.slug;
		localStorage.removeItem(KEY);
	} catch {
		/* storage blocked */
	}
	if (slug) await supabase.rpc('referral_claim', { p_ref: slug, p_kind: kind, p_name: name }).then(() => {});
}

/** Sign-up on Miracle, with this page's creator as the one who invited them (on her own address). */
export const inviteLink = (as: 'creator' | 'brand', from: string, slug = pageSlug) =>
	appAddress(`/signup?as=${as}${slug ? `&invite=${encodeURIComponent(slug)}` : ''}&utm_source=${encodeURIComponent(from)}`);
