<script lang="ts">
	import { studio } from '../studio.svelte';
	import { countUp } from '../ui.svelte';
	import { compact, fmt, fmtUpdated, mediaLabel } from '../util';
	import { change as pctChange, reachOk, type InsightsData } from '../insights';
	import { copyText } from '../ui.svelte';
	import Icon from './Icon.svelte';

	const ig = $derived(studio.ig);
	const hist = $derived(studio.followersHistory);
	const change = $derived.by(() => {
		if (hist.length < 2 || !ig?.followers) return null;
		const old = hist.find((h) => Date.parse(h.day) >= Date.now() - 30 * 864e5) ?? hist[0];
		return ig.followers - old.followers;
	});
	// Follower trend line, drawn to scale in a 100 × 32 box.
	const spark = $derived.by(() => {
		if (hist.length < 2) return '';
		const ys = hist.map((h) => h.followers), min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
		return hist.map((h, i) => `${(i / (hist.length - 1)) * 100},${30 - ((h.followers - min) / span) * 28}`).join(' ');
	});
	const t30 = $derived((ig?.insights as InsightsData | undefined)?.totals ?? {});
	const p30 = $derived((ig?.insights as InsightsData | undefined)?.prev ?? {});
	const brandOf = (id: string) => studio.collabs.find((c) => c.posts.some((p) => p.media.id === id))?.brand.name;
	const recent = $derived(studio.media.slice(0, 6));
</script>

{#if ig?.connected}
	<section class="panel glow rv" style="--i:7;margin-top:18px">
		<div class="panel-h"><h2>Instagram</h2><small>@{ig.username} · updated {ig.last_sync_at ? fmtUpdated(ig.last_sync_at) : ''}</small></div>
		<div class="ig-grid">
			<div class="ig-stat">
				<span class="lbl">Followers</span>
				<b class="big" use:countUp={{ value: ig.followers ?? 0 }}>{compact(ig.followers)}</b>
				{#if change !== null}<small class:up={change >= 0} class:down={change < 0}>{change >= 0 ? '+' : ''}{change.toLocaleString('en-IN')} in 30 days</small>{/if}
				{#if spark}<svg class="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points={spark} fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke" /></svg>{/if}
			</div>
			<div class="ig-stat"><span class="lbl">Engagement</span><b class="big">{ig.engagement_rate ?? '—'}%</b><small>last 12 posts</small></div>
			<div class="ig-stat"><span class="lbl">Avg. views</span><b class="big">{compact(ig.avg_views)}</b><small>avg. reach {compact(ig.avg_reach)}</small></div>
			{#if reachOk(t30)}
				{@const ch = pctChange(t30.reach, p30.reach)}
				<div class="ig-stat"><span class="lbl">Reached · 30 days</span><b class="big">{compact(t30.reach)}</b><small class:up={(ch ?? 0) >= 0} class:down={(ch ?? 0) < 0}>{ch !== null ? `${ch >= 0 ? '+' : ''}${ch}% vs last 30 days` : `${compact(t30.views)} views`}</small></div>
			{/if}
		</div>
		<div class="row-btns" style="border-top:0;padding-top:0"><a class="btn sm" href="/insights" target="_blank" rel="noopener"><Icon name="eye" />Insights page brands see</a><button class="btn sm ghost" onclick={() => copyText(`${location.origin}/insights`, 'Insights link copied. Send it to brands')}><Icon name="copy" />Copy link</button></div>
		<div class="ig-posts">
			{#each recent as m (m.id)}
				{@const brand = brandOf(m.id)}
				<a class="ig-post" href={m.permalink} target="_blank" rel="noopener" class:collab={!!brand}>
					<span class="lbl">{mediaLabel(m.media_type, m.product_type)} · {fmt(m.posted_at.slice(0, 10))}</span>
					<b>{compact(m.views ?? m.reach)}</b><small>{m.views !== null ? 'views' : 'reach'}</small>
					{#if brand}<span class="pill tint k-live">{brand}</span>{/if}
				</a>
			{/each}
		</div>
	</section>
{/if}
