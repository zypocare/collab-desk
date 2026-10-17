<script lang="ts">
	import { untrack } from 'svelte';
	import type { FY } from '../reports';
	import { studio } from '../studio.svelte';
	import { currentQuarter, downloadPack, quarterPack, quarters } from '../taxPack';
	import { toast } from '../ui.svelte';
	import { inr } from '../util';
	import Icon from './Icon.svelte';
	import Segmented from './Segmented.svelte';

	// The quarter's GST and TDS numbers at a glance, and the files for her CA in one download.
	let { fy }: { fy: FY } = $props();
	const qs = $derived(quarters(fy));
	let pick = $state(String(untrack(() => currentQuarter(fy))));
	const q = $derived(qs.find((x) => String(x.q) === pick) ?? qs[0]);
	const s = $derived(studio.settings!);
	const pack = $derived(quarterPack(studio.collabs, s, q, fy));
	const t = $derived(pack.totals);

	function download() {
		downloadPack(pack.files, `tax-pack-${fy.label.replace(/\s+/g, '-')}-Q${q.q}.zip`);
		toast(`Quarter pack ready: ${pack.files.length} files`, 'check');
	}
</script>

<section class="panel rv tp" style="--i:9;margin-bottom:18px">
	<div class="panel-h"><h2>Quarter pack for your CA</h2><small>GST returns, TDS and expenses</small></div>
	<div class="tp-b">
		<Segmented label="Quarter" bind:value={pick} options={qs.map((x) => ({ value: String(x.q), label: x.label }))} />
		<div class="tp-tiles">
			<div><small>Invoiced (taxable)</small><b>{inr(t.taxable)}</b><em>{t.invoices} invoice{t.invoices === 1 ? '' : 's'}</em></div>
			{#if s.gst_registered}<div class="hl"><small>GST collected</small><b>{inr(t.gst)}</b><em>{t.igst ? `IGST ${inr(t.igst)}` : ''}{t.igst && t.cgst ? ' · ' : ''}{t.cgst ? `CGST + SGST ${inr(t.cgst + t.sgst)}` : ''}{!t.gst ? 'nothing to pay' : ''}</em></div>{/if}
			{#if t.exports}<div><small>Exports (LUT, 0% GST)</small><b>{inr(t.exports)}</b><em>{s.lut_arn ? 'LUT on file' : 'add your LUT ARN in Billing'}</em></div>{/if}
			<div><small>Received</small><b>{inr(t.received)}</b><em>after TDS</em></div>
			<div class:warn={t.tdsCertsMissing > 0}><small>TDS deducted</small><b>{inr(t.tds)}</b><em>{t.tdsCertsMissing ? `${t.tdsCertsMissing} Form 16A missing` : 'claim it in your return'}</em></div>
			<div><small>Expenses</small><b>{inr(t.expenses)}</b><em>logged on collabs</em></div>
		</div>
		<div class="tp-foot">
			<span>{s.gst_registered ? `GSTR-1 for ${q.label} is due by ${q.due} if you file quarterly.` : "You're not GST-registered, so the pack has income, TDS and expenses only."} Includes a summary sheet{s.gst_registered ? ', GSTR-1 B2B and B2C, SAC summary' : ''}, exports, payments with TDS, and expenses.</span>
			<button class="btn primary" onclick={download}><Icon name="download" />Download quarter pack</button>
		</div>
	</div>
</section>
