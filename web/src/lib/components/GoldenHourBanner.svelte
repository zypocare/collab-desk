<script lang="ts">
	import { studio } from '../studio.svelte';
	import { buildFallbackPulse, isGoldenHour, minutesSince, statusCopy } from '../pulse';
	import Icon from './Icon.svelte';

	// Shows a compact live Golden Hour banner on Today & Grow only when a Reel is in its first 60 minutes.
	const pulse = $derived.by(() => {
		const p = buildFallbackPulse(studio.media);
		if (!p || !isGoldenHour(p.posted_at)) return null;
		return p;
	});

	const left = $derived(pulse ? Math.max(0, 60 - minutesSince(pulse.posted_at)) : 0);
	const meta = $derived(pulse ? statusCopy(pulse.status) : null);
	const shortCap = $derived.by(() => {
		if (!pulse) return '';
		const t = pulse.caption.replace(/#\S+/g, '').trim();
		return t.length > 34 ? t.slice(0, 32).trim() + '…' : t || 'Latest Reel';
	});
</script>

{#if pulse && meta}
	<a class="ghb rv" href="/studio/grow/pulse" style="--gh-accent:{meta.color}">
		<span class="ghb-ring" aria-hidden="true">{pulse.pulse_score}</span>
		<span class="ghb-body">
			<b>Golden Hour Live · {left}m left</b>
			<small>{shortCap} · {pulse.latest_views.toLocaleString('en-IN')} views</small>
		</span>
		<Icon name="chevR" />
	</a>
{/if}

<style>
	.ghb {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		box-sizing: border-box;
		margin: 14px 0 6px;
		padding: 13px 15px;
		border-radius: 18px;
		border: 1px solid color-mix(in oklab, var(--gh-accent) 42%, var(--line));
		background: linear-gradient(
			115deg,
			color-mix(in oklab, var(--gh-accent) 13%, var(--surface)),
			color-mix(in oklab, var(--g1) 8%, var(--surface)) 65%,
			var(--surface)
		);
		color: var(--ink);
		text-decoration: none;
		transition: border-color 0.2s, transform 0.15s;
	}
	.ghb:hover {
		border-color: var(--gh-accent);
		transform: translateY(-1px);
	}
	.ghb-ring {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		border: 2px solid var(--gh-accent);
		display: grid;
		place-items: center;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 12px;
		font-weight: 700;
		color: var(--gh-accent);
		flex-shrink: 0;
	}
	.ghb-body {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.ghb-body b {
		font-size: 13.5px;
		font-weight: 600;
		color: var(--ink);
	}
	.ghb-body small {
		font-size: 12px;
		color: var(--ink-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ghb > :global(.ic) {
		flex: none;
		width: 16px;
		height: 16px;
		color: var(--ink-3);
	}
</style>
