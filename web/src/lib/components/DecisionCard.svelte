<script lang="ts">
	import type { Collab } from '../types';
	import { decisionOf, readFit, studio } from '../studio.svelte';
	import { toast } from '../ui.svelte';
	import AiThinking from './AiThinking.svelte';
	import DecisionReport from './DecisionReport.svelte';
	import Icon from './Icon.svelte';
	import ScoreRing from './ScoreRing.svelte';

	// "Should you take it?" on an open request: the score, the verdict, each factor at a glance.
	let { c }: { c: Collab } = $props();
	const d = $derived(decisionOf(c));
	let open = $state(false);
	let busy = $state(false);

	async function read() {
		busy = true;
		try {
			await readFit(c);
		} catch (e) {
			toast((e as Error).message, 'alert');
		}
		busy = false;
	}
</script>

{#if d}
	<section class="sec dec-sec">
		<h3>Should you take it? <span class="ai-tag"><Icon name="spark" />AI</span></h3>
		<button class="dec-card v-{d.verdict}" onclick={() => (open = true)}>
			<span class="dec-fx" aria-hidden="true"></span>
			<ScoreRing score={d.score} verdict={d.verdict} />
			<span class="dec-card-t"><b>{d.label}</b>{#if studio.reading.includes(c.id)}<AiThinking label="Reading the request" />{:else}<small>{d.line}</small>{/if}</span>
			<Icon name="chevR" />
		</button>
		<ul class="dec-mini">
			{#each d.factors as f (f.key)}
				<li class="t-{f.tone}"><span>{f.label}</span><span class="dec-bar"><i style="--w:{f.score / 10}"></i></span><small>{f.headline}</small></li>
			{/each}
		</ul>
		<div class="dec-acts">
			<button class="btn sm grad" onclick={() => (open = true)}><Icon name="chart" />See the full report</button>
			{#if !studio.fits[c.id] && !studio.reading.includes(c.id)}<button class="btn sm ai-btn" disabled={busy} onclick={read}><Icon name="spark" />Read with AI</button>{/if}
		</div>
	</section>
	{#if open}<DecisionReport {c} onclose={() => (open = false)} />{/if}
{/if}
