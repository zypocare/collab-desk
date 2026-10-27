// Grow: real reach from what already works for her. Her numbers (followers, reel views, shares, watch
// time), what's working (formats, times, the reels that came with new followers), this week's reel ideas
// (the growth autopilot), collab reels with other creators, and which reel is worth boosting on Instagram.
// Nothing here buys followers or likes.
import { askAi } from './ai';
import { bestSlot, slotLabel, postingEvidence, nextSlots } from './postTime';
export { bestSlot, slotLabel, nextSlots } from './postTime';
import { studio, saveSettings } from './studio.svelte';
import { supabase } from './supabase';
import type { IgAccount, IgMedia } from './types';
import { toast } from './ui.svelte';
import { errMessage } from './util';

export type Plan = {
	id: string;
	title: string;
	why: string;
	post_at: string | null;
	status: 'idea' | 'planned' | 'posted' | 'dropped';
	source: 'autopilot' | 'check' | 'collab';
	week: string | null;
	collab_reel_id: string | null;
	scheduled_post_id: string | null;
};
export type Peer = { id: number; name: string; slug: string; handle: string; niche: string; city: string; photo: string | null; followers: number | null; match?: 'niche' | 'city' };
export type CollabReel = { id: string; idea: string; status: 'pending' | 'accepted' | 'declined' | 'cancelled'; shoot_by: string | null; post_at: string | null; created_at: string; incoming: boolean; i_post: boolean; with: Peer };

export const grow = $state<{ plans: Plan[]; reels: CollabReel[]; matches: Peer[]; loaded: boolean; planning: boolean }>({ plans: [], reels: [], matches: [], loaded: false, planning: false });

export async function loadGrow() {
	const since = new Date(Date.now() - 7 * 864e5).toISOString();
	const [p, r, m] = await Promise.all([
		supabase.from('content_plans').select('*').neq('status', 'dropped').or(`post_at.gte.${since},status.eq.idea,post_at.is.null`).order('post_at', { ascending: true, nullsFirst: false }),
		supabase.rpc('my_collab_reels'),
		supabase.rpc('grow_matches')
	]);
	grow.plans = (p.data as Plan[]) ?? [];
	grow.reels = (r.data as CollabReel[]) ?? [];
	grow.matches = (m.data as Peer[]) ?? [];
	grow.loaded = true;
}

// ---------------------------------------------------------------- her numbers
type Media = IgMedia & { avg_watch_ms?: number | null };
const DAY = 864e5;
const isReel = (m: Media) => m.product_type === 'REELS' || m.media_type === 'VIDEO';
const within = (m: Media, from: number, to: number) => {
	const t = Date.parse(m.posted_at);
	return t >= Date.now() - from * DAY && t < Date.now() - to * DAY;
};
const sum = (list: Media[], f: (m: Media) => number | null | undefined) => list.reduce((a, m) => a + (Number(f(m)) || 0), 0);
const pct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

export function stats(media: Media[], hist: { day: string; followers: number }[], ig: IgAccount | null) {
	const last = media.filter((m) => within(m, 30, 0));
	const prev = media.filter((m) => within(m, 60, 30));
	const reels = last.filter(isReel);
	const watched = reels.filter((m) => (m.avg_watch_ms ?? 0) > 0);
	const now = ig?.followers ?? hist[hist.length - 1]?.followers ?? null;
	const monthAgo = hist.find((h) => Date.parse(h.day) >= Date.now() - 31 * DAY)?.followers ?? null;
	return {
		followers: now,
		gained: now !== null && monthAgo !== null ? now - monthAgo : null,
		line: hist.filter((h) => Date.parse(h.day) >= Date.now() - 31 * DAY).map((h) => h.followers),
		views: sum(reels, (m) => m.views),
		viewsUp: pct(sum(reels, (m) => m.views), sum(prev.filter(isReel), (m) => m.views)),
		shares: sum(last, (m) => m.shares),
		sharesUp: pct(sum(last, (m) => m.shares), sum(prev, (m) => m.shares)),
		watch: watched.length ? sum(watched, (m) => m.avg_watch_ms) / watched.length / 1000 : null
	};
}

/** Followers gained in the two days after a post went up (from the daily follower count). */
function lift(m: Media, hist: { day: string; followers: number }[]) {
	const d = m.posted_at.slice(0, 10);
	const before = [...hist].reverse().find((h) => h.day < d)?.followers;
	const after = hist.find((h) => Date.parse(h.day) >= Date.parse(d) + 2 * DAY)?.followers;
	return before !== undefined && after !== undefined ? after - before : null;
}

