<script lang="ts">
	import { call, type MoneyInvoice } from '../business.svelte';
	import { askNote } from '../confirm.svelte';
	import { auth } from '../auth.svelte';
	import { toast } from '../ui.svelte';
	import { errMessage, inr, todayIso } from '../util';
	import Icon from './Icon.svelte';

	let {
		invoices,
		canPay = true,
		onpaid
	}: {
		invoices: MoneyInvoice[];
		canPay?: boolean;
		onpaid: () => void;
	} = $props();

	let selected = $state<string[]>([]);
	let tdsRate = $state<10 | 2 | 0>(10);
	let busy = $state(false);

	const openList = $derived(invoices.filter((i) => (i.status === 'sent' || i.status === 'partly_paid') && !i.claimed));

	$effect(() => {
		const valid = new Set(openList.map((i) => i.token));
		selected = selected.filter((t) => valid.has(t));
	});

	const allSelected = $derived(openList.length > 0 && selected.length === openList.length);
	const picked = $derived(openList.filter((i) => selected.includes(i.token)));

	function toggleAll() {
		selected = allSelected ? [] : openList.map((i) => i.token);
	}
	function toggleOne(token: string) {
		selected = selected.includes(token) ? selected.filter((t) => t !== token) : [...selected, token];
	}

	function calcRow(i: MoneyInvoice) {
		const gross = Math.max(0, Number(i.total) - Number(i.gst || 0));
		const gst = Number(i.gst || 0);
		const tds = Math.round((gross * tdsRate) / 100);
		const net = Math.max(0, Math.round(gross + gst - tds));
		return { gross, gst, tds, net };
	}

	const totals = $derived.by(() => {
		let gross = 0, gst = 0, tds = 0, net = 0;
		for (const i of picked) {
			const c = calcRow(i);
			gross += c.gross;
			gst += c.gst;
			tds += c.tds;
			net += c.net;
		}
		return { gross, gst, tds, net };
	});

	function downloadNeft() {
		if (!picked.length) return toast('Select at least one invoice first', 'alert');
		const today = todayIso();
		const rows = [['Payment Mode', 'Invoice No', 'Beneficiary Name', 'Request Code', 'Gross Fee (INR)', 'GST (INR)', 'TDS Rate', 'Auto-TDS (INR)', 'Net Payable (INR)', 'Date']];
		for (const i of picked) {
			const c = calcRow(i);
			rows.push(['NEFT', i.number, i.creator, i.code, String(c.gross), String(c.gst), `${tdsRate}%`, String(c.tds), String(c.net), today]);
		}
		const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
		a.download = `miracle-bulk-neft-${tdsRate}pct-tds-${today}.csv`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(a.href);
		toast(`Downloaded Bulk NEFT CSV for ${picked.length} invoice${picked.length === 1 ? '' : 's'}`, 'download');
	}

	async function bulkMarkPaid() {
		if (!picked.length || !canPay) return;
		const ref = await askNote({
			title: `Mark ${picked.length} invoice${picked.length === 1 ? '' : 's'} paid`,
			body: `Net payout ${inr(totals.net)} (after ${inr(totals.tds)} auto-TDS at ${tdsRate}%). Each creator will be notified to confirm.`,
			note: 'Batch UTR / Bank Transfer Reference',
			placeholder: 'e.g. NEFT-BATCH-20261122',
			ok: 'Mark all paid'
		});
		if (!ref) return;
		busy = true;
		try {
			const name = auth.account?.role === 'brand' ? auth.account.full_name || auth.account.email : '';
			const today = todayIso();
			await Promise.all(
				picked.map((i) => {
					const c = calcRow(i);
					return call('invoice_claim_paid', {
						p_token: i.token,
						p_amount: c.net,
						p_ref: `${ref} (TDS ${tdsRate}%: ₹${c.tds})`,
						p_on: today,
						p_name: name
					});
				})
			);
			selected = [];
			toast(`Marked ${picked.length} payout${picked.length === 1 ? '' : 's'} paid`, 'check');
			onpaid();
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = false;
		}
	}
</script>

