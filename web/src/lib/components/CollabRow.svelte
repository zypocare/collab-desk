<script lang="ts">
	import type { Collab } from '../types';
	import { delivText, inr, inrS, nextLine, overdue, stageOf, unreadFor } from '../util';
	import WalletRow from './WalletRow.svelte';
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
	const state = $derived(late ? 'Overdue' : c.type === 'barter' ? `Barter · ${stageOf(c)}` : c.type === 'hybrid' ? `+ product · ${stageOf(c)}` : stageOf(c));
	// New requests: how this brand pays, from every creator's invoices.
	const pays = $derived(c.stage === 'request' || c.stage === 'negotiating' ? payHint(trust.brands[c.brand_id]) : '');
	$effect(() => {
		if (c.stage === 'request') loadBrandTrust();
	});
	const tag = $derived(unread ? `${unread} new` : c.stage === 'request' && !c.someday ? 'New' : '');
</script>

<WalletRow name={c.brand.name} stage={c.someday ? 'someday' : c.stage} href="/studio/c/{c.code}"
	{money} status={state} meta="{c.code} · {c.retainer_id ? 'Monthly · ' : ''}{delivText(c.deliverables) || 'Details to fill'}{pays ? ` · ${pays}` : ''}"
	icon={n.icon} next={n.text} {tag} attention={late} {i} />