// Formats, from words in the caption.
const FORMATS: [string, RegExp][] = [
	['Get-ready-with-me', /\bgrwm\b|get ready with me/i],
	['Rating and review', /\brat(e|ing|ed)\b|\breview|\btried\b|\bvs\.?\b|honest/i],
	['How-to', /how to|steps?\b|tutorial|routine|hack/i],
	['Day in my life', /day in|diml|vlog|a day with/i],
	['Haul and unboxing', /\bhaul\b|unbox/i],
	['Before and after', /before.{0,12}after|transformation/i]
];
const formatOf = (m: Media) => FORMATS.find(([, re]) => re.test(m.caption ?? ''))?.[0] ?? null;
const shareRate = (list: Media[]) => {
	const v = sum(list, (m) => m.views || m.reach);
	return v > 0 ? sum(list, (m) => (m.shares ?? 0) + (m.saves ?? 0)) / v : 0;
};

const reach = (m: Media) => m.views || m.reach || 0;

export type Insight = { text: string; bold: string };
/** What's working: plain sentences from her own numbers (only the ones the numbers support). */
export function insights(media: Media[], hist: { day: string; followers: number }[]): Insight[] {
	const out: Insight[] = [];
	const reels = media.filter(isReel).filter((m) => reach(m) > 0);
	// Watch time.
	const w = reels.filter((m) => (m.avg_watch_ms ?? 0) > 0).sort((a, b) => (a.avg_watch_ms ?? 0) - (b.avg_watch_ms ?? 0));
	if (w.length >= 6) {
		const mid = (w[Math.floor(w.length / 2)].avg_watch_ms ?? 0) / 1000;
		const hi = w.filter((m) => (m.avg_watch_ms ?? 0) / 1000 >= mid);
		const lo = w.filter((m) => (m.avg_watch_ms ?? 0) / 1000 < mid);
		const r = sum(hi, reach) / hi.length / Math.max(1, sum(lo, reach) / Math.max(1, lo.length));
		if (r >= 1.3) out.push({ bold: `${Math.round(mid)} seconds or more`, text: `Reels people watch for {b} got ${r.toFixed(1)}× the views. Get to the point fast.` });
	}
	// Formats.
	const base = shareRate(reels);
	const fm = FORMATS.map(([name]) => ({ name, list: reels.filter((m) => formatOf(m) === name) }))
		.filter((f) => f.list.length >= 2)
		.map((f) => ({ ...f, r: base > 0 ? shareRate(f.list) / base : 0 }))
		.sort((a, b) => b.r - a.r)[0];
	if (fm && fm.r >= 1.3) out.push({ bold: fm.name, text: `{b} reels get ${fm.r.toFixed(1)}× your usual shares and saves, and shares are what bring new people.` });
	// New followers after a reel.
	const lifts = reels.filter((m) => within(m, 60, 2)).map((m) => ({ m, n: lift(m, hist) })).filter((x) => (x.n ?? 0) > 0).sort((a, b) => (b.n ?? 0) - (a.n ?? 0));
	if (lifts[0] && (lifts[0].n ?? 0) >= 50) {
		const c = (lifts[0].m.caption || 'One reel').split('\n')[0].slice(0, 50);
		out.push({ bold: `+${(lifts[0].n ?? 0).toLocaleString('en-IN')} followers`, text: `“${c}” came with {b} in the two days after it went up.` });
	}
	// Best time.
	const s = bestSlot(media);
	if (s) out.push({ bold: slotLabel(s), text: `Try posting {b}. ${postingEvidence(s)}` });
	return out.slice(0, 4);
}

/** Her top reels of the last 90 days, by views. */
export function topReels(media: Media[], n = 3) {
	return media.filter(isReel).filter((m) => within(m, 90, 0) && reach(m) > 0).sort((a, b) => reach(b) - reach(a)).slice(0, n);
}

/** The reel worth boosting: shared and saved most for its views in the last 30 days. */
export function boostPick(media: Media[]) {
	const list = media.filter(isReel).filter((m) => within(m, 30, 0) && reach(m) >= 500);
	if (list.length < 2) return null;
	const base = shareRate(list);
	const best = list.map((m) => ({ m, r: base > 0 ? shareRate([m]) / base : 0 })).sort((a, b) => b.r - a.r)[0];
	return best && best.r >= 1.2 ? best : null;
}

