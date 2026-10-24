// Audience health and brand safety: what a brand wants to know before booking a creator, worked out
// from her own Instagram numbers (never anyone's opinion), and an AI read of her recent captions.
// Brands see it in Discover, on her applications and on their requests; she sees the same in Grow.
//   Real reach      how many of her followers a post reaches (bought or dead followers don't see posts)
//   Engagement      likes, comments, saves and shares a post, for an account her size
//   Steady growth   no sudden follower jumps that a viral post doesn't explain
//   Audience        where her followers are (an Indian creator's followers should mostly be in India)
//   Brand safety    nothing in recent captions a brand would want to know about first
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const DAY = 864e5;
export type Tone = 'ok' | 'warn' | 'bad' | 'na';
export type Check = { key: 'reach' | 'engagement' | 'growth' | 'audience'; label: string; score: number | null; tone: Tone; value: string; note: string };
export type SafetyFlag = { kind: string; label: string; severity: 'high' | 'medium' | 'low'; why: string; post: { id: string; permalink: string; posted_at: string } };
export type Safety = { level: 'clear' | 'note' | 'review' | 'unchecked'; checked_at: string | null; posts: number; flags: SafetyFlag[]; last_post?: string | null };
export type Health = { v: 1; at: string; score: number | null; grade: 'strong' | 'good' | 'fair' | 'weak' | null; posts: number; checks: Check[]; safety: Safety };

export type HealthPost = { id: string; posted_at: string; product_type: string; media_type: string; reach: number | null; views: number | null; likes: number | null; comments: number | null; saves: number | null; shares: number | null; interactions: number | null };
export type HealthInput = {
	followers: number;
	posts: HealthPost[]; // her feed posts, newest first (stories left out)
	history: { day: string; followers: number }[]; // oldest first
	demographics: { country?: Record<string, number> };
	homeCountry?: string; // 'IN'
	now?: number;
};

// The same size bands as the website's engagement calculator.
const BANDS: [number, number, number][] = [[1e4, 3, 6], [5e4, 2, 4.5], [1e5, 1.5, 3.5], [5e5, 1.2, 2.8], [Infinity, 0.8, 2]];
const WEIGHTS = { reach: 30, engagement: 25, growth: 20, audience: 25 };
const clamp = (n: number, a = 0, b = 100) => Math.max(a, Math.min(b, n));
/** A straight line through (x0, y0)–(x1, y1), held at the ends. */
const ramp = (x: number, x0: number, y0: number, x1: number, y1: number) => (x <= x0 ? y0 : x >= x1 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0));
const median = (xs: number[]) => {
	const v = [...xs].sort((a, b) => a - b);
	if (!v.length) return null;
	const h = Math.floor(v.length / 2);
	return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
};
const pct = (n: number) => `${n >= 10 ? Math.round(n) : Math.round(n * 10) / 10}%`;
const compact = (n: number) => (n >= 1e5 ? `${Math.round(n / 1e4) / 10}L` : n >= 1e3 ? `${Math.round(n / 100) / 10}K` : String(n));
const toneOf = (s: number): Tone => (s >= 70 ? 'ok' : s >= 45 ? 'warn' : 'bad');
const interOf = (p: HealthPost) => p.interactions ?? (p.likes === null && p.comments === null ? null : (p.likes ?? 0) + (p.comments ?? 0) + (p.saves ?? 0) + (p.shares ?? 0));

