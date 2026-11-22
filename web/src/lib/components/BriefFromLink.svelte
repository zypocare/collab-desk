<script lang="ts">
	import { briefFromLink, type BriefDraft } from '../brandAi';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// Paste the product page's link: the AI reads it and drafts the brief (key message, do's and don'ts,
	// hashtags). Only empty fields are filled, so nothing the brand typed is lost.
	let { category = '', deal = '', deliverables = '', onfill }: { category?: string; deal?: string; deliverables?: string; onfill: (d: BriefDraft) => void } = $props();
	let url = $state('');
	let busy = $state(false);
	let error = $state('');
	let done = $state('');

	async function run(e: SubmitEvent) {
		e.preventDefault();
		if (!url.trim() || busy) return;
		busy = true;
		error = '';
		done = '';
		try {
			const d = await briefFromLink(url.trim(), { category, deal, deliverables });
			onfill(d);
			done = d.product ? `Drafted from ${d.product}. Check it and change anything below.` : 'Drafted. Check it and change anything below.';
		} catch (x) {
			error = errMessage(x);
		} finally {
			busy = false;
		}
	}
</script>

<form class="bfl" onsubmit={run}>
	<div class="bfl-top">
		<span class="bfl-eb"><Icon name="spark" />AI Brief Writer</span>
		<span class="bfl-live">● Instant</span>
	</div>
	<div class="bfl-h">
		<b>Write it from your product page</b>
		<small>Paste the link and AI drafts your campaign name, brief, and talking points.</small>
	</div>
	<div class="bfl-row">
		<input
			class="bfl-inp"
			type="url"
			inputmode="url"
			autocomplete="url"
			aria-label="Product page link"
			placeholder="https://yourshop.in/product"
			maxlength="500"
			bind:value={url}
			disabled={busy}
		/>
		<button type="submit" class="btn grad bfl-go" disabled={busy || !url.trim()}>
			{#if busy}<span class="spinner"></span>Reading…{:else}✦ Draft brief{/if}
		</button>
	</div>
	{#if error}<small class="bfl-err" role="alert">{error}</small>{:else if done}<small class="bfl-ok" role="status">{done}</small>{/if}
</form>

<style>
	@property --bfl-rim { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
	@keyframes bfl-spin { to { --bfl-rim: 360deg; } }
	@keyframes bfl-sheen {
		0%, 58% { transform: translateX(-160%) skewX(-22deg); }
		100% { transform: translateX(270%) skewX(-22deg); }
	}

	.bfl {
		position: relative;
		overflow: hidden;
		display: grid;
		gap: 12px;
		padding: 16px;
		border-radius: 22px;
		border: 1.5px solid transparent;
		background:
			linear-gradient(152deg, #24182c 0%, #161019 58%, #201521 100%) padding-box,
			conic-gradient(from var(--bfl-rim), rgba(156, 123, 255, 0.86), rgba(242, 90, 144, 0.82), rgba(255, 174, 107, 0.74), rgba(84, 62, 92, 0.32), rgba(156, 123, 255, 0.86)) border-box;
		animation: bfl-spin 11s linear infinite;
		box-shadow: 0 22px 44px -24px rgba(156, 123, 255, 0.42);
	}
	.bfl-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.bfl-eb {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font: 800 10px/1 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--g3);
	}
	.bfl-eb :global(.ic) {
		width: 14px;
		height: 14px;
		color: var(--g2);
	}
	.bfl-live {
		padding: 3px 8px;
		border-radius: 99px;
		background: rgba(111, 208, 140, 0.14);
		border: 1px solid rgba(111, 208, 140, 0.32);
		color: var(--ok);
		font: 800 9.5px/1 var(--f-mono, ui-monospace, monospace);
	}
	.bfl-h {
		display: grid;
		gap: 4px;
	}
	.bfl-h b {
		font: 400 22px/1.1 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	.bfl-h small {
		font-size: 12.5px;
		line-height: 1.4;
		color: var(--ink-2);
	}
	.bfl-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 10px;
		align-items: stretch;
	}
	.bfl-inp {
		display: block;
		width: 100%;
		min-width: 0;
		min-height: 48px !important;
		height: 48px !important;
		padding: 12px 14px !important;
		margin: 0;
		box-sizing: border-box;
		border-radius: 12px !important;
		border: 1px solid #48384c !important;
		background: rgba(15, 11, 16, 0.92) !important;
		color: var(--ink, #faf7fc) !important;
		font: 400 16px/1.35 var(--f-body, system-ui, sans-serif) !important;
		outline: none;
		-webkit-appearance: none;
		appearance: none;
	}
	.bfl-inp:focus {
		border-color: var(--g2, #f25a90) !important;
		box-shadow: 0 0 0 2px rgba(242, 90, 144, 0.22);
	}
	.bfl-inp::placeholder {
		color: var(--ink-3, #8f8499);
		opacity: 1;
	}
	.bfl-go {
		position: relative;
		overflow: hidden;
		min-height: 48px !important;
		height: 48px !important;
		padding: 0 18px !important;
		border-radius: 0 !important;
		font: 800 12px/1 var(--f-body, inherit) !important;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		box-shadow: 3.5px 3.5px 0 #5b3b99 !important;
		white-space: nowrap;
	}
	.bfl-go::after {
		content: '';
		position: absolute;
		inset: 0;
		width: 42%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.34), transparent);
		transform: translateX(-160%) skewX(-22deg);
		animation: bfl-sheen 4.8s ease-in-out infinite;
		pointer-events: none;
	}
	.bfl-err {
		color: var(--bad);
		font-size: 12px;
	}
	.bfl-ok {
		color: var(--ok);
		font-size: 12px;
	}
	@media (max-width: 560px) {
		.bfl-row {
			grid-template-columns: minmax(0, 1fr);
		}
		.bfl-go {
			width: 100%;
			justify-content: center;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bfl, .bfl-go::after { animation: none; }
	}
</style>
