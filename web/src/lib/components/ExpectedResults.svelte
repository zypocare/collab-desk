<script lang="ts">
	import { expectedResults } from '../expected';
	import { pub } from '../publicPage.svelte';
	import { compact, inr } from '../util';
	import Icon from './Icon.svelte';

	// "What you can expect": views, reach and cost per view for these deliverables, from her real averages.
	let { lines, cost, compactView = false }: { lines: { kind: string; qty: number }[]; cost: number; compactView?: boolean } = $props();
	const e = $derived(expectedResults(lines, cost, pub.data, pub.ins));
	const rupee = (n: number) => (n < 10 ? `₹${n.toFixed(2)}` : inr(n));
</script>

{#if e}
	{#if compactView}
		<span class="exp-mini" title="Estimate from {e.basis}">≈ {compact(e.views)} views{#if e.cpm} · {rupee(e.cpm)} per 1K views{/if}</span>
	{:else}
		<div class="exp-box" aria-label="What you can expect">
			<span class="exp-h"><Icon name="chart" />What you can expect</span>
			<div class="exp-nums">
				<div><b>≈ {compact(e.views)}</b><small>views</small></div>
				<div><b>≈ {compact(e.reach)}</b><small>accounts reached</small></div>
				{#if e.engagements}<div><b>≈ {compact(e.engagements)}</b><small>likes, comments, saves</small></div>{/if}
				{#if e.cpv}<div><b>{rupee(e.cpv)}</b><small>per view</small></div>{/if}
				{#if e.cpm}<div><b>{rupee(e.cpm)}</b><small>per 1,000 views</small></div>{/if}
				{#if e.cpe}<div><b>{rupee(e.cpe)}</b><small>per engagement</small></div>{/if}
			</div>
			<small class="exp-basis">Estimate from {e.basis}, verified from Instagram. Actual results vary.</small>
		</div>
	{/if}
{/if}