export function audienceHealth(x: HealthInput, safety: Safety): Health {
	const now = x.now ?? Date.now();
	const f = Math.max(0, x.followers || 0);
	// Settled posts (3 days old) with Instagram's numbers, the last 12.
	const feed = x.posts.filter((p) => p.reach !== null && Date.parse(p.posted_at) < now - 3 * DAY).slice(0, 12);
	const checks: Check[] = [];

	// 1. Real reach: the middle post's reach against followers.
	const medReach = median(feed.map((p) => p.reach!));
	if (f >= 100 && medReach !== null && feed.length >= 4) {
		const r = (medReach / f) * 100;
		const s = Math.round(r >= 20 ? 100 : r >= 10 ? ramp(r, 10, 75, 20, 100) : r >= 4 ? ramp(r, 4, 40, 10, 75) : ramp(r, 0, 5, 4, 40));
		checks.push({ key: 'reach', label: 'Real reach', score: s, tone: toneOf(s), value: `${pct(r)} of followers`, note: r >= 10 ? `A typical post reaches ${compact(Math.round(medReach))} accounts, a healthy share of ${compact(f)} followers.` : `A typical post reaches ${compact(Math.round(medReach))} accounts of ${compact(f)} followers. Low reach can mean inactive or bought followers, or few recent posts.` });
	} else checks.push({ key: 'reach', label: 'Real reach', score: null, tone: 'na', value: 'Not enough posts', note: 'Needs at least 4 posts older than 3 days with Instagram insights.' });

	// 2. Engagement for the account's size (per post, against followers), with very high rates on big accounts noted.
	const inter = feed.map(interOf).filter((n): n is number => n !== null);
	if (f >= 100 && inter.length >= 4) {
		const er = (inter.reduce((a, b) => a + b, 0) / inter.length / f) * 100;
		const [, lo, hi] = BANDS.find((b) => f < b[0])!;
		const odd = f >= 5e4 && er > hi * 3;
		const s = Math.round(odd ? 70 : er >= hi ? 100 : er >= lo ? ramp(er, lo, 75, hi, 100) : ramp(er, 0, 10, lo, 75));
		checks.push({ key: 'engagement', label: 'Engagement', score: s, tone: toneOf(s), value: pct(er), note: odd ? `Far above the usual ${lo}–${hi}% for this size. Worth a look at recent comments (giveaways and engagement groups push this up).` : er >= lo ? `In or above the usual ${lo}–${hi}% for accounts this size.` : `Below the usual ${lo}–${hi}% for accounts this size.` });
	} else checks.push({ key: 'engagement', label: 'Engagement', score: null, tone: 'na', value: 'Not enough posts', note: 'Needs at least 4 posts older than 3 days.' });

	// 3. Steady growth: a day's gain far above her normal (over 2% of followers, 5 times her usual day and
	// 500+), with no post in the 3 days before reaching several times her usual.
	const h = x.history.filter((d) => Date.parse(d.day) > now - 120 * DAY);
	if (h.length >= 14 && f >= 1000) {
		const steps: { day: string; perDay: number }[] = [];
		for (let i = 1; i < h.length; i++) {
			const gap = Math.max(1, Math.round((Date.parse(h[i].day) - Date.parse(h[i - 1].day)) / DAY));
			steps.push({ day: h[i].day, perDay: (h[i].followers - h[i - 1].followers) / gap });
		}
		const usual = Math.max(5, median(steps.map((s) => Math.abs(s.perDay))) ?? 0);
		const viral = (day: string) => {
			const t = Date.parse(day);
			return x.posts.some((p) => {
				const at = Date.parse(p.posted_at);
				return at <= t + DAY && at >= t - 4 * DAY && medReach !== null && (p.reach ?? 0) >= medReach * 3;
			});
		};
		const jumps = steps.filter((s) => s.perDay > Math.max(500, usual * 5, f * 0.02));
		const unexplained = jumps.filter((s) => !viral(s.day));
		const drops = steps.filter((s) => -s.perDay > Math.max(500, usual * 5, f * 0.02));
		const s = unexplained.length ? (unexplained.length > 1 ? 25 : 45) : drops.length ? 60 : 100;
		const big = unexplained[0];
		checks.push({
			key: 'growth', label: 'Steady growth', score: s, tone: toneOf(s),
			value: unexplained.length ? `${unexplained.length} sudden jump${unexplained.length === 1 ? '' : 's'}` : drops.length ? 'A sudden drop' : jumps.length ? 'Jumps after viral posts' : 'Steady',
			note: big ? `Gained about ${compact(Math.round(big.perDay))} followers a day around ${new Date(big.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} without a post that went viral. That can be a shout-out or a giveaway, or bought followers.`
				: drops.length ? 'Lost many followers at once (Instagram removes fake accounts in sweeps, which can show bought followers leaving).'
				: jumps.length ? 'Follower jumps line up with posts that went viral.' : `No unusual jumps in the last ${Math.round((now - Date.parse(h[0].day)) / DAY)} days.`
		});
	} else checks.push({ key: 'growth', label: 'Steady growth', score: null, tone: 'na', value: 'Too early', note: f < 1000 ? 'Checked from 1,000 followers.' : 'Needs two weeks of daily follower counts (Miracle saves one a day).' });

	// 4. Audience: share of followers in her home country.
	const c = x.demographics?.country ?? {};
	const total = Object.values(c).reduce((a, b) => a + (Number(b) || 0), 0);
	const home = x.homeCountry ?? 'IN';
	if (total >= 100) {
		const share = ((Number(c[home]) || 0) / total) * 100;
		const s = Math.round(share >= 75 ? 100 : share >= 50 ? ramp(share, 50, 70, 75, 100) : share >= 25 ? ramp(share, 25, 35, 50, 70) : ramp(share, 0, 5, 25, 35));
		const top = Object.entries(c).filter(([k]) => k !== home).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k).join(', ');
		checks.push({ key: 'audience', label: 'Audience in India', score: s, tone: toneOf(s), value: `${pct(share)} in India`, note: share >= 75 ? 'Followers are mostly in India, where Indian brands sell.' : `Many followers are outside India${top ? ` (${top})` : ''}. Fine for global brands; bought followers often come from abroad.` });
	} else checks.push({ key: 'audience', label: 'Audience in India', score: null, tone: 'na', value: 'Not shared yet', note: 'Instagram shares where followers are from 100 followers up.' });

	// The score: the checks that could be worked out, by weight; at least reach and engagement.
	const have = checks.filter((k) => k.score !== null);
	const enough = have.some((k) => k.key === 'reach') && have.some((k) => k.key === 'engagement');
	const w = have.reduce((a, k) => a + WEIGHTS[k.key], 0);
	const score = enough && w ? Math.round(clamp(have.reduce((a, k) => a + k.score! * WEIGHTS[k.key], 0) / w)) : null;
	const grade = score === null ? null : score >= 80 ? 'strong' : score >= 65 ? 'good' : score >= 50 ? 'fair' : 'weak';
	return { v: 1, at: new Date(now).toISOString(), score, grade, posts: feed.length, checks, safety };
}

