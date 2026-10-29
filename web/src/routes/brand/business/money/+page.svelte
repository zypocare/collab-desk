<script lang="ts">
	import { onMount } from 'svelte';
	import { call, loadTeam, team, type Money, type MoneyInvoice } from '#lib/business.svelte.ts';
	import { askNote } from '#lib/confirm.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { errMessage, firstName, fmt, inr, inrS, todayIso } from '#lib/util.ts';
	import { countUp } from '#lib/ui.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Ticket from '#lib/components/Ticket.svelte';
	import RingIcons from '#lib/components/RingIcons.svelte';
	import { auth } from '#lib/auth.svelte.ts';

	// Money: every invoice from every creator, what's due, and the GST and TDS for the year.
	let m = $state<Money | null>(null);
	let show = $state<'all' | 'due' | 'overdue' | 'paid'>('all');
	let fan = $state(false);
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
	const today = todayIso();
	const late = (i: MoneyInvoice) => open(i) && !!i.due_date && i.due_date < today;
	const pick = (i: MoneyInvoice, k: typeof show) => (k === 'all' ? true : k === 'paid' ? i.status === 'paid' : k === 'overdue' ? late(i) : open(i) && !late(i));
	const list = $derived((m?.invoices ?? []).filter((i) => pick(i, show)));
	const counts = $derived(Object.fromEntries((['all', 'due', 'overdue', 'paid'] as const).map((k) => [k, (m?.invoices ?? []).filter((i) => pick(i, k)).length])) as Record<typeof show, number>);
	const HUE = { paid: 'var(--ok)', due: 'var(--warn,#e0a23a)', overdue: 'var(--bad)' } as const;
	const paidSum = $derived((m?.invoices ?? []).filter((i) => i.status === 'paid').reduce((a, i) => a + Number(i.payable), 0));
	const dueSum = $derived((m?.invoices ?? []).filter((i) => open(i) && !late(i)).reduce((a, i) => a + Number(i.due), 0));
	const odSum = $derived(m?.overdue ?? 0);
	const next = $derived((m?.invoices ?? []).filter((i) => open(i) && i.due_date).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))[0]);
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
	<!-- The creator's Payments, from the other side: what's still to pay, then each invoice as a ticket. -->
	<section class="hero-card glow m-hero m-pipe" aria-label="Still to pay">
		<div class="mesh" aria-hidden="true"></div>
		<div class="hc-in">
			<div class="hc-top">
				<span class="hc-eb">Still to pay</span>
				{#if counts.overdue}<button class="glass-chip" onclick={() => (show = 'overdue')}><Icon name="alert" />{counts.overdue} overdue</button>{/if}
				{#if m.invoices.length}<button class="glass-chip" onclick={exportCsv}><Icon name="download" />Export</button>{/if}
			</div>
			<div class="hc-val" use:countUp={{ value: m.to_pay, money: true }}>{inr(m.to_pay)}</div>
			<div class="hc-sub">{next ? `Next: ${next.creator} · ${fmt(next.due_date)}` : m.to_pay > 0 ? `${m.to_pay_count} invoice${m.to_pay_count === 1 ? '' : 's'} to pay` : 'Nothing waiting to be paid'}{m.gst_fy ? ` · ${inrS(m.gst_fy)} GST to claim this year` : ''}</div>
			{#if paidSum + dueSum + odSum > 0}
				<div class="pipe-bar" aria-hidden="true">
					{#if paidSum}<i style="flex:{paidSum};--hue:var(--ok)"></i>{/if}
					{#if dueSum}<i style="flex:{dueSum};--hue:var(--warn,#e0a23a)"></i>{/if}
					{#if odSum}<i style="flex:{odSum};--hue:var(--bad)"></i>{/if}
				</div>
			{/if}
			<div class="hc-foot">
				{#each [['paid', 'Paid', paidSum], ['due', 'Due', dueSum], ['overdue', 'Overdue', odSum]] as const as [k, label, v] (k)}
					<button class:on={show === k} onclick={() => (show = k)}><small><span class="dt" style="--hue:{HUE[k]}"></span>{label}</small><b>{inrS(v)}</b></button>
				{/each}
			</div>
		</div>
	</section>
	<!-- The creator's Money shortcuts: round, each with its own tint, a turning rim and an icon that changes. -->
	<nav class="cr-rings" aria-label="Money shortcuts">
		<a class="cr-ring" style="--rt:var(--h-request)" href="/brand/reports"><i><span><RingIcons i={0} icons={['chart', 'eye', 'layers']} /></span></i><small>Reports</small></a>
		<a class="cr-ring" style="--rt:var(--g1)" href="/brand/business/calendar"><i><span><RingIcons i={1} icons={['cal', 'clock', 'bell']} /></span></i>{#if counts.overdue}<b>{counts.overdue} LATE</b>{:else if counts.due}<b>{counts.due} DUE</b>{/if}<small>Due dates</small></a>
		<a class="cr-ring" style="--rt:var(--g3)" href="/brand/business/shipping"><i><span><RingIcons i={2} icons={['box', 'send', 'check']} /></span></i><small>Shipping</small></a>
		<a class="cr-ring" style="--rt:var(--g2)" href="/brand/business/team"><i><span><RingIcons i={3} icons={['users', 'shield', 'check']} /></span></i><small>Team</small></a>
		<a class="cr-ring" style="--rt:var(--h-live)" href="/brand/business/turnaround"><i><span><RingIcons i={4} icons={['clock', 'refresh', 'spark']} /></span></i><small>Turnaround</small></a>
	</nav>
	<div class="m-stages" role="tablist" aria-label="Filter invoices">
		{#each [['all', 'All'], ['due', 'Due'], ['overdue', 'Overdue'], ['paid', 'Paid']] as const as [k, label] (k)}
			<button role="tab" aria-selected={show === k} class:on={show === k} onclick={() => (show = k)}><i class="dt" style="--hue:{k === 'all' ? 'var(--accent)' : HUE[k]}"></i>{label}<span>{counts[k]}</span></button>
		{/each}
	</div>
	<!-- Each invoice a ticket (like the creator's Payments): three, the edge of the rest, "+N more". -->
	<div class="tks m-plist">
		{#each fan ? list : list.slice(0, 3) as i, k (i.token)}
			{@const w = when(i)}
			<Ticket
				name={i.creator}
				sub={i.code}
				money={inrS(i.status === 'paid' ? i.payable : i.due)}
				moneySub={i.status === 'paid' ? 'paid' : late(i) ? 'overdue' : i.status === 'partly_paid' ? 'left to pay' : 'due'}
				task={`Invoice ${i.number}${i.gst ? ` · ${inrS(i.gst)} GST` : ''}${i.tds ? ` · ${inrS(i.tds)} TDS` : ''}`}
				status={w.text}
				tone={i.status === 'paid' ? 'ok' : late(i) ? 'hot' : i.claimed ? 'calm' : 'warn'}
				href={invoiceUrl(i)}
				i={k}
			>
				{#if open(i) && !i.claimed && canPay}<button class="btn primary" onclick={() => markPaid(i)} aria-label="Mark {i.number} paid">Paid?</button>{:else}<a class="btn" href={invoiceUrl(i)} target="_blank" rel="noopener">Open</a>{/if}
			</Ticket>
		{:else}
			<div class="clear hero-card glow m-none">
				<div class="mesh" aria-hidden="true"></div>
				<span class="clear-ic"><Icon name="wallet" /></span>
				<b>{show === 'overdue' ? 'Nothing overdue' : show === 'paid' ? 'Nothing paid yet' : 'Nothing to pay'}</b>
				<small>Creators' invoices show up here when they send them.</small>
			</div>
		{/each}
		{#if !fan && list.length > 3}<span class="cr-edge tk-edge" aria-hidden="true"></span>{/if}
	</div>
	{#if list.length > 3}<button class="cr-more" onclick={() => (fan = !fan)}>{fan ? 'Show less' : `+${list.length - 3} more`}</button>{/if}
	<p class="hint" style="margin:14px 4px 0">Pay creators directly (bank or UPI on each invoice), then mark it paid with your payment reference. The creator gets a note to confirm.{m.tds_fy ? ` TDS deducted this year: ${inr(m.tds_fy)}.` : ''}</p>
{/if}
