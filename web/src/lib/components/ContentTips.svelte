<script lang="ts">
	import { sponsoredLine, type InsightsData } from '../insights';
	import { studio } from '../studio.svelte';
	import { postingTimeInsights, slotLabel, postingEvidence } from '../postTime';
	import { compact } from '../util';
	import Icon from './Icon.svelte';

	// What her own numbers say about planning content: when to post, what works, what people keep.
	const ins = $derived((studio.ig?.insights ?? null) as InsightsData | null);
	const bt = $derived(postingTimeInsights(studio.media));
	const topics = $derived(ins?.topics ?? []);
	const reels = $derived(ins?.formats?.reels ?? null);
	const spLine = $derived(sponsoredLine(ins?.sponsored ?? null));
	const bandMax = $derived(Math.max(1, ...(bt?.bands ?? []).map((b) => b.typical)));
	const dayMax = $derived(Math.max(1, ...(bt?.days ?? []).map((b) => b.typical)));
	const topMax = $derived(Math.max(1, ...topics.map((t) => t.med_views ?? 0)));
	const has = $derived(!!(bt.recommendation || topics.length || reels?.save_rate != null || spLine));
	const pct = (v: number | null | undefined, max: number) => Math.max(6, Math.round(((v ?? 0) / max) * 100));
</script>

{#if studio.ig?.connected && has}
	<!-- Phone: CRED's look. Each tip a card: a line in serif, then the numbers as capsules or a ranking. -->
	<section class="hs tp">
		<header class="hs-h"><h2>Content tips</h2><span class="tp-from">from your own posts</span></header>
		{#if bt.recommendation}
			<article class="tp-card">
				<span class="tp-eb"><i><Icon name="cal" /></i>Best time to post</span>
				<p class="tp-say">Try posting <em>{slotLabel(bt.recommendation)}</em>.</p>
				<div class="tp-cols tp-bands">
					{#each bt.bands as b (b.k)}
						<div class="tp-col" class:best={b.k === bt.best_band}>
							<b>{compact(b.typical)}</b>
							<span class="tp-track"><i style="height:{pct(b.typical, bandMax)}%"></i></span>
							<span class="tp-lbl">{b.k.split('–')[0]}<small>to {b.k.split('–')[1]}</small></span>
						</div>
					{/each}
				</div>
				<div class="tp-cols tp-days">
					{#each bt.days as dd (dd.k)}
						<div class="tp-col" class:best={dd.k === bt.best_day} title="{dd.posts} posts">
							<span class="tp-track"><i style="height:{pct(dd.typical, dayMax)}%"></i></span>
							<span class="tp-lbl">{dd.k}</span>
						</div>
					{/each}
				</div>
				<small class="tp-hint">{postingEvidence(bt.recommendation)}</small>
			</article>
		{/if}
		{#if topics.length}
			<article class="tp-card">
				<span class="tp-eb"><i><Icon name="spark" /></i>What performs best</span>
				<p class="tp-say"><em>{topics[0].k}</em> wins{topics[1] ? `, then ${topics[1].k.toLowerCase()}` : ''}.</p>
				<ol class="tp-rank">
					{#each topics as t, i (t.k)}
						<li class:top={i === 0}>
							<span class="tp-n">{String(i + 1).padStart(2, '0')}</span>
							<span class="tp-t"><b>{t.k}</b><small>{t.posts} post{t.posts === 1 ? '' : 's'}</small><span class="tp-bar"><i style="width:{pct(t.med_views, topMax)}%"></i></span></span>
							<b class="tp-v">{compact(t.med_views)}</b>
						</li>
					{/each}
				</ol>
				<small class="tp-hint">Typical views per post, by topic in the caption and hashtags.</small>
			</article>
		{/if}
		{#if reels && (reels.save_rate != null || reels.share_rate != null)}
			<article class="tp-card">
				<span class="tp-eb"><i><Icon name="check" /></i>Saves and shares on Reels</span>
				<div class="tp-nums">
					<div><b>{reels.save_rate ?? '—'}<small>%</small></b><span>saved</span></div>
					<div><b>{reels.share_rate ?? '—'}<small>%</small></b><span>shared</span></div>
				</div>
				<small class="tp-hint">Per 100 accounts reached. Saves and shares are the strongest sign people found it useful, and Instagram shows those Reels to more people.</small>
			</article>
		{/if}
		{#if spLine}
			<article class="tp-card">
				<span class="tp-eb"><i><Icon name="chart" /></i>Sponsored vs regular</span>
				<p class="tp-say tp-say-sm">{spLine}.</p>
				<small class="tp-hint">Typical post of each. Brands see this on your insights page.</small>
			</article>
		{/if}
	</section>
{/if}

<style>
	.tp-bands {
		grid-auto-columns: minmax(76px, 1fr);
		overflow-x: auto;
		padding-bottom: 8px;
	}
</style>
