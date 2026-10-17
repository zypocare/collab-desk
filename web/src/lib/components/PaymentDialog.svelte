<script lang="ts">
	import { portal } from '../portal';
	import { money } from '../currency';
	import { untrack } from 'svelte';
	import { recordPayment } from '../studio.svelte';
	import { balanceDue, type Invoice } from '../invoice';
	import { inr, todayIso } from '../util';
	import Icon from './Icon.svelte';
	import DatePicker from './DatePicker.svelte';

	let { inv, onclose }: { inv: Invoice; onclose: () => void } = $props();

	const start = untrack(() => ({ due: balanceDue(inv), tds: inv.tds_deducted ? 0 : inv.tds_amount }));
	let amount = $state(start.due);
	let tds = $state(start.tds);
	let date = $state(todayIso());
	let ref = $state('');
	let busy = $state(false);
	// Never more than what's left on the invoice (an extra zero would inflate every report).
	const room = $derived(Math.max(0, inv.total - inv.amount_received - Math.max(inv.tds_deducted, Number(tds) || 0)));
	const tooMuch = $derived((Number(amount) || 0) > room + 1);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (tooMuch) return;
		busy = true;
		const ok = await recordPayment(inv, { amount: Number(amount) || 0, tds: Number(tds) || 0, date, ref: ref.trim() });
		busy = false;
		if (ok) onclose();
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="pay-title">
		<form onsubmit={submit}>
			<h2 id="pay-title">Record a payment</h2>
			<p>{inv.number} · {money(inv.total, inv.currency)} total{inv.tds_amount ? `, ${money(inv.payable, inv.currency)} after TDS` : ''}{inv.amount_received ? ` · ${money(inv.amount_received, inv.currency)} received before` : ''}</p>
			<div class="fields">
				<div class="f"><label for="pd-amt">Amount received</label><div class="pre"><span>₹</span><input class="inp num" id="pd-amt" type="number" min="0" step="0.01" bind:value={amount} /></div></div>
				<div class="f"><label for="pd-tds">TDS deducted</label><div class="pre"><span>₹</span><input class="inp num" id="pd-tds" type="number" min="0" step="0.01" bind:value={tds} /></div></div>
				<div class="f"><label for="pd-date">Date</label><DatePicker id="pd-date" bind:value={date} clearable={false} /></div>
				<div class="f"><label for="pd-ref">UTR / reference <span class="hint">(optional)</span></label><input class="inp" id="pd-ref" bind:value={ref} /></div>
			</div>
			{#if tooMuch}<p class="err" style="margin:12px 0 0">That's more than the {money(room, inv.currency)} still to receive on {inv.number}. Check the amount.</p>{/if}
			<p class="hint" style="margin:12px 0 0">TDS the brand deducted counts as paid; you claim it back when you file your income tax return.</p>
			<div class="row">
				<button type="button" class="btn ghost" onclick={onclose}>Cancel</button>
				<button type="submit" class="btn primary" disabled={busy || tooMuch || (Number(amount) <= 0 && Number(tds) <= 0)}>{#if busy}<span class="spinner"></span>{:else}<Icon name="check" />{/if}Record payment</button>
			</div>
		</form>
	</div>
</div>
