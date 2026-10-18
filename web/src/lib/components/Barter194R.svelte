<script lang="ts">
	import { onMount } from 'svelte';
	import type { FY } from '../reports';
	import { studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { barter194r, fyKey, LIMIT_194R } from '../tds194r';
	import { toast } from '../ui.svelte';
	import { errMessage, fmt, inr } from '../util';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';

	// Barter tax (Section 194R): brands whose gifts to her this year are over ₹20,000 must deduct TDS.
	// She can remind them in one tap, and mark it done once Form 16A arrives.
	let { fy }: { fy: FY } = $props();
	const rows = $derived(barter194r(studio.collabs, fy));
	const near = $derived(rows.filter((r) => r.total >= LIMIT_194R * 0.75));
	let status = $state<Record<string, { status: string; reminded_at: string | null }>>({});
	let busy = $state('');

	async function load() {
		const { data } = await supabase.from('barter_tds').select('brand_id, status, reminded_at').eq('fy', fyKey(fy));
		status = Object.fromEntries(((data as { brand_id: string; status: string; reminded_at: string | null }[]) ?? []).map((x) => [x.brand_id, x]));
	}
	onMount(load);
	$effect(() => {
		void fy.start;
		load();
	});

	async function remind(id: string, total: number, brand: string) {
		busy = id;
		const { data, error } = await supabase.rpc('remind_194r', { p_brand: id, p_fy: fyKey(fy), p_total: total });
		busy = '';
		if (error) return toast(errMessage(error), 'alert');
		toast(`Reminded ${brand} (${data})`, 'send');
		load();
	}
	async function done(id: string, on: boolean) {
		const { error } = await supabase.from('barter_tds').upsert({ brand_id: id, fy: fyKey(fy), status: on ? 'deducted' : '', updated_at: new Date().toISOString() });
		if (error) return toast(errMessage(error), 'alert');
		load();
	}
</script>

<section class="panel rv b194" style="--i:8">
	<div class="panel-h"><h2>Barter tax (Section 194R)</h2><small>{fy.label} · brands over {inr(LIMIT_194R)} must deduct 10% TDS</small></div>
	{#if near.length}
		{#each near as r (r.brandId)}
			{@const st = status[r.brandId]}
			<div class="b194-row">
				<Mono name={r.brand} size="sm" />
				<div class="b194-t">
					<b>{r.brand}</b>
					<small>{inr(r.total)} in barter this year · {r.items.length} item{r.items.length === 1 ? '' : 's'}</small>
					<span class="b194-bar" class:over={r.over}><i style="--p:{Math.min(1, r.total / LIMIT_194R)}"></i></span>
				</div>
				<div class="b194-acts">
					{#if !r.over}
						<span class="pill tint plain">{inr(LIMIT_194R - r.total)} to go</span>
					{:else if st?.status === 'deducted'}
						<span class="pill tint k-pay"><Icon name="check" />TDS done</span>
						<button class="lnk" onclick={() => done(r.brandId, false)}>Undo</button>
					{:else}
						<button class="btn sm" disabled={busy === r.brandId} onclick={() => remind(r.brandId, r.total, r.brand)}>{#if busy === r.brandId}<span class="spinner"></span>{:else}<Icon name="send" />{/if}{st?.reminded_at ? `Reminded ${fmt(st.reminded_at.slice(0, 10))}` : 'Remind brand'}</button>
						<button class="btn sm" onclick={() => done(r.brandId, true)}><Icon name="check" />TDS deducted</button>
					{/if}
				</div>
			</div>
		{/each}
	{:else}
		<p class="hint b194-none">No brand is near {inr(LIMIT_194R)} of barter this year. Brands show up here at {inr(LIMIT_194R * 0.75)}.</p>
	{/if}
</section>
