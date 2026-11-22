<script lang="ts">
	import { engagedShare, type InsightsData } from '../insights';
	import { fmt } from '../util';
	import Icon from './Icon.svelte';

	let { insights, badge = false }: { insights?: InsightsData | null; badge?: boolean } = $props();
	const metric = $derived(engagedShare(insights?.totals));
</script>

{#if metric}
	<details class="audience-rate" class:badge>
		<summary>
			<span class="rate"><strong>{metric.percent}%</strong> of accounts reached engaged</span>
			<small>{badge ? 'Last 30 days' : 'Last 30 days · Instagram Insights'}</small>
			<Icon name="chevD" />
		</summary>
		<p>{metric.engaged.toLocaleString('en-IN')} accounts engaged ÷ {metric.reached.toLocaleString('en-IN')} accounts reached × 100 = {metric.percent}%</p>
		{#if insights?.from && insights.to}<small>{fmt(insights.from)} – {fmt(insights.to)}</small>{/if}
	</details>
{/if}

<style>
	.audience-rate { color: var(--ink); font: 500 14px/1.4 var(--f-body); }
	summary { width: fit-content; max-width: 100%; min-height: 44px; display: grid; grid-template-columns: minmax(0,auto) auto; align-content: center; align-items: center; column-gap: 5px; cursor: pointer; list-style: none; }
	summary::-webkit-details-marker { display: none; }
	summary:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; border-radius: 3px; }
	strong { font-variant-numeric: tabular-nums; }
	small { grid-column: 1 / -1; font-size: 12px; color: var(--ink-2); }
	summary :global(svg) { grid-column: 2; grid-row: 1; width: 14px; height: 14px; }
	details[open] summary :global(svg) { transform: rotate(180deg); }
	p { margin: 4px 0 2px; font-size: 13px; }
	.badge summary { margin-left: auto; justify-items: center; grid-template-columns: auto 14px; gap: 4px; }
	.badge .rate {
		position: relative; grid-column: 1 / -1; display: grid; place-content: center; gap: 2px; box-sizing: border-box;
		width: 108px; height: 108px; padding: 13px; border-radius: 50%;
		background: linear-gradient(140deg, #352637, #221822);
		color: #f7eff5; text-align: center; font-size: 11px; line-height: 1.25;
	}
	.badge .rate::before {
		content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
		background: conic-gradient(from -40deg, var(--g1), var(--g3), var(--g2), var(--g1));
		mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
	}
	@media (prefers-reduced-motion: no-preference) {
		.badge .rate::before { animation: turn 8s linear infinite; }
	}
	@keyframes turn { to { transform: rotate(1turn); } }
	.badge strong { font: 750 24px/1.15 var(--f-body); }
	.badge small { grid-column: 1; }
	.badge summary :global(svg) { grid-row: 2; }
</style>
