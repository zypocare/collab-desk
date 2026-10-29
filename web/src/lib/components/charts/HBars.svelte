<script lang="ts">
	// Horizontal bars: one row per item, each split into parts (e.g. received + yet to come).
	let {
		rows,
		names,
		colors,
		fmt = (v: number) => String(v)
	}: { rows: { label: string; values: number[] }[]; names: string[]; colors: string[]; fmt?: (v: number) => string } = $props();
	const max = $derived(Math.max(1, ...rows.map((r) => r.values.reduce((a, v) => a + v, 0))));
</script>

<div class="hb">
	{#each rows as r, i (r.label + i)}
		{@const sum = r.values.reduce((a, v) => a + v, 0)}
		<div class="hb-row" title="{r.label}: {r.values.map((v, j) => `${names[j]} ${fmt(v)}`).join(', ')}">
			<span class="hb-l">{r.label}</span>
			<span class="hb-track">{#each r.values as v, j (j)}{#if v}<i style="width:{(v / max) * 100}%;background:{colors[j]};--d:{i * 70}ms"></i>{/if}{/each}</span>
			<b class="hb-v">{fmt(sum)}</b>
		</div>
	{:else}
		<p class="hb-none">Nothing yet this year.</p>
	{/each}
	{#if rows.length}<div class="hb-legend">{#each names as n, j (n)}<span><i style="background:{colors[j]}"></i>{n}</span>{/each}</div>{/if}
</div>

<style>
	.hb { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
	.hb-row { display: grid; grid-template-columns: minmax(80px, 34%) minmax(0, 1fr) auto; align-items: center; gap: 12px; }
	.hb-l { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hb-track { display: flex; gap: 2px; height: 12px; border-radius: 99px; background: color-mix(in oklab, var(--ink) 7%, transparent); overflow: hidden; }
	.hb-track i { display: block; height: 100%; border-radius: 99px; transform-origin: left; animation: grow .8s cubic-bezier(.2, .8, .2, 1) both; animation-delay: var(--d); }
	.hb-v { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; min-width: 64px; text-align: right; }
	.hb-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; color: var(--ink-2); padding-top: 2px; }
	.hb-legend span { display: inline-flex; align-items: center; gap: 7px; }
	.hb-legend i { width: 10px; height: 10px; border-radius: 3px; }
	.hb-none { margin: 0; color: var(--ink-3); font-size: 14px; }
	@keyframes grow { from { transform: scaleX(0); } }
	@media (prefers-reduced-motion: reduce) { .hb-track i { animation: none; } }
</style>