// Brand safety: what the AI may flag, how serious it is for a brand, and how it's named.
export const SAFETY_KINDS: Record<string, { label: string; severity: SafetyFlag['severity'] }> = {
	betting: { label: 'Betting or real-money games', severity: 'high' },
	adult: { label: 'Adult or sexual content', severity: 'high' },
	hate: { label: 'Hate or abuse', severity: 'high' },
	alcohol_tobacco: { label: 'Alcohol, tobacco or vaping', severity: 'medium' },
	health_claims: { label: 'Risky health or weight-loss claims', severity: 'medium' },
	money_schemes: { label: 'Crypto or get-rich schemes', severity: 'medium' },
	politics_religion: { label: 'Political or religious controversy', severity: 'medium' },
	strong_language: { label: 'Strong language', severity: 'low' },
	unlabelled_ad: { label: 'Promotion that may be missing #ad', severity: 'low' }
};

export function safetyFrom(raw: unknown, posts: { id: string; permalink: string; posted_at: string }[], checked: number): Safety {
	const byId = new Map(posts.map((p) => [p.id, p]));
	const list = Array.isArray((raw as { flags?: unknown })?.flags) ? ((raw as { flags: Record<string, unknown>[] }).flags) : [];
	const seen = new Set<string>();
	const flags: SafetyFlag[] = [];
	for (const r of list) {
		const k = SAFETY_KINDS[String(r.kind ?? '')];
		const p = byId.get(String(r.id ?? ''));
		if (!k || !p || seen.has(`${p.id}:${r.kind}`)) continue;
		seen.add(`${p.id}:${r.kind}`);
		flags.push({ kind: String(r.kind), label: k.label, severity: k.severity, why: String(r.why ?? '').replace(/\s+/g, ' ').trim().slice(0, 160), post: { id: p.id, permalink: p.permalink, posted_at: p.posted_at } });
	}
	const order = { high: 0, medium: 1, low: 2 };
	flags.sort((a, b) => order[a.severity] - order[b.severity] || b.post.posted_at.localeCompare(a.post.posted_at));
	const level: Safety['level'] = flags.some((f) => f.severity === 'high') || flags.filter((f) => f.severity === 'medium').length >= 2 ? 'review' : flags.length ? 'note' : 'clear';
	return { level, checked_at: new Date().toISOString(), posts: checked, flags: flags.slice(0, 12), last_post: posts[0]?.posted_at ?? null };
}

