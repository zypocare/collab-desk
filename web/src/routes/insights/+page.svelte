<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { loadPublicPage, pub } from '#lib/publicPage.svelte.ts';
	import { change, FORMAT_LABEL, reachOk, type PublicInsights } from '#lib/insights.ts';
	import { compact, fmt, fmtLong, mediaLabel } from '#lib/util.ts';
	import { copyText } from '#lib/ui.svelte.ts';
	import { downloadMediaKit } from '#lib/mediaKitPdf.ts';
	import BrandTopbar from '#lib/components/BrandTopbar.svelte';
	import Audience from '#lib/components/Audience.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';

	// The profile insights brands ask for, live from Instagram: one link instead of screenshots.
	let d = $state<PublicInsights | null>(null);
	let status = $state<'loading' | 'ok' | 'off'>('loading');
	onMount(async () => {
		loadPublicPage();
		const { data } = await supabase.rpc('public_insights');
		d = (data as PublicInsights | null) ?? null;
		status = d ? 'ok' : 'off';
	});

	const t = $derived(d?.insights.totals ?? {});
	const pv = $derived(d?.insights.prev ?? {});
	const f = $derived(d?.insights.formats);
	const kpis = $derived(
		d
			? [
					{ k: 'Followers', v: d.followers, sub: d.insights.growth?.d30 ? `${d.insights.growth.d30 > 0 ? '+' : ''}${compact(d.insights.growth.d30)} in 30 days` : '', ch: null },
					{ k: 'Accounts reached', v: reachOk(t) ? t.reach : undefined, sub: '30 days', ch: reachOk(pv) ? change(t.reach, pv.reach) : null },
					{ k: 'Views', v: t.views, sub: '30 days', ch: change(t.views, pv.views) },
					{ k: 'Accounts engaged', v: t.accounts_engaged, sub: '30 days', ch: change(t.accounts_engaged, pv.accounts_engaged) },
					{ k: 'Engagement rate', v: d.engagement_rate, sub: 'per post, last 12', ch: null, pct: true },
					{ k: 'Interactions', v: t.total_interactions, sub: '30 days', ch: change(t.total_interactions, pv.total_interactions) },
					{ k: 'Avg. Reel views', v: f?.reels.avg_views ?? d.avg_views, sub: f?.reels.posts ? `last ${f.reels.posts} Reels` : 'recent posts', ch: null },
					{ k: 'Avg. Story reach', v: f?.stories.avg_reach, sub: f?.stories.posts ? `${f.stories.posts} Stories` : '', ch: null },
					{ k: 'Link taps', v: t.profile_links_taps, sub: '30 days', ch: change(t.profile_links_taps, pv.profile_links_taps) }
				].filter((x) => typeof x.v === 'number' && x.v > 0)
			: []
	);
	const mix = $derived(
		[
			{ k: 'Likes', v: t.likes },
			{ k: 'Comments', v: t.comments },
			{ k: 'Shares', v: t.shares },
			{ k: 'Saves', v: t.saves }
		].filter((x) => x.v)
	);
	const mixMax = $derived(Math.max(1, ...mix.map((x) => x.v)));
	const formats = $derived(f ? (Object.entries(f) as [string, NonNullable<typeof f>['reels']][]).filter(([, s]) => s.posts > 0) : []);

	// Follower line for the last 90 days.
	const spark = $derived.by(() => {
		const h = d?.history ?? [];
		if (h.length < 3) return null;
		const ys = h.map((x) => x.followers);
		const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
		const pts = h.map((x, i) => `${(i / (h.length - 1)) * 300},${70 - ((x.followers - lo) / span) * 60}`);
		return { line: pts.join(' '), area: `0,80 ${pts.join(' ')} 300,80`, from: h[0], to: h[h.length - 1] };
	});
	const results = $derived(pub.data?.results ?? []);
	const reviews = $derived(pub.data?.reviews ?? []);
	let kitBusy = $state(false);
	async function kit() {
		if (!pub.data) return;
		kitBusy = true;
		await downloadMediaKit(pub.data, location.origin).catch(() => {});
		kitBusy = false;
	}
</script>

