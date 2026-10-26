<script lang="ts">
	import { untrack } from 'svelte';
	import { num } from '../format.ts';
	import { errMessage, supabase } from '../supabase.ts';

	// The website's visitors (www.miracleapp.live, migration 167): visits, Join clicks and sign-ups for the Dashboard's
	// period, each day, and the top pages, sources and buttons. Counted without cookies, as daily totals.
	let { days }: { days: number } = $props();
	type D = Record<string, any>;
	let d = $state<D | null>(null);
	let err = $state('');
	async function load() {
		const { data, error } = await supabase.rpc('admin_site_stats', { p_days: days });
		err = error ? errMessage(error) : '';
		if (!error) d = data as D;
	}
	$effect(() => {
		void days;
		untrack(load);
	});

	const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—');
	const change = $derived.by(() => {
		if (!d || d.visits_prev === null || d.visits_prev === undefined) return null;
		const prev = Number(d.visits_prev), cur = Number(d.visits);
		if (!prev) return cur ? ['new', 't-ok'] : null;
		const p = Math.round(((cur - prev) / prev) * 100);
		return [`${p >= 0 ? '+' : ''}${p}%`, p > 0 ? 't-ok' : p < 0 ? 't-bad' : 't-mute'];
	});
	// Each day of the period (up to 60), empty days included.
	const series = $derived.by(() => {
		const have = new Map(((d?.by_day ?? []) as D[]).map((x) => [String(x.day), x]));
		const n = Math.min(days || 60, 60);
		const out: { day: string; visits: number; clicks: number }[] = [];
		const now = new Date();
		for (let i = n - 1; i >= 0; i--) {
			const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
			const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
			out.push({ day: k, visits: Number(have.get(k)?.visits ?? 0), clicks: Number(have.get(k)?.clicks ?? 0) });
		}
		return out;
	});
	const top = $derived(Math.max(1, ...series.map((x) => x.visits)));
	const SOURCE: Record<string, string> = { direct: 'Direct or unknown', 'google.com': 'Google', 'linkedin.com': 'LinkedIn', 'lnkd.in': 'LinkedIn', 'instagram.com': 'Instagram', 'l.instagram.com': 'Instagram', 'facebook.com': 'Facebook', 'l.facebook.com': 'Facebook', 't.co': 'X (Twitter)', 'bing.com': 'Bing', growth: 'Growth Autopilot emails' };
	const PAGE: Record<string, string> = { '/': 'Home', '/pricing': 'Pricing', '/waitlist': 'Waitlist', '/signin': 'Sign in' };
</script>

<section class="card site">
	<div class="card-h"><h2 class="card-t">Website</h2><span class="muted sm">www.miracleapp.live · {days ? `last ${days} days` : 'all time'} · no cookies</span></div>
	{#if err}<p class="err" style="margin:12px 16px">{err}</p>{/if}
	{#if d}
		<div class="nums">
			<div><small>Visits</small><b class="mono">{num(d.visits)}</b><span>{#if change}<span class="tag {change[1]}">{change[0]}</span>{/if} {num(d.today)} today</span></div>
			<div><small>Pages viewed</small><b class="mono">{num(d.views)}</b><span>{d.visits ? (Number(d.views) / Number(d.visits)).toFixed(1) : '0'} a visit</span></div>
			<div><small>Join clicks</small><b class="mono">{num(d.clicks)}</b><span>{pct(Number(d.clicks), Number(d.visits))} of visits</span></div>
			<div><small>Sign-ups</small><b class="mono">{num(d.signups)}</b><span>creators and brands · {pct(Number(d.signups), Number(d.visits))} of visits</span></div>
		</div>
		<div class="chart" role="img" aria-label="Website visits per day">
			{#each series as x (x.day)}<span class="b" style:height="{Math.max(x.visits ? 4 : 1, (x.visits / top) * 100)}%" title="{x.day}: {x.visits} visits, {x.clicks} join clicks">{#if x.clicks}<i style:height="{Math.min(100, (x.clicks / Math.max(1, x.visits)) * 100)}%"></i>{/if}</span>{/each}
		</div>
		<div class="axis muted"><span>{series[0]?.day ?? ''}</span><span>purple: visits · green: join clicks</span><span>today</span></div>
		<div class="lists">
			<div>
				<h3>Where visitors came from</h3>
				{#each d.sources as x (x.source)}<p><span>{SOURCE[x.source] ?? x.source}</span><b class="mono">{num(x.n)}</b></p>{:else}<p class="muted">No visits yet.</p>{/each}
			</div>
			<div>
				<h3>Top pages</h3>
				{#each d.pages as x (x.path)}<p><span class="mono pth">{PAGE[x.path] ?? x.path}</span><b class="mono">{num(x.n)}</b></p>{:else}<p class="muted">No views yet.</p>{/each}
			</div>
			<div>
				<h3>Buttons clicked</h3>
				{#each d.buttons as x (x.label)}<p><span>{x.label.replace(/^join · /, 'Join as ').replace('sign in', 'Sign in')}</span><b class="mono">{num(x.n)}</b></p>{:else}<p class="muted">No clicks yet.</p>{/each}
			</div>
		</div>
	{:else if !err}
		<div class="ld"><span class="spinner"></span></div>
	{/if}
</section>

<style>
	.sm { font-size: 12px; }
	.ld { padding: 30px; display: grid; place-items: center; }
	.nums { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); border-top: 1px solid var(--line-soft); }
	.nums > div { display: grid; gap: 4px; padding: 14px 16px; border-right: 1px solid var(--line-soft); }
	.nums > div:last-child { border-right: 0; }
	.nums small { font-size: 12.5px; color: var(--ink-3); }
	.nums b { font-size: 22px; font-weight: 500; letter-spacing: -.02em; }
	.nums span { font-size: 12px; color: var(--ink-3); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
	.chart { display: flex; align-items: flex-end; gap: 2px; height: 120px; padding: 14px 16px 6px; border-top: 1px solid var(--line-soft); }
	.chart .b { position: relative; flex: 1; min-width: 2px; background: var(--accent); opacity: .85; border-radius: 2px 2px 0 0; overflow: hidden; }
	.chart .b i { position: absolute; left: 0; right: 0; bottom: 0; background: #2c7a45; }
	.axis { display: flex; justify-content: space-between; padding: 0 16px 12px; font-size: 11.5px; }
	.lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); border-top: 1px solid var(--line-soft); }
	.lists > div { padding: 12px 16px 14px; border-right: 1px solid var(--line-soft); }
	.lists > div:last-child { border-right: 0; }
	h3 { font-size: 12.5px; font-weight: 600; color: var(--ink-2); margin: 0 0 6px; }
	.lists p { display: flex; justify-content: space-between; gap: 10px; margin: 0; padding: 5px 0; font-size: 13px; border-bottom: 1px solid var(--line-soft); }
	.lists p:last-child { border-bottom: 0; }
	.pth { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
