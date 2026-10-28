<script lang="ts">
	import { audienceSummary, basedOn, benchmark, engageMix, formatRows, FORMAT_LABEL, insightKpis, sponsoredLine, type PublicInsights, type SectionKey } from '../insights';
	import { compact, fmt, mediaLabel } from '../util';
	import Audience from './Audience.svelte';
	import Icon from './Icon.svelte';

	// Everything an insights page shows, from the audience line to past collabs: the brands' /insights page and the
	// creator's own Insights screen (Grow) are the same numbers, laid out the same way.
	type Result = { permalink: string; thumbnail: string; brand: string; kind: string; views: number | null; reach: number | null };
	let { d, hide = new Set<SectionKey>(), results = [] }: { d: PublicInsights; hide?: Set<SectionKey>; results?: Result[] } = $props();
	const show = (k: SectionKey) => !hide.has(k);

	const kpis = $derived(insightKpis(d));
	// Reels engagement both ways (public_insights / my_insights, migration 177): her own Reels and her collab Reels,
	// each over the last 10. A side shows once it has at least 3 Reels.
	type Side = { posts: number; er: number | null; avg_interactions: number | null };
	const split = $derived((d as PublicInsights & { reels_split?: { own: Side; collab: Side } }).reels_split ?? null);
	const sides = $derived(
		split
			? [
					{ k: 'Engagement · own Reels', s: split.own, sub: 'her own Reels' },
					{ k: 'Engagement · collab Reels', s: split.collab, sub: 'brand collab Reels' }
				].filter((x) => x.s && x.s.er !== null && x.s.posts >= 3)
			: []
	);
	const mix = $derived(engageMix(d));
	const mixMax = $derived(Math.max(1, ...mix.map((x) => x.v)));
	const formats = $derived(formatRows(d));
	const summary = $derived(audienceSummary(d.demographics));
	const bench = $derived(benchmark(d.followers, d.engagement_rate));
	const sp = $derived(d.insights.sponsored ?? null);
	const spLine = $derived(sponsoredLine(sp));
	const topics = $derived(d.insights.topics ?? []);

	// Follower line for the last 90 days.
	const spark = $derived.by(() => {
		const h = d.history ?? [];
		if (h.length < 3) return null;
		const ys = h.map((x) => x.followers);
		const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
		const pts = h.map((x, i) => `${(i / (h.length - 1)) * 300},${70 - ((x.followers - lo) / span) * 60}`);
		return { line: pts.join(' '), area: `0,80 ${pts.join(' ')} 300,80`, from: h[0], to: h[h.length - 1] };
	});
	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
</script>

