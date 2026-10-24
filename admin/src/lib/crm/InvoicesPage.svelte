<script lang="ts">
	import { untrack } from 'svelte';
	import { day, inr2 as inr, num } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { toast } from '../ui.svelte.ts';
	import { KIND_LABEL, PERIOD_LABEL, invoiceUrl, subjectHref } from './billing.ts';

	// Tax invoices for Miracle's own plan payments, for a period: totals for the GST return, every invoice
	// with a link to it, and a CSV for the accountant (B2B rows are the ones with a buyer GSTIN).
	type R = Record<string, any>;
	type Range = 'month' | 'last' | 'quarter' | 'fy' | 'custom';
	let range = $state<Range>('month');
	let from = $state('');
	let to = $state('');
	let d = $state<R | null>(null);
	let err = $state('');
	let busy = $state(false);

	const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
	// Indian financial year: April to March; quarters Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar.
	function bounds(r: Range): [string, string] {
		const now = new Date();
		const y = now.getFullYear();
		const m = now.getMonth();
		if (r === 'month') return [iso(new Date(y, m, 1)), iso(now)];
		if (r === 'last') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
		if (r === 'quarter') {
			const fyMonth = (m + 9) % 12;
			const qStart = new Date(y, m - (fyMonth % 3), 1);
			return [iso(qStart), iso(now)];
		}
		const fyStartYear = m >= 3 ? y : y - 1;
		return [iso(new Date(fyStartYear, 3, 1)), iso(now)];
	}
	async function load() {
		busy = true;
		const { data, error } = await supabase.rpc('admin_billing_invoices', { p_from: from || null, p_to: to || null });
		busy = false;
		err = error ? errMessage(error) : '';
		if (!error) d = data as R;
	}
	function pick(r: Range) {
		range = r;
		if (r !== 'custom') [from, to] = bounds(r);
	}
	$effect(() => {
		void from;
		void to;
		untrack(load);
	});
	pick('month');

	function csv() {
		if (!d?.rows.length) return toast('No invoices in this period.', true);
		const cols: [string, (r: R) => unknown][] = [
			['Invoice number', (r) => r.invoice_no], ['Invoice date', (r) => r.date], ['Buyer', (r) => r.buyer], ['Buyer GSTIN', (r) => r.buyer_gstin ?? ''],
			['Type', (r) => (r.buyer_gstin ? 'B2B' : 'B2C')], ['Place of supply', (r) => r.place_of_supply], ['Taxable value', (r) => r.taxable],
			['CGST', (r) => r.cgst], ['SGST', (r) => r.sgst], ['IGST', (r) => r.igst], ['Invoice total', (r) => r.total], ['Plan', (r) => r.plan],
			['Period', (r) => PERIOD_LABEL[r.period] ?? r.period], ['Email', (r) => r.email], ['Payment reference', (r) => r.payment_ref], ['Invoice link', (r) => (r.token ? invoiceUrl(r.token) : '')]
		];
		const cell = (v: unknown) => {
			const s = v === null || v === undefined ? '' : String(v);
			return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
		};
		const lines = [cols.map(([h]) => cell(h)).join(','), ...[...d.rows].reverse().map((r: R) => cols.map(([, f]) => cell(f(r))).join(','))];
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
		a.download = `miracle-plan-invoices-${d.from}-to-${d.to}.csv`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 2000);
	}
	const RANGES: [Range, string][] = [['month', 'This month'], ['last', 'Last month'], ['quarter', 'This quarter'], ['fy', 'This financial year'], ['custom', 'Custom']];
	const t = $derived(d?.totals ?? {});
</script>

