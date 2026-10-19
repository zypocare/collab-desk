<script lang="ts">
	import { markPaid, reloadCollabs, setInvoiceFlags, studio } from '#lib/studio.svelte.ts';
	import { countUp, toast, ui } from '#lib/ui.svelte.ts';
	import { delivText, diff, errMessage, fmt, hasProduct, inr, inrS, isPaid, outstanding, overdue, parse, payState, relWord, stageIndex, stageLabel } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import Ticket from '#lib/components/Ticket.svelte';
	import PayPill from '#lib/components/PayPill.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import BankCredits from '#lib/components/BankCredits.svelte';
	import { tdsToCollect } from '#lib/tds.ts';
	import { supabase } from '#lib/supabase.ts';
	import { money } from '#lib/currency.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { ask } from '#lib/confirm.svelte.ts';
	import { page } from '$app/state';

	let filter = $state<'all' | 'due' | 'overdue' | 'paid'>('all');
	let swapKey = $state(0);
	let fanPay = $state(false);

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
	// Phone: the "Still to come" card, the next payment, and a colour per status.
	const next = $derived(rows.filter((c) => payState(c) !== 'paid' && c.pay_due).sort((a, b) => a.pay_due!.localeCompare(b.pay_due!))[0]);
	const counts = $derived({ all: rows.length, due: rows.filter((c) => payState(c) === 'due').length, overdue: nOd, paid: rows.filter((c) => payState(c) === 'paid').length });
	const HUE = { paid: 'var(--ok)', due: 'var(--warn,#e0a23a)', overdue: 'var(--bad)' } as const;
	const pick = (f: typeof filter) => {
		filter = filter === f ? 'all' : f;
		swapKey++;
	};
	const prods = $derived(studio.collabs.filter((c) => hasProduct(c) && c.product_value && c.stage !== 'declined'));

	// "Remind brands" (also the button on the payment notification): a polite reminder to every brand
	// with an invoice still unpaid. Nobody gets two in a day (the database checks).
	const toRemind = $derived(rows.filter((c) => outstanding(c) > 0 && (c.pay_status === 'invoiced' || c.pay_status === 'advance')));
	let reminding = $state(false);
	async function remindAll() {
		if (!toRemind.length) return toast('No unpaid invoices to remind about. Send the invoices first.', 'alert');
		const names = [...new Set(toRemind.map((c) => c.brand.name))];
		const ok = await ask({
			title: `Remind ${names.length} brand${names.length > 1 ? 's' : ''} about ${toRemind.length} unpaid invoice${toRemind.length > 1 ? 's' : ''}?`,
			body: `${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}. Each gets a polite email with their invoice and amount due. Nobody gets two in a day.`,
			ok: 'Send reminders'
		});
		if (!ok) return;
		reminding = true;
		const { data, error } = await supabase.rpc('send_reminders', { p_ids: toRemind.map((c) => c.id) });
		reminding = false;
		if (error) return toast(`Couldn't send: ${errMessage(error)}`, 'alert');
		const r = data as { payment: number; skipped: number };
		toast(r.payment ? `${r.payment} payment reminder${r.payment > 1 ? 's' : ''} sent${r.skipped ? `. ${r.skipped} were reminded today already` : ''}` : 'Everyone was reminded today already.', r.payment ? 'send' : 'alert');
		await reloadCollabs();
	}
	// Opened from the notification's "Remind brands" button.
	let fromPush = false;
	$effect(() => {
		if (fromPush || !studio.loaded || page.url.searchParams.get('act') !== 'remind') return;
		fromPush = true;
		history.replaceState(history.state, '', '/studio/payments');
		remindAll();
	});
</script>

