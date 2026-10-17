<script lang="ts">
	import { markPaid, reloadCollabs, setInvoiceFlags, studio } from '#lib/studio.svelte.ts';
	import { countUp, toast, ui } from '#lib/ui.svelte.ts';
	import { delivText, diff, errMessage, fmt, hasProduct, inr, isPaid, outstanding, overdue, parse, payState, relWord, stageIndex, stageLabel } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import PayPill from '#lib/components/PayPill.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import BankCredits from '#lib/components/BankCredits.svelte';
	import { tdsToCollect } from '#lib/tds.ts';
	import { supabase } from '#lib/supabase.ts';
	import { money } from '#lib/currency.ts';

	let filter = $state<'all' | 'due' | 'overdue' | 'paid'>('all');
	let swapKey = $state(0);

	const rows = $derived(studio.collabs.filter((c) => isPaid(c) && stageIndex(c.stage) >= 2));
	const recd = $derived(rows.reduce((a, c) => a + c.pay_received, 0));
	const od = $derived(rows.filter(overdue).reduce((a, c) => a + outstanding(c), 0));
	const due = $derived(rows.filter((c) => !overdue(c)).reduce((a, c) => a + outstanding(c), 0));
	const nOd = $derived(rows.filter(overdue).length);
	const rank = { overdue: 0, due: 1, paid: 2 };
	const list = $derived(
		rows
			.filter((c) => filter === 'all' || payState(c) === filter)
			.sort(
				(a, b) =>
					rank[payState(a)] - rank[payState(b)] ||
					(payState(a) === 'paid'
						? (b.paid_on ?? '').localeCompare(a.paid_on ?? '')
						: (a.pay_due ? parse(a.pay_due).getTime() : 9e15) - (b.pay_due ? parse(b.pay_due).getTime() : 9e15))
			)
	);
	// TDS certificates (Form 16A) still to come from brands.
	const certs = $derived(tdsToCollect(studio.collabs));
	let asking = $state('');
	async function askCert(id: string, brand: string) {
		asking = id;
		const { data, error } = await supabase.rpc('request_tds_certificate', { p_invoice: id });
		asking = '';
		if (error) return toast(errMessage(error), 'alert');
		toast(`Asked ${brand} for the certificate (${(data as { to: string }).to})`, 'send');
		await reloadCollabs();
	}
	const prods = $derived(studio.collabs.filter((c) => hasProduct(c) && c.product_value && c.stage !== 'declined'));
</script>

