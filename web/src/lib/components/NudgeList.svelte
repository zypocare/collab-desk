<script lang="ts">
	import { nudgesFor, type Nudge } from '../nudges';
	import { studio } from '../studio.svelte';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';
	import NudgeSheet from './NudgeSheet.svelte';

	// Today: brands that have gone quiet, each with a one-tap AI-written nudge.
	let { phone = false }: { phone?: boolean } = $props();
	const all = $derived(nudgesFor(studio.collabs));
	let showAll = $state(false);
	const shown = $derived(showAll ? all : all.slice(0, 4));
	let open = $state<Nudge | null>(null);
	const ICON: Record<string, string> = { payment: 'wallet', product: 'box', draft: 'film', quote: 'rupee', brief: 'doc', quiet: 'mail' };
</script>

{#if all.length}
	<section class={phone ? 'hs' : 'panel rv nudges'} style={phone ? '' : '--i:3'}>
		{#if phone}
			<header class="hs-h"><h2>Gentle nudges</h2><span class="m-gn">{all.length}</span><span class="ai-tag"><Icon name="spark" />AI</span></header>
		{:else}
			<div class="panel-h"><h2>Gentle nudges <span class="ai-tag"><Icon name="spark" />AI</span></h2><small>brands that have gone quiet</small></div>
		{/if}
		<div class="nd-list">
			{#each shown as n (n.c.id + n.kind)}
				<div class="nd-row k-{n.kind}">
					<span class="nd-av"><Mono name={n.c.brand.name} /><i><Icon name={ICON[n.kind]} /></i></span>
					<span class="nd-t"><b>{n.c.brand.name}</b><small>{n.why}{n.tries ? ` · nudged ${n.tries}×` : ''}</small></span>
					<button class="nd-go" onclick={() => (open = n)}><Icon name="spark" />Nudge</button>
				</div>
			{/each}
		</div>
		{#if all.length > 4}<button class="lnk nd-more" onclick={() => (showAll = !showAll)}>{showAll ? 'Show fewer' : `Show all ${all.length}`}</button>{/if}
	</section>
{/if}
{#if open}<NudgeSheet n={open} onclose={() => (open = null)} />{/if}
