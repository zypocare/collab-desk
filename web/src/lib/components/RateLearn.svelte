<script lang="ts">
	import { learnRates } from '../rateLearn';
	import { saveSettings, studio } from '../studio.svelte';
	import { toast } from '../ui.svelte';
	import { inr, KINDS } from '../util';
	import Icon from './Icon.svelte';

	// "What brands said to your prices": per deliverable, the evidence and a suggested price.
	const s = $derived(studio.settings!);
	const lessons = $derived(learnRates(studio.collabs, s.rates ?? {}, (s.offered_kinds?.length ? s.offered_kinds : KINDS).filter((k) => KINDS.includes(k))));
	const LABEL = { raise: 'Charge more', lower: 'A bit high', hold: 'About right', discount: 'Discounting a lot', learning: 'Still learning' };
	function use(kind: string, v: number) {
		saveSettings({ rates: { ...s.rates, [kind]: v } });
		toast(`${kind} is now ${inr(v)}`, 'check');
	}
</script>

{#if lessons.length}
	<section class="panel rv rl" style="--i:2">
		<div class="panel-h"><h2>What brands said to your prices</h2><small>learns from your quotes and offers</small></div>
		<ul class="rl-list">
			{#each lessons as l (l.kind)}
				<li class="rl-{l.advice}">
					<div class="rl-t">
						<b>{l.kind}</b>
						<span class="rl-pill">{LABEL[l.advice]}</span>
						<small>{l.why}{#if l.avgYes && l.advice !== 'discount'}{' '}Average price accepted: {inr(l.avgYes)}.{/if}</small>
					</div>
					<div class="rl-r">
						<span class="rl-now">{inr(l.rate)}</span>
						{#if l.suggest && l.suggest !== l.rate}<button class="btn sm {l.advice === 'raise' ? 'grad' : ''}" onclick={() => use(l.kind, l.suggest!)}><Icon name="arrow" />{inr(l.suggest)}</button>{/if}
					</div>
				</li>
			{/each}
		</ul>
		<p class="hint rl-foot">Counts quotes from the last 12 months. Advice appears after 3 answered quotes for a deliverable.</p>
	</section>
{/if}
