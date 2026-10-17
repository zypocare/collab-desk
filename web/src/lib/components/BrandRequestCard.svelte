<script lang="ts">
	import { milestones } from '../campaign';
	import type { BrandRequest } from '../types';
	import { delivText, fmt, inr, stageIndex } from '../util';
	import Icon from './Icon.svelte';

	// Laptop: one of the brand's requests, with what was offered, where it stands and who acts next.
	let { r, creator, unread = 0 }: { r: BrandRequest; creator: string; unread?: number } = $props();
	const STEPS = ['Request', 'Talks', 'Agreed', 'Creating', 'Live', 'Done'];
	const declined = $derived(r.stage === 'declined');
	const si = $derived(declined ? -1 : stageIndex(r.stage));
	const next = $derived(declined ? null : milestones(r, creator || 'the creator').find((m) => m.who !== 'done') ?? null);
	const offer = $derived(
		r.type === 'barter'
			? `Barter: ${r.product || 'product'}${r.product_value ? ` (${inr(r.product_value)})` : ''}`
			: r.type === 'hybrid'
				? `${r.fee ? inr(r.fee) : 'Fee to agree'} + ${r.product || 'product'}`
				: r.fee
					? inr(r.fee)
					: 'Asked for a quote'
	);
	const golive = $derived(r.live_date ?? r.preferred_live);
	const yours = $derived(next?.who === 'you');
</script>

<a class="brq" class:declined class:yours href="/brand/r/{r.code}">
	<div class="brq-main">
		<div class="brq-top">
			<span class="brq-code">{r.code}</span>
			<span class="brq-chip" class:bad={declined} class:live={r.stage === 'live' || r.stage === 'wrapped'}>{r.stage_label}</span>
			{#if unread}<span class="brq-msg"><Icon name="mail" />{unread} new message{unread === 1 ? '' : 's'}</span>{/if}
		</div>
		<b class="brq-t">{delivText(r.deliverables)}</b>
		<div class="brq-facts">
			<span><Icon name="rupee" />{offer}</span>
			<span><Icon name="cal" />{golive ? `Go-live ${fmt(golive)}` : 'Go-live to agree'}</span>
			<span><Icon name="clock" />Sent {fmt(r.received_on)}</span>
		</div>
		{#if declined}
			<p class="brq-note">{r.note_for_brand || `${creator || 'The creator'} can't take this one on right now.`}</p>
		{:else}
			<ol class="brq-steps" aria-label="Progress">
				{#each STEPS as label, k (label)}
					<li class:done={k < si} class:on={k === si}><i></i><span>{label}</span></li>
				{/each}
			</ol>
		{/if}
	</div>
	<div class="brq-side">
		{#if next}
			<small>{yours ? 'Waiting on you' : `Next, ${creator || 'the creator'}`}</small>
			<b>{next.title}</b>
			{#if next.date || next.note}<em>{next.note ?? ''}{next.note && next.date ? ' · ' : ''}{next.date ? fmt(next.date) : ''}</em>{/if}
		{:else if declined}
			<small>Closed</small>
			<b>Not going ahead</b>
		{:else}
			<small>All done</small>
			<b>Wrapped up</b>
		{/if}
		<span class="brq-open">Open <Icon name="chevR" /></span>
	</div>
</a>
