<script lang="ts">
	import type { Collab } from '../types';
	import { delivText, inr, inrS, nextLine, unreadFor } from '../util';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';

	// One collab as a list row on the phone: who, what, how much, and what happens next.
	let { c }: { c: Collab } = $props();
	const n = $derived(nextLine(c));
	const unread = $derived(unreadFor(c));
	const money = $derived(c.type === 'barter' ? `Barter ${inrS(c.product_value)}` : c.fee ? inr(c.fee) : 'Quote needed');
</script>

<a class="m-crow" href="/studio/c/{c.code}">
	<Mono name={c.brand.name} />
	<span class="m-cr-b">
		<span class="m-cr-t"><b>{c.brand.name}</b><span class="m-cr-amt" class:muted={!c.fee && c.type !== 'barter'}>{money}</span></span>
		<span class="m-cr-s">{delivText(c.deliverables)}{c.type === 'hybrid' ? ' · + product' : ''}</span>
		<span class="m-cr-n {n.tone}"><Icon name={n.icon} />{n.text}</span>
	</span>
	{#if unread}<span class="m-dot" aria-label="{unread} unread">{unread}</span>{:else if c.stage === 'request'}<span class="new-badge">NEW</span>{/if}
	<Icon name="chevR" class="m-chev" />
</a>
