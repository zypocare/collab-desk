<script lang="ts">
	// Line chart: running totals (or any series) across labels; the first series gets a soft area.
	let {
		labels,
		series,
		fmt = (v: number) => String(v),
		height = 200
	}: { labels: string[]; series: { name: string; color: string; values: (number | null)[]; dashed?: boolean }[]; fmt?: (v: number) => string; height?: number } = $props();

	const uid = `ln${Math.random().toString(36).slice(2, 8)}`;
	const W = 600;
	const H = 200;
	const max = $derived.by(() => {
		const m = Math.max(1, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)));
		const p = 10 ** Math.floor(Math.log10(m));
		return [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= m) ?? m;
	});
	const x = (i: number) => (labels.length > 1 ? (i / (labels.length - 1)) * W : W / 2);
	const y = (v: number) => H - (v / max) * (H - 8);
	const pts = (vals: (number | null)[]) => vals.map((v, i) => (v === null ? null : [x(i), y(v)] as [number, number])).filter((p): p is [number, number] => !!p);
	const line = (p: [number, number][]) => p.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)} ${b.toFixed(1)}`).join(' ');
	const paths = $derived(series.map((s) => {
		const p = pts(s.values);
		const last = [...s.values].reverse().find((v) => v !== null) ?? 0;
		return { ...s, d: line(p), area: p.length ? `${line(p)} L${p[p.length - 1][0]} ${H} L${p[0][0]} ${H} Z` : '', end: p[p.length - 1], last };
	}));
</script>

<div class="ln" style="--h:{height}px">
	<div class="ln-plot">
		<div class="ln-grid" aria-hidden="true">{#each [1, 0.5, 0] as g (g)}<div style="bottom:{g * 100}%"><span>{g ? fmt(max * g) : ''}</span></div>{/each}</div>
		<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
			<defs>
				<linearGradient id="{uid}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:{series[0]?.color};stop-opacity:.28" /><stop offset="1" style="stop-color:{series[0]?.color};stop-opacity:0" /></linearGradient>
			</defs>
			{#if paths[0]?.area}<path d={paths[0].area} fill="url(#{uid}a)" />{/if}
			{#each paths as p, i (p.name)}
				<path class="ln-path" d={p.d} fill="none" stroke={p.color} stroke-width={i ? 2 : 3} stroke-dasharray={p.dashed ? '6 6' : undefined} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
			{/each}
		</svg>
		{#each paths as p (p.name)}
			{#if p.end}<span class="ln-dot" style="left:{(p.end[0] / W) * 100}%;top:{(p.end[1] / H) * 100}%;background:{p.color}" title="{p.name}: {fmt(p.last)}"></span>{/if}
		{/each}
	</div>
	<div class="ln-x" aria-hidden="true">{#each labels as l, i (l + i)}<span>{l}</span>{/each}</div>
	<div class="ln-legend">{#each series as s (s.name)}<span><i style="background:{s.color}" class:dash={s.dashed}></i>{s.name}</span>{/each}</div>
</div>

<style>
	.ln { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
	.ln-plot { position: relative; height: var(--h); margin-left: 44px; }
	.ln-plot svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
	.ln-path { animation: draw 1.1s cubic-bezier(.2, .8, .2, 1) both; }
	.ln-grid div { position: absolute; left: 0; right: 0; border-top: 1px dashed color-mix(in oklab, var(--ink) 12%, transparent); }
	.ln-grid span { position: absolute; left: -44px; top: -8px; width: 38px; text-align: right; font: 500 11px var(--f-mono, monospace); color: var(--ink-3); }
	.ln-dot { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; box-shadow: 0 0 0 4px color-mix(in oklab, var(--surface) 80%, transparent); }
	.ln-x { display: flex; justify-content: space-between; margin-left: 44px; }
	.ln-x span { font-size: 12px; color: var(--ink-3); width: 0; display: flex; justify-content: center; white-space: nowrap; }
	.ln-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-left: 44px; padding-top: 4px; font-size: 13px; color: var(--ink-2); }
	.ln-legend span { display: inline-flex; align-items: center; gap: 7px; }
	.ln-legend i { width: 14px; height: 3px; border-radius: 2px; }
	.ln-legend i.dash { background: repeating-linear-gradient(90deg, currentColor 0 4px, transparent 4px 7px) !important; color: var(--ink-3); }
	@keyframes draw { from { opacity: 0; } }
</style>