<svelte:head><title>Payments · {studio.settings?.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Money</div>
		<h1>Payments</h1>
		<p>Track every invoice from fee agreed to money in the bank.</p>
	</div>
</header>

<section class="kpis" aria-label="Payment summary">
	<div class="kpi glow rv" style="--i:1">
		<span class="mini-ic tint k-pay"><Icon name="check" /></span>
		<div><div class="lbl">Received</div><div class="big" use:countUp={{ value: recd, money: true }}>{inr(recd)}</div><div class="sub">all time · across {rows.filter((c) => c.pay_received).length} collabs</div></div>
	</div>
	<div class="kpi glow rv" style="--i:2">
		<span class="mini-ic tint k-product"><Icon name="clock" /></span>
		<div><div class="lbl">Due</div><div class="big" use:countUp={{ value: due, money: true }}>{inr(due)}</div><div class="sub">not yet late</div></div>
	</div>
	<div class="kpi glow rv" style="--i:3">
		<span class="mini-ic tint k-bad"><Icon name="alert" /></span>
		<div><div class="lbl">Overdue</div><div class="big" class:late={od > 0} use:countUp={{ value: od, money: true }}>{inr(od)}</div><div class="sub">{nOd} invoice{nOd === 1 ? '' : 's'} past due date</div></div>
	</div>
</section>

<BankCredits />

<div class="toolbar rv" style="--i:4">
	<Segmented
		label="Filter payments"
		bind:value={filter}
		onchange={() => swapKey++}
		options={[
			{ value: 'all', label: 'All' },
			{ value: 'due', label: 'Due' },
			{ value: 'overdue', label: 'Overdue' },
			{ value: 'paid', label: 'Paid' }
		]}
	/>
</div>

<div class="pay-grid">
	<section class="panel rv" style="--i:5">
		<div class="pay-row head"><span>Brand</span><span class="c-inv">Invoice</span><span>Amount</span><span>Due</span><span>Status</span><span></span></div>
		{#key swapKey}
			{#each list as c, i (c.id)}
				{@const p = c.fee ? Math.min(1, c.pay_received / c.fee) : 0}
				{@const st = payState(c)}
				<div class="pay-row" style="--i:{i}">
					<button class="who" onclick={() => (ui.openCollab = c.id)}><Mono name={c.brand.name} /><div><b>{c.brand.name}</b><small>{delivText(c.deliverables)}</small></div></button>
					<span class="c-inv id">{c.invoice_no || '—'}</span>
					<span class="amt c-amt">
						<b>{inr(c.fee)}</b>
						<div class="pbar {st === 'paid' ? 'k-pay' : st === 'overdue' ? 'k-bad' : 'k-product'}" title="{inr(c.pay_received)} received"><i style="--p:{p}"></i></div>
					</span>
					<span class="c-due">
						{#if c.pay_status === 'paid'}
							<b>Paid</b><small class="m">{fmt(c.paid_on)}</small>
						{:else if c.pay_due}
							<b class:late={diff(c.pay_due) < 0}>Due {fmt(c.pay_due)}</b><small class="m">{diff(c.pay_due) < 0 ? `${-diff(c.pay_due)} days late` : relWord(diff(c.pay_due))}</small>
						{:else}
							<b>—</b><small class="m">no due date yet</small>
						{/if}
					</span>
					<span class="c-st"><PayPill {c} /></span>
					<span class="r">{#if c.pay_status !== 'paid'}<button class="btn sm" onclick={() => markPaid(c)}>Mark paid</button>{/if}</span>
				</div>
			{:else}
				<div class="empty">No payments here.</div>
			{/each}
		{/key}
	</section>
	{#if certs.length}
		<section class="panel rv tds-panel" style="--i:6">
			<div class="panel-h"><h2>TDS certificates to collect</h2><small>Form 16A, to claim TDS when you file</small></div>
			{#each certs as t (t.inv.id)}
				<div class="prod-row tds-row">
					<Mono name={t.c.brand.name} size="sm" />
					<div>
						<b>{t.c.brand.name} · {t.inv.number}</b>
						<small>{money(t.inv.tds_deducted, t.inv.currency)} TDS · {t.overdue ? `due since ${fmt(t.due)}` : `due by ${fmt(t.due)}`}{t.inv.tds_requested_at ? ` · asked ${fmt(t.inv.tds_requested_at.slice(0, 10))}` : ''}</small>
					</div>
					<div class="tds-acts">
						{#if t.overdue}<button class="btn sm" disabled={asking === t.inv.id || t.askedRecently} onclick={() => askCert(t.inv.id, t.c.brand.name)}>{#if asking === t.inv.id}<span class="spinner"></span>{:else}<Icon name="send" />{/if}{t.askedRecently ? 'Asked' : 'Ask for it'}</button>{/if}
						<button class="btn sm primary" onclick={() => setInvoiceFlags(t.inv, { tds_certificate: true })}><Icon name="check" />Got it</button>
					</div>
				</div>
			{/each}
		</section>
	{/if}
	<section class="panel rv" style="--i:6">
		<div class="panel-h"><h2>Barter products</h2><small>{inr(prods.reduce((a, c) => a + c.product_value, 0))} in total</small></div>
		{#each prods as c (c.id)}
			<button class="prod-row" style="width:100%;border-left:0;border-right:0;border-bottom:0;background:none;text-align:left" onclick={() => (ui.openCollab = c.id)}>
				<Mono name={c.brand.name} size="sm" />
				<div><b>{c.product || 'Product'}</b><small>{c.brand.name} · {stageLabel(c.stage)}</small></div>
				<span class="v">{inr(c.product_value)}</span>
			</button>
		{:else}
			<div class="empty">No barter collabs yet.</div>
		{/each}
	</section>
</div>
