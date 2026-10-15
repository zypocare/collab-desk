<script lang="ts">
	import { studio } from '../studio.svelte';
	import { countUp } from '../ui.svelte';
	import { compact, fmt } from '../util';

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
	const brandOf = (id: string) => studio.collabs.find((c) => c.posts.some((p) => p.media.id === id))?.brand.name;
	const recent = $derived(studio.media.slice(0, 6));
</script>

{#if ig?.connected}
	<section class="panel glow rv" style="--i:7;margin-top:18px">
		<div class="panel-h"><h2>Instagram</h2><small>@{ig.username} · updated {ig.last_sync_at ? fmt(ig.last_sync_at.slice(0, 10)) : ''}</small></div>
		<div class="ig-grid">
			<div class="ig-stat">
				<span class="lbl">Followers</span>
				<b class="big" use:countUp={{ value: ig.followers ?? 0 }}>{compact(ig.followers)}</b>
				{#if change !== null}<small class:up={change >= 0} class:down={change < 0}>{change >= 0 ? '+' : ''}{change.toLocaleString('en-IN')} in 30 days</small>{/if}
				{#if spark}<svg class="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points={spark} fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke" /></svg>{/if}
			</div>
			<div class="ig-stat"><span class="lbl">Engagement</span><b class="big">{ig.engagement_rate ?? '—'}%</b><small>last 12 posts</small></div>
			<div class="ig-stat"><span class="lbl">Avg. views</span><b class="big">{compact(ig.avg_views)}</b><small>avg. reach {compact(ig.avg_reach)}</small></div>
		</div>
		<div class="ig-posts">
			{#each recent as m (m.id)}
				{@const brand = brandOf(m.id)}
				<a class="ig-post" href={m.permalink} target="_blank" rel="noopener" class:collab={!!brand}>
					<span class="lbl">{m.product_type === 'REELS' ? 'Reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : 'Post'} · {fmt(m.posted_at.slice(0, 10))}</span>
					<b>{compact(m.views ?? m.reach)}</b><small>{m.views !== null ? 'views' : 'reach'}</small>
					{#if brand}<span class="pill tint k-live">{brand}</span>{/if}
				</a>
			{/each}
		</div>
	</section>
{/if}
