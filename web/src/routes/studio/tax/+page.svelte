<script lang="ts">
	import { fyFromStart, fyOf } from '#lib/reports.ts';
	import { saveBrand, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { gstLimit, tdsByBrand, turnover, type QuarterKey } from '#lib/taxDesk.ts';
	import { loadOtherIncome, otherIncome, otherInFy } from '#lib/otherIncome.svelte.ts';
	import { onMount } from 'svelte';
	import { toast } from '#lib/ui.svelte.ts';
	import { errMessage, fmt, inr } from '#lib/util.ts';
	import Barter194R from '#lib/components/Barter194R.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Segmented from '#lib/components/Segmented.svelte';

	// The tax desk: GST registration, TDS by brand and in her Form 26AS, barter tax, and her PAN.
	const now = fyOf(new Date());
	let start = $state(String(now.start));
	const fy = $derived(fyFromStart(Number(start)));
	const s = $derived(studio.settings!);
	onMount(() => {
		if (!otherIncome.loaded) loadOtherIncome().catch(() => {});
	});
	const oi = $derived(otherInFy(otherIncome.rows, fy));
	const t = $derived(turnover(studio.collabs, fy, oi.total));
	const limit = $derived(gstLimit(s?.state));
	const share = $derived(Math.min(1, t.total / limit));
	const tds = $derived(tdsByBrand(studio.collabs, fy));
	const quarters = $derived(
		(['Q1', 'Q2', 'Q3', 'Q4'] as QuarterKey[]).map((q) => {
			const list = tds.flatMap((b) => b.invoices.filter((x) => x.q === q && x.tds > 0).map((x) => ({ ...x, brand: b.brand })));
			return { q, list, total: list.reduce((a, x) => a + x.tds, 0), seen: list.filter((x) => x.inv.tds_seen_at).length };
		})
	);
	const QLABEL: Record<QuarterKey, string> = { Q1: 'Apr–Jun', Q2: 'Jul–Sep', Q3: 'Oct–Dec', Q4: 'Jan–Mar' };
	const exportsNoLut = $derived(studio.collabs.some((c) => c.invoices.some((i) => i.tax_mode === 'export' && i.status !== 'cancelled')) && !s?.lut_arn);

	async function seen(id: string, on: boolean) {
		const { error } = await supabase.from('invoices').update({ tds_seen_at: on ? new Date().toISOString() : null }).eq('id', id);
		if (error) return toast(errMessage(error), 'alert');
		for (const c of studio.collabs) for (const i of c.invoices) if (i.id === id) i.tds_seen_at = on ? new Date().toISOString() : null;
	}
	async function setTan(brandId: string, v: string) {
		const tan = v.trim().toUpperCase();
		if (tan && !/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(tan)) return toast('A TAN has 10 characters, like BLRK12345E.', 'alert');
		await saveBrand(brandId, { tan });
	}
</script>

<svelte:head><title>Tax desk · Miracle</title></svelte:head>

<a class="back rv" href="/studio/money"><Icon name="back" />Money</a>
<header class="ph rv">
	<div>
		<div class="eb">{fy.label} · GST, TDS and barter</div>
		<h1>Your <em>tax desk</em></h1>
	</div>
	<div class="acts">
		<Segmented label="Year" bind:value={start} options={[{ value: String(now.start - 1), label: fyFromStart(now.start - 1).label }, { value: String(now.start), label: now.label }]} />
	</div>
</header>

{#if s && !s.pan}
	<div class="tx-alert rv"><Icon name="alert" /><span><b>Add your PAN.</b> Without it brands must deduct TDS at 20% instead of 10% (section 206AA). <a href="/studio/settings?s=payments">Add it in Settings</a></span></div>
{/if}
{#if exportsNoLut}
	<div class="tx-alert rv"><Icon name="alert" /><span><b>Export invoices without an LUT number.</b> File the LUT (Form GST RFD-11) each year to bill foreign brands without GST, then add its ARN in <a href="/studio/settings?s=payments">Settings</a>.</span></div>
{/if}

<div class="tx">
	<section class="panel tx-card rv" style="--i:1" aria-labelledby="tx-gst">
		<div class="panel-h"><h2 id="tx-gst">GST</h2><small>{s?.gst_registered ? `Registered${s.gstin ? ` · ${s.gstin}` : ''}` : 'Not registered'}</small></div>
		<div class="tx-b">
			<div class="tx-big"><b class="num">{inr(t.total)}</b><small>turnover in {fy.label}, counting barter at its value</small></div>
			{#if !s?.gst_registered}
				<div class="tx-bar" role="img" aria-label="{Math.round(share * 100)}% of the GST limit"><i style="width:{share * 100}%" class:hot={share >= 0.8}></i></div>
				<p class="hint">{share >= 1 ? `Over the ${inr(limit)} limit: register for GST within 30 days and charge 18% from then on.` : share >= 0.8 ? `Close to the ${inr(limit)} limit (${inr(limit - t.total)} to go). Start your GST registration now; it takes a few weeks.` : `${inr(limit - t.total)} to go before you need GST (the limit is ${inr(limit)} a year).`}</p>
			{/if}
			<dl class="tx-dl">
				<dt>Fees invoiced</dt><dd>{inr(t.fees)}</dd>
				{#if t.paidNoInvoice}<dt>Paid without an invoice</dt><dd>{inr(t.paidNoInvoice)}</dd>{/if}
				<dt>Barter (products, stays)</dt><dd>{inr(t.barter)}</dd>
				{#if t.other}<dt>Other income (YouTube, affiliate…)</dt><dd>{inr(t.other)}</dd>{/if}
			</dl>
			<small class="hint">{t.other ? 'Income from outside Miracle comes from Money › Other income.' : 'YouTube, affiliate and platform income count too: add them in Money › Other income.'}</small>
		</div>
	</section>

	<section class="panel tx-card rv" style="--i:2" aria-labelledby="tx-tds">
		<div class="panel-h"><h2 id="tx-tds">TDS by brand</h2><small>194J and 194C, now Section 393 · same rates</small></div>
		<div class="tx-b">
			{#each tds as b (b.brandId)}
				<div class="tx-brand">
					<div class="tx-bh"><b>{b.brand}</b><span class="num">{inr(b.paid)}</span></div>
					<small class="tx-note {b.tone}">{b.note}</small>
					<label class="tx-tan"><span>TAN</span><input class="inp sm" value={b.tan} placeholder="e.g. BLRK12345E" maxlength="10" onchange={(e) => setTan(b.brandId, (e.currentTarget as HTMLInputElement).value)} /></label>
				</div>
			{:else}
				<p class="hint">No invoices in {fy.label} yet.</p>
			{/each}
			{#if oi.tds}
				<div class="tx-brand">
					<div class="tx-bh"><b>Other income</b><span class="num">{inr(oi.total)}</span></div>
					<small class="tx-note info">{inr(oi.tds)} TDS deducted by {[...new Set(oi.list.filter((r) => r.tds).map((r) => r.payer))].join(', ')}. Check it in your 26AS too.</small>
				</div>
			{/if}
		</div>
	</section>

	<section class="panel tx-card tx-wide rv" style="--i:3" aria-labelledby="tx-26">
		<div class="panel-h"><h2 id="tx-26">Match with your Form 26AS</h2><small>Tick each one when it shows in 26AS or AIS on the income-tax site</small></div>
		<div class="tx-b tx-q">
			{#each quarters as q (q.q)}
				<div class="tx-qc">
					<div class="tx-bh"><b>{q.q} · {QLABEL[q.q]}</b><span class="num">{inr(q.total)}</span></div>
					{#each q.list as x (x.inv.id)}
						<label class="check-row"><input type="checkbox" class="cbx" checked={!!x.inv.tds_seen_at} onchange={(e) => seen(x.inv.id, (e.currentTarget as HTMLInputElement).checked)} /><span>{x.brand} · {x.inv.number} · <b>{inr(x.tds)}</b>{x.inv.paid_on ? ` · paid ${fmt(x.inv.paid_on)}` : ''}</span></label>
					{:else}
						<small class="hint">No TDS this quarter.</small>
					{/each}
					{#if q.list.length}<small class="hint">{q.seen === q.list.length ? 'All in your 26AS.' : `${q.list.length - q.seen} not seen yet. Brands file TDS returns by the end of the month after the quarter; if it's missing after that, ask them.`}</small>{/if}
				</div>
			{/each}
		</div>
	</section>
</div>

<Barter194R {fy} />

<style>
	.tx {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		margin-bottom: 16px;
	}
	.tx-wide {
		grid-column: 1 / -1;
	}
	@media (max-width: 900px) {
		.tx {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.tx-b {
		display: grid;
		gap: 12px;
		padding: 0 18px 18px;
	}
	.tx-big {
		display: grid;
		gap: 2px;
	}
	.tx-big b {
		font: 400 34px/1 var(--f-serif, Georgia, serif);
	}
	.tx-big small {
		color: var(--ink-3);
	}
	.tx-bar {
		height: 8px;
		border-radius: 99px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.tx-bar i {
		display: block;
		height: 100%;
		background: var(--ok);
	}
	.tx-bar i.hot {
		background: var(--warn);
	}
	.tx-dl {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 6px 12px;
		margin: 0;
		font-size: 13.5px;
	}
	.tx-dl dt {
		color: var(--ink-3);
	}
	.tx-dl dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
	.tx-brand {
		display: grid;
		gap: 6px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--line);
	}
	.tx-bh {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	.tx-note {
		line-height: 1.45;
	}
	.tx-note.warn {
		color: var(--warn);
	}
	.tx-note.ok {
		color: var(--ok);
	}
	.tx-note.info {
		color: var(--ink-3);
	}
	.tx-tan {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: var(--ink-3);
	}
	.tx-tan input {
		max-width: 160px;
		height: 36px;
		padding-block: 0;
		font-size: 13px;
	}
	.tx-q {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	@media (max-width: 900px) {
		.tx-q {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.tx-qc {
		display: grid;
		gap: 8px;
		align-content: start;
		padding: 12px;
		border-radius: 14px;
		background: var(--surface-2);
	}
	.tx-alert {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		margin-bottom: 12px;
		padding: 12px 14px;
		border-radius: 14px;
		background: color-mix(in oklab, var(--warn) 12%, var(--surface));
		font-size: 13.5px;
		line-height: 1.5;
	}
</style>
