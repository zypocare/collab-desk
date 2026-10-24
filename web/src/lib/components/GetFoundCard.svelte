<script lang="ts">
	import { onMount } from 'svelte';
	import { loadPageViews, pageViews, summarise } from '../pageViews.svelte';
	import { studio } from '../studio.svelte';
	import Icon from './Icon.svelte';

	// On the phone's My page hub: how many people opened her page this month, where they came from, and
	// one way in to the full Get found screen.
	let { onopen }: { onopen: () => void } = $props();
	onMount(() => {
		if (!pageViews.loaded) loadPageViews();
	});
	const sum = $derived(summarise(pageViews.rows));
	const max = $derived(Math.max(1, ...sum.sources.map((x) => x.views)));
	const hasBio = $derived(!!studio.settings?.bio?.trim());
</script>

<button class="gfc" onclick={onopen} aria-label="Get found: {sum.total} page views in 30 days. Open">
	<span class="gfc-top"><span class="gfc-eb">Get found</span><small>Last 30 days</small></span>
	<span class="gfc-main">
		<span class="gfc-n"><b>{sum.total}</b><small>{sum.total === 1 ? 'page view' : 'page views'}</small></span>
		{#if sum.sources.length}
			<span class="gfc-bars">
				{#each sum.sources as x (x.key)}
					<span class="gfc-bar"><span class="gfc-l">{x.label}</span><b>{x.views}</b><i style="width:{Math.max(6, (x.views / max) * 100)}%"></i></span>
				{/each}
			</span>
		{:else}
			<span class="gfc-empty">Views show here once people open your page.</span>
		{/if}
	</span>
	<span class="gfc-foot">
		<span class="gfc-st" class:ok={hasBio}><i></i>{hasBio ? 'About you is written' : 'Add a line about you'}</span>
		<span class="gfc-go">{hasBio ? 'Improve' : 'Write it'}<Icon name="chevR" /></span>
	</span>
</button>

<style>
	.gfc {
		display: grid;
		gap: 16px;
		width: 100%;
		margin-top: 16px;
		padding: 18px;
		border: 1px solid var(--line);
		border-radius: 22px;
		background: radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--g1) 16%, transparent), transparent 60%), var(--surface);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: transform 0.12s;
	}
	.gfc:active {
		transform: scale(0.985);
	}
	.gfc-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}
	.gfc-eb {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.17em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.gfc-top small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.gfc-main {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 18px;
		align-items: center;
	}
	.gfc-n {
		display: grid;
		gap: 2px;
		min-width: 74px;
	}
	.gfc-n b {
		font: 400 44px/1 var(--f-serif, Georgia, serif);
		font-variant-numeric: tabular-nums;
	}
	.gfc-n small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.gfc-bars {
		display: grid;
		gap: 8px;
		min-width: 0;
	}
	.gfc-bar {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-rows: auto 4px;
		column-gap: 8px;
		row-gap: 4px;
		font-size: 12.5px;
	}
	.gfc-l {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--ink-2);
	}
	.gfc-bar b {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.gfc-bar i {
		grid-column: 1 / -1;
		height: 4px;
		border-radius: 99px;
		background: linear-gradient(90deg, var(--g1), var(--g2));
	}
	.gfc-empty {
		font-size: 13px;
		color: var(--ink-3);
	}
	.gfc-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding-top: 14px;
		border-top: 1px dashed var(--line-strong, var(--line));
	}
	.gfc-st {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		font-size: 13px;
		color: var(--ink-2);
	}
	.gfc-st i {
		width: 8px;
		height: 8px;
		flex: none;
		border-radius: 50%;
		background: var(--warn);
	}
	.gfc-st.ok i {
		background: var(--ok);
	}
	.gfc-go {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex: none;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.gfc-go :global(.ic) {
		width: 16px;
		height: 16px;
	}
</style>
