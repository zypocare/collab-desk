<script lang="ts">
	import { onMount } from 'svelte';
	import { ADDONS, BANDS, bench, loadBench, rangeFor } from '../benchmark.svelte';
	import { studio } from '../studio.svelte';
	import { inr, KINDS } from '../util';

	// What creators like her charge, next to her own price for each thing she offers.
	onMount(loadBench);
	const s = $derived(studio.settings!);
	const kinds = $derived((s.offered_kinds?.length ? s.offered_kinds : KINDS).filter((k) => KINDS.includes(k)));
	const rows = $derived(kinds.map((k) => ({ kind: k, mine: Number(s.rates?.[k]) || 0, r: rangeFor(k) })).filter((x) => x.r));
	const verdict = (mine: number, r: { low: number; high: number }) => (!mine ? '' : mine < r.low ? 'below' : mine > r.high ? 'above' : 'within');
</script>

{#if bench.loaded && rows.length}
	<section class="panel rv rb" style="--i:3" aria-labelledby="rb-t">
		<div class="panel-h"><h2 id="rb-t">What creators like you charge</h2><small>{BANDS[bench.band] || 'creators your size'}</small></div>
		<ul class="rb-list">
			{#each rows as x (x.kind)}
				{@const v = verdict(x.mine, x.r!)}
				<li>
					<div class="rb-t"><b>{x.kind}</b><small>{x.r!.from}</small></div>
					<div class="rb-bar" aria-hidden="true">
						<i style="left:{Math.max(0, Math.min(100, ((x.mine - x.r!.low) / Math.max(1, x.r!.high - x.r!.low)) * 60 + 20))}%" class:off={!x.mine}></i>
					</div>
					<div class="rb-n"><span>{inr(x.r!.low)} – {inr(x.r!.high)}</span><small class={v}>{x.mine ? `You: ${inr(x.mine)}${v === 'below' ? ', below most' : v === 'above' ? ', above most' : ''}` : 'No price set'}</small></div>
				</li>
			{/each}
		</ul>
		<div class="rb-add">
			<span class="lbl-t">Add on top</span>
			<dl>{#each ADDONS as a (a.what)}<dt>{a.what}</dt><dd>{a.add}</dd>{/each}</dl>
		</div>
		<small class="hint rb-foot">Prices from other creators are anonymous and only shown when at least 5 creators are in the group. Yours are never shown to anyone.</small>
	</section>
{/if}

<style>
	.rb-list {
		display: grid;
		gap: 14px;
		margin: 0;
		padding: 0 18px;
		list-style: none;
	}
	.rb-list li {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1.2fr);
		gap: 14px;
		align-items: center;
	}
	@media (max-width: 700px) {
		.rb-list li {
			grid-template-columns: minmax(0, 1fr);
			gap: 6px;
		}
	}
	.rb-t {
		display: grid;
	}
	.rb-t small,
	.rb-n small {
		color: var(--ink-3);
		font-size: 12px;
	}
	.rb-bar {
		position: relative;
		height: 8px;
		border-radius: 99px;
		background: linear-gradient(90deg, var(--surface-2) 0 20%, color-mix(in oklab, var(--ok) 35%, var(--surface-2)) 20% 80%, var(--surface-2) 80%);
	}
	.rb-bar i {
		position: absolute;
		top: -4px;
		width: 4px;
		height: 16px;
		border-radius: 2px;
		background: var(--ink);
		transform: translateX(-2px);
	}
	.rb-bar i.off {
		display: none;
	}
	.rb-n {
		display: grid;
		font-variant-numeric: tabular-nums;
	}
	.rb-n small.below {
		color: var(--warn);
	}
	.rb-add {
		display: grid;
		gap: 8px;
		margin: 16px 18px 0;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--surface-2);
	}
	.rb-add dl {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 6px 12px;
		margin: 0;
		font-size: 13px;
	}
	.rb-add dt {
		color: var(--ink-2);
	}
	.rb-add dd {
		margin: 0;
		font-weight: 700;
	}
	.rb-foot {
		display: block;
		padding: 12px 18px 18px;
	}
</style>
