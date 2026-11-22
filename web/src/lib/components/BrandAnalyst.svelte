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

<section class="ba-vault rv" style="--i:1" aria-labelledby="ba-h">
	<header class="ba-head-row">
		<div>
			<span class="ba-eb">AI analyst</span>
			<h2 id="ba-h">What your results say</h2>
		</div>
		<span class="ba-live-pill">✦ Instant</span>
	</header>

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
					<span class="ba-eb">Do next</span>
					<ol class="ba-next">{#each reading.next as n (n)}<li>{n}</li>{/each}</ol>
				{/if}
				<small class="ba-fine">Written by AI from this period's numbers{report.by_creator.length > 40 ? `: the 40 creators with the biggest fees one by one, the other ${report.by_creator.length - 40} added up` : ''}. Sales count orders dated in the period. Check anything important before acting on it.</small>
			</div>
		{:else}
			<button class="ba-go" onclick={() => run()} disabled={busy}>
				{#if busy}<span class="spinner"></span>Reading your numbers…{:else}<Icon name="spark" />Explain these results{/if}
			</button>
		{/if}
		<form class="ba-ask" onsubmit={(e) => { e.preventDefault(); if (question.trim()) run(question); }}>
			<input class="ba-inp" aria-label="Ask about your results" placeholder="Ask about these results…" maxlength="300" bind:value={question} disabled={busy} />
			<button class="ba-ask-btn" disabled={busy || !question.trim()}>
				{#if busy && reading}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Ask
			</button>
		</form>
		<div class="ba-chips">
			{#each ASK as a (a)}<button type="button" class="ba-chip" disabled={busy} onclick={() => run(a)}>{a}</button>{/each}
		</div>
		{#if error}<p class="err-box" role="alert">{error}</p>{/if}
	{/if}
</section>

<style>
	@property --ba-rim {
		syntax: '<angle>';
		initial-value: 0deg;
		inherits: false;
	}
	@keyframes baSpinRim {
		to {
			--ba-rim: 360deg;
		}
	}

	.ba-vault {
		position: relative;
		grid-column: 1 / -1;
		border-radius: 22px;
		padding: 18px 17px;
		background:
			radial-gradient(100% 80% at 90% 0%, rgba(156, 123, 255, 0.16), transparent 60%),
			radial-gradient(80% 70% at 10% 100%, rgba(242, 90, 144, 0.12), transparent 60%),
			linear-gradient(165deg, #1e1725 0%, #141017 100%);
		display: grid;
		gap: 13px;
		box-shadow: 0 14px 36px rgba(0, 0, 0, 0.42);
		z-index: 1;
	}
	.ba-vault::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1.5px;
		background: conic-gradient(from var(--ba-rim), #9c7bff, #f25a90, #ffae6b, rgba(255, 255, 255, 0.08) 48%, #9c7bff);
		-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		pointer-events: none;
		animation: baSpinRim 9s linear infinite;
	}

	.ba-head-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.ba-head-row h2 {
		margin: 3px 0 0;
		font-family: var(--f-serif, 'Instrument Serif', Georgia, serif);
		font-size: 26px;
		font-weight: 400;
		line-height: 1.08;
		color: #faf7fc;
	}
	.ba-eb {
		display: inline-block;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		background: linear-gradient(90deg, #9c7bff 0%, #f25a90 52%, #ffae6b 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}
	.ba-live-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 9px;
		border-radius: 999px;
		background: rgba(156, 123, 255, 0.16);
		border: 1px solid rgba(156, 123, 255, 0.35);
		color: #d2c2ff;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.ba-note {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: #8f8499;
	}
	.ba-go {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 10px 16px;
		border: 0;
		border-radius: 10px;
		background: linear-gradient(135deg, #9c7bff 0%, #f25a90 52%, #ffae6b 100%);
		color: #120b14;
		font: 800 12.5px/1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
		box-shadow: 3px 3px 0 0 rgba(156, 123, 255, 0.55), 0 8px 22px rgba(242, 90, 144, 0.25);
		transition: transform 0.14s ease, box-shadow 0.14s ease;
	}
	.ba-go:active:not(:disabled) {
		transform: translate(2px, 2px);
		box-shadow: 1px 1px 0 0 rgba(156, 123, 255, 0.5);
	}
	.ba-go:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.ba-go :global(.ic) {
		width: 15px;
		height: 15px;
	}

	.ba-read {
		background: rgba(11, 8, 13, 0.65);
		border: 1px solid rgba(255, 255, 255, 0.09);
		border-radius: 15px;
		padding: 14px;
		display: grid;
		gap: 10px;
	}
	.ba-q {
		display: flex;
		align-items: center;
		gap: 7px;
		margin: 0;
		color: #ffae6b;
		font-size: 12px;
		font-weight: 600;
	}
	.ba-q :global(.ic) {
		width: 14px;
		height: 14px;
	}
	.ba-answer {
		margin: 0;
		font-size: 14.5px;
		line-height: 1.55;
		color: #faf7fc;
	}
	.ba-head {
		margin: 0;
		font: 400 22px/1.2 var(--f-serif, 'Instrument Serif', Georgia, serif);
		color: #faf7fc;
	}
	.ba-list,
	.ba-next {
		margin: 0;
		padding-left: 19px;
		display: grid;
		gap: 6px;
		font-size: 12.5px;
		color: #cfc6d6;
		line-height: 1.5;
	}
	.ba-fine {
		font-size: 11px;
		color: #8f8499;
		line-height: 1.45;
	}

	.ba-ask {
		display: flex;
		gap: 8px;
	}
	.ba-inp {
		flex: 1;
		min-width: 0;
		padding: 11px 13px;
		border-radius: 12px;
		background: rgba(12, 9, 14, 0.85);
		border: 1px solid rgba(255, 255, 255, 0.14);
		color: #faf7fc;
		font: 400 13px/1.3 var(--f-body, system-ui, sans-serif);
		outline: none;
		transition: border-color 0.16s ease;
	}
	.ba-inp:focus {
		border-color: #f25a90;
	}
	.ba-inp::placeholder {
		color: #8f8499;
	}
	.ba-ask-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 10px 14px;
		border: 0;
		border-radius: 10px;
		background: #faf7fc;
		color: #140e16;
		font: 800 12.5px/1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
		box-shadow: 0 3px 0 0 #f25a90;
		white-space: nowrap;
	}
	.ba-ask-btn:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.ba-ask-btn :global(.ic) {
		width: 14px;
		height: 14px;
	}

	.ba-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
	}
	.ba-chip {
		padding: 7px 11px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #cfc6d6;
		font: 600 11.5px/1.2 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
		transition: all 0.16s ease;
	}
	.ba-chip:hover:not(:disabled) {
		background: rgba(242, 90, 144, 0.14);
		border-color: rgba(242, 90, 144, 0.4);
		color: #faf7fc;
	}
	.ba-chip:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
