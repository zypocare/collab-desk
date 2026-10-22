// The growth check-up: why she isn't growing and what to change, from her own reels and audience.
// It's made on the server (the growth-checkup function): by itself every two weeks, with a phone alert
// and an email, or now when she asks. Here: loading it, ticking actions off, and the actions' buttons.
import { bestSlot } from './grow.svelte';
import { studio } from './studio.svelte';
import { supabase } from './supabase';
import type { IgMedia } from './types';
import { toast } from './ui.svelte';
import { errMessage } from './util';

export type Topic = { name: string; n: number; views: number; shares1k: number; ids: string[] };
export type Finding = { key: 'audience' | 'shares' | 'mix' | 'watch'; title: string; text: string; big?: boolean };
export type Action = { key: string; title: string; sub: string; kind: 'copy' | 'moments' | 'weekly' | 'check' | 'boost' | 'autopilot' | 'tick'; text?: string };
export type Ideal = { gender: 'women' | 'men' | 'everyone'; age_from: number; age_to: number; city: string };
export type Moment = { name: string; date: string };
export type Checkup = {
	reels: number;
	typical: number;
	followers: number | null;
	week: number | null;
	women: number | null;
	foreign: number | null;
	teens: number | null;
	home: number | null;
	rate: number;
	shares1k: number;
	saves1k: number;
	mix: { stories: number; reels: number; perWeek: number; maxGap: number };
	watch: { cut: number; ratio: number } | null;
	caption: { sentence: number; tags: number } | null;
	days: { best: string; worst: string | null } | null;
	topics: Topic[];
	ideal: Ideal;
	bio: string;
	repeat: string;
	best: { id: string; caption: string; views: number; permalink: string } | null;
	moments: Moment[];
	findings: Finding[];
	verdict: string;
	actions: Action[];
};
export type Run = { id: string; created_at: string; data: Checkup; done: Record<string, boolean>; auto: boolean; seen_at: string | null };

export const checkups = $state<{ list: Run[]; loaded: boolean; running: boolean }>({ list: [], loaded: false, running: false });
export const latest = () => checkups.list[0] ?? null;
/** A check-up she hasn't opened yet (the Today card). */
export const unseen = () => (latest() && !latest()!.seen_at ? latest() : null);

export async function loadCheckups() {
	const { data } = await supabase.from('growth_checkups').select('*').order('created_at', { ascending: false }).limit(2);
	checkups.list = (data as Run[]) ?? [];
	checkups.loaded = true;
}

const isReel = (m: IgMedia) => m.product_type === 'REELS' || (m.media_type === 'VIDEO' && m.product_type !== 'STORY');
export const enoughReels = () => studio.media.filter(isReel).filter((m) => (m.views ?? 0) > 0).length >= 6;

/** A new check-up now (made on the server, like the ones that come by themselves). */
export async function runCheckup() {
	if (checkups.running) return;
	checkups.running = true;
	try {
		const { data, error } = await supabase.functions.invoke('growth-checkup', { body: {} });
		if (error) {
			let msg = errMessage(error);
			try {
				const b = await (error as { context?: Response }).context?.json();
				if (b?.error) msg = b.error;
			} catch {
				/* keep the general message */
			}
			throw new Error(msg);
		}
		if ((data as { skipped?: string })?.skipped) throw new Error('The check-up needs Instagram connected and at least 6 reels with views.');
		await loadCheckups();
		await markSeen();
	} catch (e) {
		toast(errMessage(e), 'alert');
	} finally {
		checkups.running = false;
	}
}

/** She opened it: the Today card goes away. */
export async function markSeen() {
	const r = latest();
	if (!r || r.seen_at) return;
	r.seen_at = new Date().toISOString();
	await supabase.from('growth_checkups').update({ seen_at: r.seen_at }).eq('id', r.id);
}

export async function setDone(run: Run, key: string, on: boolean) {
	run.done = { ...run.done, [key]: on };
	const { error } = await supabase.from('growth_checkups').update({ done: run.done }).eq('id', run.id);
	if (error) toast(errMessage(error), 'alert');
}

/** The festival reels: planned 2 days before each, at her best time. */
export async function planMoments(run: Run, a: Action) {
	const slot = bestSlot(studio.media);
	const hour = slot?.hour ?? 19, minute = slot?.minute ?? 30;
	const rows = run.data.moments.map((m) => {
		const d = new Date(m.date + 'T00:00:00Z');
		const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 2, hour, minute) - 330 * 60e3;
		return { title: `${m.name} reel`, why: a.sub, post_at: new Date(at).toISOString(), status: 'planned', source: 'checkup' };
	});
	const { error } = await supabase.from('content_plans').insert(rows);
	if (error) return toast(errMessage(error), 'alert');
	await setDone(run, a.key, true);
	toast(rows.length === 1 ? 'In your Calendar' : `${rows.length} reels are in your Calendar`, 'cal');
}

/** One reel of her best topic a week, for four weeks, on her best day and time. */
export async function planWeekly(run: Run, a: Action) {
	const slot = bestSlot(studio.media);
	const day = slot?.days[0] ?? 4, hour = slot?.hour ?? 19, minute = slot?.minute ?? 30;
	const rows = [];
	const today = new Date(Date.now() + 330 * 60e3);
	let first = (day - today.getUTCDay() + 7) % 7 || 7;
	for (let i = 0; i < 4; i++, first += 7) {
		const at = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + first, hour, minute) - 330 * 60e3;
		rows.push({ title: a.title.replace(/^One /, '').replace(/ a week$/, ''), why: run.data.repeat || 'Your best topic', post_at: new Date(at).toISOString(), status: 'planned', source: 'checkup' });
	}
	const { error } = await supabase.from('content_plans').insert(rows);
	if (error) return toast(errMessage(error), 'alert');
	await setDone(run, a.key, true);
	toast('4 weeks of it are in your Calendar', 'cal');
}

/** The boost: settings to copy into Instagram. */
export function boostText(run: Run) {
	const a = run.data.ideal;
	const budget = (run.data.followers ?? 0) >= 100000 ? 500 : (run.data.followers ?? 0) >= 20000 ? 300 : 200;
	return `Boost: ${run.data.best?.caption ?? 'my best reel'}\nAudience: ${a.gender === 'everyone' ? 'Everyone' : a.gender[0].toUpperCase() + a.gender.slice(1)} ${a.age_from}-${a.age_to}${a.city ? `, ${a.city}` : ''}\nBudget: ₹${budget} a day for 3 days\nGoal: more profile visits`;
}
