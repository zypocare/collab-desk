<script lang="ts">
	import { studio } from '../studio.svelte';
	import Icon from './Icon.svelte';

	// Tracks the ratio of organic discovery posts vs sponsored/collab posts across the last 10 posts.
	// Back-to-back sponsored Reels often reduce non-follower reach; a 3:1 organic-to-collab balance keeps discovery healthy.
	const linkedIds = $derived.by(() => {
		const ids = new Set<string>();
		for (const c of studio.collabs) {
			for (const p of c.posts ?? []) {
				if (p.media?.id) ids.add(p.media.id);
			}
		}
		return ids;
	});

	const recent = $derived(studio.media.slice(0, 10));

	const breakdown = $derived.by(() => {
		if (recent.length < 3) return null;
		const tagged = recent.map((m) => {
			const cap = (m.caption ?? '').toLowerCase();
			const isCollab = linkedIds.has(m.id) || /(#ad\b|#collab\b|#sponsored\b|paid partnership|\bcollab with\b)/.test(cap);
			return { id: m.id, isCollab };
		});
		const collabCount = tagged.filter((x) => x.isCollab).length;
		const organicCount = tagged.length - collabCount;
		const lastThreeCollabs = tagged.slice(0, 3).filter((x) => x.isCollab).length;
		const heavy = lastThreeCollabs >= 2 || collabCount / tagged.length > 0.4;
		return { total: tagged.length, collabCount, organicCount, lastThreeCollabs, heavy, dots: tagged };
	});
</script>

{#if breakdown}
	<section class="fb rv" class:warn={breakdown.heavy} aria-label="Discovery vs collab balance">
		<div class="fb-top">
			<div class="fb-title">
				<span class="fb-ic"><Icon name={breakdown.heavy ? 'alert' : 'chart'} /></span>
				<div>
					<b>{breakdown.heavy ? 'Feed is heavy on collabs' : 'Healthy discovery mix'}</b>
					<small>Last {breakdown.total} posts · {breakdown.organicCount} organic · {breakdown.collabCount} collab</small>
				</div>
			</div>
			<a class="fb-cta" href="/studio/grow/studio">
				<span>{breakdown.heavy ? 'Plan organic Reel' : 'Script Studio'}</span>
				<Icon name="chevR" />
			</a>
		</div>

		<div class="fb-dots" aria-hidden="true">
			{#each breakdown.dots as d (d.id)}
				<span class="fb-bar" class:collab={d.isCollab} title={d.isCollab ? 'Collab post' : 'Organic discovery post'}></span>
			{/each}
		</div>

		<p class="fb-note">
			{#if breakdown.heavy}
				{breakdown.lastThreeCollabs >= 2
					? `${breakdown.lastThreeCollabs} of your last 3 posts were collabs.`
					: 'Over 40% of your recent feed is sponsored.'} Post 1 high-share organic Reel next to pull in non-followers.
			{:else}
				Strong balance for follower growth. Keep at least 2–3 organic discovery Reels between sponsored posts.
			{/if}
		</p>
	</section>
{/if}

<style>
	.fb {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 16px;
		padding: 13px 14px;
		display: grid;
		gap: 10px;
	}
	.fb.warn {
		border-color: color-mix(in oklab, var(--warn) 45%, var(--line));
		background: linear-gradient(125deg, color-mix(in oklab, var(--warn) 10%, var(--surface)), var(--surface) 70%);
	}
	.fb-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
	}
	.fb-title {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.fb-ic {
		width: 32px;
		height: 32px;
		border-radius: 10px;
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		display: grid;
		place-items: center;
		color: var(--ok);
		flex-shrink: 0;
	}
	.fb.warn .fb-ic {
		color: var(--warn);
		border-color: color-mix(in oklab, var(--warn) 48%, var(--line));
	}
	.fb-title b {
		display: block;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--ink);
	}
	.fb-title small {
		display: block;
		font-size: 11.5px;
		color: var(--ink-3);
	}
	.fb-cta {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 6px 10px;
		border-radius: 99px;
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		color: var(--ink);
		font-size: 11.5px;
		font-weight: 600;
		text-decoration: none;
		white-space: nowrap;
	}
	.fb-cta:hover {
		border-color: var(--g1);
	}
	.fb-dots {
		display: grid;
		grid-template-columns: repeat(10, 1fr);
		gap: 5px;
	}
	.fb-bar {
		height: 6px;
		border-radius: 99px;
		background: var(--ok);
		opacity: 0.85;
	}
	.fb-bar.collab {
		background: var(--g2);
		opacity: 0.9;
	}
	.fb-note {
		margin: 0;
		font-size: 12px;
		line-height: 1.42;
		color: var(--ink-2);
	}
</style>
