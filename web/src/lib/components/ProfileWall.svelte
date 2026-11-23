<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<div class="wall">{@render children()}</div>

<style>
	.wall { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; margin: 0 -16px; padding: 4px; }
	.wall :global(.wt) { min-width: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); text-decoration: none;
		animation: wt-in .35s var(--ease) both; animation-delay: calc(var(--i) * 24ms); transition: transform .18s var(--ease), border-color .18s; }
	.wall :global(.wt.st-live) { border-color: color-mix(in oklab, var(--h-live) 34%, var(--line)); }
	.wall :global(.wt):active { transform: scale(.97); border-color: var(--accent); }
	.wall :global(.wt-cover) { position: relative; isolation: isolate; display: grid; place-items: center; flex: none; width: 100%; aspect-ratio: 1 / 0.94; overflow: hidden;
		background: radial-gradient(ellipse at 100% 0%, color-mix(in oklab, var(--h) 60%, transparent), transparent 70%), radial-gradient(ellipse at 0% 100%, color-mix(in oklab, var(--g2) 36%, transparent), transparent 70%), var(--hero); }
	.wall :global(.wt-cover) > :global(img) { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.wall :global(.wt-mark) { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid rgba(255, 255, 255, .2); border-radius: 14px; background: rgba(255, 255, 255, .06); color: rgba(255, 255, 255, .88); font: 600 17px/1 var(--f-display); letter-spacing: -.03em; }
	.wall :global(.wt-b) { display: flex; flex-direction: column; gap: 2.5px; min-width: 0; padding: 5px 6.5px 5.5px; border-top: 1px solid var(--line); background: linear-gradient(180deg, color-mix(in oklab, var(--surface) 94%, var(--g1) 6%), var(--surface)); }
	.wall :global(.wt-r1) { display: flex; align-items: center; justify-content: space-between; gap: 4px; min-width: 0; }
	.wall :global(.wt-brand-line) { display: flex; align-items: center; gap: 4px; min-width: 0; flex: 1; }
	.wall :global(.wt-dot) { flex: none; width: 5.5px; height: 5.5px; border-radius: 50%; background: var(--g1); }
	.wall :global(.wt-dot.live) { background: var(--h-live); box-shadow: 0 0 6px var(--h-live); animation: wt-pulse 1.8s ease-in-out infinite; }
	.wall :global(.wt-brand-line) > :global(b) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 700 11px/1.15 var(--f-body); color: var(--ink); }
	.wall :global(.wt-views-txt) { flex: none; display: inline-flex; align-items: center; gap: 2.5px; font-size: 9px; font-weight: 700; line-height: 1; color: color-mix(in oklab, var(--g1) 75%, var(--ink)); font-variant-numeric: tabular-nums; }
	.wall :global(.wt-views-txt.ok) { color: var(--h-live); }
	.wall :global(.wt-views-txt) :global(.ic) { width: 10px; height: 10px; }
	.wall :global(.wt-r2) { display: flex; align-items: center; justify-content: space-between; gap: 4px; min-width: 0; }
	.wall :global(.wt-r2) :global(small) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-3); font-size: 9.5px; font-weight: 600; line-height: 1.2; }
	.wall :global(.wt-r2) :global(em) { flex: none; color: var(--g3); font-family: var(--f-serif, Georgia, serif); font-style: italic; font-size: 11.5px; font-weight: 400; line-height: 1; white-space: nowrap; }
	.wall :global(.pf-empty) { grid-column: 1 / -1; }
	@keyframes wt-in { from { opacity: 0; transform: translateY(6px); } }
	@keyframes wt-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.35); opacity: .55; } }
	@media (prefers-reduced-motion: reduce) { .wall :global(.wt), .wall :global(.wt-dot.live) { animation: none; } }
</style>
