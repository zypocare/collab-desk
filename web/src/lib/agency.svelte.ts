// Agency mode: a manager or agency who works for several creators switches between their studios, sees
// the whole roster at once, keeps a commission ledger (tracking only) and makes pitch decks.
import { addressFor } from './creatorHost';
import { isNative } from './native';
import { supabase } from './supabase';
import { errMessage } from './util';

export type Studio = { id: number; name: string; handle: string; slug: string; role: string; photo: string | null; current: boolean };
/** pct: the commission on this deal. term: 'rate' when locked at the rate of the time, 'deal' when set for this deal, null while it follows the current rate. */
export type RosterDeal = { id: string; code: string; brand: string; fee: number; paid_on: string | null; settled: boolean; pct: number; term: 'rate' | 'deal' | null };
export type RosterCreator = {
	id: number;
	slug: string;
	name: string;
	niche: string;
	city: string;
	handle: string;
	photo: string | null;
	followers: number | null;
	engagement: number | null;
	avg_views: number | null;
	languages: string[] | null;
	site_url: string;
	rates: Record<string, number> | null;
	show_insights: boolean;
	pct: number;
	open: number;
	requests: number;
	due: number;
	week: number;
	deals: RosterDeal[];
	trust?: { deals: number; posted: number; on_time: number; reply_hours: number | null } | null;
};

export const agency = $state<{ studios: Studio[]; loaded: boolean }>({ studios: [], loaded: false });

export async function loadStudios() {
	const { data } = await supabase.rpc('my_studios');
	agency.studios = (data as Studio[]) ?? [];
	agency.loaded = true;
}

/** Work for another creator: the whole studio reloads as theirs. */
export async function useCreator(id: number, to = '/studio', slug = '') {
	const { error } = await supabase.rpc('use_creator', { p_creator: id });
	if (error) throw new Error(errMessage(error));
	// Each creator's studio lives at her own address (the sign-in is shared across them).
	const s = slug || agency.studios.find((x) => x.id === id)?.slug || '';
	location.href = s && !isNative() ? addressFor(s, to) : to;
}

export async function loadRoster() {
	const { data, error } = await supabase.rpc('agency_roster');
	if (error) throw new Error(errMessage(error));
	return (data as RosterCreator[]) ?? [];
}

export async function setSplit(creator: number, pct: number) {
	const { error } = await supabase.rpc('agency_set', { p_creator: creator, p_pct: pct, p_collab: null, p_settled: false });
	if (error) throw new Error(errMessage(error));
}
/** A commission for one deal on its own terms. */
export async function setDealPct(collab: string, pct: number) {
	const { error } = await supabase.rpc('agency_deal_pct', { p_collab: collab, p_pct: pct });
	if (error) throw new Error(errMessage(error));
}
export async function setSettled(creator: number, collab: string, settled: boolean) {
	const { error } = await supabase.rpc('agency_set', { p_creator: creator, p_pct: null, p_collab: collab, p_settled: settled });
	if (error) throw new Error(errMessage(error));
}
