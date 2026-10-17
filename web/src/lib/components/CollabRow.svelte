<script lang="ts">
	import type { Collab } from '../types';
	import { delivText, inr, inrS, nextLine, unreadFor } from '../util';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';

	// One collab as a card on the phone (the same look as Home): who, what, the money, and what
	// happens next. New requests and unread messages get the bright story ring.
	let { c, i = 0 }: { c: Collab; i?: number } = $props();
	const n = $derived(nextLine(c));
	const unread = $derived(unreadFor(c));
	const fresh = $derived(c.stage === 'request' || unread > 0);
	// A barter shows what it's worth (never "₹0").
	const money = $derived(
		c.type === 'barter'
			? c.product_value ? `Barter · ${inrS(c.product_value)}` : 'Barter'
			: c.fee
				? `${inr(c.fee)}${c.type === 'hybrid' ? ' + product' : ''}`
				: 'Quote needed'
	);
</script>

<a class="m-ccard st-{c.stage}" href="/studio/c/{c.code}" style="--i:{Math.min(i, 8)}">
	<span class="m-cc-av" class:fresh><Mono name={c.brand.name} /></span>
	<span class="m-cc-b">
		<span class="m-cc-t">
			<b>{c.brand.name}</b>
			{#if unread}<span class="m-dot" aria-label="{unread} unread">{unread}</span>{:else if c.stage === 'request'}<span class="new-badge">NEW</span>{/if}
		</span>
		<span class="m-cc-s">{c.retainer_id ? 'Monthly · ' : ''}{delivText(c.deliverables)}</span>
		<span class="m-cc-f">
			<span class="m-cc-money" class:soft={c.type === 'barter' || !c.fee}>{money}</span>
			<span class="m-cc-n {n.tone}"><Icon name={n.icon} />{n.text}</span>
		</span>
	</span>
	<Icon name="chevR" class="m-cc-go" />
</a>
