<script lang="ts">
	import { onMount } from 'svelte';
	import { call, loadTeam, team, type Money, type MoneyInvoice } from '#lib/business.svelte.ts';
	import { askNote } from '#lib/confirm.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { errMessage, firstName, fmt, inr, todayIso } from '#lib/util.ts';
	import { auth } from '#lib/auth.svelte.ts';

	// Money: every invoice from every creator, what's due, and the GST and TDS for the year.
	let m = $state<Money | null>(null);
	let show = $state<'due' | 'paid' | 'all'>('due');
	async function load() {
		try {
			m = await call<Money>('brand_money');
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
	onMount(() => {
		load();
		if (!team.data) loadTeam().catch(() => {});
	});
	const canPay = $derived(!team.data || team.data.role !== 'member');
	const open = (i: MoneyInvoice) => i.status === 'sent' || i.status === 'partly_paid';
	const list = $derived((m?.invoices ?? []).filter((i) => (show === 'all' ? true : show === 'paid' ? i.status === 'paid' : open(i))));
	const month = new Date().toLocaleDateString('en-IN', { month: 'long' });
	const today = todayIso();
	const when = (i: MoneyInvoice) => {
		if (i.status === 'paid') return { text: i.paid_on ? `Paid ${fmt(i.paid_on)}` : 'Paid', tone: 'ok' };
		if (i.claimed) return { text: 'Marked paid · waiting for the creator', tone: '' };
		if (!i.due_date) return { text: 'No due date', tone: '' };
		const days = Math.round((Date.parse(i.due_date) - Date.parse(today)) / 864e5);
		return days < 0 ? { text: `${-days} day${days === -1 ? '' : 's'} late`, tone: 'bad' } : days === 0 ? { text: 'Due today', tone: 'warn' } : { text: `in ${days} day${days === 1 ? '' : 's'}`, tone: '' };
	};
	const invoiceUrl = (i: MoneyInvoice) => (i.slug === pageSlug ? `/invoice/${i.token}` : addressFor(i.slug, `/invoice/${i.token}`));

	async function markPaid(i: MoneyInvoice) {
		const ref = await askNote({ title: `Mark ${i.number} paid`, body: `${inr(i.due)} to ${i.creator}. ${i.creator.split(' ')[0]} gets a note to confirm it arrived.`, note: 'Payment reference (UTR or UPI ID)', ok: 'Mark paid' });
		if (!ref) return;
		try {
			const name = auth.account?.role === 'brand' ? auth.account.full_name || auth.account.email : '';
			await call('invoice_claim_paid', { p_token: i.token, p_amount: i.due, p_ref: ref, p_on: today, p_name: name });
			toast(`Marked paid. ${firstName(i.creator)} will confirm.`, 'check');
			load();
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}

	// For the accountant: one row per invoice.
	function exportCsv() {
		const rows = [['Invoice', 'Creator', 'Request', 'Issued', 'Due', 'Total', 'GST', 'TDS', 'Payable', 'Status', 'Paid on', 'Reference']];
		for (const i of m?.invoices ?? []) rows.push([i.number, i.creator, i.code, i.issue_date, i.due_date ?? '', String(i.total), String(i.gst), String(i.tds ?? 0), String(i.payable), i.status, i.paid_on ?? '', i.claim_ref ?? '']);
		const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
		a.download = `miracle-invoices-${today}.csv`;
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<svelte:head><title>Money · Miracle</title></svelte:head>

{#if !m}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else}
	<div class="mn-stats rv">
		<div class="mn-s" class:hot={m.to_pay > 0}><span>To pay</span><b>{inr(m.to_pay)}</b><small>{m.to_pay_count} invoice{m.to_pay_count === 1 ? '' : 's'}{m.overdue ? ` · ${inr(m.overdue)} overdue` : ''}</small></div>
		<div class="mn-s"><span>Paid in {month}</span><b>{inr(m.paid_month)}</b><small>{m.paid_month_creators ? `to ${m.paid_month_creators} creator${m.paid_month_creators === 1 ? '' : 's'}` : 'nothing yet'}</small></div>
		{#if !phone.on}
			<div class="mn-s"><span>GST · this year</span><b>{inr(m.gst_fy)}</b><small>input credit you can claim</small></div>
			<div class="mn-s"><span>TDS deducted · this year</span><b>{inr(m.tds_fy)}</b><small>for your TDS returns</small></div>
		{/if}
	</div>

	<div class="mn-bar">
		<div class="mn-chips" role="group" aria-label="Show">
			<button class:on={show === 'due'} onclick={() => (show = 'due')}>To pay · {m.invoices.filter(open).length}</button>
			<button class:on={show === 'paid'} onclick={() => (show = 'paid')}>Paid</button>
			<button class:on={show === 'all'} onclick={() => (show = 'all')}>All</button>
		</div>
		{#if m.invoices.length}<button class="mn-neo mn-ghost" onclick={exportCsv}>Export for your accountant</button>{/if}
	</div>

	{#if !list.length}
		<p class="mn-none">{show === 'due' ? 'Nothing to pay right now.' : 'No invoices here yet.'} Creators' invoices show up here when they send them.</p>
	{:else}
		<div class="mn-t" class:cards={phone.on}>
			{#if !phone.on}<div class="mn-r mn-th"><span>Invoice</span><span>Creator</span><span>To pay</span><span>GST</span><span>TDS</span><span>Due</span><span></span></div>{/if}
			{#each list as i (i.token)}
				{@const w = when(i)}
				<div class="mn-r">
					<span class="mn-num"><a href={invoiceUrl(i)} target="_blank" rel="noopener">{i.number}</a></span>
					<span class="mn-cr">{i.creator}</span>
					<span class="mn-amt">{inr(i.status === 'paid' ? i.payable : i.due)}</span>
					<span class="mn-sm">{i.gst ? inr(i.gst) : '—'}{#if phone.on} GST{/if}</span>
					<span class="mn-sm">{i.tds ? inr(i.tds) : '—'}{#if phone.on} TDS{/if}</span>
					<span class="mn-w {w.tone}">{w.text}</span>
					<span class="mn-a">
						{#if open(i) && !i.claimed && canPay}<button class="mn-neo mn-light" onclick={() => markPaid(i)}>Mark paid</button>{:else if open(i) && !i.claimed}<small>Finance marks it paid</small>{/if}
					</span>
				</div>
			{/each}
		</div>
	{/if}
	<p class="mn-note">Pay creators directly (bank or UPI on each invoice), then mark it paid with your payment reference. The creator gets a note to confirm.</p>
{/if}

<style>
	.mn-stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
		margin-bottom: 18px;
	}
	.mn-s {
		display: grid;
		gap: 4px;
		padding: 16px 18px;
		border-radius: 16px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.mn-s.hot {
		background:
			radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--g3) 16%, transparent), transparent 60%),
			var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.mn-s span {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.mn-s.hot span {
		color: var(--g3);
		font-weight: 600;
	}
	.mn-s b {
		font-family: var(--f-serif);
		font-weight: 400;
		font-size: 32px;
		line-height: 1;
	}
	.mn-s small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.mn-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 14px;
	}
	.mn-chips {
		display: flex;
		gap: 8px;
	}
	.mn-chips button {
		height: 36px;
		padding: 0 14px;
		border: 0;
		border-radius: 99px;
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink-2);
		font: 600 13px/1 var(--f-body);
		cursor: pointer;
	}
	.mn-chips button.on {
		background: color-mix(in oklab, var(--g2) 16%, transparent);
		box-shadow: none;
		color: var(--g2);
	}
	.mn-neo {
		height: 42px;
		padding: 0 14px;
		border: 0;
		cursor: pointer;
		font: 700 11.5px/1 var(--f-body);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		transition: transform 0.12s, box-shadow 0.12s;
	}
	.mn-light {
		background: var(--ink);
		color: var(--bg);
		box-shadow: 3px 3px 0 var(--g2);
	}
	.mn-ghost {
		background: transparent;
		color: var(--ink);
		box-shadow:
			inset 0 0 0 1.5px var(--ink-3),
			4px 4px 0 var(--line);
	}
	.mn-neo:hover {
		transform: translate(-2px, -2px);
	}
	.mn-neo:active {
		transform: translate(3px, 3px);
		box-shadow: none;
	}
	.mn-none,
	.mn-note {
		margin: 0;
		color: var(--ink-3);
		font-size: 13.5px;
	}
	.mn-none {
		padding: 18px;
		border-radius: 18px;
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.mn-note {
		margin-top: 14px;
	}
	.mn-t {
		display: grid;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		overflow: hidden;
	}
	.mn-r {
		display: grid;
		grid-template-columns: 1.4fr 1.3fr 1fr 0.8fr 0.8fr 1.1fr 1.1fr;
		gap: 12px;
		align-items: center;
		padding: 14px 18px;
		font-size: 14px;
	}
	.mn-r + .mn-r {
		border-top: 1px solid var(--line);
	}
	.mn-th {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.mn-num a {
		color: var(--ink);
		font-weight: 600;
	}
	.mn-amt {
		font-weight: 700;
	}
	.mn-w.bad {
		color: var(--bad);
		font-weight: 600;
	}
	.mn-w.warn {
		color: var(--g3);
		font-weight: 600;
	}
	.mn-w.ok {
		color: var(--ok);
	}
	.mn-a {
		justify-self: end;
	}
	.mn-a small {
		color: var(--ink-3);
		font-size: 12px;
	}
	/* Phones: each invoice a card. */
	.mn-t.cards {
		background: none;
		box-shadow: none;
		gap: 12px;
	}
	.cards .mn-r {
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 6px 12px;
		padding: 14px 16px;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.cards .mn-r + .mn-r {
		border-top: 0;
	}
	.cards .mn-cr {
		grid-row: 1;
		font-family: var(--f-serif);
		font-style: italic;
		font-size: 21px;
	}
	.cards .mn-amt {
		grid-row: 1;
		justify-self: end;
	}
	.cards .mn-num,
	.cards .mn-sm {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.cards .mn-a {
		grid-column: 1 / -1;
		justify-self: stretch;
	}
	.cards .mn-a .mn-neo {
		width: 100%;
		height: 44px;
	}
	@media (max-width: 900px) {
		.mn-stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.mn-s b {
			font-size: 26px;
		}
	}
</style>
