<script lang="ts">
	import { studio } from '#lib/studio.svelte.ts';
	import { countUp } from '#lib/ui.svelte.ts';
	import { buildReport, dmy, downloadCsv, fyFromStart, fyOf, n2 } from '#lib/reports.ts';
	import { inr, inrS, today } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Segmented from '#lib/components/Segmented.svelte';

	const current = fyOf(today());
	let fyStart = $state(String(current.start));
	const fy = $derived(fyFromStart(Number(fyStart)));
	const r = $derived(buildReport(studio.collabs, fy));
	const s = $derived(studio.settings!);
	const max = $derived(Math.max(50000, Math.ceil(Math.max(...r.months.map((m) => m.received)) / 50000) * 50000));
	const barterFlags = $derived(r.brands.filter((b) => b.barter > 20000));
	const certsMissing = $derived(r.brands.reduce((a, b) => a + b.tdsCertsMissing, 0));

	function exportRegister() {
		downloadCsv(`invoices-${fy.label.replace(' ', '-')}.csv`, [
			['Invoice no.', 'Date', 'Brand', 'Brand GSTIN', 'Brand state', 'Collab', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Invoice total', 'TDS rate %', 'TDS deducted', 'Amount received', 'Status', 'Paid on', 'Payment ref', 'TDS certificate'],
			...r.register.map(({ inv, c }) => [
				inv.number, dmy(inv.issue_date), c.brand.name, c.brand.gstin, inv.bill_to?.state || c.brand.state, c.code, n2(inv.subtotal), n2(inv.cgst), n2(inv.sgst), n2(inv.igst),
				n2(inv.total), inv.tds_rate, n2(inv.tds_deducted), n2(inv.amount_received), inv.status, dmy(inv.paid_on), inv.payment_ref, inv.tds_deducted ? (inv.tds_certificate ? 'Yes' : 'No') : ''
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

<section class="kpis k4" aria-label="Year summary">
	<div class="kpi glow rv" style="--i:1"><div><div class="lbl">Money received</div><div class="big" use:countUp={{ value: r.total.received, money: true }}>{inr(r.total.received)}</div><div class="sub">+ {inr(r.total.tds)} TDS deducted</div></div></div>
	<div class="kpi glow rv" style="--i:2"><div><div class="lbl">Invoiced</div><div class="big" use:countUp={{ value: r.total.taxable, money: true }}>{inr(r.total.taxable)}</div><div class="sub">{r.total.invoices} invoice{r.total.invoices === 1 ? '' : 's'}, before GST</div></div></div>
	<div class="kpi glow rv" style="--i:3"><div><div class="lbl">GST charged</div><div class="big" use:countUp={{ value: r.total.gst, money: true }}>{inr(r.total.gst)}</div><div class="sub">{s.gst_registered ? 'to pay with your GST returns' : 'not registered for GST'}</div></div></div>
	<div class="kpi glow rv" style="--i:4"><div><div class="lbl">Barter value</div><div class="big" use:countUp={{ value: r.total.barter, money: true }}>{inr(r.total.barter)}</div><div class="sub">products received</div></div></div>
</section>

{#if barterFlags.length || certsMissing}
	<section class="warn-box rv" style="--i:5;margin:0 0 18px">
		{#if certsMissing}<span><b>{certsMissing} TDS certificate{certsMissing > 1 ? 's' : ''} (Form 16A) not received yet.</b> Ask the brands for them; you need them to claim the TDS back.</span>{/if}
		{#if barterFlags.length}<span><b>Products worth over ₹20,000 this year from {barterFlags.map((b) => b.name).join(', ')}.</b> Above this limit the brand may have to deduct TDS on the products (Section 194R). Check with your accountant.</span>{/if}
	</section>
{/if}

<div class="today-grid">
	<section class="panel rv" style="--i:6">
		<div class="panel-h"><h2>Month by month</h2><button class="btn sm" onclick={exportMonthly}><Icon name="arrow" />CSV</button></div>
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
	</section>
	<section class="panel glow rv" style="--i:7">
		<div class="panel-h"><h2>Money received</h2><small>{fy.label}</small></div>
		<div class="chart">
			<div class="plot" role="img" aria-label="Money received each month">
				{#each [1, 0.5, 0] as f (f)}<div class="gl" class:base={f === 0} style="bottom:{f * 100}%"><span>{f === 0 ? '0' : inrS(max * f)}</span></div>{/each}
				<div class="bars" style="gap:4%">
					{#each r.months as m, i (m.key)}
						<div class="bcol" style="--i:{i}"><div class="bar" class:cur={m.key === new Date().toISOString().slice(0, 7)} style="height:{(m.received / max) * 100}%" title="{m.label}: {inr(m.received)}"></div></div>
					{/each}
				</div>
			</div>
			<div class="months" style="gap:4%">{#each r.months as m (m.key)}<span title={m.label}><span class="m3">{m.label.slice(0, 3)}</span><span class="m1">{m.label.slice(0, 1)}</span></span>{/each}</div>
		</div>
	</section>
</div>

<section class="panel rv" style="--i:8;margin-bottom:18px">
	<div class="panel-h"><h2>By brand</h2><button class="btn sm" onclick={exportBrands}><Icon name="arrow" />CSV</button></div>
	<div style="overflow-x:auto;padding:0 20px 16px">
		<table class="doc-table rep-table">
			<thead><tr><th>Brand</th><th>Invoiced</th><th>Received</th><th>TDS</th><th>Barter</th></tr></thead>
			<tbody>
				{#each r.brands as b (b.name)}
					<tr><td>{b.name}{#if b.tdsCertsMissing}<span class="pill tint k-follow" style="margin-left:8px">Form 16A missing</span>{/if}</td><td>{inr(b.taxable)}</td><td>{inr(b.received)}</td><td>{inr(b.tds)}</td><td>{b.barter ? inr(b.barter) : '—'}</td></tr>
				{:else}
					<tr><td colspan="5" class="hint">Nothing in this year yet.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<section class="panel rv" style="--i:9">
	<div class="panel-h"><h2>For your accountant</h2><small>CSV files open in Excel and Google Sheets</small></div>
	<div class="export-list">
		<button class="export" onclick={exportRegister}><Icon name="layers" /><div><b>Invoice register</b><small>Every invoice with GSTIN, taxable value, CGST/SGST/IGST, TDS and payment. Useful for GST returns.</small></div></button>
		<button class="export" onclick={exportMonthly}><Icon name="cal" /><div><b>Monthly summary</b><small>Invoiced, GST, received, TDS, barter, costs and what you kept, each month.</small></div></button>
		<button class="export" onclick={exportBrands}><Icon name="users" /><div><b>Brand summary</b><small>Totals per brand, including missing TDS certificates.</small></div></button>
	</div>
</section>
