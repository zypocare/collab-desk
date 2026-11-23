<script lang="ts">
	import { milestones } from '../campaign';
	import type { BrandRequest } from '../types';
	import { delivText, inr, inrS } from '../util';
	import WalletRow from './WalletRow.svelte';

	// One request on the brand's board as the creator's wallet card (CollabRow): the creator in their
	// colour, the money and where it stands on top, the next step at the bottom.
	let { r, creator, unread = 0, i = 0 }: { r: BrandRequest; creator: string; unread?: number; i?: number } = $props();
	const next = $derived(milestones(r, creator || 'the creator').find((m) => m.who !== 'done'));
	const mine = $derived(next?.who === 'you');
	const money = $derived(r.type === 'barter' ? (r.product_value ? inrS(r.product_value) : 'Barter') : r.fee ? inr(r.fee) : 'Quote');
	const state = $derived(r.type === 'barter' ? `Barter · ${r.stage_label}` : r.type === 'hybrid' ? `+ product · ${r.stage_label}` : r.stage_label);
	const tag = $derived(unread ? `${unread} new` : mine ? 'Your turn' : '');
</script>

<WalletRow name={delivText(r.deliverables) || 'New request'} colorKey={r.code} stage={r.stage} href="/brand/r/{r.code}"
	{money} status={state} meta="{r.code}{creator ? ` · with ${creator}` : ''}"
	icon={mine ? 'bell' : 'clock'} next={next ? (mine ? next.title : `${creator || 'Creator'}: ${next.title}`) : 'All done'}
	{tag} attention={mine} {i} />