<svelte:head>
	<title>{d ? `${d.display_name} · Instagram insights` : 'Insights'}</title>
	{#if d}<meta name="description" content="Live Instagram insights for @{d.username}: reach, views, engagement and audience." />{/if}
</svelte:head>

<BrandTopbar />

<div class="page"><div class="wrap ins-wrap">
	{#if status === 'loading'}
		<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
	{:else if status === 'off' || !d}
		<div class="empty-card">
			<h2>Insights aren't shared right now</h2>
			<p>Ask the creator for a media kit, or send a collaboration request.</p>
			<a class="btn primary" href="/">Go to the brand page</a>
		</div>
	{:else}
		<section class="ins-hero rv">
			<Avatar name={d.display_name} src={d.profile_picture_url} />
			<div>
				<div class="eb">Instagram insights</div>
				<h1>{d.display_name}</h1>
				<div class="handle">@{d.username}{d.niche ? ` · ${d.niche}` : ''}{d.city ? ` · ${d.city}` : ''}</div>
				<span class="ins-verified"><Icon name="check" />Verified from Instagram{d.updated_at ? ` · updated ${fmtLong(d.updated_at.slice(0, 10))}` : ''}</span>
			</div>
			<div class="ins-acts">
				<button class="btn sm" onclick={() => copyText(location.href, 'Link copied')}><Icon name="copy" />Copy link</button>
				<button class="btn sm" disabled={kitBusy || !pub.data} onclick={kit}>{#if kitBusy}<span class="spinner"></span>{:else}<Icon name="film" />{/if}Media kit PDF</button>
			</div>
		</section>

		{#if d.insights.from}<p class="hint ins-period">Last 30 days: {fmt(d.insights.from)} to {fmt(d.insights.to)}. Changes are against the 30 days before.</p>{/if}

		<div class="ins-kpis">
			{#each kpis as k, i (k.k)}
				<div class="ins-kpi glow rv" style="--i:{i + 1}">
					<small>{k.k}</small>
					<b>{k.pct ? `${k.v}%` : compact(k.v as number)}</b>
					<span>
						{#if k.ch !== null}<em class:up={k.ch >= 0} class:down={k.ch < 0}>{k.ch >= 0 ? '▲' : '▼'} {Math.abs(k.ch)}%</em>{/if}
						{k.sub}
					</span>
				</div>
			{/each}
		</div>

		<div class="ins-grid">
			{#if formats.length}
				<section class="panel rv" style="--i:3">
					<div class="panel-h"><h2>By format</h2><small>averages of recent posts (up to 12 each)</small></div>
					<div class="table-wrap">
						<table class="doc-table ins-table">
							<thead><tr><th>Format</th><th>Posts</th><th>Avg. views</th><th>Avg. reach</th><th>Engagement</th></tr></thead>
							<tbody>
								{#each formats as [key, s] (key)}
									<tr><td>{FORMAT_LABEL[key]}</td><td>{s.posts}</td><td>{s.avg_views ? compact(s.avg_views) : '—'}</td><td>{s.avg_reach ? compact(s.avg_reach) : '—'}</td><td>{key === 'stories' ? (s.avg_interactions ? `${compact(s.avg_interactions)} actions` : '—') : s.er ? `${s.er}%` : '—'}</td></tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>
			{/if}
			{#if mix.length || spark}
				<section class="panel rv" style="--i:4">
					{#if mix.length}
						<div class="panel-h"><h2>How people engage</h2><small>30 days</small></div>
						<div class="ins-mix">
							{#each mix as m (m.k)}
								<div class="ins-mix-row"><span>{m.k}</span><div class="ct-bar"><i style="width:{(m.v / mixMax) * 100}%"></i></div><b>{compact(m.v)}</b></div>
							{/each}
						</div>
					{/if}
					{#if spark}
						<div class="panel-h" style="border-top:1px solid var(--line)"><h2>Followers</h2><small>{fmt(spark.from.day)} to {fmt(spark.to.day)}</small></div>
						<svg class="ins-spark" viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label="Followers went from {compact(spark.from.followers)} to {compact(spark.to.followers)}">
							<polygon points={spark.area} />
							<polyline points={spark.line} />
						</svg>
					{/if}
				</section>
			{/if}
		</div>

		{#if Object.keys(d.demographics ?? {}).length}<Audience demo={d.demographics} i={5} />{/if}

		{#if d.top.length}
			<section class="rv ins-top" style="--i:6" aria-label="Top content">
				<div class="pkgs-h"><h2>Top content</h2><p>Best of her recent posts.</p></div>
				<div class="ins-top-grid">
					{#each d.top as m, i (m.permalink)}
						<a class="ins-post glow" href={m.permalink} target="_blank" rel="noopener" style="--i:{i}">
							{#if m.thumbnail_url}<img src={m.thumbnail_url} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="ins-post-ph"><Icon name="film" /></span>{/if}
							<span class="ins-post-t">{mediaLabel(m.media_type, m.product_type)} · {fmt(m.posted_at.slice(0, 10))}</span>
							<span class="ins-post-n">{#if m.views}<b>{compact(m.views)}</b> views{:else if m.reach}<b>{compact(m.reach)}</b> reached{/if}{#if m.interactions}{' · '}{compact(m.interactions)} interactions{/if}</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if results.length}
			<section class="rv ins-top" style="--i:7" aria-label="Results from past collabs">
				<div class="pkgs-h"><h2>Past brand collabs</h2><p>How collab posts performed.</p></div>
				<div class="ins-top-grid">
					{#each results.slice(0, 6) as r, i (r.permalink + i)}
						<a class="ins-post glow" href={r.permalink} target="_blank" rel="noopener" style="--i:{i}">
							{#if r.thumbnail}<img src={r.thumbnail} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="ins-post-ph"><Icon name="spark" /></span>{/if}
							<span class="ins-post-t">{r.brand} · {r.kind}</span>
							<span class="ins-post-n">{#if r.views}<b>{compact(r.views)}</b> views{:else if r.reach}<b>{compact(r.reach)}</b> reached{/if}</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if reviews.length}
			<p class="hint ins-reviews rv">{(reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1)} ★ from {reviews.length} brand review{reviews.length === 1 ? '' : 's'} · <a class="lnk" href="/">see them on the brand page</a></p>
		{/if}

		<section class="ins-cta rv">
			<div><b>Like what you see?</b><small>Send a request in 2 minutes. No sign-up needed.</small></div>
			<a class="btn grad lg" href="/brand/new"><Icon name="send" />Send a collaboration request</a>
		</section>
	{/if}
</div></div>
