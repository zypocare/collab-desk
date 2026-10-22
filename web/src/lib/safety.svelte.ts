// Reporting and blocking, for creators (blocking brands) and brands (blocking creators).
import { supabase } from './supabase';
import { toast } from './ui.svelte';
import { errMessage } from './util';

export type Block = { id: string; name: string; brand_id: string | null; creator_id: number; photo: string | null; at: string };
export const blocks = $state<{ list: Block[]; loaded: boolean }>({ list: [], loaded: false });

export async function loadBlocks() {
	const { data } = await supabase.rpc('my_blocks');
	blocks.list = (data as Block[] | null) ?? [];
	blocks.loaded = true;
}

/** Creators a brand blocked (they drop out of Discover and pools). */
export const blockedCreators = () => new Set(blocks.list.map((b) => b.creator_id));

export async function block(target: { brand_id?: string; creator_id?: number; collab_id?: string }, name: string) {
	const { data, error } = await supabase.rpc('safety_block', { p: target });
	if (error) return toast(errMessage(error), 'alert'), false;
	blocks.list = (data as Block[]) ?? [];
	blocks.loaded = true;
	toast(`${name} is blocked`, 'check');
	return true;
}

export async function unblock(b: Block) {
	const { data, error } = await supabase.rpc('safety_unblock', { p_id: b.id });
	if (error) return toast(errMessage(error), 'alert');
	blocks.list = (data as Block[]) ?? [];
	toast(`${b.name} is unblocked`, 'check');
}

export type Reason = { id: string; label: string };
// What a creator can report about a brand, and a brand about a creator.
export const BRAND_REASONS: Reason[] = [
	{ id: 'pay_to_work', label: 'Asking me to pay to get work' },
	{ id: 'fake', label: 'Fake brand or pretending to be someone' },
	{ id: 'not_paid', label: "Didn't pay after the post went live" },
	{ id: 'abuse', label: 'Rude, threatening or inappropriate' },
	{ id: 'spam', label: 'Spam' },
	{ id: 'other', label: 'Something else' }
];
export const CREATOR_REASONS: Reason[] = [
	{ id: 'not_posted', label: "Got paid but didn't post" },
	{ id: 'fake_followers', label: 'Fake followers or bought likes' },
	{ id: 'no_approval', label: 'Posted without my approval' },
	{ id: 'abuse', label: 'Rude, threatening or inappropriate' },
	{ id: 'other', label: 'Something else' }
];

export async function report(p: { collab_id?: string; brand_id?: string; creator_id?: number; reason: string; details: string; block: boolean }) {
	const { data, error } = await supabase.rpc('safety_report', { p });
	if (error) throw error;
	if (p.block) await loadBlocks();
	return data as { ok: boolean; blocked: boolean };
}

// A first request or message that asks the creator for money, or carries a UPI ID: a scam sign.
const PAY = /(registration|security|joining|processing|onboarding)\s*(fee|charge|amount|deposit)|pay\s*(₹|rs\.?|inr)?\s*[0-9][0-9,]*\s*(to|for)\s*(confirm|join|register|book|secure)|refundable\s*deposit|(?:^|\s)[a-z0-9._-]{2,}@(?:ybl|okaxis|oksbi|okhdfcbank|okicici|paytm|upi|ibl|axl|apl|ptyes|ptsbi|ptaxis|pthdfc|yapl|waaxis|wahdfcbank|freecharge|jupiteraxis|slc|kotak|icici|sbi|hdfcbank|axisbank)\b/i;
export const asksToPay = (...texts: (string | null | undefined)[]) => texts.some((t) => !!t && PAY.test(t));
