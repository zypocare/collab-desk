<script lang="ts">
	import { addressFor } from '../creatorHost';
	import { pageSlug } from '../supabase';
	import type { BrandRow } from '../types';
	import { fmt, hueOf, inr, inrS } from '../util';
	import Icon from './Icon.svelte';

	// One request in the brand's list as the creator's wallet card (CollabRow): the creator in their colour,
	// the money and where it stands on top, what waits on you at the bottom.
	let { r, i = 0 }: { r: BrandRow; i?: number } = $props();
	const href = $derived(r.creator.slug === pageSlug ? `/brand/r/${r.code}` : addressFor(r.creator.slug, `/brand/r/${r.code}`));
	const money = $derived(r.needs === 'quote' && r.quote_total ? inr(r.quote_total) : r.needs === 'pay' && r.invoice_amount ? inr(r.invoice_amount) : r.type === 'barter' ? (r.product_value ? inrS(r.product_value) : 'Barter') : r.fee ? inr(r.fee) : 'Quote');
	const next = $derived(
		r.needs === 'quote' ? 'Review the quote' : r.needs === 'draft' ? `Approve the draft${r.live_date ? ` · live ${fmt(r.live_date)}` : ''}` : r.needs === 'pay' ? `Pay the invoice${r.invoice_due ? ` · due ${fmt(r.invoice_due)}` : ''}` : r.unread ? `${r.unread} new message${r.unread === 1 ? '' : 's'}` : r.stage_label
	);
	const tag = $derived(r.needs ? 'Your turn' : r.unread ? `${r.unread} new` : '');
</script>

<a class="wc st-{r.stage}" {href} style="--h:var(--m{hueOf(r.creator.name)});--i:{Math.min(i, 8)}">
	<span class="wc-top">
		<span class="wc-bn">{r.creator.name}</span>
		<span class="wc-money">{#if r.needs}<i></i>{/if}{money}<small>{r.needs === 'quote' ? 'quote' : r.needs === 'pay' ? 'to pay' : r.stage_label}</small></span>
	</span>
	<span class="wc-meta">{r.code} · {r.deliverables || 'Details to fill'}</span>
	<span class="wc-foot">
		<span class="wc-next"><Icon name={r.needs ? 'bell' : r.unread ? 'send' : 'clock'} /><span>{next}</span></span>
		{#if tag}<span class="wc-tag">{tag.toUpperCase()}</span>{/if}
	</span>
</a>