/** Asks the AI to read her recent captions (a single-use pass, like the checkup). Null if it couldn't. */
export async function readSafety(db: SupabaseClient, creator: number, site: string, posts: { id: string; caption: string; permalink: string; posted_at: string }[]): Promise<Safety | null> {
	const list = posts.filter((p) => p.caption.trim()).slice(0, 40);
	if (!list.length) return { level: 'clear', checked_at: new Date().toISOString(), posts: 0, flags: [], last_post: posts[0]?.posted_at ?? null };
	const ticket = crypto.randomUUID() + crypto.randomUUID();
	const { error } = await db.from('ai_tickets').insert({ creator_id: creator, token: ticket, kind: 'safety' });
	if (error) return null;
	const r = await fetch(`${site.replace(/\/$/, '')}/api/ai/safety`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-ai-ticket': ticket, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
		body: JSON.stringify({ posts: list.map((p) => ({ id: p.id, caption: p.caption.replace(/\s+/g, ' ').slice(0, 300) })) })
	}).catch(() => null);
	const j = (await r?.json().catch(() => null)) as { flags?: unknown; error?: string } | null;
	if (!j || j.error || !Array.isArray(j.flags)) return null;
	return safetyFrom(j, posts, list.length);
}

/** Works it out and saves it. The captions are read again once a week, or sooner after new posts. */
export async function saveHealth(db: SupabaseClient, creator: number, followers: number, demographics: Record<string, unknown>) {
	const [{ data: media }, { data: hist }, { data: acct }, { data: s }] = await Promise.all([
		db.from('ig_media').select('id, caption, permalink, posted_at, product_type, media_type, reach, views, likes, comments, saves, shares, interactions')
			.eq('creator_id', creator).neq('product_type', 'STORY').order('posted_at', { ascending: false }).limit(60),
		db.from('ig_followers_history').select('day, followers').eq('creator_id', creator).gte('day', new Date(Date.now() - 120 * DAY).toISOString().slice(0, 10)).order('day'),
		db.from('ig_account').select('health').eq('id', creator).maybeSingle(),
		db.from('creator_settings').select('site_url').eq('id', creator).maybeSingle()
	]);
	const posts = (media ?? []) as (HealthPost & { caption: string; permalink: string })[];
	const prev = ((acct?.health ?? {}) as Partial<Health>).safety;
	const stale = !prev?.checked_at || Date.now() - Date.parse(prev.checked_at) > 7 * DAY || (posts[0]?.posted_at ?? '') > (prev.last_post ?? '');
	let safety: Safety = prev ?? { level: 'unchecked', checked_at: null, posts: 0, flags: [] };
	if (stale) safety = (await readSafety(db, creator, String(s?.site_url || 'https://app.miracleapp.live'), posts).catch(() => null)) ?? safety;
	const health = audienceHealth({ followers, posts, history: hist ?? [], demographics: demographics as HealthInput['demographics'] }, safety);
	await db.from('ig_account').update({ health }).eq('id', creator);
	return { score: health.score, safety: health.safety.level };
}
