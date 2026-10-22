// The growth check-up: why she isn't growing and what to change, from her own reels and audience.
// The app works out the numbers; the AI only reads her captions into topics, says who her content is
// for (to compare with who follows her), and suggests a bio. Each run is kept, so the next one can say
// what moved, with the actions she ticked off.
import { askAi } from './ai';
import { audience as audienceOf, bestSlot, boostBudget, slotLabel } from './grow.svelte';
import { studio } from './studio.svelte';
import { supabase } from './supabase';
import type { IgMedia } from './types';
import { toast } from './ui.svelte';
import { errMessage } from './util';

type Media = IgMedia & { avg_watch_ms?: number | null };
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
export type Run = { id: string; created_at: string; data: Checkup; done: Record<string, boolean> };

export const checkups = $state<{ list: Run[]; loaded: boolean; running: boolean }>({ list: [], loaded: false, running: false });
export const latest = () => checkups.list[0] ?? null;

export async function loadCheckups() {
	const { data } = await supabase.from('growth_checkups').select('*').order('created_at', { ascending: false }).limit(2);
	checkups.list = (data as Run[]) ?? [];
	checkups.loaded = true;
}

// ---------------------------------------------------------------- the numbers
const DAY = 864e5;
const median = (a: number[]) => {
	if (!a.length) return 0;
	const s = [...a].sort((x, y) => x - y);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const isReel = (m: Media) => m.product_type === 'REELS' || (m.media_type === 'VIDEO' && m.product_type !== 'STORY');
const isStory = (m: Media) => m.product_type === 'STORY';
const per1k = (n: number | null | undefined, v: number) => (v > 0 ? ((n ?? 0) / v) * 1000 : 0);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const istDay = (iso: string) => new Date(Date.parse(iso) + 330 * 60e3).getUTCDay();
const pct = (x: number) => Math.round(x * 100);
const fmt = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}K` : n.toLocaleString('en-IN'));
const KARNATAKA = /bengaluru|bangalore|mysuru|mysore|mangaluru|mangalore|hubli|hubballi|belagavi|belgaum|udupi|karnataka/i;
const sameCity = (a: string, b: string) => {
	const n = (s: string) => s.toLowerCase().replace(/bangalore/, 'bengaluru').replace(/bombay/, 'mumbai').split(',')[0].trim();
	return !!a && !!b && n(a) === n(b);
};

// Days her audience celebrates (dates are fixed or known for this year). Regional ones need her region.
const MOMENTS: (Moment & { kannada?: boolean })[] = [
	{ name: 'Kannada Rajyotsava', date: '2026-11-01', kannada: true },
	{ name: 'Deepavali', date: '2026-11-08' },
	{ name: "Children's Day", date: '2026-11-14' },
	{ name: 'Christmas', date: '2026-12-25' },
	{ name: "New Year's Eve", date: '2026-12-31' },
	{ name: 'Makar Sankranti', date: '2027-01-14' },
	{ name: 'Republic Day', date: '2027-01-26' },
	{ name: "Valentine's Day", date: '2027-02-14' },
	{ name: "Women's Day", date: '2027-03-08' }
];

export function upcomingMoments(city: string, languages: string[], days = 45): Moment[] {
	const kn = KARNATAKA.test(city) || languages.some((l) => /kannada/i.test(l));
	const today = new Date(Date.now() + 330 * 60e3).toISOString().slice(0, 10);
	const until = new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
	return MOMENTS.filter((m) => m.date > today && m.date <= until && (!m.kannada || kn)).slice(0, 2).map(({ name, date }) => ({ name, date }));
}

type Ai = { topics: { name: string; ids: string[] }[]; ideal: Ideal; bio: string; repeat: string };

/** Everything except the words: from her posts, follower history and audience. */
function analyse(media: Media[], hist: { day: string; followers: number }[], ai: Ai): Checkup {
	const s = studio.settings;
	const ig = studio.ig as (typeof studio.ig & { demographics?: Record<string, Record<string, number>> }) | null;
	const reels = media.filter(isReel).filter((m) => (m.views ?? 0) > 0);
	const v = (m: Media) => m.views ?? 0;
	const typical = Math.round(median(reels.map(v)));
	// Followers this week.
	const now = ig?.followers ?? hist[hist.length - 1]?.followers ?? null;
	const weekAgo = hist.find((h) => Date.parse(h.day) >= Date.now() - 8 * DAY)?.followers ?? null;
	// Who follows her.
	const d = ig?.demographics ?? {};
	const sum = (o?: Record<string, number>) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
	const g = d.gender ?? {};
	const known = (g.F ?? 0) + (g.M ?? 0);
	const women = known > 0 ? (g.F ?? 0) / known : null;
	const foreign = sum(d.country) > 0 ? 1 - (d.country?.IN ?? 0) / sum(d.country) : null;
	const teens = sum(d.age) > 0 ? (d.age?.['13-17'] ?? 0) / sum(d.age) : null;
	const homeCity = ai.ideal.city || s?.city || '';
	const home = sum(d.city) > 0 && homeCity ? Object.entries(d.city ?? {}).filter(([c]) => sameCity(c, homeCity)).reduce((a, [, n]) => a + n, 0) / sum(d.city) : null;
	// Saves and shares.
	const shares1k = median(reels.map((m) => per1k(m.shares, v(m))));
	const saves1k = median(reels.map((m) => per1k(m.saves, v(m))));
	// Reels against stories, and how often.
	const last30 = media.filter((m) => Date.parse(m.posted_at) > Date.now() - 30 * DAY);
	const recentReels = media.filter(isReel).filter((m) => Date.parse(m.posted_at) > Date.now() - 56 * DAY).map((m) => Date.parse(m.posted_at)).sort((a, b) => b - a);
	const gaps = recentReels.slice(1).map((t, i) => Math.round((recentReels[i] - t) / DAY));
	const mix = { stories: last30.filter(isStory).length, reels: last30.filter(isReel).length, perWeek: Math.round((recentReels.length / 8) * 10) / 10, maxGap: gaps.length ? Math.max(...gaps) : 0 };
	// Watch time.
	const w = reels.filter((m) => (m.avg_watch_ms ?? 0) > 0).sort((a, b) => (a.avg_watch_ms ?? 0) - (b.avg_watch_ms ?? 0));
	let watch: Checkup['watch'] = null;
	if (w.length >= 6) {
		const half = Math.floor(w.length / 2);
		const lo = median(w.slice(0, half).map(v)), hi = median(w.slice(half).map(v));
		const cut = Math.round((w[half].avg_watch_ms ?? 0) / 1000);
		if (lo > 0 && hi / lo >= 1.3) watch = { cut, ratio: Math.round((hi / lo) * 10) / 10 };
	}
	// Captions that start with a sentence vs with hashtags.
	const tagLed = reels.filter((m) => /^\s*(#\w+\s*){1,}/.test(m.caption ?? '') || ((m.caption ?? '').slice(0, 90).match(/#\w+/g)?.length ?? 0) >= 3);
	const sentence = reels.filter((m) => !tagLed.includes(m));
	const caption = tagLed.length >= 2 && sentence.length >= 2 ? { sentence: Math.round(median(sentence.map(v))), tags: Math.round(median(tagLed.map(v))) } : null;
	// Days.
	const byDay = new Map<number, number[]>();
	for (const m of reels) byDay.set(istDay(m.posted_at), [...(byDay.get(istDay(m.posted_at)) ?? []), v(m)]);
	const ranked = [...byDay.entries()].filter(([, l]) => l.length >= 2).map(([k, l]) => ({ k, med: median(l) })).sort((a, b) => b.med - a.med);
	const slot = bestSlot(media);
	const days = ranked.length >= 3 ? { best: slot ? slotLabel(slot) : `${WEEKDAYS[ranked[0].k]}s`, worst: WEEKDAYS[ranked[ranked.length - 1].k] } : null;
	// Topics (the AI grouped the captions; the numbers are hers).
	const byId = new Map(reels.map((m) => [m.id, m]));
	const topics: Topic[] = ai.topics
		.map((t) => {
			const list = t.ids.map((id) => byId.get(id)).filter((m): m is Media => !!m);
			return { name: t.name, n: list.length, views: Math.round(median(list.map(v))), shares1k: Math.round(median(list.map((m) => per1k(m.shares, v(m)))) * 10) / 10, ids: t.ids };
		})
		.filter((t) => t.n)
		.sort((a, b) => (a.name === 'Everything else' ? 1 : b.name === 'Everything else' ? -1 : b.views - a.views));
	const bestReel = [...reels].sort((a, b) => v(b) - v(a))[0];
	const moments = upcomingMoments(s?.city ?? '', (s?.content_languages as string[] | undefined) ?? []);

	// What's holding her back, biggest first.
	const findings: Finding[] = [];
	const parts: string[] = [];
	if (women !== null && ai.ideal.gender === 'women' && women < 0.5) parts.push(`only ${pct(women)}% women`);
	if (women !== null && ai.ideal.gender === 'men' && women > 0.5) parts.push(`${pct(women)}% women`);
	if (foreign !== null && foreign > 0.15) parts.push(`${pct(foreign)}% outside India`);
	if (teens !== null && teens > 0.08) parts.push(`${pct(teens)}% aged 13–17`);
	if (home !== null && ai.ideal.city && home < 0.4) parts.push(`${ai.ideal.city} about ${pct(home)}%`);
	if (parts.length >= 2 || (women !== null && ai.ideal.gender === 'women' && women < 0.3))
		findings.push({ key: 'audience', big: true, title: "Followers who don't match your content", text: `Your content is for ${ai.ideal.gender === 'everyone' ? 'people' : ai.ideal.gender} ${ai.ideal.age_from}–${ai.ideal.age_to}${ai.ideal.city ? ` in ${ai.ideal.city}` : ''}, but your followers are ${parts.join(', ')}. Instagram tries each reel on your followers first; when they don't watch, it stops showing it to new people.` });
	if (shares1k + saves1k < 4)
		findings.push({ key: 'shares', title: 'Few saves and shares', text: `${(Math.round(shares1k * 10) / 10).toLocaleString('en-IN')} shares and ${(Math.round(saves1k * 10) / 10).toLocaleString('en-IN')} saves per 1,000 views. Saves and sends are what take a reel to new people.` });
	if (mix.stories > mix.reels || mix.perWeek < 2)
		findings.push({ key: 'mix', title: mix.stories > mix.reels ? 'More stories than reels' : 'Not enough reels', text: `Last 30 days: ${mix.stories} stories, ${mix.reels} reels. About ${mix.perWeek} reels a week lately${mix.maxGap >= 7 ? `, with gaps up to ${mix.maxGap} days` : ''}. Stories only reach people who already follow you.` });
	if (w.length >= 6 && median(w.map((m) => (m.avg_watch_ms ?? 0) / 1000)) < 8)
		findings.push({ key: 'watch', title: 'People leave early', text: `People watch your reels for about ${Math.round(median(w.map((m) => (m.avg_watch_ms ?? 0) / 1000)))} seconds. Show the payoff in the first second and cut the slow parts.` });
	if (!findings.some((f) => f.big) && findings[0]) findings[0].big = true;

	const VERDICT: Record<string, string> = {
		audience: "Your reels reach people, but most of your followers aren't the people your content is for.",
		shares: "People watch your reels, but don't save or send them, so they don't travel to new people.",
		mix: 'Your best work is in reels, but most of what you post is stories that only your followers see.',
		watch: 'People leave your reels before the payoff, so Instagram stops showing them.'
	};
	const verdict = findings[0] ? VERDICT[findings[0].key] : 'Nothing big is holding you back. Do more of what works below, a little more often.';

	// What to change, in order.
	const top = topics.filter((t) => t.name !== 'Everything else');
	const shareTop = [...top].sort((a, b) => b.shares1k - a.shares1k)[0];
	const actions: Action[] = [];
	if (ai.bio) actions.push({ key: 'bio', kind: 'copy', title: `Make your page about ${top.slice(0, 2).map((t) => t.name.toLowerCase()).join(' and ') || 'one thing'}`, sub: `Bio: “${ai.bio}”`, text: ai.bio });
	if (moments.length) actions.push({ key: `moments-${moments[0].date}`, kind: 'moments', title: moments.map((m) => `${m.name}, ${new Date(m.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`).join(' · '), sub: shareTop && shareTop.shares1k >= 5 ? `Your ${shareTop.name.toLowerCase()} reels get ${shareTop.shares1k} shares per 1,000` : 'Post 2–3 days before, so it travels in time' });
	if (top[0]) actions.push({ key: 'weekly', kind: 'weekly', title: `One ${top[0].name.toLowerCase()} reel a week`, sub: ai.repeat || `Your best topic: ${fmt(top[0].views)} views typical` });
	actions.push({ key: 'saves', kind: 'check', title: 'Give people a reason to save and send', sub: 'Places, prices and steps on screen; “Save this” or “Send this to…” at the end' });
	if (findings.some((f) => f.key === 'audience')) {
		const b = audienceOf(studio.ig);
		actions.push({ key: 'boost', kind: 'boost', title: `Show your best reel to ${ai.ideal.gender === 'everyone' ? 'people' : ai.ideal.gender} ${ai.ideal.city ? `in ${ai.ideal.city}` : 'like your audience'}`, sub: `${ai.ideal.gender === 'everyone' ? 'Everyone' : ai.ideal.gender[0].toUpperCase() + ai.ideal.gender.slice(1)} ${ai.ideal.age_from}–${ai.ideal.age_to} · ₹${boostBudget(now)} a day for 3 days`, text: b.text });
	}
	actions.push({ key: 'collab', kind: 'tick', title: 'Make brand and venue posts collab posts', sub: "So the brand's followers see them too" });
	actions.push({ key: 'cadence', kind: 'autopilot', title: `3 reels a week${days ? `, ${days.best}` : ''}`, sub: 'Growth autopilot plans them for you' });
	actions.push({ key: 'status', kind: 'tick', title: 'Check Account status in Instagram', sub: 'Settings › Account status: nothing should be "not eligible for recommendations"' });

	return {
		reels: reels.length,
		typical,
		followers: now,
		week: now !== null && weekAgo !== null ? now - weekAgo : null,
		women,
		foreign,
		teens,
		home,
		rate: Math.round((shares1k + saves1k) * 10) / 10,
		shares1k: Math.round(shares1k * 10) / 10,
		saves1k: Math.round(saves1k * 10) / 10,
		mix,
		watch,
		caption,
		days,
		topics,
		ideal: ai.ideal,
		bio: ai.bio,
		repeat: ai.repeat,
		best: bestReel ? { id: bestReel.id, caption: (bestReel.caption ?? '').split('\n')[0].slice(0, 80), views: v(bestReel), permalink: bestReel.permalink } : null,
		moments,
		findings,
		verdict,
		actions
	};
}

