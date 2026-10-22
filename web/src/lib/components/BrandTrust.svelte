<script lang="ts">
	import { onMount } from 'svelte';
	import { brandChips, loadBrandTrust, trust } from '../trust.svelte';
	import type { Collab } from '../types';

	// How this brand pays, across every creator on Miracle: on time or late, a real GST number,
	// a verified Instagram. A brand with no history gets a nudge to ask for an advance.
	let { c, onquote }: { c: Collab; onquote?: () => void } = $props();
	onMount(() => loadBrandTrust());
	const t = $derived(trust.loaded ? brandChips(trust.brands[c.brand_id], c.brand.gstin) : null);
	const early = $derived((c.stage === 'request' || c.stage === 'negotiating') && !c.quotes.some((q) => q.status === 'accepted'));
</script>

{#if t}
	<div class="bt" class:risky={t.risky}>
		<div class="bt-chips">
			{#each t.chips as ch (ch.text)}<span class="bt-chip {ch.tone}">{ch.text}</span>{/each}
		</div>
		{#if t.line}<small>{t.line}</small>{/if}
		{#if t.fresh && early && onquote}<button class="btn sm" onclick={onquote}>Quote with 50% advance</button>{/if}
	</div>
{/if}

<style>
	.bt {
		display: grid;
		gap: 8px;
		margin-top: 10px;
		justify-items: start;
	}
	.bt-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.bt-chip {
		padding: 5px 10px;
		border-radius: 99px;
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
	}
	.bt-chip.ok {
		background: color-mix(in oklab, var(--ok) 15%, transparent);
		color: var(--ok);
	}
	.bt-chip.warn {
		background: color-mix(in oklab, var(--warn) 15%, transparent);
		color: var(--warn);
	}
	.bt-chip.bad {
		background: color-mix(in oklab, var(--bad) 15%, transparent);
		color: var(--bad);
	}
	.bt-chip.info {
		background: color-mix(in oklab, var(--m5, #9c7bff) 18%, transparent);
		color: var(--m5, #9c7bff);
	}
	.bt small {
		font-size: 12px;
		line-height: 1.45;
		color: var(--ink-3);
	}
</style>