<div class="iv">
	<header class="ih">
		<div>
			<div class="eb">Billing</div>
			<h1>Plan invoices</h1>
			<p class="muted lead">Tax invoices for Miracle's plan payments. Amounts in rupees; seller details come from <a href={href('plans')}>Plans & settings</a>.</p>
		</div>
		<button class="btn pri" onclick={csv} disabled={!d?.rows.length}>Export CSV for GST</button>
	</header>

	<div class="bar">
		<div class="seg" role="group" aria-label="Period">
			{#each RANGES as [k, l] (k)}<button class:on={range === k} aria-pressed={range === k} onclick={() => pick(k)}>{l}</button>{/each}
		</div>
		<label class="dt">From <input class="inp" type="date" bind:value={from} onchange={() => (range = 'custom')} /></label>
		<label class="dt">To <input class="inp" type="date" bind:value={to} onchange={() => (range = 'custom')} /></label>
		{#if busy}<span class="spinner muted"></span>{/if}
	</div>

	{#if err}<p class="err">{err}</p>{/if}
	{#if d}
		<section class="tot">
			<div class="card k"><small>Invoices</small><b class="mono">{num(t.count)}</b><span>{num(t.b2b)} B2B (buyer GSTIN) · {num(Number(t.count) - Number(t.b2b))} B2C</span></div>
			<div class="card k"><small>Taxable value</small><b class="mono">{inr(t.taxable)}</b><span>before GST</span></div>
			<div class="card k"><small>CGST + SGST</small><b class="mono">{inr(Number(t.cgst) + Number(t.sgst))}</b><span>{inr(t.cgst)} + {inr(t.sgst)} · same state</span></div>
			<div class="card k"><small>IGST</small><b class="mono">{inr(t.igst)}</b><span>other states</span></div>
			<div class="card k"><small>Invoice total</small><b class="mono">{inr(t.total)}</b><span>{day(d.from)} – {day(d.to)}</span></div>
		</section>

		<section class="card tbl-wrap">
			{#if !d.rows.length}
				<div class="card-empty">No plan invoices between {day(d.from)} and {day(d.to)}.</div>
			{:else}
				<table class="tbl">
					<thead><tr><th>Invoice</th><th>Date</th><th>Buyer</th><th>GSTIN</th><th>Place of supply</th><th class="r">Taxable</th><th class="r">CGST</th><th class="r">SGST</th><th class="r">IGST</th><th class="r">Total</th><th>Plan</th></tr></thead>
					<tbody>
						{#each d.rows as r (r.id)}
							<tr>
								<td class="mono">{#if r.token}<a href={invoiceUrl(r.token)} target="_blank" rel="noopener">{r.invoice_no}</a>{:else}{r.invoice_no ?? '—'}{/if}</td>
								<td>{day(r.date)}</td>
								<td><a class="w5" href={subjectHref(r.subject_kind, r.subject)}>{r.buyer || r.email}</a><small class="d">{KIND_LABEL[r.subject_kind] ?? r.subject_kind}</small></td>
								<td class="mono">{r.buyer_gstin || '—'}</td>
								<td>{r.place_of_supply || '—'}</td>
								<td class="r mono">{inr(r.taxable)}</td>
								<td class="r mono">{inr(r.cgst)}</td>
								<td class="r mono">{inr(r.sgst)}</td>
								<td class="r mono">{inr(r.igst)}</td>
								<td class="r mono">{inr(r.total)}</td>
								<td class="mono">{r.plan}<small class="d">{PERIOD_LABEL[r.period] ?? r.period}</small></td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	{:else if !err}
		<div class="ld"><span class="spinner"></span></div>
	{/if}
</div>

<style>
	.iv { display: flex; flex-direction: column; gap: 16px; }
	.ih { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 12px; }
	.eb { font-size: 12.5px; color: var(--ink-3); margin-bottom: 3px; }
	h1 { font-size: 24px; }
	.lead { margin-top: 4px; font-size: 13.5px; }
	.bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
	.seg { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--line-strong); border-radius: 7px; overflow: hidden; background: var(--surface); }
	.seg button { height: 32px; padding: 0 12px; border: 0; background: none; font-size: 13px; font-weight: 500; color: var(--ink-2); }
	.seg button.on { background: var(--ink); color: #fff; }
	.dt { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-2); }
	.dt .inp { height: 32px; width: auto; }
	.ld { padding: 60px; display: grid; place-items: center; }
	.tot { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
	.k { padding: 14px 16px; display: grid; gap: 4px; }
	.k small { font-size: 12.5px; color: var(--ink-3); }
	.k b { font-size: 21px; font-weight: 500; }
	.k span { font-size: 12px; color: var(--ink-3); }
	.w5 { font-weight: 500; }
	.d { display: block; font-size: 12px; color: var(--ink-3); font-family: var(--f-body); }
</style>
