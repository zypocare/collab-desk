<script lang="ts">
	import { ask } from '../confirm.svelte';
	import type { Collab } from '../types';
	import { reloadCollabs } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage, fmt, inr } from '../util';
	import { EXPENSE_CATS, collabProfit } from '../expenses';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';

	// What this collab cost her, and what she kept.
	let { c }: { c: Collab } = $props();
	let label = $state('');
	let amount = $state('');
	let category = $state<keyof typeof EXPENSE_CATS>('props');
	let busy = $state(false);
	const p = $derived(collabProfit(c));

	async function add(e: SubmitEvent) {
		e.preventDefault();
		const amt = Number(amount);
		if (!label.trim() || !(amt >= 0)) return;
		busy = true;
		const { error } = await supabase.from('collab_expenses').insert({ collab_id: c.id, label: label.trim(), amount: amt, category });
		busy = false;
		if (error) return toast(`Couldn't save: ${errMessage(error)}`, 'alert');
		label = amount = '';
		reloadCollabs();
	}
	async function remove(id: string, what: string) {
		if (!(await ask({ title: `Remove “${what}”?`, ok: 'Remove', danger: true }))) return;
		await supabase.from('collab_expenses').delete().eq('id', id);
		reloadCollabs();
	}
</script>

<section class="sec">
	<h3>Costs &amp; profit {#if p.costs}<span>{inr(p.costs)} spent</span>{/if}</h3>
	{#if p.earned || p.costs}
		<div class="profit-line" class:neg={p.kept < 0}>
			<div><small>Earned</small><b>{inr(p.earned)}</b>{#if p.product}<small>+ {inr(p.product)} product</small>{/if}</div>
			<div><small>Costs</small><b>{p.costs ? `− ${inr(p.costs)}` : '—'}</b></div>
			<div><small>You keep</small><b>{inr(p.kept)}</b>{#if p.earned}<small>{p.margin}%</small>{/if}</div>
		</div>
	{/if}
	{#each c.expenses ?? [] as x (x.id)}
		<div class="exp-row">
			<span class="pill tint plain">{EXPENSE_CATS[x.category]}</span>
			<span class="exp-l">{x.label}<small>{' · '}{fmt(x.spent_on)}</small></span>
			<b>{inr(x.amount)}</b>
			<button class="shot-x" style="opacity:1" aria-label="Remove {x.label}" onclick={() => remove(x.id, x.label)}><Icon name="x" /></button>
		</div>
	{/each}
	<form class="exp-add" onsubmit={add}>
		<Select size="sm" ariaLabel="Kind of cost" bind:value={category} options={Object.entries(EXPENSE_CATS).map(([value, label]) => ({ value: value as keyof typeof EXPENSE_CATS, label }))} />
		<input class="inp" placeholder="What was it? (e.g. saree rental)" aria-label="What the cost was" bind:value={label} />
		<span class="pre exp-amt"><span>₹</span><input class="inp num" type="number" inputmode="numeric" min="0" placeholder="0" aria-label="Amount" bind:value={amount} /></span>
		<button class="btn sm" type="submit" disabled={busy || !label.trim() || amount === ''}><Icon name="plus" />Add</button>
	</form>
</section>
