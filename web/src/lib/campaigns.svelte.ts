// A brand's pools (saved groups of creators) and campaigns (one brief sent to many creators, each as an
// ordinary request of their own). All through database functions that only touch this login's own.
import { supabase } from './supabase';
import type { BrandCreator, CampaignBoard, CampaignSummary, Pool } from './types';
import { errMessage } from './util';

export const pools = $state<{ list: Pool[]; loaded: boolean }>({ list: [], loaded: false });
export const campaigns = $state<{ list: CampaignSummary[]; loaded: boolean }>({ list: [], loaded: false });

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
	const { data, error } = await supabase.rpc(fn, args);
	if (error) throw new Error(errMessage(error));
	return data as T;
}

export async function loadPools() {
	pools.list = await call<Pool[]>('pools_list');
	pools.loaded = true;
}

/** Make a pool (no id) or rename one; returns the pool's id. */
export async function savePool(name: string, id: string | null = null) {
	const r = await call<{ id: string; pools: Pool[] }>('pool_save', { p_id: id, p_name: name });
	pools.list = r.pools;
	return r.id;
}

export async function deletePool(id: string) {
	pools.list = await call<Pool[]>('pool_delete', { p_id: id });
}

/** Add creators (listed, or already working together) and Instagram handles to invite. */
export async function addToPool(pool: string, creators: number[] = [], handles: string[] = []) {
	const r = await call<{ skipped: number; pools: Pool[] }>('pool_add', { p_pool: pool, p_creators: creators, p_handles: handles });
	pools.list = r.pools;
	return r.skipped;
}

export async function updateMember(id: string, note: string, tags: string[]) {
	pools.list = await call<Pool[]>('pool_member_update', { p_member: id, p_note: note, p_tags: tags });
}

export async function removeMember(id: string) {
	pools.list = await call<Pool[]>('pool_remove', { p_member: id });
}

export async function loadCampaigns() {
	campaigns.list = await call<CampaignSummary[]>('campaigns_list');
	campaigns.loaded = true;
}

export const saveCampaign = (p: Record<string, unknown>) => call<string>('campaign_save', { p });
export const deleteCampaign = (id: string) => call<null>('campaign_delete', { p_id: id });
export const campaignBoard = (id: string) => call<CampaignBoard | null>('campaign_board', { p_campaign: id });
export const sendCampaign = (id: string, creators: number[], handles: string[]) =>
	call<CampaignBoard>('send_campaign', { p_campaign: id, p_creators: creators, p_handles: handles });
export const respondQuotes = (quotes: string[], accept: boolean, note = '', name = '') =>
	call<{ done: number; failed: { quote: string; error: string }[] }>('campaign_respond', { p_quotes: quotes, p_accept: accept, p_note: note, p_name: name });

/** Why a creator can't take this brief, or '' when they can (what the board and send step show). */
export function fitFor(c: BrandCreator | null, kinds: string[]): { ok: boolean; text: string } {
	if (!c) return { ok: false, text: 'Not on Miracle yet' };
	if (!c.accepting) return { ok: false, text: 'Fully booked right now' };
	const offered = c.kinds ?? [];
	const missing = kinds.filter((k) => !offered.includes(k));
	if (missing.length === kinds.length && kinds.length) return { ok: false, text: "Doesn't make this content" };
	if (missing.length) return { ok: true, text: `Doesn't make ${missing.join(', ')}: gets the rest` };
	return { ok: true, text: 'Ready' };
}

/** The message a brand sends from its own Instagram or WhatsApp to a creator who isn't on Miracle. */
export const inviteText = (company: string, handle: string, campaign = '') =>
	`Hi! We're ${company || 'a brand'} and we'd love to work with you${campaign ? ` on our ${campaign} campaign` : ''}. We send briefs and quotes through Miracle (free for creators, no commission). Join here and you'll get our brief once you're set up: https://app.miracleapp.live/signup?as=creator`;
