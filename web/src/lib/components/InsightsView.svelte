<script lang="ts">
	import { igImg } from '../igImg';
	import { audienceSummary, basedOn, benchmark, engageMix, formatRows, FORMAT_LABEL, insightKpis, sponsoredLine, type PublicInsights, type SectionKey } from '../insights';
	import { compact, fmt, mediaLabel } from '../util';
	import Audience from './Audience.svelte';
	import Icon from './Icon.svelte';

	// Everything an insights page shows, from the audience line to past collabs: the brands' /insights page and the
	// creator's own Insights screen (Grow) share this redesigned editorial view with 100% metric parity.
	type Result = { permalink: string; thumbnail: string; brand: string; kind: string; views: number | null; reach: number | null };
	let { d, hide = new Set<SectionKey>(), results = [] }: { d: PublicInsights; hide?: Set<SectionKey>; results?: Result[] } = $props();
	const show = (k: SectionKey) => !hide.has(k);

	let activeTab = $state<'all' | 'perf' | 'aud' | 'content'>('all');

	const allKpis = $derived(insightKpis(d));
	// Pull primary 30-day Views + 3 hero rail stats (Followers, Accounts reached, Avg. Reel views) into the Hero Spotlight,
	// and render all remaining KPIs below without dropping a single metric.
	const heroViews = $derived(allKpis.find((k) => k.k === 'Views') ?? null);
	const heroFollowers = $derived(allKpis.find((k) => k.k === 'Followers') ?? null);
	const heroReach = $derived(allKpis.find((k) => k.k === 'Accounts reached') ?? null);
	const heroAvgReel = $derived(allKpis.find((k) => k.k === 'Avg. Reel views') ?? null);
	const heroKeys = $derived(new Set([heroViews?.k, heroFollowers?.k, heroReach?.k, heroAvgReel?.k].filter(Boolean)));
	const restKpis = $derived(heroViews ? allKpis.filter((k) => !heroKeys.has(k.k)) : allKpis);

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
		const lo = Math.min(...ys),
			hi = Math.max(...ys),
			span = hi - lo || 1;
		const pts = h.map((x, i) => `${(i / (h.length - 1)) * 300},${70 - ((x.followers - lo) / span) * 60}`);
		return { line: pts.join(' '), area: `0,80 ${pts.join(' ')} 300,80`, from: h[0], to: h[h.length - 1] };
	});
	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

	const showPerf = $derived(activeTab === 'all' || activeTab === 'perf');
	const showAud = $derived(activeTab === 'all' || activeTab === 'aud');
	const showContent = $derived(activeTab === 'all' || activeTab === 'content');
</script>

