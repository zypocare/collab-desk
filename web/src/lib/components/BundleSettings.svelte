<script lang="ts">
	import { DEFAULT_TIERS, bundlePrice, cleanTiers } from '../bundle';
	import { saveSettings, studio } from '../studio.svelte';
	import type { BundleTier } from '../types';
	import { inr, offeredKinds, plural } from '../util';

	// The package builder on her page: brands build a package from her rates, and these steps set the discount by
	// size (from N pieces, P% off the whole package). Off: her page shows her fixed packages instead.
	const s = $derived(studio.settings!);
	const on = $derived(s.bundle_on !== false);
	const tiers = $derived(s.bundle_tiers?.length ? s.bundle_tiers : DEFAULT_TIERS);

	function change(i: number, key: keyof BundleTier, d: number) {
		const next = tiers.map((t) => ({ ...t }));
		next[i][key] = Math.max(key === 'min' ? 2 : 1, Math.min(key === 'min' ? 50 : 60, next[i][key] + d));
		saveSettings({ bundle_tiers: next });
	}

	// What brands see, at her own rates: the same two pieces, 1 + 1, 2 + 2 and 3 + 3.
	const examples = $derived.by(() => {
		const kinds = offeredKinds(s.offered_kinds).filter((k) => Number(s.rates?.[k]) > 0);
		const a = kinds.includes('Reel') ? 'Reel' : kinds[0];
		const b = kinds.includes('Story') && a !== 'Story' ? 'Story' : kinds.find((k) => k !== a);
		if (!a) return [];
		return [1, 2, 3].map((n) => {
			const qty = b ? { [a]: n, [b]: n } : { [a]: n * 2 };
			const p = bundlePrice(s.rates, qty, cleanTiers(tiers));
			return { t: b ? `${n} ${plural(a, n)} + ${n} ${plural(b, n)}` : `${n * 2} ${plural(a, n * 2)}`, full: p.full, total: p.total, pct: p.pct };
		});
	});
</script>

<section class="panel rv" style="--i:2">
	<div class="panel-h"><h2>Package discount</h2><small>brands build their own package</small></div>
	<div class="switch-row" style="border-top:0">
		<div><b>Let brands build a package</b><small>On your page, under your rates: they pick how many of each, and the more they take, the less it costs.</small></div>
		<input type="checkbox" class="tgl" checked={on} aria-label="Let brands build a package" onchange={(e) => saveSettings({ bundle_on: (e.currentTarget as HTMLInputElement).checked })} />
	</div>
	{#if on}
		<div class="bd-tiers">
			{#each tiers as t, i (i)}
				<div class="bd-tier">
					<span class="bd-l">From</span>
					<div class="stepper sm">
						<button type="button" onclick={() => change(i, 'min', -1)} disabled={t.min <= 2} aria-label="Fewer pieces">−</button>
						<output>{t.min}</output>
						<button type="button" onclick={() => change(i, 'min', 1)} aria-label="More pieces">+</button>
					</div>
					<span class="bd-l">pieces</span>
					<div class="stepper sm bd-pct">
						<button type="button" onclick={() => change(i, 'pct', -1)} disabled={t.pct <= 1} aria-label="Less off">−</button>
						<output>{t.pct}%</output>
						<button type="button" onclick={() => change(i, 'pct', 1)} aria-label="More off">+</button>
					</div>
					<span class="bd-l">off</span>
				</div>
			{/each}
		</div>
		{#if examples.length}
			<div class="bd-ex">
				<span class="bd-eb">What brands see</span>
				{#each examples as e (e.t)}
					<div class="bd-row"><span>{e.t}</span><b>{#if e.pct}<s>{inr(e.full)}</s> {inr(e.total)} · {e.pct}% off{:else}{inr(e.full)}{/if}</b></div>
				{/each}
				<p class="hint">Every piece counts once, a Story the same as a Reel. Totals round to the nearest ₹100.</p>
			</div>
		{/if}
	{:else}
		<p class="hint bd-offnote">Your page shows your fixed packages below, and your rates one at a time.</p>
	{/if}
</section>

<style>
	.bd-tiers { display: flex; flex-direction: column; padding: 0 20px; }
	.bd-tier { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; padding: 12px 0; border-top: 1px solid var(--line); }
	.bd-tier:first-child { border-top: 0; }
	.bd-l { font-size: 14px; color: var(--ink-2); }
	.bd-tier output { min-width: 34px; text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }
	.bd-pct output { color: var(--ok); }
	.bd-ex { display: flex; flex-direction: column; gap: 8px; margin: 6px 20px 18px; padding: 16px; border-radius: 16px; background: color-mix(in oklab, var(--ink) 4%, transparent); }
	.bd-eb { font-size: 10.5px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-3); }
	.bd-row { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; color: var(--ink-2); }
	.bd-row b { color: var(--ink); font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
	.bd-row s { font-weight: 400; color: var(--ink-3); }
	.bd-ex .hint { margin: 2px 0 0; }
	.bd-offnote { margin: 0; padding: 0 20px 18px; }
</style>
