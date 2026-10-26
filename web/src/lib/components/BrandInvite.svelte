<script lang="ts">
	import { auth } from '../auth.svelte';
	import { inviteLink } from '../invite';
	import { firstName } from '../util';
	import Logo from './Logo.svelte';

	// At the foot of what a brand gets from a creator (invoice, quote, agreement, report): Miracle for
	// their own side of the work, with her as the one who invited them. Not for a brand already on Miracle.
	let { creator = '', from }: { creator?: string; from: string } = $props();
	const show = $derived(auth.account?.role !== 'brand');
	const who = $derived(firstName(creator) || 'Your creator');
</script>

{#if show}
	<aside class="bi no-print" aria-label="Miracle for brands">
		<span class="bi-logo"><Logo size={30} /></span>
		<div class="bi-t">
			<small>{who} runs collabs on Miracle</small>
			<b>Run all your creator collabs in one place</b>
			<span>Briefs, approvals, invoices and results for every creator you work with. Free for brands, and creators are paid directly: no commission.</span>
		</div>
		<a class="bi-go" href={inviteLink('brand', from)}>Try it free</a>
	</aside>
{/if}

<style>
	.bi { display: flex; align-items: center; gap: 16px; margin: 22px 0 8px; padding: 16px 18px; border-radius: 18px; background: var(--hero); color: var(--hero-ink); box-shadow: var(--shadow); }
	.bi-logo { width: 46px; height: 46px; flex: none; border-radius: 13px; display: grid; place-items: center; background: color-mix(in oklab, var(--hero-ink) 8%, transparent); }
	.bi-t { display: grid; gap: 3px; flex: 1; min-width: 0; }
	.bi-t small { font: 700 10.5px/1.2 var(--f-body); letter-spacing: .14em; text-transform: uppercase; color: color-mix(in oklab, var(--hero-ink) 62%, transparent); }
	.bi-t b { font: 400 21px/1.15 var(--f-serif); }
	.bi-t span { font-size: 13px; line-height: 1.45; color: color-mix(in oklab, var(--hero-ink) 75%, transparent); }
	.bi-go { flex: none; padding: 12px 18px; background: var(--grad); color: var(--on-grad); font: 700 12.5px/1 var(--f-body); letter-spacing: .08em; text-transform: uppercase; text-decoration: none; white-space: nowrap; box-shadow: 4px 4px 0 color-mix(in oklab, var(--hero-ink) 22%, transparent); transition: transform .12s, box-shadow .12s; }
	.bi-go:active { transform: translate(4px, 4px); box-shadow: none; }
	@media (max-width: 560px) {
		.bi { flex-wrap: wrap; }
		.bi-t { flex-basis: calc(100% - 62px); }
		.bi-go { margin-left: 62px; }
	}
</style>
