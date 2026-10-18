<script lang="ts">
	import { money } from '../currency';
	import type { QuoteChoice } from '../types';
	import { delivText } from '../util';
	import Icon from './Icon.svelte';

	// The brand picks one of the creator's options (Good / Better / Best); the middle one is marked.
	let { options, value = $bindable(0), currency }: { options: QuoteChoice[]; value?: number; currency?: string } = $props();
</script>

<div class="qc" role="radiogroup" aria-label="Choose an option">
	{#each options as o, i (i)}
		<button type="button" class="qc-opt" class:on={value === i} class:pop={o.popular} role="radio" aria-checked={value === i} onclick={() => (value = i)}>
			{#if o.popular}<span class="qc-pop">Most popular</span>{/if}
			<span class="qc-t">{o.title}</span>
			<b class="num">{money(o.total, currency)}</b>
			<small>{delivText(o.items.map((x) => ({ kind: x.kind, qty: x.qty })))}</small>
			{#if o.sub}<small class="qc-sub">{o.sub}</small>{/if}
			<span class="qc-tick" aria-hidden="true"><Icon name="check" /></span>
		</button>
	{/each}
</div>
