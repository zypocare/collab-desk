<script lang="ts">
	import type { BriefDetails } from '../types';

	let { d }: { d: BriefDetails } = $props();
	const rows = $derived(
		[
			{ k: 'Key message', v: d.message },
			{ k: "Do's", v: d.dos },
			{ k: "Don'ts", v: d.donts },
			{ k: 'Link', v: d.link },
			{ k: 'Promo code', v: d.promo },
			{ k: 'References', v: d.references }
		].filter((r) => r.v)
	);
</script>

<div class="brief-view">
	{#if d.hashtags?.length || d.mentions?.length}
		<div class="tag-chips">{#each [...(d.mentions ?? []), ...(d.hashtags ?? [])] as t (t)}<span>{t}</span>{/each}</div>
	{/if}
	{#each rows as r (r.k)}
		<div><span class="lbl-t">{r.k}</span><p>{r.v}</p></div>
	{/each}
</div>
