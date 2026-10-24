// A brand's autopilots: five agents, each Off, Ask me or Auto, and what they prepared for an OK.
// The work itself runs in the database (migration 115), daily and whenever the Autopilots page opens.
import { supabase } from './supabase';
import type { BrandCreator } from './types';
import { errMessage } from './util';

export type Mode = 'off' | 'ask' | 'auto';
export type AutopilotKind = 'shortlist' | 'followup' | 'draft' | 'negotiate' | 'rebook' | 'watch' | 'invite';
export type Competitor = { name: string; handle: string };
/** One competitor in the weekly brief: creators on Miracle seen with it, and ones the web search found. */
export type WatchSection = {
	name: string;
	handle: string;
	miracle: { creator: BrandCreator & { health?: unknown }; creator_id: number; posts: { link: string; posted_at: string | null; views: number | null; source: 'miracle' | 'web' }[]; new: boolean; known: boolean }[];
	web: { handle: string; name: string; link: string; note: string; new: boolean }[];
};
export type Autopilots = {
	shortlist: Mode;
	shortlist_max: number;
	followup: Mode;
	followup_days: number;
	draftcheck: Mode;
	negotiate: Mode;
	negotiate_over: number;
	signer: string;
	rebook: Mode;
	watch: Mode;
	watch_brands: Competitor[];
	watch_campaign: string | null;
	watch_max: number;
	watch_checked_at: string | null;
	waiting: number;
	lately: Partial<Record<AutopilotKind, { title: string; status: string; at: string }>>;
};
export type DraftCheck = { label: string; ok: boolean | null };
export type AutopilotItem = {
	id: string;
	kind: AutopilotKind;
	status: 'pending' | 'done' | 'skipped' | 'auto';
	title: string;
	body: string;
	payload: {
		action?: 'accept' | 'counter' | 'review' | 'approve' | 'changes';
		checks?: DraftCheck[];
		creators?: (BrandCreator & { score: number; why: string[] })[];
		total?: number;
		budget?: number;
		code?: string;
		slug?: string;
		competitors?: WatchSection[];
		new?: number;
		campaign?: { id: string; name: string } | null;
		creator_id?: number | null;
		handle?: string;
		competitor?: string;
		link?: string;
		on_miracle?: boolean;
		creator?: BrandCreator | null;
	};
	note: string;
	created_at: string;
	acted_at: string | null;
	campaign_id: string | null;
	campaign: string | null;
	code: string | null;
	slug: string | null;
	creator: BrandCreator | null;
};
export type Suggestion = BrandCreator & { score: number; why: string[] };

export const autopilots = $state<{ settings: Autopilots | null; items: AutopilotItem[]; loaded: boolean }>({ settings: null, items: [], loaded: false });

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
	const { data, error } = await supabase.rpc(fn, args);
	if (error) throw new Error(errMessage(error));
	return data as T;
}

/** Settings, then a fresh run so the inbox is up to date. */
export async function loadAutopilots(run = true) {
	autopilots.settings = await call<Autopilots>('autopilots_get');
	autopilots.items = await call<AutopilotItem[]>(run ? 'autopilots_run_now' : 'autopilot_items');
	if (run) autopilots.settings = await call<Autopilots>('autopilots_get');
	autopilots.loaded = true;
}

export async function saveAutopilots(patch: Partial<Autopilots>) {
	if (autopilots.settings) Object.assign(autopilots.settings, patch);
	autopilots.settings = await call<Autopilots>('autopilots_save', { p: patch });
}

/** approve: do what it prepared · alt: the other choice (approve a draft anyway) · skip. */
export async function actOn(id: string, action: 'approve' | 'alt' | 'skip', body?: string) {
	autopilots.items = await call<AutopilotItem[]>('autopilot_act', { p_item: id, p_action: action, p_body: body ?? null });
	if (autopilots.settings) autopilots.settings.waiting = autopilots.items.filter((i) => i.status === 'pending').length;
}

/** Creators who fit a brief (a saved campaign, or one being written). */
export const shortlistFor = (campaign: string | null, brief: unknown | null, limit = 8) =>
	call<Suggestion[]>('shortlist_for', { p_campaign: campaign, p_brief: brief, p_limit: limit });

export const draftCheck = (draft: string) => call<{ caption: string; checks: DraftCheck[]; missing: number; message: string } | null>('draft_check', { p_draft: draft });

export const KIND_LABEL: Record<AutopilotKind, string> = { shortlist: 'Shortlist', followup: 'Follow-up', draft: 'Draft checker', negotiate: 'Negotiator', rebook: 'Rebook', watch: 'Competitor watch', invite: 'Invite' };

/** Competitor watch now (at most once an hour): the web search, creators on Miracle, the brief and the invites. */
export async function checkCompetitors() {
	const { data, error } = await supabase.functions.invoke('competitor-watch', { body: {} });
	if (error) {
		const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
		throw new Error((body as { error?: string } | null)?.error ?? errMessage(error));
	}
	await loadAutopilots(false);
	return data as { creators?: number; new?: number; invites?: number; web?: number };
}