<div class="iv">
	{#if summary.length && show('audience')}
		<div class="iv-glance rv" aria-label="Audience at a glance">
			{#each summary as s (s)}<span>{s}</span>{/each}
		</div>
	{/if}

	<!-- Editorial Hero Spotlight (Views + Followers + Reached + Avg Reel) -->
	{#if heroViews}
		<section class="iv-hero rv">
			<div class="iv-htop">
				<span class="iv-eb">{d.insights.from ? `Last 30 days · ${fmt(d.insights.from)} – ${fmt(d.insights.to)}` : 'Last 30 days'}</span>
				{#if heroViews.ch !== null}
					<span class="iv-dpill" class:down={heroViews.ch < 0}>
						{heroViews.ch >= 0 ? '+' : ''}{heroViews.ch}%
					</span>
				{/if}
			</div>

			<div class="iv-hnum">{heroViews.show ?? compact(heroViews.v as number)}</div>
			<div class="iv-hsub">Total views · {heroViews.sub}</div>

			{#if spark}
				<div class="iv-hspark">
					<svg viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true">
						<defs>
							<linearGradient id="ivGradLine" x1="0%" y1="0%" x2="100%" y2="0%">
								<stop offset="0%" stop-color="#9C7BFF" />
								<stop offset="55%" stop-color="#F25A90" />
								<stop offset="100%" stop-color="#FFAE6B" />
							</linearGradient>
							<linearGradient id="ivGradFill" x1="0%" y1="0%" x2="0%" y2="100%">
								<stop offset="0%" stop-color="#F25A90" stop-opacity="0.28" />
								<stop offset="100%" stop-color="#9C7BFF" stop-opacity="0" />
							</linearGradient>
						</defs>
						<polygon points={spark.area} fill="url(#ivGradFill)" />
						<polyline points={spark.line} fill="none" stroke="url(#ivGradLine)" stroke-width="2.4" />
					</svg>
				</div>
			{/if}

			{#if heroFollowers || heroReach || heroAvgReel}
				<div class="iv-rail">
					{#each [heroFollowers, heroReach, heroAvgReel].filter((x): x is NonNullable<typeof x> => !!x) as r (r.k)}
						<div class="iv-ri">
							<small>{r.k.replace('Accounts ', '').replace('Avg. ', 'Avg ')}</small>
							<b>{r.show ?? (r.pct ? `${r.v}%` : compact(r.v as number))}</b>
							<i class:up={r.ch !== null && r.ch >= 0} class:down={r.ch !== null && r.ch < 0}>
								{#if r.ch !== null}{r.ch >= 0 ? '+' : ''}{r.ch}% · {/if}{r.sub}
							</i>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{:else if d.insights.from}
		<p class="hint iv-period">Last 30 days: {fmt(d.insights.from)} to {fmt(d.insights.to)}.</p>
	{/if}

	<!-- Native Miracle NeoPOP Segmented Tabs (matches Work / Money / Brand & All Active / Needs Action) -->
	<div class="iv-tabs" role="tablist" aria-label="Insights sections">
		<button type="button" role="tab" aria-selected={activeTab === 'all'} class:on={activeTab === 'all'} onclick={() => (activeTab = 'all')}>All</button>
		<button type="button" role="tab" aria-selected={activeTab === 'perf'} class:on={activeTab === 'perf'} onclick={() => (activeTab = 'perf')}>Performance</button>
		<button type="button" role="tab" aria-selected={activeTab === 'aud'} class:on={activeTab === 'aud'} onclick={() => (activeTab = 'aud')}>Audience</button>
		<button type="button" role="tab" aria-selected={activeTab === 'content'} class:on={activeTab === 'content'} onclick={() => (activeTab = 'content')}>Content</button>
	</div>

	<!-- PERFORMANCE SECTIONS -->
	{#if showPerf}
		<div class="iv-kpis">
			{#each restKpis as k, i (k.k)}
				<div class="iv-kpi rv" class:accent={i === 0} class:wide={i === restKpis.length - 1 && restKpis.length % 2 === 1} style="--i:{i + 1}">
					<small>{k.k}</small>
					<b>{k.show ?? (k.pct ? `${k.v}%` : compact(k.v as number))}</b>
					<span>
						{#if k.ch !== null}<em class:up={k.ch >= 0} class:down={k.ch < 0}>{k.ch >= 0 ? '+' : ''}{k.ch}%</em> · {/if}{k.sub}
					</span>
				</div>
			{/each}

			{#if show('sponsored') && sides.length}
				<div class="iv-kpi wide rv">
					<small>Reels engagement · last 10 of each</small>
					<div class="iv-split">
						{#each sides as x (x.k)}
							<div>
								<b>{x.s.er}%</b>
								<em>{x.k.replace('Engagement · ', '')}</em>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		{#if bench}
			<p class="iv-bench rv"><Icon name="check" /><span>{bench}</span></p>
		{/if}

		{#if formats.length && show('formats')}
			<section class="iv-panel rv">
				<div class="iv-ph">
					<h2>By format</h2>
					<small>last 12 of each, leaving out posts under 3 days old</small>
				</div>
				<div class="iv-tw">
					<table class="doc-table ins-table">
						<thead><tr><th>Format</th><th>Based on</th><th>Avg. views</th><th>Avg. reach</th><th>Saved · shared</th><th>Engagement</th></tr></thead>
						<tbody>
							{#each formats as [key, s] (key)}
								<tr>
									<td>{FORMAT_LABEL[key]}</td>
									<td>{s.manual ? 'your numbers' : key === 'stories' ? plural(basedOn(s), 'Story', 'Stories') : plural(basedOn(s), 'post', 'posts')}</td>
									<td>{s.avg_views ? compact(s.avg_views) : '—'}{#if s.med_views && s.avg_views && s.med_views !== s.avg_views}<small class="iv-typ">typical {compact(s.med_views)}</small>{/if}</td>
									<td>{s.avg_reach ? compact(s.avg_reach) : '—'}{#if s.med_reach && s.avg_reach && s.med_reach !== s.avg_reach}<small class="iv-typ">typical {compact(s.med_reach)}</small>{/if}</td>
									<td>{s.save_rate == null && s.share_rate == null ? '—' : [s.save_rate, s.share_rate].map((v) => (v == null ? '—' : `${v}%`)).join(' · ')}</td>
									<td>{key === 'stories' ? (s.avg_interactions ? `${compact(s.avg_interactions)} actions` : '—') : s.er ? `${s.er}%` : '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="iv-cards">
					{#each formats as [key, s] (key)}
						<div class="iv-fc">
							<div class="iv-fc-h"><b>{FORMAT_LABEL[key]}</b><small>{s.manual ? 'your numbers' : key === 'stories' ? plural(basedOn(s), 'Story', 'Stories') : plural(basedOn(s), 'post', 'posts')}</small></div>
							<dl>
								<div><dt>Avg. views</dt><dd>{s.avg_views ? compact(s.avg_views) : '—'}{#if s.med_views && s.avg_views && s.med_views !== s.avg_views}<small>typical {compact(s.med_views)}</small>{/if}</dd></div>
								<div><dt>Avg. reach</dt><dd>{s.avg_reach ? compact(s.avg_reach) : '—'}{#if s.med_reach && s.avg_reach && s.med_reach !== s.avg_reach}<small>typical {compact(s.med_reach)}</small>{/if}</dd></div>
								<div><dt>Saved · shared</dt><dd>{s.save_rate == null && s.share_rate == null ? '—' : [s.save_rate, s.share_rate].map((v) => (v == null ? '—' : `${v}%`)).join(' · ')}</dd></div>
								<div><dt>Engagement</dt><dd>{key === 'stories' ? (s.avg_interactions ? `${compact(s.avg_interactions)} actions` : '—') : s.er ? `${s.er}%` : '—'}</dd></div>
							</dl>
						</div>
					{/each}
				</div>
				<p class="iv-foot">“Typical” is the middle post, so one viral post doesn't pull it up. Saved · shared: per 100 accounts reached.</p>
			</section>
		{/if}

		{#if ((mix.length || spark) && show('engage')) || (topics.length && show('topics'))}
			<div class="iv-grid2">
				{#if (mix.length || spark) && show('engage')}
					<section class="iv-panel rv">
						{#if mix.length}
							<div class="iv-ph"><h2>How people engage</h2><small>30 days</small></div>
							<div class="iv-bars">
								{#each mix as m (m.k)}
									<div class="iv-brow">
										<div class="iv-btop"><b>{m.k}</b><span>{compact(m.v)}</span></div>
										<div class="iv-btrack"><i style="width:{(m.v / mixMax) * 100}%"></i></div>
									</div>
								{/each}
							</div>
						{/if}
						{#if spark}
							<div class="iv-ph iv-sep"><h2>Followers</h2><small>{fmt(spark.from.day)} to {fmt(spark.to.day)}</small></div>
							<svg class="iv-spark" viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label="Followers went from {compact(spark.from.followers)} to {compact(spark.to.followers)}">
								<polygon points={spark.area} />
								<polyline points={spark.line} />
							</svg>
						{/if}
					</section>
				{/if}

				{#if topics.length && show('topics')}
					<section class="iv-panel rv">
						<div class="iv-ph"><h2>What performs best</h2><small>typical views by topic</small></div>
						<div class="iv-bars">
							{#each topics as t (t.k)}
								<div class="iv-brow">
									<div class="iv-btop"><b>{t.k} · {plural(t.posts, 'post', 'posts')}</b><span>{compact(t.med_views)}</span></div>
									<div class="iv-btrack"><i style="width:{((t.med_views ?? 0) / (topics[0].med_views || 1)) * 100}%"></i></div>
								</div>
							{/each}
						</div>
					</section>
				{/if}
			</div>
		{/if}

		{#if sp && spLine && show('sponsored')}
			<section class="iv-panel rv">
				<div class="iv-ph"><h2>Sponsored vs regular posts</h2><small>typical post of each</small></div>
				<p class="iv-sp-line">{spLine}.</p>
				<div class="iv-tw">
					<table class="doc-table ins-table">
						<thead><tr><th></th><th>Based on</th><th>Typical reach</th><th>Typical views</th><th>Engagement</th></tr></thead>
						<tbody>
							<tr><td>Sponsored</td><td>{plural(basedOn(sp.sponsored), 'post', 'posts')}</td><td>{compact(sp.sponsored.med_reach)}</td><td>{compact(sp.sponsored.med_views)}</td><td>{sp.sponsored.er ?? '—'}%</td></tr>
							<tr><td>Regular</td><td>{plural(basedOn(sp.regular), 'post', 'posts')}</td><td>{compact(sp.regular.med_reach)}</td><td>{compact(sp.regular.med_views)}</td><td>{sp.regular.er ?? '—'}%</td></tr>
						</tbody>
					</table>
				</div>
				<div class="iv-cards">
					{#each [['Sponsored', sp.sponsored], ['Regular', sp.regular]] as const as [label, x] (label)}
						<div class="iv-fc">
							<div class="iv-fc-h"><b>{label}</b><small>{plural(basedOn(x), 'post', 'posts')}</small></div>
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
	{/if}

	<!-- AUDIENCE SECTION -->
	{#if showAud && Object.keys(d.demographics ?? {}).length && show('audience')}
		<Audience demo={d.demographics} i={7} />
	{/if}

	<!-- TOP CONTENT & PAST COLLABS SECTIONS -->
	{#if showContent}
		{#if d.top.length && show('top')}
			<section class="iv-panel rv" aria-label="Top content">
				<div class="iv-ph"><h2>Top performing content</h2><small>Last 90 days</small></div>
				<div class="iv-posts">
					{#each d.top as m (m.permalink)}
						<a class="iv-post" href={m.permalink} target="_blank" rel="noopener">
							{#if m.thumbnail_url}
								<img src={igImg(m.thumbnail_url)} alt="" loading="lazy" referrerpolicy="no-referrer" />
							{:else}
								<span class="iv-post-ph"><Icon name="film" /></span>
							{/if}
							<span class="iv-pm">
								<b>{mediaLabel(m.media_type, m.product_type)} · {fmt(m.posted_at.slice(0, 10))}</b>
								<small>{m.interactions ? `${compact(m.interactions)} interactions` : 'Instagram post'}</small>
							</span>
							<span class="iv-pn">
								<b>{m.views ? compact(m.views) : m.reach ? compact(m.reach) : '—'}</b>
								<small>{m.views ? 'views' : 'reached'}</small>
							</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if results.length && show('collabs')}
			<section class="iv-panel rv" aria-label="Results from past collabs">
				<div class="iv-ph"><h2>Past brand collabs</h2><small>How collab posts performed</small></div>
				<div class="iv-posts">
					{#each results.slice(0, 6) as r, i (r.permalink + i)}
						<a class="iv-post" href={r.permalink} target="_blank" rel="noopener">
							{#if r.thumbnail}
								<img src={igImg(r.thumbnail)} alt="" loading="lazy" referrerpolicy="no-referrer" />
							{:else}
								<span class="iv-post-ph"><Icon name="spark" /></span>
							{/if}
							<span class="iv-pm">
								<b>{r.brand}</b>
								<small>{({ REELS: 'Reel', STORY: 'Story', FEED: 'Post' } as Record<string, string>)[r.kind] ?? r.kind}</small>
							</span>
							<span class="iv-pn">
								<b>{r.views ? compact(r.views) : r.reach ? compact(r.reach) : '—'}</b>
								<small>{r.views ? 'views' : 'reached'}</small>
							</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</div>

<style>
	.iv {
		display: grid;
		gap: 14px;
		min-width: 0;
	}
	.iv-glance {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.iv-glance span {
		padding: 4px 10px;
		border-radius: 99px;
		border: 1px solid var(--line-strong);
		background: var(--surface);
		font-size: 12px;
		font-weight: 500;
		color: var(--ink-2);
	}
	.iv-period {
		margin: 0;
	}
	.iv-hero {
		border-radius: 22px;
		border: 1px solid var(--line-strong);
		background:
			radial-gradient(240px 150px at 88% 0%, color-mix(in oklab, var(--g2) 22%, transparent), transparent 72%),
			radial-gradient(200px 140px at 10% 0%, color-mix(in oklab, var(--g1) 16%, transparent), transparent 70%),
			linear-gradient(180deg, #1e1721 0%, #151018 100%);
		padding: 18px 16px 14px;
		overflow: hidden;
	}
	.iv-htop {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.iv-eb {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.iv-dpill {
		padding: 3px 9px;
		border-radius: 99px;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 11px;
		font-weight: 600;
		color: var(--ok);
		background: color-mix(in oklab, var(--ok) 14%, transparent);
		border: 1px solid color-mix(in oklab, var(--ok) 36%, transparent);
	}
	.iv-dpill.down {
		color: var(--bad);
		background: color-mix(in oklab, var(--bad) 14%, transparent);
		border-color: color-mix(in oklab, var(--bad) 36%, transparent);
	}
	.iv-hnum {
		font: 400 50px/1 var(--f-serif, Georgia, serif);
		margin: 6px 0 2px;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
	.iv-hsub {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.iv-hspark {
		margin: 8px -16px 0;
		height: 60px;
	}
	.iv-hspark svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.iv-rail {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
		padding-top: 12px;
		margin-top: 8px;
		border-top: 1px dashed var(--line-strong);
	}
	.iv-ri small {
		display: block;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-3);
	}
	.iv-ri b {
		display: block;
		font: 400 24px/1.1 var(--f-serif, Georgia, serif);
		margin-top: 2px;
		font-variant-numeric: tabular-nums;
	}
	.iv-ri i {
		display: block;
		font-style: normal;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 10.5px;
		font-weight: 600;
		color: var(--ink-3);
	}
	.iv-ri i.up {
		color: var(--ok);
	}
	.iv-ri i.down {
		color: var(--bad);
	}

	/* Native Miracle NeoPOP Sharp Segmented Tabs (matching Work / Money / Brand & Today tabs) */
	.iv-tabs {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		border: 1px solid var(--line-strong);
		background: var(--surface);
	}
	.iv-tabs button {
		position: relative;
		min-height: 40px;
		padding: 8px 4px;
		border: 0;
		border-right: 1px solid var(--line);
		background: transparent;
		color: var(--ink-2);
		font: 700 10.5px/1 var(--f-body, inherit);
		letter-spacing: 0.09em;
		text-transform: uppercase;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.iv-tabs button:last-child {
		border-right: 0;
	}
	.iv-tabs button.on {
		background: var(--ink);
		color: var(--bg);
		box-shadow: inset 0 -3px 0 var(--g2);
	}

	.iv-kpis {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	.iv-kpi {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 16px;
		padding: 13px;
		display: grid;
		gap: 4px;
	}
	.iv-kpi.wide {
		grid-column: 1 / -1;
	}
	.iv-kpi.accent {
		border-color: color-mix(in oklab, var(--g1) 38%, var(--line));
		background: linear-gradient(155deg, color-mix(in oklab, var(--g1) 10%, var(--surface)), var(--surface) 70%);
	}
	.iv-kpi small {
		font-size: 11px;
		font-weight: 600;
		color: var(--ink-3);
	}
	.iv-kpi b {
		font: 400 30px/1.02 var(--f-serif, Georgia, serif);
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
	.iv-kpi span {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 10.5px;
		color: var(--ink-3);
	}
	.iv-kpi em {
		font-style: normal;
		font-weight: 600;
	}
	.iv-kpi em.up {
		color: var(--ok);
	}
	.iv-kpi em.down {
		color: var(--bad);
	}
	.iv-split {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin-top: 4px;
	}
	.iv-split > div + div {
		padding-left: 12px;
		border-left: 1px solid var(--line);
	}
	.iv-split b {
		display: block;
		font: 400 28px/1 var(--f-serif, Georgia, serif);
	}
	.iv-split em {
		font-style: normal;
		font-size: 12px;
		color: var(--ink-2);
	}
	.iv-bench {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 13px;
		border-radius: 13px;
		background: color-mix(in oklab, var(--ok) 9%, var(--surface));
		border: 1px solid color-mix(in oklab, var(--ok) 30%, var(--line));
		color: var(--ok);
		font-size: 12.5px;
		font-weight: 500;
	}
	.iv-panel {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 18px;
		padding: 15px;
		display: grid;
		gap: 12px;
	}
	.iv-ph {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}
	.iv-ph.iv-sep {
		padding-top: 12px;
		border-top: 1px solid var(--line);
	}
	.iv-ph h2 {
		font: 400 22px/1.1 var(--f-serif, Georgia, serif);
		margin: 0;
	}
	.iv-ph small {
		font-size: 11.5px;
		color: var(--ink-3);
	}
	.iv-typ {
		display: block;
		font-size: 11px;
		color: var(--ink-3);
	}
	.iv-cards {
		display: none;
		gap: 10px;
	}
	.iv-fc {
		padding: 12px;
		border-radius: 13px;
		background: var(--surface-2);
		border: 1px solid var(--line);
		display: grid;
		gap: 8px;
	}
	.iv-fc-h {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	.iv-fc-h b {
		font-size: 14.5px;
	}
	.iv-fc-h small {
		font-size: 11.5px;
		color: var(--ink-3);
	}
	.iv-fc dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px 12px;
		margin: 0;
	}
	.iv-fc dt {
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-3);
	}
	.iv-fc dd {
		margin: 2px 0 0;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 13.5px;
		font-weight: 600;
	}
	.iv-fc dd small {
		display: block;
		font-family: var(--f-body, inherit);
		font-size: 11px;
		font-weight: 400;
		color: var(--ink-3);
	}
	.iv-foot {
		margin: 0;
		font-size: 11.5px;
		color: var(--ink-3);
		line-height: 1.4;
	}
	.iv-grid2 {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 14px;
	}
	.iv-bars {
		display: grid;
		gap: 10px;
	}
	.iv-brow {
		display: grid;
		gap: 4px;
	}
	.iv-btop {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 13px;
	}
	.iv-btop b {
		font-weight: 500;
	}
	.iv-btop span {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 12px;
		font-weight: 600;
		color: var(--ink-2);
	}
	.iv-btrack {
		height: 5px;
		border-radius: 99px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.iv-btrack i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--grad);
	}
	.iv-spark {
		width: 100%;
		height: 64px;
		display: block;
	}
	.iv-spark polygon {
		fill: color-mix(in oklab, var(--g1) 18%, transparent);
	}
	.iv-spark polyline {
		fill: none;
		stroke: var(--g1);
		stroke-width: 2.2;
	}
	.iv-sp-line {
		margin: 0;
		font-size: 13.5px;
		color: var(--ink-2);
	}
	.iv-posts {
		display: grid;
		gap: 9px;
	}
	.iv-post {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 10px 11px;
		border-radius: 13px;
		background: var(--surface-2);
		border: 1px solid var(--line);
		text-decoration: none;
		color: inherit;
	}
	.iv-post img,
	.iv-post-ph {
		width: 42px;
		height: 54px;
		border-radius: 9px;
		object-fit: cover;
		flex: none;
	}
	.iv-post-ph {
		display: grid;
		place-items: center;
		background: linear-gradient(155deg, #3a254b, #5b2444 55%, #2b1f2e);
		color: var(--ink-2);
	}
	.iv-pm {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.iv-pm b {
		font-size: 13.5px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.iv-pm small {
		font-size: 11.5px;
		color: var(--ink-3);
	}
	.iv-pn {
		text-align: right;
		font-family: var(--f-mono, ui-monospace, monospace);
		flex: none;
		display: grid;
		gap: 2px;
	}
	.iv-pn b {
		font-size: 13.5px;
	}
	.iv-pn small {
		font-size: 10.5px;
		color: var(--ok);
	}
	@media (max-width: 640px) {
		.iv-tw {
			display: none;
		}
		.iv-cards {
			display: grid;
		}
	}
</style>
