<script lang="ts">
	import { brandStats } from '../brandStats';
	import { saveBrandNotes, studio } from '../studio.svelte';
	import type { Brand } from '../types';
	import { toast } from '../ui.svelte';
	import Icon from './Icon.svelte';

	let { brand, compact = false }: { brand: Brand; compact?: boolean } = $props();

	const n = $derived(studio.notes[brand.id] ?? { brand_id: brand.id, notes: '', competitors: [] });
	const stats = $derived(brandStats(brand, studio.collabs));
	const rows = [
		{ k: 'rate_pay', label: 'Paid on time', hint: 'Money arrived when promised' },
		{ k: 'rate_brief', label: 'Clear brief', hint: 'Knew what they wanted, few surprises' },
		{ k: 'rate_again', label: 'Would work again', hint: 'Overall, worth it' }
	] as const;
	let hover = $state<{ k: string; v: number } | null>(null);

	function rate(k: (typeof rows)[number]['k'], v: number) {
		const same = n[k] === v;
		saveBrandNotes(brand.id, { [k]: same ? null : v, rated_at: new Date().toISOString() });
		if (!same && !compact) toast('Saved. Only you can see this.', 'check');
	}
</script>

<div class="rating" class:compact>
	{#each rows as r (r.k)}
		{@const cur = hover?.k === r.k ? hover.v : (n[r.k] ?? 0)}
		<div class="rate-row">
			<div><b>{r.label}</b>{#if !compact}<small>{r.hint}</small>{/if}</div>
			<div class="stars" role="group" aria-label={r.label} onmouseleave={() => (hover = null)}>
				{#each [1, 2, 3, 4, 5] as v (v)}
					<button
						type="button"
						class="star"
						class:on={v <= cur}
						aria-pressed={n[r.k] === v}
						aria-label="{v} star{v > 1 ? 's' : ''}"
						onmouseenter={() => (hover = { k: r.k, v })}
						onclick={() => rate(r.k, v)}>★</button
					>
				{/each}
			</div>
		</div>
	{/each}
	<p class="hint rate-foot">
		<Icon name="eye" />Private: brands never see this.
		{#if stats.avgDaysToPay !== null} They pay {stats.avgDaysToPay} day{stats.avgDaysToPay === 1 ? '' : 's'} after invoicing on average{stats.onTimeRate !== null ? `, ${Math.round(stats.onTimeRate * 100)}% on time` : ''}.{/if}
	</p>
</div>