export const enoughReels = () => studio.media.filter(isReel).filter((m) => (m.views ?? 0) > 0).length >= 6;

/** Runs a new check-up and keeps it. */
export async function runCheckup() {
	if (checkups.running) return;
	checkups.running = true;
	try {
		const media = studio.media as Media[];
		const reels = media.filter(isReel).filter((m) => (m.views ?? 0) > 0);
		const ai = await askAi<Ai>('checkup', {
			niche: studio.settings?.niche ?? '',
			city: studio.settings?.city ?? '',
			languages: studio.settings?.content_languages ?? [],
			reels: reels.slice(0, 40).map((m) => ({ id: m.id, caption: (m.caption ?? '').replace(/\s+/g, ' ').slice(0, 120), views: m.views ?? 0 }))
		});
		const data = analyse(media, studio.followersHistory, ai);
		// Actions already done carry over (and some count as done from what she does).
		const prev = latest()?.done ?? {};
		const done: Record<string, boolean> = { ...prev };
		if (studio.settings?.grow_mode === 'auto' || data.mix.perWeek >= 3) done.cadence = true;
		const { error } = await supabase.from('growth_checkups').insert({ data, done });
		if (error) throw error;
		await loadCheckups();
	} catch (e) {
		toast(errMessage(e), 'alert');
	} finally {
		checkups.running = false;
	}
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

/** The boost: settings copied, the reel opened in Instagram. */
export function boostText(run: Run) {
	const a = run.data.ideal;
	return `Boost: ${run.data.best?.caption ?? 'my best reel'}\nAudience: ${a.gender === 'everyone' ? 'Everyone' : a.gender[0].toUpperCase() + a.gender.slice(1)} ${a.age_from}-${a.age_to}${a.city ? `, ${a.city}` : ''}\nBudget: ₹${boostBudget(run.data.followers)} a day for 3 days\nGoal: more profile visits`;
}
