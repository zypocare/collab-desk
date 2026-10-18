<script lang="ts">
	// Column chart: one column per label, its series side by side (or stacked). Bars grow in on load.
	let {
		items,
		names,
		colors,
		stacked = false,
		fmt = (v: number) => String(v),
		height = 200
	}: { items: { label: string; values: number[]; now?: boolean }[]; names: string[]; colors: string[]; stacked?: boolean; fmt?: (v: number) => string; height?: number } = $props();

	const max = $derived.by(() => {
		const m = Math.max(1, ...items.map((it) => (stacked ? it.values.reduce((a, v) => a + v, 0) : Math.max(...it.values))));
		// A round top for the scale: 1, 2 or 5 times a power of ten.
		const p = 10 ** Math.floor(Math.log10(m));
		return [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= m) ?? m;
	});
	const h = (v: number) => `${Math.max(v > 0 ? 1.5 : 0, (v / max) * 100)}%`;
	const tip = (it: { label: string; values: number[] }) => `${it.label}: ${it.values.map((v, j) => `${names[j]} ${fmt(v)}`).join(', ')}`;
</script>

<div class="cc" style="--h:{height}px">
	<div class="cc-plot">
		<div class="cc-grid" aria-hidden="true">
			{#each [1, 0.5, 0] as g (g)}<div class="cc-gl" style="bottom:{g * 100}%"><span>{g ? fmt(max * g) : ''}</span></div>{/each}
		</div>
		{#each items as it, i (it.label + i)}
			<div class="cc-col" class:now={it.now} title={tip(it)} style="--d:{i * 40}ms">
				{#if stacked}
					<div class="cc-stack">{#each it.values as v, j (j)}{#if v}<i style="height:{h(v)};background:{colors[j]}"></i>{/if}{/each}</div>
				{:else}
					<div class="cc-group">{#each it.values as v, j (j)}<i style="height:{h(v)};background:{colors[j]}"></i>{/each}</div>
				{/if}
			</div>
		{/each}
	</div>
	<div class="cc-x" aria-hidden="true">{#each items as it, i (it.label + i)}<span class:now={it.now}>{it.label}</span>{/each}</div>
	<div class="cc-legend">{#each names as n, j (n)}<span><i style="background:{colors[j]}"></i>{n}</span>{/each}</div>
</div>

<style>
	.cc { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
	.cc-plot { position: relative; height: var(--h); display: flex; align-items: flex-end; gap: clamp(4px, 1.2%, 12px); padding-left: 44px; }
	.cc-grid { position: absolute; inset: 0 0 0 0; pointer-events: none; }
	.cc-gl { position: absolute; left: 44px; right: 0; border-top: 1px dashed color-mix(in oklab, var(--ink) 12%, transparent); }
	.cc-gl span { position: absolute; left: -44px; top: -8px; width: 38px; text-align: right; font: 500 11px var(--f-mono, monospace); color: var(--ink-3); }
	.cc-col { position: relative; flex: 1; height: 100%; display: flex; align-items: flex-end; justify-content: center; border-radius: 8px; transition: background .2s; }
	.cc-col:hover { background: color-mix(in oklab, var(--ink) 5%, transparent); }
	.cc-col.now { background: color-mix(in oklab, var(--g2) 9%, transparent); }
	.cc-group, .cc-stack { width: 100%; max-width: 46px; height: 100%; display: flex; align-items: flex-end; gap: 3px; }
	.cc-stack { flex-direction: column-reverse; justify-content: flex-start; align-items: stretch; gap: 2px; }
	.cc-group i, .cc-stack i { display: block; flex: 1; border-radius: 6px 6px 2px 2px; transform-origin: bottom; animation: grow .7s cubic-bezier(.2, .8, .2, 1) both; animation-delay: var(--d); }
	.cc-stack i { flex: none; border-radius: 4px; }
	.cc-x { display: flex; gap: clamp(4px, 1.2%, 12px); padding-left: 44px; }
	.cc-x span { flex: 1; text-align: center; font-size: 12px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.cc-x span.now { color: var(--ink); font-weight: 700; }
	.cc-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; padding-left: 44px; font-size: 13px; color: var(--ink-2); }
	.cc-legend span { display: inline-flex; align-items: center; gap: 7px; }
	.cc-legend i { width: 10px; height: 10px; border-radius: 3px; }
	@keyframes grow { from { transform: scaleY(0); } }
	@media (prefers-reduced-motion: reduce) { .cc-group i, .cc-stack i { animation: none; } }
</style>
