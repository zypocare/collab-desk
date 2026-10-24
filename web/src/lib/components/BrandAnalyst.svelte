<script lang="ts">
	import { explainReport, reportFacts, type Reading } from '../brandAi';
	import type { Report } from '../brandReports.svelte';
	import { loadSales, type SalesRow } from '../brandSales';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// On Reports: the AI reads the period's numbers and says, in plain words, what stands out and what to
	// do next. Or answers a question about them.
	let { report, company, period }: { report: Report; company: string; period: string } = $props();
	const ASK = ['Which creators should I book again?', 'Is my cost per view good?', 'Where is my money going?'];
	let question = $state('');
	let reading = $state<Reading | null>(null);
	let asked = $state('');
	let busy = $state(false);
	let error = $state('');
	// Sales for this report's own dates, so return on spend divides the period's sales by the period's fees.
	let sales: { key: string; rows: SalesRow[] } | null = null;
	// A new period: the old reading no longer fits.
	$effect(() => {
		void period;
		reading = null;
		error = '';
	});

	async function run(q = '') {
		if (busy) return;
		busy = true;
		error = '';
		try {
			const key = `${report.from}:${report.to}`;
			if (sales?.key !== key) sales = { key, rows: await loadSales(report.from, report.to).catch(() => []) };
			reading = await explainReport(reportFacts(report, sales.rows), company, period, q.trim());
			asked = q.trim();
			question = '';
		} catch (e) {
			error = errMessage(e);
		} finally {
			busy = false;
		}
	}
	const empty = $derived(!report.kpi.collabs && !report.kpi.spent);
</script>

<section class="md-card md-wide ba rv" style="--i:1" aria-labelledby="ba-h">
	<header class="md-h"><div><span class="bx-eb">AI analyst</span><h2 id="ba-h">What your results say</h2></div></header>
	{#if empty}
		<p class="ba-note">Once you've worked with a few creators, the AI reads these numbers and tells you what's working.</p>
	{:else}
		{#if reading}
			<div class="ba-read" aria-live="polite">
				{#if asked}<p class="ba-q"><Icon name="spark" />{asked}</p>{/if}
				{#if reading.answer}<p class="ba-answer">{reading.answer}</p>{/if}
				{#if reading.headline}<p class="ba-head">{reading.headline}</p>{/if}
				{#if reading.points.length}<ul class="ba-list">{#each reading.points as p (p)}<li>{p}</li>{/each}</ul>{/if}
				{#if reading.next.length}
					<span class="bx-eb">Do next</span>
					<ol class="ba-next">{#each reading.next as n (n)}<li>{n}</li>{/each}</ol>
				{/if}
				<small class="ba-fine">Written by AI from this period's numbers{report.by_creator.length > 40 ? `: the 40 creators with the biggest fees one by one, the other ${report.by_creator.length - 40} added up` : ''}. Sales count orders dated in the period. Check anything important before acting on it.</small>
			</div>
		{:else}
			<button class="btn grad ba-go" onclick={() => run()} disabled={busy}>{#if busy}<span class="spinner"></span>Reading your numbers…{:else}<Icon name="spark" />Explain these results{/if}</button>
		{/if}
		<form class="ba-ask" onsubmit={(e) => { e.preventDefault(); if (question.trim()) run(question); }}>
			<input class="inp" aria-label="Ask about your results" placeholder="Ask about these results…" maxlength="300" bind:value={question} disabled={busy} />
			<button class="btn" disabled={busy || !question.trim()}>{#if busy && reading}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Ask</button>
		</form>
		<div class="ba-chips">
			{#each ASK as a (a)}<button type="button" class="ba-chip" disabled={busy} onclick={() => run(a)}>{a}</button>{/each}
		</div>
		{#if error}<p class="err-box" role="alert">{error}</p>{/if}
	{/if}
</section>

<style>
	.ba {
		display: grid;
		gap: 14px;
	}
	.ba-note {
		margin: 0;
		color: var(--ink-3);
	}
	.ba-go {
		justify-self: start;
	}
	.ba-read {
		display: grid;
		gap: 10px;
	}
	.ba-q {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		color: var(--ink-3);
		font-size: 13.5px;
	}
	.ba-answer {
		margin: 0;
		font-size: 16px;
		line-height: 1.55;
	}
	.ba-head {
		margin: 0;
		font: 400 24px/1.2 var(--f-serif, Georgia, serif);
	}
	.ba-list,
	.ba-next {
		margin: 0;
		padding-left: 20px;
		display: grid;
		gap: 6px;
		color: var(--ink-2);
		line-height: 1.5;
	}
	.ba-fine {
		color: var(--ink-3);
	}
	.ba-ask {
		display: flex;
		gap: 8px;
	}
	.ba-ask .inp {
		flex: 1;
		min-width: 0;
	}
	.ba-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.ba-chip {
		padding: 8px 12px;
		border: 0;
		border-radius: 99px;
		background: var(--surface-2);
		color: var(--ink-2);
		font: 600 13px var(--f-body, system-ui);
		cursor: pointer;
	}
	.ba-chip:hover:not(:disabled) {
		color: var(--ink);
	}
	.ba-chip:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
