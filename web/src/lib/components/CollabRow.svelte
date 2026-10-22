<script lang="ts">
	import type { Collab } from '../types';
	import { delivText, hueOf, inr, inrS, nextLine, overdue, stageLabel, unreadFor } from '../util';
	import Icon from './Icon.svelte';
	import { loadBrandTrust, payHint, trust } from '../trust.svelte';

	// One collab on the phone board as a wallet card (CRED's card stack): the brand in its colour,
	// the money and where it stands on top, the next step at the bottom. Cards overlap in the list,
	// so the brand, amount and state stay readable on every one.
	let { c, i = 0 }: { c: Collab; i?: number } = $props();
	const n = $derived(nextLine(c));
	const unread = $derived(unreadFor(c));
	const late = $derived(overdue(c));
	// A barter shows what it's worth (never "₹0").
	const money = $derived(
		c.type === 'barter'
			? c.product_value ? inrS(c.product_value) : 'Barter'
			: c.fee
				? inr(c.fee)
				: 'Quote'
	);
	const state = $derived(late ? 'Overdue' : c.type === 'barter' ? `Barter · ${stageLabel(c.stage)}` : c.type === 'hybrid' ? `+ product · ${stageLabel(c.stage)}` : stageLabel(c.stage));
	// New requests: how this brand pays, from every creator's invoices.
	const pays = $derived(c.stage === 'request' || c.stage === 'negotiating' ? payHint(trust.brands[c.brand_id]) : '');
	$effect(() => {
		if (c.stage === 'request') loadBrandTrust();
	});
	const tag = $derived(unread ? `${unread} new` : c.stage === 'request' ? 'New' : '');
</script>

<a class="wc st-{c.stage}" href="/studio/c/{c.code}" style="--h:var(--m{hueOf(c.brand.name)});--i:{Math.min(i, 8)}">
	<span class="wc-top">
		<span class="wc-bn">{c.brand.name}</span>
		<span class="wc-money">{#if late}<i></i>{/if}{money}<small>{state}</small></span>
	</span>
	<span class="wc-meta">{c.code} · {c.retainer_id ? 'Monthly · ' : ''}{delivText(c.deliverables) || 'Details to fill'}{pays ? ` · ${pays}` : ''}</span>
	<span class="wc-foot">
		<span class="wc-next"><Icon name={n.icon} /><span>{n.text}</span></span>
		{#if tag}<span class="wc-tag">{tag.toUpperCase()}</span>{/if}
	</span>
</a>
