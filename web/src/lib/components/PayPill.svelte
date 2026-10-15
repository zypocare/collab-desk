<script lang="ts">
	import type { Collab } from '../types';
	import { diff, isPaid, overdue } from '../util';
	import Icon from './Icon.svelte';

	let { c }: { c: Collab } = $props();
	const gotProduct = $derived(!!c.product_date && diff(c.product_date) <= 0);
</script>

{#if !isPaid(c)}
	<span class="pill tint k-product">{gotProduct ? 'Product received' : 'Product pending'}</span>
{:else if c.pay_status === 'paid'}
	<span class="pill tint k-pay"><Icon name="check" />Paid</span>
{:else if overdue(c)}
	<span class="pill tint k-bad">Overdue</span>
{:else if c.pay_status === 'invoiced'}
	<span class="pill tint k-new">Invoice sent</span>
{:else if c.pay_status === 'advance'}
	<span class="pill tint k-product">Advance in</span>
{:else}
	<span class="pill plain">Not invoiced</span>
{/if}
