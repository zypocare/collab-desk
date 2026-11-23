<script lang="ts" generics="T extends string">
	import type { Snippet } from 'svelte';
	let { id, title, href, linkLabel, filters, selected, onselect, filterLabel, children }: {
		id: string; title: string; href: string; linkLabel: string; filterLabel: string;
		filters: { id: T; label: string; count: number }[]; selected: T;
		onselect: (id: T) => void; children: Snippet;
	} = $props();
	let rail: HTMLElement;
	function select(id: T) {
		onselect(id);
		rail.scrollLeft = 0;
	}
</script>

<section class="tix" {id} aria-label={title}>
	<div class="tix-h"><h2>{title}</h2><a {href}>{linkLabel} →</a></div>
	{#if filters.length}
		<div class="tix-filters" role="group" aria-label={filterLabel}>
			{#each filters as f (f.id)}
				<button type="button" class="tix-flt" class:on={selected === f.id} aria-pressed={selected === f.id} onclick={() => select(f.id)}>{f.label} <b>{f.count}</b></button>
			{/each}
		</div>
	{/if}
	<div class="tix-row" bind:this={rail}>{@render children()}</div>
</section>
