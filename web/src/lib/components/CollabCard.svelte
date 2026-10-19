<script lang="ts">
	import type { Collab } from '../types';
	import { isRanked } from '../priority';
	import { priorityOf } from '../studio.svelte';
	import { ui } from '../ui.svelte';
	import { delivText, diff, fmt, hueOf, inr, inrS, nextLine, stageIndex, stageLabel, unreadFor } from '../util';
	import Icon from './Icon.svelte';
	import { nextStep } from '../suggest';
	import PriorityBadge from './PriorityBadge.svelte';
	import Mono from './Mono.svelte';
	import PayPill from './PayPill.svelte';

	let {
		c,
		i = 0,
		pop = false,
		selecting = false,
		picked = false,
		onpick
	}: { c: Collab; i?: number; pop?: boolean; selecting?: boolean; picked?: boolean; onpick?: () => void } = $props();
	// In select mode a tap picks the card instead of opening it.
	const open = () => (selecting ? onpick?.() : (ui.openCollab = c.id));

	const n = $derived(nextLine(c));
	const prio = $derived(isRanked(c) ? priorityOf(c) : null);
	const unread = $derived(unreadFor(c));
	const step = $derived(nextStep(c));
	const done = $derived(c.deliverables.filter((d) => d.done).length);
	const showProg = $derived(stageIndex(c.stage) >= 2 && stageIndex(c.stage) <= 4 && c.deliverables.length > 0);
	const followTone = $derived(c.follow_date ? (diff(c.follow_date) < 0 ? 'late' : diff(c.follow_date) === 0 ? 'soon' : '') : '');
	let dragging = $state(false);
</script>

<div
	class="card glow"
	class:dragging
	class:pop
	class:picking={selecting}
	class:picked
	draggable={!selecting}
	tabindex="0"
	role="button"
	aria-pressed={selecting ? picked : undefined}
	style="--i:{i};--h:var(--m{hueOf(c.brand.name)})"
	aria-label="{c.brand.name}, {stageLabel(c.stage)}"
	ondragstart={(e) => {
		e.dataTransfer?.setData('text/plain', c.id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		requestAnimationFrame(() => (dragging = true));
	}}
	ondragend={() => (dragging = false)}
	onclick={open}
	onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
>
	{#if selecting}<span class="pick-box" aria-hidden="true">{#if picked}<Icon name="check" />{/if}</span>{/if}
	<div class="card-h">
		<Mono name={c.brand.name} />
		<div><b>{c.brand.name}</b><small><span class="id">{c.code}</span> · {c.brand.category}</small></div>
		{#if unread}<span class="msg-dot" title="{unread} unread message{unread > 1 ? 's' : ''}"><Icon name="mail" />{unread}</span>{:else if c.stage === 'request'}<span class="new-badge">NEW</span>{/if}
	</div>
	<div class="deliv">{delivText(c.deliverables)}</div>
	{#if showProg}
		<div class="dprog" title="{done} of {c.deliverables.length} deliverables done"><i style="--p:{done / c.deliverables.length}"></i></div>
	{/if}
	<div class="chips">
		{#if prio}<PriorityBadge p={prio} compact />{/if}
		{#if c.retainer_id}<span class="chip tint k-live" title="Part of a monthly deal"><Icon name="refresh" />Monthly</span>{/if}
		{#if c.package_name}<span class="chip tint k-quote" title="Booked package"><Icon name="gift" />{c.package_name}</span>{/if}
		{#if c.type === 'barter'}
			<span class="chip tint k-product"><Icon name="gift" />Barter · {inrS(c.product_value)}</span>
		{:else}
			<span class="chip money">{c.fee ? inr(c.fee) : 'Quote needed'}</span>
			{#if c.type === 'hybrid'}<span class="chip tint k-product"><Icon name="gift" />+ product</span>{/if}
		{/if}
	</div>
	<div class="next {n.tone}"><Icon name={n.icon} /><span>{n.text}</span></div>
	<div class="card-f">
		<PayPill {c} />
		{#if step && !selecting}
			<button
				class="card-next"
				title={step.hint}
				onclick={(e) => {
					e.stopPropagation();
					ui.pendingNext = step.key;
					ui.openCollab = c.id;
				}}
				onkeydown={(e) => e.stopPropagation()}><Icon name={step.icon} />{step.label}</button
			>
		{/if}
		{#if c.follow_date}<span class="flag {followTone}" title={c.follow_note}><Icon name="bell" />{fmt(c.follow_date)}</span>{/if}
	</div>
</div>
