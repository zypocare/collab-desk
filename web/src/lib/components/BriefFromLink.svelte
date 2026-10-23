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
	<span class="bfl-h"><Icon name="spark" /><b>Write it from your product page</b><small>Paste the link and the AI drafts the brief</small></span>
	<div class="bfl-row">
		<input class="inp" type="url" inputmode="url" aria-label="Product page link" placeholder="https://yourshop.in/product" maxlength="500" bind:value={url} disabled={busy} />
		<button class="btn grad" disabled={busy || !url.trim()}>{#if busy}<span class="spinner"></span>Reading…{:else}Draft brief{/if}</button>
	</div>
	{#if error}<small class="bfl-err" role="alert">{error}</small>{:else if done}<small class="bfl-ok" role="status">{done}</small>{/if}
</form>

<style>
	.bfl {
		display: grid;
		gap: 10px;
		padding: 14px 16px;
		margin-bottom: 14px;
		border-radius: 16px;
		background: color-mix(in oklab, var(--g1) 9%, var(--surface-2, var(--surface)));
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--g1) 25%, transparent);
	}
	.bfl-h {
		display: grid;
		grid-template-columns: auto 1fr;
		column-gap: 8px;
		align-items: center;
	}
	.bfl-h small {
		grid-column: 2;
		color: var(--ink-3);
	}
	.bfl-row {
		display: flex;
		gap: 8px;
	}
	.bfl-row .inp {
		flex: 1;
		min-width: 0;
	}
	.bfl-err {
		color: var(--bad);
	}
	.bfl-ok {
		color: var(--ok);
	}
	@media (max-width: 520px) {
		.bfl-row {
			flex-direction: column;
		}
	}
</style>
