<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import Icon from '#lib/components/Icon.svelte';

	// A Miracle plan's GST tax invoice (migration 157), by the private link in the receipt email and in
	// Plan & billing. "Download PDF" saves it through the browser's print dialog; the same invoice also
	// came as a PDF with the receipt email.
	type Inv = {
		title: string;
		number: string;
		date: string;
		seller: { legal_name?: string; address?: string; state?: string; gstin?: string; pan?: string; email?: string };
		buyer: { name?: string; trade_name?: string; gstin?: string; address?: string; state?: string; city?: string; email?: string };
		place_of_supply: string;
		item: { description: string; from: string; to: string; sac: string; qty: number };
		taxable: number;
		gst_rate: number;
		cgst: number;
		sgst: number;
		igst: number;
		total: number;
		gst_charged: boolean;
		paid: { on: string; via: string; ref: string };
	};
	let inv = $state<Inv | null>(null);
	let loaded = $state(false);
	onMount(async () => {
		const { data } = await supabase.rpc('plan_invoice', { p_token: page.params.token });
		inv = (data as Inv | null) ?? null;
		loaded = true;
	});
	const fmtLong = (d: string) => (d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
	const rs = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	function words(n: number) {
		const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
		const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
		const two = (x: number) => (x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? '-' + ones[x % 10] : ''));
		const three = (x: number) => (x >= 100 ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
		const r = Math.floor(n), p = Math.round((n - r) * 100);
		const parts = [Math.floor(r / 1e7) && three(Math.floor(r / 1e7)) + ' Crore', Math.floor((r % 1e7) / 1e5) && two(Math.floor((r % 1e7) / 1e5)) + ' Lakh', Math.floor((r % 1e5) / 1e3) && two(Math.floor((r % 1e5) / 1e3)) + ' Thousand', r % 1e3 && three(r % 1e3)].filter(Boolean);
		return `${parts.join(' ') || 'Zero'} Rupees${p ? ` and ${two(p)} Paise` : ''} only`;
	}
</script>

<svelte:head><title>{inv ? `${inv.title} ${inv.number}` : 'Invoice'} · Miracle</title><meta name="robots" content="noindex" /></svelte:head>

<div class="page">
	<div class="wrap doc-wrap">
		{#if !loaded}
			<div class="loader" style="min-height:50vh"><span class="ring"><span></span></span></div>
		{:else if !inv}
			<div class="empty-card" style="margin-top:40px"><h2>Invoice not found</h2><p>Check the link in your receipt email, or open Plan & billing in Miracle.</p></div>
		{:else}
			<div class="doc-tools no-print">
				<span class="pill tint k-paid">Paid</span>
				<button class="btn primary" onclick={() => print()}><Icon name="arrow" />Download PDF</button>
			</div>
			<article class="doc inv-doc">
				<header class="doc-h">
					<div>
						<div class="eb">{inv.title} · {inv.number}</div>
						<h1>{inv.seller.legal_name}</h1>
						<small class="hint">{[inv.seller.address, inv.seller.state, inv.seller.gstin ? `GSTIN ${inv.seller.gstin}` : '', inv.seller.pan ? `PAN ${inv.seller.pan}` : ''].filter(Boolean).join(' · ')}</small>
					</div>
					<dl class="inv-meta">
						<div><dt>Date</dt><dd>{fmtLong(inv.date)}</dd></div>
						<div><dt>Place of supply</dt><dd>{inv.place_of_supply || '—'}</dd></div>
					</dl>
				</header>
				<section class="doc-parties" style="grid-template-columns:minmax(0,1fr)">
					<div>
						<span class="lbl">Billed to</span><b>{inv.buyer.name}</b>
						{#if inv.buyer.trade_name && inv.buyer.trade_name !== inv.buyer.name}<small>{inv.buyer.trade_name}</small>{/if}
						{#if inv.buyer.address || inv.buyer.city || inv.buyer.state}<small>{[inv.buyer.address, inv.buyer.city, inv.buyer.state].filter(Boolean).join(', ')}</small>{/if}
						{#if inv.buyer.gstin}<small>GSTIN {inv.buyer.gstin}</small>{/if}
						{#if inv.buyer.email}<small>{inv.buyer.email}</small>{/if}
					</div>
				</section>
				<div style="overflow-x:auto">
					<table class="doc-table">
						<thead><tr><th>Description</th><th>SAC</th><th>Qty</th><th>Taxable value</th></tr></thead>
						<tbody><tr><td>{inv.item.description}<br /><small class="hint">{fmtLong(inv.item.from)} to {fmtLong(inv.item.to)}</small></td><td>{inv.item.sac}</td><td>{inv.item.qty}</td><td>{rs(inv.taxable)}</td></tr></tbody>
						<tfoot>
							<tr class="sub"><td colspan="3">Taxable value</td><td>{rs(inv.taxable)}</td></tr>
							{#if inv.gst_charged && inv.igst}
								<tr class="sub"><td colspan="3">IGST @ {inv.gst_rate}%</td><td>{rs(inv.igst)}</td></tr>
							{:else if inv.gst_charged}
								<tr class="sub"><td colspan="3">CGST @ {inv.gst_rate / 2}%</td><td>{rs(inv.cgst)}</td></tr>
								<tr class="sub"><td colspan="3">SGST @ {inv.gst_rate / 2}%</td><td>{rs(inv.sgst)}</td></tr>
							{/if}
							<tr><td colspan="3">Total</td><td>{rs(inv.total)}</td></tr>
						</tfoot>
					</table>
				</div>
				<p class="hint" style="margin-top:8px">{words(inv.total)}</p>
				<p class="bill-paid">Paid on {fmtLong(inv.paid.on)} via {inv.paid.via}{inv.paid.ref ? ` · ref ${inv.paid.ref}` : ''}</p>
				<footer class="doc-sign">
					<p class="hint">{inv.gst_charged ? 'Prices include GST. Tax is not payable on reverse charge.' : 'GST is not charged on this invoice.'} Miracle takes no commission on deals between brands and creators; this invoice is only for the Miracle plan. Computer-generated; no signature needed.</p>
					<p class="hint">{inv.seller.legal_name} · {inv.seller.email ?? 'support@miracleapp.live'} · www.miracleapp.live</p>
				</footer>
			</article>
		{/if}
	</div>
</div>

<style>
	.bill-paid {
		margin: 14px 0 0;
		padding: 10px 14px;
		border-radius: 12px;
		background: color-mix(in oklab, var(--ok) 14%, transparent);
		color: var(--ok);
		font-weight: 650;
		font-size: 14.5px;
	}
</style>
