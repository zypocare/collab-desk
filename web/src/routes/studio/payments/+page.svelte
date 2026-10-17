<script lang="ts">
	import { markPaid, reloadCollabs, setInvoiceFlags, studio } from '#lib/studio.svelte.ts';
	import { countUp, toast, ui } from '#lib/ui.svelte.ts';
	import { delivText, diff, errMessage, fmt, hasProduct, inr, inrS, isPaid, outstanding, overdue, parse, payState, relWord, stageIndex, stageLabel } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import PayPill from '#lib/components/PayPill.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import BankCredits from '#lib/components/BankCredits.svelte';
	import { tdsToCollect } from '#lib/tds.ts';
	import { supabase } from '#lib/supabase.ts';
	import { money } from '#lib/currency.ts';
	import { phone } from '#lib/phone.svelte.ts';

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
	// Phone: the "Still to come" card, the next payment, and a colour per status.
	const next = $derived(rows.filter((c) => payState(c) !== 'paid' && c.pay_due).sort((a, b) => a.pay_due!.localeCompare(b.pay_due!))[0]);
	const counts = $derived({ all: rows.length, due: rows.filter((c) => payState(c) === 'due').length, overdue: nOd, paid: rows.filter((c) => payState(c) === 'paid').length });
	const HUE = { paid: 'var(--ok)', due: 'var(--warn,#e0a23a)', overdue: 'var(--bad)' } as const;
	const pick = (f: typeof filter) => {
		filter = filter === f ? 'all' : f;
		swapKey++;
	};
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

{#if phone.on}
	<section class="hero-card glow m-hero m-pipe" aria-label="Money still to come">
		<div class="mesh" aria-hidden="true"></div>
		<div class="hc-in">
			<div class="hc-top">
				<span class="hc-eb">Still to come</span>
				{#if nOd}<button class="glass-chip" onclick={() => pick('overdue')}><Icon name="alert" />{nOd} overdue</button>{/if}
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
	<div class="m-list m-plist">
		{#key swapKey}
			{#each list as c, i (c.id)}
				{@const p = c.fee ? Math.min(1, c.pay_received / c.fee) : 0}
				{@const st = payState(c)}
				<div class="m-ccard m-pcard" style="--i:{Math.min(i, 8)};--hue:{HUE[st]}">
					<button class="m-pc-open" onclick={() => (ui.openCollab = c.id)} aria-label="Open {c.brand.name}">
						<span class="m-cc-av" class:fresh={st === 'overdue'}><Mono name={c.brand.name} /></span>
						<span class="m-cc-b">
							<span class="m-cc-t"><b>{c.brand.name}</b></span>
							<span class="m-cc-s">{delivText(c.deliverables)}{c.invoice_no ? ` · ${c.invoice_no}` : ''}</span>
							<span class="m-pbar" title="{inr(c.pay_received)} received"><i style="--p:{p}"></i></span>
							<span class="m-cc-f">
								<span class="m-cc-money">{inr(c.fee)}</span>
								<span class="m-cc-n" class:late={st === 'overdue'}>
									{#if c.pay_status === 'paid'}<Icon name="check" />Paid {fmt(c.paid_on)}
									{:else if c.pay_due}<Icon name="clock" />{diff(c.pay_due) < 0 ? `${-diff(c.pay_due)} days late` : `Due ${fmt(c.pay_due)}`}
									{:else}<PayPill {c} />{/if}
								</span>
							</span>
						</span>
					</button>
					{#if c.pay_status !== 'paid'}<button class="m-pc-pay" onclick={() => markPaid(c)} aria-label="Mark {c.brand.name} as paid"><Icon name="wallet" /><small>Paid?</small></button>{/if}
				</div>
			{:else}
				<div class="clear hero-card glow m-none">
					<div class="mesh" aria-hidden="true"></div>
					<span class="clear-ic"><Icon name="wallet" /></span>
					<b>{filter === 'overdue' ? 'Nothing overdue' : filter === 'paid' ? 'No payments yet' : 'Nothing due'}</b>
					<small>{filter === 'overdue' ? 'Every brand has paid on time.' : 'Payments show up here once a collab is agreed.'}</small>
				</div>
			{/each}
		{/key}
	</div>
	{#if certs.length}
		<section class="hs">
			<header class="hs-h"><h2>TDS certificates</h2><span class="m-gn">{certs.length}</span></header>
			<div class="m-list">
				{#each certs as t (t.inv.id)}
					<div class="m-ccard m-mini" style="--hue:var(--accent)">
						<span class="m-cc-av"><Mono name={t.c.brand.name} /></span>
						<span class="m-cc-b">
							<span class="m-cc-t"><b>{t.c.brand.name}</b></span>
							<span class="m-cc-s">{money(t.inv.tds_deducted, t.inv.currency)} TDS · {t.inv.number}</span>
							<span class="m-cc-n" class:late={t.overdue}>{t.overdue ? `Form 16A due since ${fmt(t.due)}` : `Form 16A due by ${fmt(t.due)}`}</span>
							<span class="m-mini-acts">
								{#if t.overdue}<button class="btn sm" disabled={asking === t.inv.id || t.askedRecently} onclick={() => askCert(t.inv.id, t.c.brand.name)}>{#if asking === t.inv.id}<span class="spinner"></span>{:else}<Icon name="send" />{/if}{t.askedRecently ? 'Asked' : 'Ask for it'}</button>{/if}
								<button class="btn sm" onclick={() => setInvoiceFlags(t.inv, { tds_certificate: true })}><Icon name="check" />Got it</button>
							</span>
						</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}
	{#if prods.length}
		<section class="hs">
			<header class="hs-h"><h2>Barter products</h2><span class="m-gn">{prods.length}</span><small class="m-hs-r">{inr(prods.reduce((a, c) => a + c.product_value, 0))}</small></header>
			<div class="m-list">
				{#each prods as c, i (c.id)}
					<button class="m-ccard" style="--i:{Math.min(i, 8)};--hue:var(--g2)" onclick={() => (ui.openCollab = c.id)}>
						<span class="m-cc-av"><Mono name={c.brand.name} /></span>
						<span class="m-cc-b">
							<span class="m-cc-t"><b>{c.product || 'Product'}</b></span>
							<span class="m-cc-s">{c.brand.name} · {stageLabel(c.stage)}</span>
						</span>
						<span class="m-cc-money">{inr(c.product_value)}</span>
					</button>
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
