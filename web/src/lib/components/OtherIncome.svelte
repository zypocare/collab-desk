<script lang="ts">
	import { onMount } from 'svelte';
	import { addOtherIncome, loadOtherIncome, otherIncome, otherInFy, removeOtherIncome, sourceLabel, SOURCES, type Source } from '../otherIncome.svelte';
	import type { FY } from '../reports';
	import { studio } from '../studio.svelte';
	import { toast } from '../ui.svelte';
	import { errMessage, fmt, inr, inrS, todayIso } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';

	// In Money: what she earns outside Miracle, so her year's total is the whole picture.
	let { fy, received }: { fy: FY; received: number } = $props();
	const year = $derived(otherInFy(otherIncome.rows, fy));
	const canEdit = $derived(!studio.me || ['owner', 'manager', 'accountant'].includes(studio.me.team_role));
	let open = $state(false);
	let busy = $state(false);
	let f = $state({ received_on: todayIso(), source: 'youtube' as Source, payer: '', amount: '', tds: '', note: '' });

	onMount(() => {
		if (!otherIncome.loaded) loadOtherIncome().catch((e) => toast(errMessage(e), 'alert'));
	});

	async function save(e: SubmitEvent) {
		e.preventDefault();
		const amount = Number(f.amount);
		if (!f.payer.trim()) return toast('Who paid you? e.g. Google AdSense, Amazon Associates.', 'alert');
		if (!(amount > 0)) return toast('Add the amount you received.', 'alert');
		const tds = Number(f.tds) || 0;
		if (tds < 0 || tds > amount) return toast("TDS can't be more than the amount.", 'alert');
		busy = true;
		try {
			await addOtherIncome({ received_on: f.received_on, source: f.source, payer: f.payer.trim().slice(0, 80), amount, tds, note: f.note.trim().slice(0, 200) });
			toast('Added', 'check');
			f = { received_on: todayIso(), source: f.source, payer: '', amount: '', tds: '', note: '' };
			open = false;
		} catch (x) {
			toast(errMessage(x), 'alert');
		} finally {
			busy = false;
		}
	}
	async function remove(id: string) {
		try {
			await removeOtherIncome(id);
		} catch (x) {
			toast(errMessage(x), 'alert');
		}
	}
</script>

<section class="panel oi rv" aria-labelledby="oi-h">
	<div class="panel-h">
		<div><h2 id="oi-h">Other income</h2><small>YouTube, affiliate, platform bonuses, UGC and more, outside Miracle</small></div>
		{#if canEdit}<button class="btn sm" onclick={() => (open = !open)}><Icon name={open ? 'x' : 'plus'} />{open ? 'Close' : 'Add income'}</button>{/if}
	</div>
	<div class="oi-b">
		<div class="oi-sum">
			<div><small>Brand deals in {fy.label}</small><b>{inrS(received)}</b></div>
			<div><small>Other income</small><b>{inrS(year.total)}</b></div>
			<div class="oi-all"><small>All you earned</small><b>{inr(received + year.total)}</b></div>
		</div>
		{#if year.bySource.length}
			<div class="oi-by">{#each year.bySource as s (s.source)}<span>{s.label} <b>{inrS(s.value)}</b></span>{/each}{#if year.tds}<span>TDS deducted <b>{inrS(year.tds)}</b></span>{/if}</div>
		{/if}

		{#if open}
			<form class="oi-form" onsubmit={save}>
				<div class="f"><label for="oi-src">From</label><Select id="oi-src" bind:value={f.source} options={SOURCES.map((s) => ({ value: s.value, label: s.label, hint: s.hint }))} /></div>
				<div class="f"><label for="oi-payer">Who paid</label><input class="inp" id="oi-payer" maxlength="80" placeholder="e.g. Google AdSense" bind:value={f.payer} /></div>
				<div class="f"><label for="oi-amt">Amount received (₹)</label><input class="inp num" id="oi-amt" type="number" inputmode="decimal" min="0" bind:value={f.amount} /></div>
				<div class="f"><label for="oi-tds">TDS deducted (₹) <span class="hint">(if any)</span></label><input class="inp num" id="oi-tds" type="number" inputmode="decimal" min="0" bind:value={f.tds} /></div>
				<div class="f"><label for="oi-date">Received on</label><input class="inp" id="oi-date" type="date" bind:value={f.received_on} /></div>
				<div class="f"><label for="oi-note">Note <span class="hint">(optional)</span></label><input class="inp" id="oi-note" maxlength="200" placeholder="e.g. September payout" bind:value={f.note} /></div>
				<div class="oi-go"><button class="btn grad" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><small class="hint">Counted in your year's total, so your earnings show everything.</small></div>
			</form>
		{/if}

		{#if year.list.length}
			<ul class="oi-list">
				{#each year.list as r (r.id)}
					<li>
						<span><b>{r.payer}</b><small>{sourceLabel(r.source)} · {fmt(r.received_on)}{r.note ? ` · ${r.note}` : ''}</small></span>
						<span class="oi-amt"><b>{inr(r.amount)}</b>{#if r.tds}<small>TDS {inr(r.tds)}</small>{/if}</span>
						{#if canEdit}<button class="icon-btn" aria-label="Remove {r.payer} {fmt(r.received_on)}" onclick={() => remove(r.id)}><Icon name="x" /></button>{/if}
					</li>
				{/each}
			</ul>
		{:else if otherIncome.loaded && !open}
			<p class="hint">Nothing added for {fy.label}. Add YouTube payouts, affiliate earnings or anything else you earn, so your totals and tax desk are complete.</p>
		{/if}
	</div>
</section>

<style>
	.oi {
		margin-top: 16px;
	}
	.oi .panel-h {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.oi-b {
		display: grid;
		gap: 14px;
		padding: 0 18px 18px;
	}
	.oi-sum {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
	.oi-sum div {
		display: grid;
		gap: 2px;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--surface-2);
		min-width: 0;
	}
	.oi-sum small {
		color: var(--ink-3);
	}
	.oi-sum b {
		font: 400 24px/1.1 var(--f-serif, Georgia, serif);
	}
	.oi-all {
		box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--g2) 45%, transparent);
	}
	.oi-by {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.oi-by span {
		padding: 6px 10px;
		border-radius: 99px;
		background: var(--surface-2);
		font-size: 13px;
		color: var(--ink-2);
	}
	.oi-form {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		padding: 14px;
		border-radius: 16px;
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.oi-go {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.oi-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}
	.oi-list li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 10px;
		padding: 10px 0;
		border-bottom: 1px solid var(--line);
	}
	.oi-list span {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.oi-list small {
		color: var(--ink-3);
	}
	.oi-amt {
		text-align: right;
	}
	@media (max-width: 640px) {
		.oi-sum {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
		.oi-all {
			grid-column: 1 / -1;
		}
		.oi-form {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
