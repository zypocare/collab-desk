<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { supabase } from '#lib/supabase.ts';
	import { loadPublicPage, pub } from '#lib/publicPage.svelte.ts';
	import {
		audienceSummary,
		basedOn,
		benchmark,
		engageMix,
		formatRows,
		FORMAT_LABEL,
		insightKpis,
		monthName,
		sponsoredLine,
		type PublicInsights,
		type SectionKey
	} from '#lib/insights.ts';
	import { compact, fmt, fmtUpdated, mediaLabel } from '#lib/util.ts';
	import { copyText } from '#lib/ui.svelte.ts';
	import { downloadMediaKit } from '#lib/mediaKitPdf.ts';
	import BrandTopbar from '#lib/components/BrandTopbar.svelte';
	import Audience from '#lib/components/Audience.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';

	// The profile insights brands ask for, live from Instagram: one link instead of screenshots.
	// A brand's own link (?for=...) tells the creator when it's opened and may leave some sections out.
	let d = $state<PublicInsights | null>(null);
	let status = $state<'loading' | 'ok' | 'off'>('loading');
	let forLabel = $state('');
	let hide = $state(new Set<SectionKey>());
	onMount(async () => {
		loadPublicPage();
		const token = page.url.searchParams.get('for');
		const [{ data }, link] = await Promise.all([supabase.rpc('public_insights'), token ? supabase.rpc('insight_link_open', { p_token: token }) : Promise.resolve({ data: null })]);
		d = (data as PublicInsights | null) ?? null;
		const l = link.data as { label: string; hide: SectionKey[] } | null;
		if (l) {
			forLabel = l.label;
			hide = new Set(l.hide ?? []);
		}
		status = d ? 'ok' : 'off';
	});
	const show = (k: SectionKey) => !hide.has(k);

	const kpis = $derived(d ? insightKpis(d) : []);
	const mix = $derived(d ? engageMix(d) : []);
	const mixMax = $derived(Math.max(1, ...mix.map((x) => x.v)));
	const formats = $derived(d ? formatRows(d) : []);
	const summary = $derived(d ? audienceSummary(d.demographics) : []);
	const bench = $derived(d ? benchmark(d.followers, d.engagement_rate) : null);
	const sp = $derived(d?.insights.sponsored ?? null);
	const spLine = $derived(sponsoredLine(sp));
	const topics = $derived(d?.insights.topics ?? []);
	const months = $derived((d?.months ?? []).filter((m) => m.reach || m.views));

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
		await downloadMediaKit(pub.data, location.origin, [...hide]).catch(() => {});
		kitBusy = false;
	}
	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
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
				<div class="eb">Instagram insights{forLabel ? ` · prepared for ${forLabel}` : ''}</div>
				<h1>{d.display_name}</h1>
				<div class="handle">@{d.username}{d.niche ? ` · ${d.niche}` : ''}{d.city ? ` · ${d.city}` : ''}</div>
				<span class="ins-verified"><Icon name="check" />Verified from Instagram{d.updated_at ? ` · updated ${fmtUpdated(d.updated_at)}` : ''}</span>
			</div>
			<div class="ins-acts">
				<button class="btn sm" onclick={() => copyText(location.href, 'Link copied')}><Icon name="copy" />Copy link</button>
				<button class="btn sm" disabled={kitBusy || !pub.data} onclick={kit}>{#if kitBusy}<span class="spinner"></span>{:else}<Icon name="film" />{/if}Media kit PDF</button>
			</div>
		</section>

		{#if summary.length && show('audience')}
			<div class="ins-summary rv" aria-label="Audience at a glance">{#each summary as s (s)}<span>{s}</span>{/each}</div>
		{/if}
		{#if d.insights.from}<p class="hint ins-period">Last 30 days: {fmt(d.insights.from)} to {fmt(d.insights.to)}.</p>{/if}

		<div class="ins-kpis">
			{#each kpis as k, i (k.k)}
				<div class="ins-kpi glow rv" style="--i:{i + 1}">
					<small>{k.k}</small>
					<b>{k.show ?? (k.pct ? `${k.v}%` : compact(k.v as number))}</b>
					<span>
						{#if k.ch !== null}<em class:up={k.ch >= 0} class:down={k.ch < 0}>{k.ch >= 0 ? '▲' : '▼'} {Math.abs(k.ch)}%</em>{/if}
						{k.sub}
					</span>
				</div>
			{/each}
		</div>
		{#if bench}<p class="ins-bench rv"><Icon name="check" />{bench}</p>{/if}

		{#if formats.length && show('formats')}
			<section class="panel rv" style="--i:3;margin-bottom:18px">
				<div class="panel-h"><h2>By format</h2><small>last 12 of each, leaving out posts under 3 days old</small></div>
				<div class="table-wrap">
					<table class="doc-table ins-table">
						<thead><tr><th>Format</th><th>Based on</th><th>Avg. views</th><th>Avg. reach</th><th>Saved · shared</th><th>Engagement</th></tr></thead>
						<tbody>
							{#each formats as [key, s] (key)}
								<tr>
									<td>{FORMAT_LABEL[key]}</td>
									<td>{s.manual ? 'your numbers' : key === 'stories' ? plural(basedOn(s), 'Story', 'Stories') : plural(basedOn(s), 'post', 'posts')}</td>
									<td>{s.avg_views ? compact(s.avg_views) : '—'}{#if s.med_views && s.avg_views && s.med_views !== s.avg_views}<small class="ins-typ">typical {compact(s.med_views)}</small>{/if}</td>
									<td>{s.avg_reach ? compact(s.avg_reach) : '—'}{#if s.med_reach && s.avg_reach && s.med_reach !== s.avg_reach}<small class="ins-typ">typical {compact(s.med_reach)}</small>{/if}</td>
									<td>{s.save_rate == null && s.share_rate == null ? '—' : [s.save_rate, s.share_rate].map((v) => (v == null ? '—' : `${v}%`)).join(' · ')}</td>
									<td>{key === 'stories' ? (s.avg_interactions ? `${compact(s.avg_interactions)} actions` : '—') : s.er ? `${s.er}%` : '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="hint ins-foot">"Typical" is the middle post, so one viral post doesn't pull it up. Saved · shared: per 100 accounts reached.</p>
			</section>
		{/if}
		{#if ((mix.length || spark) && show('engage')) || (topics.length && show('topics'))}
			<div class="ins-grid">
			{#if (mix.length || spark) && show('engage')}
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
				{#if topics.length && show('topics')}
					<section class="panel rv" style="--i:6">
						<div class="panel-h"><h2>What performs best</h2><small>typical views by topic</small></div>
						<div class="ins-mix">
							{#each topics as t (t.k)}
								<div class="ins-mix-row ins-topic"><span>{t.k}<small>{plural(t.posts, 'post', 'posts')}</small></span><div class="ct-bar"><i style="width:{((t.med_views ?? 0) / (topics[0].med_views || 1)) * 100}%"></i></div><b>{compact(t.med_views)}<small>typical views</small></b></div>
							{/each}
						</div>
					</section>
				{/if}
			</div>
		{/if}
		{#if sp && spLine && show('sponsored')}
			<section class="panel rv" style="--i:5;margin-bottom:18px">
				<div class="panel-h"><h2>Sponsored vs regular posts</h2><small>typical post of each</small></div>
				<p class="ins-sp-line">{spLine}.</p>
				<div class="table-wrap">
					<table class="doc-table ins-table">
						<thead><tr><th></th><th>Based on</th><th>Typical reach</th><th>Typical views</th><th>Engagement</th></tr></thead>
						<tbody>
							<tr><td>Sponsored</td><td>{plural(basedOn(sp.sponsored), 'post', 'posts')}</td><td>{compact(sp.sponsored.med_reach)}</td><td>{compact(sp.sponsored.med_views)}</td><td>{sp.sponsored.er ?? '—'}%</td></tr>
							<tr><td>Regular</td><td>{plural(basedOn(sp.regular), 'post', 'posts')}</td><td>{compact(sp.regular.med_reach)}</td><td>{compact(sp.regular.med_views)}</td><td>{sp.regular.er ?? '—'}%</td></tr>
						</tbody>
					</table>
				</div>
			</section>
		{/if}

		{#if Object.keys(d.demographics ?? {}).length && show('audience')}<Audience demo={d.demographics} i={7} />{/if}

		{#if months.length >= 2 && show('months')}
			<section class="panel rv" style="--i:8;margin-bottom:18px">
				<div class="panel-h"><h2>Month by month</h2><small>30 days to each month's last update</small></div>
				<div class="table-wrap">
					<table class="doc-table ins-table">
						<thead><tr><th>Month</th><th>Followers</th><th>Accounts reached</th><th>Views</th><th>Accounts engaged</th><th>Reels engagement</th></tr></thead>
						<tbody>
							{#each months as m (m.month)}
								<tr><td>{monthName(m.month)}</td><td>{m.followers ? compact(m.followers) : '—'}</td><td>{m.reach ? compact(m.reach) : '—'}</td><td>{m.views ? compact(m.views) : '—'}</td><td>{m.engaged ? compact(m.engaged) : '—'}</td><td>{m.reels_er ? `${m.reels_er}%` : '—'}</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}

		{#if d.top.length && show('top')}
			<section class="rv ins-top" style="--i:9" aria-label="Top content">
				<div class="pkgs-h"><h2>Top performing content.</h2></div>
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

		{#if results.length && show('collabs')}
			<section class="rv ins-top" style="--i:10" aria-label="Results from past collabs">
				<div class="pkgs-h"><h2>Past brand collabs</h2><p>How collab posts performed.</p></div>
				<div class="ins-top-grid">
					{#each results.slice(0, 6) as r, i (r.permalink + i)}
						<a class="ins-post glow" href={r.permalink} target="_blank" rel="noopener" style="--i:{i}">
							{#if r.thumbnail}<img src={r.thumbnail} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="ins-post-ph"><Icon name="spark" /></span>{/if}
							<span class="ins-post-t">{r.brand} · {({ REELS: 'Reel', STORY: 'Story', FEED: 'Post' } as Record<string, string>)[r.kind] ?? r.kind}</span>
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
