<script lang="ts">
	import { studio } from '#lib/studio.svelte.ts';
	import { dealStats } from '#lib/dealStats.ts';
	import { countUp } from '#lib/ui.svelte.ts';
	import { buildReport, dmy, downloadCsv, fyFromStart, fyOf, n2 } from '#lib/reports.ts';
	import { inr, inrS, today } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { phone } from '#lib/phone.svelte.ts';
	import Segmented from '#lib/components/Segmented.svelte';
	import MonthReview from '#lib/components/MonthReview.svelte';
	import TaxPack from '#lib/components/TaxPack.svelte';
	import Columns from '#lib/components/charts/Columns.svelte';
	import Barter194R from '#lib/components/Barter194R.svelte';

	const current = fyOf(today());
	let fyStart = $state(String(current.start));
	const fy = $derived(fyFromStart(Number(fyStart)));
	const r = $derived(buildReport(studio.collabs, fy));
	const d = $derived(dealStats(studio.collabs, fy.from, fy.to, studio.settings?.rates ?? {}));
	const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
	const dayText = (x: number | null) => (x === null ? '—' : `${Math.round(x)} day${Math.round(x) === 1 ? '' : 's'}`);
	// One plain-words tip from the numbers.
	const tip = $derived.by(() => {
		if (d.fullPriceRate !== null && d.discountRate !== null && d.fullPriceRate >= d.discountRate - 0.05)
			return `Brands accept ${pct(d.fullPriceRate)} of quotes at your full rate card, about as often as discounted ones (${pct(d.discountRate)}). You can hold your price more often.`;
		if (d.avgDiscount !== null && d.avgDiscount > 0.15) return `You give away ${pct(d.avgDiscount)} on average. Try offering fewer Stories instead of a lower price.`;
		const best = d.byCategory.find((g) => g.avgFee && g.won >= 2);
		if (best) return `${best.key} brands pay you the most on average (${inr(best.avgFee ?? 0)}). Worth pitching more of them.`;
		return '';
	});
	const s = $derived(studio.settings!);
	const barterFlags = $derived(r.brands.filter((b) => b.barter > 20000));
	const certsMissing = $derived(r.brands.reduce((a, b) => a + b.tdsCertsMissing, 0));

	function exportRegister() {
		downloadCsv(`invoices-${fy.label.replace(' ', '-')}.csv`, [
			['Invoice no.', 'Date', 'Brand', 'Brand GSTIN', 'Brand state', 'Collab', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Invoice total', 'TDS rate %', 'TDS deducted', 'Amount received', 'Status', 'Paid on', 'Payment ref', 'TDS certificate', 'Currency', 'Rate to INR', 'Taxable value in INR'],
			...r.register.map(({ inv, c }) => [
				inv.number, dmy(inv.issue_date), c.brand.name, c.brand.gstin, inv.bill_to?.state || c.brand.state, c.code, n2(inv.subtotal), n2(inv.cgst), n2(inv.sgst), n2(inv.igst),
				n2(inv.total), inv.tds_rate, n2(inv.tds_deducted), n2(inv.amount_received), inv.status, dmy(inv.paid_on), inv.payment_ref, inv.tds_deducted ? (inv.tds_certificate ? 'Yes' : 'No') : '', inv.currency || 'INR', inv.inr_rate || 1, n2(inv.subtotal * (Number(inv.inr_rate) || 1))
			])
		]);
	}
	function exportMonthly() {
		downloadCsv(`monthly-summary-${fy.label.replace(' ', '-')}.csv`, [
			['Month', 'Invoices', 'Taxable value invoiced', 'GST charged', 'Money received', 'TDS deducted', 'Barter value', 'Costs', 'Kept (received - costs)'],
			...r.months.map((m) => [m.label, m.invoices, n2(m.taxable), n2(m.gst), n2(m.received), n2(m.tds), n2(m.barter), n2(m.costs), n2(m.received - m.costs)]),
			['Total', r.total.invoices, n2(r.total.taxable), n2(r.total.gst), n2(r.total.received), n2(r.total.tds), n2(r.total.barter), n2(r.total.costs), n2(r.total.received - r.total.costs)]
		]);
	}
	function exportBrands() {
		downloadCsv(`brands-${fy.label.replace(' ', '-')}.csv`, [
			['Brand', 'GSTIN', 'Invoiced (taxable)', 'Received', 'TDS deducted', 'Barter value', 'TDS certificates missing'],
			...r.brands.map((b) => [b.name, b.gstin, n2(b.taxable), n2(b.received), n2(b.tds), n2(b.barter), b.tdsCertsMissing])
		]);
	}
</script>

<svelte:head><title>Reports · {s.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Money · {fy.label}</div>
		<h1>Reports</h1>
		<p>Income, GST and TDS for the financial year (April to March), ready for your accountant.</p>
	</div>
	<div class="acts">
		<Segmented
			label="Financial year"
			bind:value={fyStart}
			options={[current.start - 1, current.start].map((y) => ({ value: String(y), label: fyFromStart(y).label }))}
		/>
	</div>
</header>

<section class="md-hero rv" aria-label="Year summary">
	<div class="mesh" aria-hidden="true"></div>
	<div class="md-main">
		<span class="bx-eb">Money received · {fy.label}</span>
		<b class="md-big num" use:countUp={{ value: r.total.received, money: true }}>{inr(r.total.received)}</b>
		<div class="md-sub">
			{#if r.total.tds}<span>+ {inr(r.total.tds)} TDS deducted</span>{/if}
			{#if r.total.costs}<span>{inr(r.total.costs)} costs · you kept {inr(r.total.received - r.total.costs)}</span>{/if}
		</div>
	</div>
	<div class="md-tiles">
		<div class="md-tile"><small>Invoiced</small><b class="num">{inrS(r.total.taxable)}</b><span>{r.total.invoices} invoice{r.total.invoices === 1 ? '' : 's'}, before GST</span></div>
		<div class="md-tile"><small>GST charged</small><b class="num">{inrS(r.total.gst)}</b><span>{s.gst_registered ? 'to pay with your GST returns' : 'not registered for GST'}</span></div>
		<div class="md-tile"><small>TDS deducted</small><b class="num">{inrS(r.total.tds)}</b><span>{certsMissing ? `${certsMissing} Form 16A missing` : 'claim it back in your return'}</span></div>
		<div class="md-tile"><small>Barter value</small><b class="num">{inrS(r.total.barter)}</b><span>products received</span></div>
	</div>
</section>

<MonthReview />

{#if barterFlags.length || certsMissing}
	<section class="warn-box rv" style="--i:5;margin:0 0 18px">
		{#if certsMissing}<span><b>{certsMissing} TDS certificate{certsMissing > 1 ? 's' : ''} (Form 16A) not received yet.</b> Ask the brands for them; you need them to claim the TDS back.</span>{/if}
		{#if barterFlags.length}<span><b>Products worth over ₹20,000 this year from {barterFlags.map((b) => b.name).join(', ')}.</b> Above this limit the brand may have to deduct TDS on the products (Section 194R). Check with your accountant.</span>{/if}
	</section>
{/if}

<div class="md-grid rep-grid">
	<section class="panel rv" style="--i:6">
		<div class="panel-h"><h2>Month by month</h2><button class="btn sm" onclick={exportMonthly}><Icon name="arrow" />CSV</button></div>
		{#if phone.on}
			{@const live = r.months.filter((m) => m.taxable || m.received || m.barter)}
			<div class="rp-m">
				<div class="rp-total"><small>Kept this year</small><b>{inr(r.total.received - r.total.costs)}</b><span>{inr(r.total.received)} received · {inr(r.total.tds)} TDS · {inr(r.total.costs)} costs</span></div>
				<ol class="tp-rank">
					{#each live as m (m.key)}
						{@const kept = m.received - m.costs}
						<li>
							<span class="tp-n">{m.label.split(' ')[0].slice(0, 3)}<small>{m.label.split(' ')[1] ?? ''}</small></span>
							<span class="tp-t"><b>{m.received ? `${inr(m.received)} in` : 'Nothing in'}</b><small>{[m.taxable ? `${inrS(m.taxable)} invoiced` : '', m.tds ? `${inrS(m.tds)} TDS` : '', m.barter ? `${inrS(m.barter)} barter` : '', m.costs ? `${inrS(m.costs)} costs` : ''].filter(Boolean).join(' · ') || 'no costs'}</small><span class="tp-bar"><i style="width:{Math.max(6, Math.round((Math.max(0, kept) / Math.max(1, ...live.map((x) => x.received - x.costs))) * 100))}%"></i></span></span>
							<b class="tp-v">{inr(kept)}</b>
						</li>
					{:else}
						<li class="rp-none">Nothing in this year yet.</li>
					{/each}
				</ol>
				{#if live.length && live.length < 12}<p class="rp-quiet">{12 - live.length} quiet month{12 - live.length === 1 ? '' : 's'} not shown. The CSV has every month.</p>{/if}
			</div>
		{:else}
		<div style="overflow-x:auto;padding:0 20px 16px">
			<table class="doc-table rep-table">
				<thead><tr><th>Month</th><th>Invoiced</th>{#if s.gst_registered}<th>GST</th>{/if}<th>Received</th><th>TDS</th><th>Barter</th><th>Costs</th><th>Kept</th></tr></thead>
				<tbody>
					{#each r.months as m (m.key)}
						<tr class:empty={!m.taxable && !m.received && !m.barter}>
							<td>{m.label}</td><td>{m.taxable ? inr(m.taxable) : '—'}</td>{#if s.gst_registered}<td>{m.gst ? inr(m.gst) : '—'}</td>{/if}<td>{m.received ? inr(m.received) : '—'}</td><td>{m.tds ? inr(m.tds) : '—'}</td><td>{m.barter ? inr(m.barter) : '—'}</td><td>{m.costs ? inr(m.costs) : '—'}</td><td>{m.received || m.costs ? inr(m.received - m.costs) : '—'}</td>
						</tr>
					{/each}
				</tbody>
				<tfoot><tr><td>Total</td><td>{inr(r.total.taxable)}</td>{#if s.gst_registered}<td>{inr(r.total.gst)}</td>{/if}<td>{inr(r.total.received)}</td><td>{inr(r.total.tds)}</td><td>{inr(r.total.barter)}</td><td>{inr(r.total.costs)}</td><td>{inr(r.total.received - r.total.costs)}</td></tr></tfoot>
			</table>
		</div>
		{/if}
	</section>
	<section class="md-card rv" style="--i:7">
		<header class="md-h"><div><span class="bx-eb">Month by month</span><h2>Money received</h2></div><a href="/studio/money">Dashboard<Icon name="arrow" /></a></header>
		<Columns items={r.months.map((m) => ({ label: m.label.slice(0, 3), values: [m.taxable, m.received], now: m.key === new Date().toISOString().slice(0, 7) }))} names={['Invoiced', 'Received']} colors={['color-mix(in oklab, var(--g1) 30%, transparent)', 'linear-gradient(180deg, var(--g2), var(--g1))']} fmt={inrS} height={240} />
	</section>
</div>

<section class="panel rv deals" style="--i:8;margin-bottom:18px">
	<div class="panel-h"><h2>Your deals</h2><small>requests received in {fy.label}</small></div>
	<div class="dl-kpis">
		<div><b>{pct(d.winRate)}</b><small>of decided requests won ({d.wonCount} won, {d.declined} not)</small></div>
		<div><b>{pct(d.quoteRate)}</b><small>of quotes accepted ({d.quotesSent} sent)</small></div>
		<div><b>{d.avgDiscount === null ? '—' : pct(Math.max(0, d.avgDiscount))}</b><small>average discount from your rate card</small></div>
		<div><b>{dayText(d.avgClose)}</b><small>from request to accepted quote</small></div>
		<div><b>{dayText(d.avgAnswer)}</b><small>for brands to answer a quote</small></div>
		<div><b>{d.avgFee === null ? '—' : inr(d.avgFee)}</b><small>average fee per paid collab</small></div>
	</div>
	{#if tip}<p class="dl-tip"><Icon name="spark" />{tip}</p>{/if}
	<div class="dl-tables">
		{#each [{ title: 'By category', rows: d.byCategory }, { title: 'Where they came from', rows: d.bySource }, { title: 'By type', rows: d.byType }] as { title, rows } (title)}
			<div>
				<h3>{title}</h3>
				{#if phone.on}
					{@const top = Math.max(1, ...rows.map((g) => g.deals))}
					<ol class="tp-rank">
						{#each rows as g, i (g.key)}
							<li class:top={i === 0}>
								<span class="tp-n">{String(i + 1).padStart(2, '0')}</span>
								<span class="tp-t"><b>{g.key}</b><small>{g.deals} request{g.deals === 1 ? '' : 's'}{g.rate === null ? '' : ` · ${pct(g.rate)} won`}</small><span class="tp-bar"><i style="width:{Math.max(6, Math.round((g.deals / top) * 100))}%"></i></span></span>
								<b class="tp-v">{g.avgFee ? inr(g.avgFee) : '—'}</b>
							</li>
						{:else}<li class="rp-none">No requests in this year yet.</li>{/each}
					</ol>
				{:else}
				<table class="doc-table rep-table">
					<thead><tr><th></th><th>Requests</th><th>Won</th><th>Avg. fee</th></tr></thead>
					<tbody>
						{#each rows as g (g.key)}<tr><td>{g.key}</td><td>{g.deals}</td><td>{g.rate === null ? '—' : pct(g.rate)}</td><td>{g.avgFee ? inr(g.avgFee) : '—'}</td></tr>{:else}<tr><td colspan="4" class="hint">No requests in this year yet.</td></tr>{/each}
					</tbody>
				</table>
				{/if}
			</div>
		{/each}
	</div>
</section>

<section class="panel rv" style="--i:8;margin-bottom:18px">
	<div class="panel-h"><h2>By brand</h2><button class="btn sm" onclick={exportBrands}><Icon name="arrow" />CSV</button></div>
	{#if phone.on}
		{@const top = Math.max(1, ...r.brands.map((b) => b.received))}
		<ol class="tp-rank rp-b">
			{#each r.brands as b, i (b.name + i)}
				<li class:top={i === 0}>
					<span class="tp-n">{String(i + 1).padStart(2, '0')}</span>
					<span class="tp-t"><b>{b.name}</b><small>{[b.taxable ? `${inrS(b.taxable)} invoiced` : '', b.tds ? `${inrS(b.tds)} TDS` : '', b.barter ? `${inrS(b.barter)} barter` : ''].filter(Boolean).join(' · ') || 'received'}{#if b.tdsCertsMissing} · <em class="rp-warn">Form 16A missing</em>{/if}</small><span class="tp-bar"><i style="width:{Math.max(6, Math.round((b.received / top) * 100))}%"></i></span></span>
					<b class="tp-v">{inr(b.received)}</b>
				</li>
			{:else}<li class="rp-none">Nothing in this year yet.</li>{/each}
		</ol>
	{:else}
	<div style="overflow-x:auto;padding:0 20px 16px">
		<table class="doc-table rep-table">
			<thead><tr><th>Brand</th><th>Invoiced</th><th>Received</th><th>TDS</th><th>Barter</th></tr></thead>
			<tbody>
				{#each r.brands as b, bi (b.name + bi)}
					<tr><td>{b.name}{#if b.tdsCertsMissing}<span class="pill tint k-follow" style="margin-left:8px">Form 16A missing</span>{/if}</td><td>{inr(b.taxable)}</td><td>{inr(b.received)}</td><td>{inr(b.tds)}</td><td>{b.barter ? inr(b.barter) : '—'}</td></tr>
				{:else}
					<tr><td colspan="5" class="hint">Nothing in this year yet.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
	{/if}
</section>

<TaxPack {fy} />

<Barter194R {fy} />

<section class="panel rv" style="--i:9">
	<div class="panel-h"><h2>For your accountant</h2><small>CSV files open in Excel and Google Sheets</small></div>
	<div class="export-list">
		<button class="export" onclick={exportRegister}><Icon name="layers" /><div><b>Invoice register</b><small>Every invoice with GSTIN, taxable value, CGST/SGST/IGST, TDS and payment. Useful for GST returns.</small></div></button>
		<button class="export" onclick={exportMonthly}><Icon name="cal" /><div><b>Monthly summary</b><small>Invoiced, GST, received, TDS, barter, costs and what you kept, each month.</small></div></button>
		<button class="export" onclick={exportBrands}><Icon name="users" /><div><b>Brand summary</b><small>Totals per brand, including missing TDS certificates.</small></div></button>
	</div>
</section>
