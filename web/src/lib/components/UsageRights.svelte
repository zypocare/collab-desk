<script lang="ts">
	import type { Collab } from '../types';
	import { respondUsage } from '../studio.svelte';
	import { diff, fmt, inr } from '../util';
	import Icon from './Icon.svelte';

	let { c }: { c: Collab } = $props();
	const left = $derived(c.usage_ends ? diff(c.usage_ends) : 0);
	let busy = $state(false);

	async function answer(ok: boolean) {
		busy = true;
		await respondUsage(c, ok);
		busy = false;
	}
</script>

{#if c.usage_ends}
	<div class="usage-box" class:u-soon={left >= 0 && left <= 7} class:u-ended={left < 0}>
		<Icon name="eye" />
		<div>
			<b>{left < 0 ? `Paid usage ended ${fmt(c.usage_ends)}` : `Paid usage until ${fmt(c.usage_ends)}`}</b>
			<small>{left < 0 ? `${-left} day${left === -1 ? '' : 's'} ago. The brand should have stopped the ads.` : left === 0 ? 'Ends today.' : `${left} day${left === 1 ? '' : 's'} left. The brand is offered an extension a week before.`}</small>
		</div>
	</div>
	{#if c.usage_ext_status === 'requested'}
		<div class="usage-req">
			<div>
				<b>{c.brand.name} wants {c.usage_ext_days} more days</b>
				<small>{inr(c.usage_ext_price)} at your extension rate. Approving adds it to the fee so you can invoice it.</small>
			</div>
			<div class="row">
				<button class="btn sm ghost" disabled={busy} onclick={() => answer(false)}>Decline</button>
				<button class="btn sm primary" disabled={busy} onclick={() => answer(true)}><Icon name="check" />Approve</button>
			</div>
		</div>
	{/if}
{/if}
