<script lang="ts">
	import { milestones } from '../campaign';
	import type { BrandRequest } from '../types';
	import { delivText, hueOf, inr, inrS } from '../util';
	import Icon from './Icon.svelte';

	// One request on the brand's board as the creator's wallet card (CollabRow): the creator in their
	// colour, the money and where it stands on top, the next step at the bottom.
	let { r, creator, unread = 0, i = 0 }: { r: BrandRequest; creator: string; unread?: number; i?: number } = $props();
	const next = $derived(milestones(r, creator || 'the creator').find((m) => m.who !== 'done'));
	const mine = $derived(next?.who === 'you');
	const money = $derived(r.type === 'barter' ? (r.product_value ? inrS(r.product_value) : 'Barter') : r.fee ? inr(r.fee) : 'Quote');
	const state = $derived(r.type === 'barter' ? `Barter · ${r.stage_label}` : r.type === 'hybrid' ? `+ product · ${r.stage_label}` : r.stage_label);
	const tag = $derived(unread ? `${unread} new` : mine ? 'Your turn' : '');
</script>

<a class="wc st-{r.stage}" href="/brand/r/{r.code}" style="--h:var(--m{hueOf(r.code)});--i:{Math.min(i, 8)}">
	<span class="wc-top">
		<span class="wc-bn">{delivText(r.deliverables) || 'New request'}</span>
		<span class="wc-money">{#if mine}<i></i>{/if}{money}<small>{state}</small></span>
	</span>
	<span class="wc-meta">{r.code}{creator ? ` · with ${creator}` : ''}</span>
	<span class="wc-foot">
		<span class="wc-next"><Icon name={mine ? 'bell' : 'clock'} /><span>{next ? (mine ? next.title : `${creator || 'Creator'}: ${next.title}`) : 'All done'}</span></span>
		{#if tag}<span class="wc-tag">{tag.toUpperCase()}</span>{/if}
	</span>
</a>
