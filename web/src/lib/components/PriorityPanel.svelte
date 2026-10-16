<script lang="ts">
	import type { Collab } from '../types';
	import { TIER_LABEL } from '../priority';
	import { priorityOf, studio } from '../studio.svelte';
	import { copyText } from '../ui.svelte';
	import { delivText, firstName, inr } from '../util';
	import Icon from './Icon.svelte';

	let { c }: { c: Collab } = $props();
	const p = $derived(priorityOf(c));

	// A polite counter-offer she can paste into email or DM.
	const counter = $derived(
		p?.counterFee
			? `Hi ${firstName(c.contact_name) || c.brand.name}, thank you for thinking of me! I'd love to work with ${c.brand.name}. ` +
					`For ${delivText(c.deliverables)}, I usually work on a paid basis. With the product, I can do it for ${inr(p.counterFee)}. ` +
					`Happy to adjust the deliverables if that helps. ${firstName(studio.settings?.display_name ?? '')}`
			: ''
	);
</script>

{#if p}
	<section class="sec prio-sec">
		<h3>Priority</h3>
		<div class="prio-head">
			<div class="prio-meter prio-{p.tier}" style="--p:{p.score / 100}" aria-label="Priority score {p.score} out of 100"><b>{p.score}</b></div>
			<div>
				<b class="prio-t">{TIER_LABEL[p.tier]}</b>
				<small>Paid collabs come first, then paid + product, then barter. Change the rules in My page.</small>
			</div>
		</div>
		<ul class="prio-why">
			{#each p.reasons as r (r.text)}
				<li class:neg={r.pts < 0}><span>{r.pts > 0 ? '+' : ''}{r.pts}</span>{r.text}</li>
			{/each}
		</ul>
		{#if c.counter_status}
			<div class="prio-counter">
				<div>
					<b>{c.counter_status === 'taken' ? `Brand took ${inr(c.counter_fee ?? 0)} + product` : c.counter_status === 'kept' ? 'Brand kept it as barter' : `Auto-pilot offered ${inr(c.counter_fee ?? 0)} + product`}</b>
					<small>{c.counter_status === 'taken' ? 'Send a quote to confirm it.' : c.counter_status === 'kept' ? 'They saw your paid offer and chose barter.' : 'Waiting for the brand to switch or keep it as barter.'}</small>
				</div>
			</div>
		{:else if counter}
			<div class="prio-counter">
				<div>
					<b>Counter with a fee: {inr(p.counterFee)}</b>
					<small>Your rate card value for this, less the product's worth. A ready message to send:</small>
				</div>
				<p>{counter}</p>
				<button class="btn sm" onclick={() => copyText(counter, 'Message copied')}><Icon name="copy" />Copy message</button>
			</div>
		{/if}
	</section>
{/if}
