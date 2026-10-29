<script lang="ts">
	import { canSell } from '../plan.svelte';
	import Icon from './Icon.svelte';

	// The upgrade, at the moment it's worth it: what Pro would do here, and the way to the plan page.
	let { title, body = '', side = 'creator', cta = '' }: { title: string; body?: string; side?: 'creator' | 'brand'; cta?: string } = $props();
	const href = $derived(side === 'brand' ? '/brand/settings?s=plan' : '/studio/settings?s=plan');
</script>

<a class="pn" {href}><span class="pn-in">
	<span class="pn-ic" aria-hidden="true"><Icon name="spark" /></span>
	<span class="pn-t">
		<small>{side === 'brand' ? 'Brand Pro' : 'Creator Pro'}</small>
		<b>{title}</b>
		{#if body}<span>{body}</span>{/if}
	</span>
	<span class="pn-go">{cta || (canSell() ? 'Upgrade' : 'Your plan')}<Icon name="chevR" /></span>
</span></a>

<style>
	.pn { display: block; container-type: inline-size; padding: 14px 16px; border-radius: 14px; text-decoration: none; color: var(--ink);
		background: linear-gradient(var(--surface), var(--surface)) padding-box, var(--grad) border-box; border: 1.5px solid transparent; transition: transform .15s var(--ease), box-shadow .15s; }
	.pn-in { display: flex; align-items: center; gap: 14px; }
	.pn:hover { box-shadow: var(--glow); }
	.pn:active { transform: scale(.985); }
	.pn-ic { width: 38px; height: 38px; flex: none; border-radius: 11px; display: grid; place-items: center; background: color-mix(in oklab, var(--g1) 16%, transparent); color: color-mix(in oklab, var(--g1) 70%, var(--ink)); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--g1) 32%, transparent);}
	.pn-ic :global(.ic) { width: 19px; height: 19px; }
	.pn-t { display: grid; gap: 2px; flex: 1; min-width: 0; }
	.pn-t small { font: 700 10.5px/1.2 var(--f-body); letter-spacing: .14em; text-transform: uppercase; color: var(--accent); }
	.pn-t b { font-size: 14.5px; line-height: 1.3; }
	.pn-t span { font-size: 13px; line-height: 1.4; color: var(--ink-3); }
	.pn-go { display: inline-flex; align-items: center; gap: 2px; flex: none; font: 700 12.5px/1 var(--f-body); color: var(--accent); white-space: nowrap; }
	.pn-go :global(.ic) { width: 15px; height: 15px; }
	/* Narrow (a phone, or a card inside a step): "Upgrade" goes under the words. */
	@container (max-width: 480px) { .pn-in { flex-wrap: wrap; row-gap: 8px; } .pn-t { flex-basis: calc(100% - 52px); } .pn-go { margin-left: 52px; } }
</style>