/** Who to show a boost to: her own audience (biggest gender, the two biggest age groups, top two cities). */
export function audience(ig: IgAccount | null) {
	const d = (ig as (IgAccount & { demographics?: Record<string, Record<string, number>> }) | null)?.demographics ?? {};
	const top = (o: Record<string, number> | undefined, n: number) => Object.entries(o ?? {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
	const g = top(d.gender, 1)[0];
	const ages = top(d.age, 2).sort();
	const age = ages.length ? `${ages[0].split('-')[0]}–${(ages[ages.length - 1].split('-')[1] ?? '').replace('+', '') || '65'}` : '';
	const cities = top(d.city, 2).map((c) => c.split(',')[0]);
	const who = [g === 'F' ? 'Women' : g === 'M' ? 'Men' : 'People', age].filter(Boolean).join(' ');
	return { who, cities, text: [who, cities.join(', ')].filter(Boolean).join(' · ') };
}
/** A daily budget to start with (₹), from her size: enough to learn something, small enough to try. */
export const boostBudget = (followers: number | null) => ((followers ?? 0) >= 100000 ? 500 : (followers ?? 0) >= 20000 ? 300 : 200);

// ---------------------------------------------------------------- the growth autopilot
/** The Monday of this week (India time), as YYYY-MM-DD. */
export function weekOf(d = new Date()) {
	const ist = new Date(d.getTime() + 330 * 60e3);
	const back = (ist.getUTCDay() + 6) % 7;
	return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - back)).toISOString().slice(0, 10);
}
export const weekIdeas = () => grow.plans.filter((p) => p.source === 'autopilot' && p.week === weekOf());

/** This week's three reel ideas. Asks the AI once a week; in Auto they go straight into the Calendar. */
export async function planWeek(force = false) {
	if (grow.planning) return;
	const media = studio.media as Media[];
	if (topReels(media, 1).length === 0) return;
	if (!force && weekIdeas().length) return;
	grow.planning = true;
	try {
		const top = topReels(media, 6).map((m) => ({ caption: (m.caption ?? '').slice(0, 140), views: reach(m), shares: m.shares ?? 0, saves: m.saves ?? 0, format: formatOf(m) }));
		const s = bestSlot(media);
		const r = await askAi<{ ideas: { title: string; why: string }[] }>('growplan', { niche: studio.settings?.niche ?? '', city: studio.settings?.city ?? '', top, best_time: s ? slotLabel(s) : '', posting_evidence: s ? postingEvidence(s) : '', month: new Date().toLocaleString('en-IN', { month: 'long' }) });
		if (force) {
			const old = weekIdeas().filter((p) => p.status === 'idea').map((p) => p.id);
			if (old.length) await supabase.from('content_plans').update({ status: 'dropped' }).in('id', old);
		}
		const slots = nextSlots(media, r.ideas.length);
		const auto = studio.settings?.grow_mode === 'auto';
		const { error } = await supabase.from('content_plans').insert(
			r.ideas.map((i, k) => ({ title: i.title, why: i.why, post_at: slots[k]?.toISOString() ?? null, status: auto ? 'planned' : 'idea', source: 'autopilot', week: weekOf() }))
		);
		if (error) throw error;
		await loadGrow();
		if (auto) toast("This week's 3 reel ideas are in your Calendar", 'cal');
	} catch (e) {
		toast(errMessage(e), 'alert');
	} finally {
		grow.planning = false;
	}
}

export async function planIt(ids: string[]) {
	const { error } = await supabase.from('content_plans').update({ status: 'planned' }).in('id', ids);
	if (error) return toast(errMessage(error), 'alert');
	grow.plans = grow.plans.map((p) => (ids.includes(p.id) ? { ...p, status: 'planned' } : p));
	toast(ids.length === 1 ? 'In your Calendar' : `All ${ids.length} are in your Calendar`, 'cal');
}

export async function setPlan(p: Plan, patch: Partial<Plan>) {
	const { error } = await supabase.from('content_plans').update(patch).eq('id', p.id);
	if (error) return toast(errMessage(error), 'alert');
	Object.assign(p, patch);
	if (patch.status === 'dropped') grow.plans = grow.plans.filter((x) => x.id !== p.id);
}

export async function setMode(mode: 'ask' | 'auto') {
	await saveSettings({ grow_mode: mode } as never);
	if (mode === 'auto') {
		const ideas = weekIdeas().filter((p) => p.status === 'idea').map((p) => p.id);
		if (ideas.length) await planIt(ideas);
	}
}

// ---------------------------------------------------------------- collab reels
export async function inviteCollab(to: number, idea: string, poster: 'from' | 'to', shoot: string | null, post: Date | null) {
	const { data, error } = await supabase.rpc('collab_reel_invite', { p_to: to, p_idea: idea, p_poster: poster, p_shoot: shoot, p_post: post?.toISOString() ?? null });
	if (error) throw error;
	grow.reels = data as CollabReel[];
}
export async function answerCollab(r: CollabReel, yes: boolean) {
	const { data, error } = await supabase.rpc('collab_reel_answer', { p_id: r.id, p_yes: yes });
	if (error) return toast(errMessage(error), 'alert');
	grow.reels = data as CollabReel[];
	if (yes) {
		toast(`Collab reel with ${r.with.name} is on. It's in your Calendar.`, 'check');
		await loadGrow();
	} else toast('Declined. They’ll be told kindly.', 'check');
}
export async function cancelCollab(r: CollabReel) {
	const { data, error } = await supabase.rpc('collab_reel_cancel', { p_id: r.id });
	if (error) return toast(errMessage(error), 'alert');
	grow.reels = data as CollabReel[];
}