<svelte:head><title>Payments · {studio.settings?.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Money</div>
		<h1>Payments</h1>
		<p>Track every invoice from fee agreed to money in the bank.</p>
	</div>
	{#if toRemind.length}<button class="btn" onclick={remindAll} disabled={reminding}>{#if reminding}<span class="spinner"></span>{:else}<Icon name="bell" />{/if}Remind brands ({toRemind.length})</button>{/if}
</header>

{#if phone.on}
	<section class="hero-card glow m-hero m-pipe" aria-label="Money still to come">
		<div class="mesh" aria-hidden="true"></div>
		<div class="hc-in">
			<div class="hc-top">
				<span class="hc-eb">Still to come</span>
				{#if nOd}<button class="glass-chip" onclick={() => pick('overdue')}><Icon name="alert" />{nOd} overdue</button>{/if}
				{#if toRemind.length}<button class="glass-chip" onclick={remindAll} disabled={reminding}><Icon name="bell" />Remind</button>{/if}
			</div>
			<div class="hc-val" use:countUp={{ value: due + od, money: true }}>{inr(due + od)}</div>
			<div class="hc-sub">{next ? `Next: ${next.brand.name} · ${fmt(next.pay_due)}` : 'Nothing waiting to be paid'}</div>
			{#if recd + due + od > 0}
				<div class="pipe-bar" aria-hidden="true">
					{#if recd}<i style="flex:{recd};--hue:var(--ok)"></i>{/if}
					{#if due}<i style="flex:{due};--hue:var(--warn,#e0a23a)"></i>{/if}
					{#if od}<i style="flex:{od};--hue:var(--bad)"></i>{/if}
				</div>
			{/if}
			<div class="hc-foot">
				{#each [['paid', 'Received', recd], ['due', 'Due', due], ['overdue', 'Overdue', od]] as const as [k, label, v] (k)}
					<button class:on={filter === k} onclick={() => pick(k)}><small><span class="dt" style="--hue:{HUE[k]}"></span>{label}</small><b>{inrS(v)}</b></button>
				{/each}
			</div>
		</div>
	</section>
	<BankCredits />
	<div class="m-stages" role="tablist" aria-label="Filter payments">
		{#each [['all', 'All'], ['due', 'Due'], ['overdue', 'Overdue'], ['paid', 'Paid']] as const as [k, label] (k)}
			<button role="tab" aria-selected={filter === k} class:on={filter === k} onclick={() => ((filter = k), swapKey++)}><i class="dt" style="--hue:{k === 'all' ? 'var(--accent)' : HUE[k]}"></i>{label}<span>{counts[k]}</span></button>
		{/each}
	</div>
	<!-- Each payment a ticket (like Needs you on Today): three, the edge of the rest, "+N more". -->
	<div class="tks m-plist">
		{#key swapKey}
			{#each fanPay ? list : list.slice(0, 3) as c, i (c.id)}
				{@const st = payState(c)}
				<Ticket
					name={c.brand.name}
					sub={delivText(c.deliverables) || 'Collab'}
					money={inrS(c.fee)}
					moneySub={c.pay_status === 'paid' ? 'paid' : st === 'overdue' ? 'overdue' : c.pay_due ? 'due' : 'not invoiced'}
					task={c.invoice_no ? `Invoice ${c.invoice_no}` : c.pay_status === 'paid' ? 'Paid in full' : 'No invoice sent yet'}
					status={c.pay_status === 'paid' ? `Paid ${fmt(c.paid_on)}` : c.pay_due ? (diff(c.pay_due) < 0 ? `${-diff(c.pay_due)} day${diff(c.pay_due) === -1 ? '' : 's'} late` : diff(c.pay_due) === 0 ? 'Due today' : `Due ${fmt(c.pay_due)}`) : 'Send the invoice'}
					tone={c.pay_status === 'paid' ? 'ok' : st === 'overdue' ? 'hot' : c.pay_due ? 'warn' : 'calm'}
					onopen={() => (ui.openCollab = c.id)}
					{i}
				>
					{#if c.pay_status !== 'paid'}<button class="btn primary" onclick={() => markPaid(c)} aria-label="Mark {c.brand.name} as paid">Paid?</button>{:else}<button class="btn" onclick={() => (ui.openCollab = c.id)}>Open</button>{/if}
				</Ticket>
			{:else}
				<div class="clear hero-card glow m-none">
					<div class="mesh" aria-hidden="true"></div>
					<span class="clear-ic"><Icon name="wallet" /></span>
					<b>{filter === 'overdue' ? 'Nothing overdue' : filter === 'paid' ? 'No payments yet' : 'Nothing due'}</b>
					<small>{filter === 'overdue' ? 'Every brand has paid on time.' : 'Payments show up here once a collab is agreed.'}</small>
				</div>
			{/each}
		{/key}
		{#if !fanPay && list.length > 3}<span class="cr-edge tk-edge" aria-hidden="true"></span>{/if}
	</div>
	{#if list.length > 3}<button class="cr-more" onclick={() => (fanPay = !fanPay)}>{fanPay ? 'Show less' : `+${list.length - 3} more`}</button>{/if}
	{#if certs.length}
		<section class="hs">
			<header class="hs-h"><h2>TDS certificates</h2><span class="m-gn">{certs.length}</span></header>
			<div class="tks">
				{#each certs as t, i (t.inv.id)}
					<Ticket
						name={t.c.brand.name}
						sub="Invoice {t.inv.number}"
						money={money(t.inv.tds_deducted, t.inv.currency)}
						moneySub="TDS"
						task="Form 16A certificate"
						status={t.overdue ? `Due since ${fmt(t.due)}` : `Due by ${fmt(t.due)}`}
						tone={t.overdue ? 'hot' : 'warn'}
						onopen={() => (ui.openCollab = t.c.id)}
						{i}
					>
						{#if t.overdue}<button class="btn" disabled={asking === t.inv.id || t.askedRecently} onclick={() => askCert(t.inv.id, t.c.brand.name)}>{#if asking === t.inv.id}<span class="spinner"></span>{/if}{t.askedRecently ? 'Asked' : 'Ask'}</button>{/if}
						<button class="btn primary" onclick={() => setInvoiceFlags(t.inv, { tds_certificate: true })}>Got it</button>
					</Ticket>
				{/each}
			</div>
		</section>
	{/if}
	{#if prods.length}
		<section class="hs">
			<header class="hs-h"><h2>Barter products</h2><span class="m-gn">{prods.length}</span><small class="m-hs-r">{inr(prods.reduce((a, c) => a + c.product_value, 0))}</small></header>
			<div class="tks">
				{#each prods as c, i (c.id)}
					<Ticket
						name={c.brand.name}
						sub={stageLabel(c.stage)}
						money={inr(c.product_value)}
						moneySub="product"
						task={c.product || 'Product'}
						status={c.product_received_at ? 'Received' : c.shipped_at ? 'On the way' : 'Not shipped yet'}
						tone={c.product_received_at ? 'ok' : c.shipped_at ? 'warn' : 'calm'}
						onopen={() => (ui.openCollab = c.id)}
						{i}
					>
						<button class="btn" onclick={() => (ui.openCollab = c.id)}>Open</button>
					</Ticket>
				{/each}
			</div>
		</section>
	{/if}
{:else}
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
{/if}