{#if summary.length && show('audience')}
	<div class="ins-summary rv" aria-label="Audience at a glance">{#each summary as s (s)}<span>{s}</span>{/each}</div>
{/if}
{#if d.insights.from}<p class="hint ins-period">Last 30 days: {fmt(d.insights.from)} to {fmt(d.insights.to)}.</p>{/if}

<div class="ins-kpis">
	{#each kpis as k, i (k.k)}
		<div class="ins-kpi glow rv" class:wide={i === kpis.length - 1 && kpis.length % 2 === 1} style="--i:{i + 1}">
			<small>{k.k}</small>
			<b>{k.show ?? (k.pct ? `${k.v}%` : compact(k.v as number))}</b>
			<span>
				{#if k.ch !== null}<em class:up={k.ch >= 0} class:down={k.ch < 0}>{k.ch >= 0 ? '▲' : '▼'} {Math.abs(k.ch)}%</em>{/if}
				{k.sub}
			</span>
		</div>
	{/each}
	{#if show('sponsored') && sides.length}
		<div class="ins-kpi glow rv ins-split" style="--i:{kpis.length + 1}">
			<small>Reels engagement, last 10 of each</small>
			<div class="ins-split-row">
				{#each sides as x (x.k)}
					<span><b>{x.s.er}%</b><em>{x.k.replace('Engagement · ', '')}</em></span>
				{/each}
			</div>
		</div>
	{/if}
</div>
{#if bench}<p class="ins-bench rv"><Icon name="check" />{bench}</p>{/if}

{#if formats.length && show('formats')}
	<section class="panel rv" style="--i:3;margin-bottom:18px">
		<div class="panel-h"><h2>By format</h2><small>last 12 of each, leaving out posts under 3 days old</small></div>
		<div class="table-wrap ins-tw">
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
		<div class="ins-cards">
			{#each formats as [key, s] (key)}
				<div class="ins-fc">
					<div class="ins-fc-h"><b>{FORMAT_LABEL[key]}</b><small>{s.manual ? 'your numbers' : key === 'stories' ? plural(basedOn(s), 'Story', 'Stories') : plural(basedOn(s), 'post', 'posts')}</small></div>
					<dl>
						<div><dt>Avg. views</dt><dd>{s.avg_views ? compact(s.avg_views) : '—'}{#if s.med_views && s.avg_views && s.med_views !== s.avg_views}<small>typical {compact(s.med_views)}</small>{/if}</dd></div>
						<div><dt>Avg. reach</dt><dd>{s.avg_reach ? compact(s.avg_reach) : '—'}{#if s.med_reach && s.avg_reach && s.med_reach !== s.avg_reach}<small>typical {compact(s.med_reach)}</small>{/if}</dd></div>
						<div><dt>Saved · shared</dt><dd>{s.save_rate == null && s.share_rate == null ? '—' : [s.save_rate, s.share_rate].map((v) => (v == null ? '—' : `${v}%`)).join(' · ')}</dd></div>
						<div><dt>Engagement</dt><dd>{key === 'stories' ? (s.avg_interactions ? `${compact(s.avg_interactions)} actions` : '—') : s.er ? `${s.er}%` : '—'}</dd></div>
					</dl>
				</div>
			{/each}
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
		<div class="table-wrap ins-tw">
			<table class="doc-table ins-table">
				<thead><tr><th></th><th>Based on</th><th>Typical reach</th><th>Typical views</th><th>Engagement</th></tr></thead>
				<tbody>
					<tr><td>Sponsored</td><td>{plural(basedOn(sp.sponsored), 'post', 'posts')}</td><td>{compact(sp.sponsored.med_reach)}</td><td>{compact(sp.sponsored.med_views)}</td><td>{sp.sponsored.er ?? '—'}%</td></tr>
					<tr><td>Regular</td><td>{plural(basedOn(sp.regular), 'post', 'posts')}</td><td>{compact(sp.regular.med_reach)}</td><td>{compact(sp.regular.med_views)}</td><td>{sp.regular.er ?? '—'}%</td></tr>
				</tbody>
			</table>
		</div>
		<div class="ins-cards">
			{#each [['Sponsored', sp.sponsored], ['Regular', sp.regular]] as const as [label, x] (label)}
				<div class="ins-fc">
					<div class="ins-fc-h"><b>{label}</b><small>{plural(basedOn(x), 'post', 'posts')}</small></div>
					<dl>
						<div><dt>Typical reach</dt><dd>{compact(x.med_reach)}</dd></div>
						<div><dt>Typical views</dt><dd>{compact(x.med_views)}</dd></div>
						<div><dt>Engagement</dt><dd>{x.er ?? '—'}%</dd></div>
					</dl>
				</div>
			{/each}
		</div>
	</section>
{/if}

{#if Object.keys(d.demographics ?? {}).length && show('audience')}<Audience demo={d.demographics} i={7} />{/if}


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

<style>
	/* The two Reels rates side by side in one card. */
	.ins-split { grid-column: 1 / -1; }
	.ins-split-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 6px; }
	.ins-split-row span { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; color: var(--ink); }
	.ins-split-row b { color: var(--ink); }
	.ins-split-row span + span { padding-left: 12px; border-left: 1px solid var(--line); }
	.ins-split-row em { font-style: normal; font-size: 13px; color: var(--ink-3); }
	/* Cards in place of the tables, on a phone. */
	.ins-cards { display: none; }
	.ins-fc { padding: 14px 0; border-top: 1px solid var(--line); }
	.ins-fc:first-child { border-top: 0; padding-top: 4px; }
	.ins-fc-h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
	.ins-fc-h b { font-size: 16px; }
	.ins-fc-h small { font-size: 12.5px; color: var(--ink-3); }
	.ins-fc dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; margin: 0; }
	.ins-fc dt { font-size: 12px; color: var(--ink-3); }
	.ins-fc dd { margin: 2px 0 0; font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
	.ins-fc dd small { display: block; font-size: 11.5px; font-weight: 500; color: var(--ink-3); }
	@media (max-width: 640px) {
		.ins-kpi.wide { grid-column: 1 / -1; }
		.ins-tw { display: none; }
		.ins-cards { display: block; padding: 0 16px 4px; }
	}
</style>
