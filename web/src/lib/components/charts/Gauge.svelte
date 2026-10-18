<script lang="ts">
	// Gauge: a ring that fills to a share (0–1; over 1 shows full with the real figure in the middle).
	let { value, center, sub = '', gradient = true, color = 'var(--ok)', size = 132 }: { value: number | null; center: string; sub?: string; gradient?: boolean; color?: string; size?: number } = $props();
	const uid = `ga${Math.random().toString(36).slice(2, 8)}`;
	const R = 52;
	const C = 2 * Math.PI * R;
	const fill = $derived(value === null ? 0 : Math.max(0, Math.min(1, value)));
</script>

<div class="ga" style="width:{size}px;height:{size}px">
	<svg viewBox="0 0 128 128" aria-hidden="true">
		<defs>
			<linearGradient id={uid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--g1)" /><stop offset=".55" style="stop-color:var(--g2)" /><stop offset="1" style="stop-color:var(--g3)" /></linearGradient>
		</defs>
		<circle cx="64" cy="64" r={R} fill="none" stroke="color-mix(in oklab, var(--ink) 9%, transparent)" stroke-width="12" />
		{#if fill > 0}<circle class="ga-arc" cx="64" cy="64" r={R} fill="none" stroke={gradient ? `url(#${uid})` : color} stroke-width="12" stroke-linecap="round" stroke-dasharray="{fill * C} {C}" transform="rotate(-90 64 64)" />{/if}
	</svg>
	<div class="ga-c"><b>{center}</b>{#if sub}<small>{sub}</small>{/if}</div>
</div>

<style>
	.ga { position: relative; flex: none; }
	.ga svg { width: 100%; height: 100%; display: block; }
	.ga-arc { animation: ga 1s cubic-bezier(.2, .8, .2, 1) both; }
	.ga-c { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
	.ga-c b { font-size: 22px; font-weight: 700; letter-spacing: -.03em; }
	.ga-c small { font-size: 11.5px; color: var(--ink-3); max-width: 80%; }
	@keyframes ga { from { stroke-dasharray: 0 400; } }
	@media (prefers-reduced-motion: reduce) { .ga-arc { animation: none; } }
</style>