{#if openList.length}
	<section class="bp-card" aria-label="Bulk payouts and auto-TDS">
		<header class="bp-head">
			<div>
				<span class="bp-eb">Bulk Payouts &amp; Auto-TDS</span>
				<h3>Clear {openList.length} pending invoice{openList.length === 1 ? '' : 's'} at once</h3>
			</div>
			<button type="button" class="bp-sel-all" onclick={toggleAll}>
				{allSelected ? 'Clear all' : `Select all (${openList.length})`}
			</button>
		</header>

		<div class="bp-tds-row" role="group" aria-label="TDS rate">
			<button type="button" class="bp-chip" class:on={tdsRate === 10} onclick={() => (tdsRate = 10)}>194J · 10% TDS</button>
			<button type="button" class="bp-chip" class:on={tdsRate === 2} onclick={() => (tdsRate = 2)}>194C · 2% TDS</button>
			<button type="button" class="bp-chip" class:on={tdsRate === 0} onclick={() => (tdsRate = 0)}>0% Exempt</button>
		</div>

		<div class="bp-list">
			{#each openList as inv (inv.token)}
				{@const c = calcRow(inv)}
				{@const on = selected.includes(inv.token)}
				<button type="button" class="bp-row" class:on onclick={() => toggleOne(inv.token)}>
					<span class="bp-chk">{#if on}<Icon name="check" />{/if}</span>
					<span class="bp-who">
						<b>{inv.creator} · {inv.number}</b>
						<small>Gross {inr(c.gross)} + GST {inr(c.gst)} − TDS {inr(c.tds)}</small>
					</span>
					<b class="bp-net">{inr(c.net)}</b>
				</button>
			{/each}
		</div>

		{#if picked.length}
			<div class="bp-summary">
				<div><small>Selected</small><b>{picked.length}</b></div>
				<div><small>Auto-TDS ({tdsRate}%)</small><b class="warn">−{inr(totals.tds)}</b></div>
				<div><small>Net Payable</small><b class="ok">{inr(totals.net)}</b></div>
			</div>
		{/if}

		<div class="bp-acts">
			<button type="button" class="bp-grad" onclick={downloadNeft} disabled={!picked.length || busy}>
				<Icon name="download" />Download Bulk NEFT CSV
			</button>
			{#if canPay}
				<button type="button" class="bp-white" onclick={bulkMarkPaid} disabled={!picked.length || busy}>
					{#if busy}<span class="spinner"></span>Saving…{:else}<Icon name="check" />Bulk Mark Paid{/if}
				</button>
			{/if}
		</div>
	</section>
{/if}

<style>
	.bp-card {
		display: grid;
		gap: 12px;
		padding: 16px;
		margin: 0 0 16px;
		border-radius: 22px;
		background:
			radial-gradient(110% 80% at 92% 0%, rgba(242, 90, 144, 0.14), transparent 60%),
			linear-gradient(180deg, rgba(31, 24, 34, 0.96) 0%, rgba(21, 16, 23, 0.98) 100%);
		border: 1px solid rgba(255, 255, 255, 0.11);
		color: #faf7fc;
	}
	.bp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
	.bp-eb {
		display: inline-block;
		font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		background: linear-gradient(90deg, #9c7bff, #f25a90, #ffae6b);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}
	.bp-head h3 { margin: 3px 0 0; font: 400 22px/1.1 var(--f-serif, Georgia, serif); color: #faf7fc; }
	.bp-sel-all {
		padding: 7px 11px;
		border-radius: 9px;
		background: #241c27;
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: #faf7fc;
		font: 700 11.5px/1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
		white-space: nowrap;
	}
	.bp-tds-row { display: flex; flex-wrap: wrap; gap: 6px; }
	.bp-chip {
		padding: 7px 11px;
		border-radius: 9px;
		background: #241c27;
		border: 1px solid rgba(255, 255, 255, 0.13);
		color: #cfc6d6;
		font: 600 11.5px/1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
	}
	.bp-chip.on { background: #faf7fc; color: #140e16; border-color: #faf7fc; box-shadow: 0 2.5px 0 0 #f25a90; }

	.bp-list { display: grid; gap: 7px; max-height: 240px; overflow-y: auto; }
	.bp-row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		border-radius: 13px;
		background: rgba(13, 10, 14, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: #faf7fc;
		text-align: left;
		cursor: pointer;
	}
	.bp-row.on { background: rgba(60, 226, 155, 0.08); border-color: rgba(60, 226, 155, 0.38); }
	.bp-chk {
		width: 19px;
		height: 19px;
		border-radius: 6px;
		border: 1.5px solid #8f8499;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		color: #0d0a0e;
	}
	.bp-row.on .bp-chk { background: #3ce29b; border-color: #3ce29b; }
	.bp-chk :global(.ic) { width: 13px; height: 13px; stroke-width: 2.6; }
	.bp-who { flex: 1; min-width: 0; }
	.bp-who b { display: block; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.bp-who small { display: block; font-size: 11px; color: #8f8499; }
	.bp-net { font: 700 14px/1 var(--f-mono, ui-monospace, monospace); color: #faf7fc; white-space: nowrap; }

	.bp-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
	.bp-summary > div { padding: 10px; border-radius: 12px; background: rgba(13, 10, 14, 0.65); border: 1px solid rgba(255, 255, 255, 0.08); }
	.bp-summary small { display: block; font-size: 10.5px; color: #8f8499; margin-bottom: 3px; }
	.bp-summary b { font: 700 15px/1 var(--f-mono, ui-monospace, monospace); }
	.bp-summary b.warn { color: #ffb85c; }
	.bp-summary b.ok { color: #3ce29b; }

	.bp-acts { display: flex; flex-wrap: wrap; gap: 8px; }
	.bp-grad {
		flex: 1;
		min-width: 180px;
		min-height: 44px;
		padding: 0 15px;
		border: 0;
		border-radius: 0;
		background: linear-gradient(135deg, #9c7bff, #f25a90 52%, #ffae6b);
		color: #120b14;
		font: 800 12px/1 var(--f-body, system-ui, sans-serif);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		box-shadow: 3px 3px 0 0 #5b3b99;
		cursor: pointer;
	}
	.bp-white {
		min-height: 44px;
		padding: 0 16px;
		border: 0;
		border-radius: 10px;
		background: #faf7fc;
		color: #140e16;
		font: 800 12px/1 var(--f-body, system-ui, sans-serif);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		box-shadow: 0 3px 0 0 #f25a90;
		cursor: pointer;
	}
	.bp-grad:disabled, .bp-white:disabled { opacity: 0.45; cursor: not-allowed; }
	.bp-grad :global(.ic), .bp-white :global(.ic) { width: 14px; height: 14px; }
</style>
