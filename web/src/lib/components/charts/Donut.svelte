<script lang="ts">
	// Donut: slices of a whole with the total in the middle and a legend beside it.
	import type { Slice } from '../../moneyDash';
	let {
		slices,
		center,
		sub = '',
		fmt = (v: number) => String(v),
		size = 168
	}: { slices: Slice[]; center: string; sub?: string; fmt?: (v: number) => string; size?: number } = $props();

	const R = 60;
	const C = 2 * Math.PI * R;
	const total = $derived(slices.reduce((a, s) => a + s.value, 0));
	const arcs = $derived.by(() => {
		let off = 0;
		const gap = slices.filter((s) => s.value > 0).length > 1 ? 3 : 0;
		return slices.map((s) => {
			const len = total ? (s.value / total) * C : 0;
			const a = { ...s, dash: `${Math.max(0, len - gap)} ${C}`, off: -off, pct: total ? Math.round((s.value / total) * 100) : 0 };
			off += len;
			return a;
		});
	});
</script>

<div class="dn">
	<div class="dn-ring" style="width:{size}px;height:{size}px">
		<svg viewBox="0 0 160 160" aria-hidden="true">
			<circle cx="80" cy="80" r={R} fill="none" stroke="color-mix(in oklab, var(--ink) 8%, transparent)" stroke-width="20" />
			{#each arcs as a, i (a.label)}
				{#if a.value > 0}<circle class="dn-arc" cx="80" cy="80" r={R} fill="none" stroke={a.color} stroke-width="20" stroke-dasharray={a.dash} stroke-dashoffset={a.off} transform="rotate(-90 80 80)" style="--d:{i * 90}ms" />{/if}
			{/each}
		</svg>
		<div class="dn-c"><b>{center}</b>{#if sub}<small>{sub}</small>{/if}</div>
	</div>
	<ul class="dn-legend">
		{#each arcs as a (a.label)}
			<li><i style="background:{a.color}"></i><span>{a.label}</span><b>{fmt(a.value)}</b><em>{a.pct}%</em></li>
		{:else}
			<li class="dn-none">Nothing yet</li>
		{/each}
	</ul>
</div>

<style>
	.dn { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; min-width: 0; }
	.dn-ring { position: relative; flex: none; }
	.dn-ring svg { width: 100%; height: 100%; display: block; }
	.dn-arc { animation: arc .9s cubic-bezier(.2, .8, .2, 1) both; animation-delay: var(--d); }
	.dn-c { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
	.dn-c b { font-size: 21px; font-weight: 700; letter-spacing: -.03em; }
	.dn-c small { font-size: 12px; color: var(--ink-3); }
	.dn-legend { list-style: none; margin: 0; padding: 0; flex: 1 1 180px; min-width: 0; display: flex; flex-direction: column; gap: 9px; }
	.dn-legend li { display: flex; align-items: center; gap: 9px; font-size: 14px; }
	.dn-legend i { width: 10px; height: 10px; border-radius: 3px; flex: none; }
	.dn-legend span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink-2); }
	.dn-legend b { font-weight: 600; font-variant-numeric: tabular-nums; }
	.dn-legend em { width: 40px; text-align: right; font-style: normal; font-size: 12.5px; color: var(--ink-3); }
	.dn-none { color: var(--ink-3); }
	@keyframes arc { from { stroke-dasharray: 0 400; } }
	@media (prefers-reduced-motion: reduce) { .dn-arc { animation: none; } }
</style>
