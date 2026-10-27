<script lang="ts">
	import { page } from '$app/state';
	import { todayIso } from '#lib/util.ts';
	import { money } from '#lib/currency.ts';
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { amountInWords, balanceDue, INVOICE_STATUS, normaliseInvoice, upiLink, type InvoiceView } from '#lib/invoice.ts';
	import UpiQr from '#lib/components/UpiQr.svelte';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { errMessage, fmtLong, inr } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import BrandInvite from '#lib/components/BrandInvite.svelte';

	let inv = $state<InvoiceView | null>(null);
	let loaded = $state(false);
	let busy = $state(false);
	let qrOpen = $state(false);

	onMount(async () => {
		const { data } = await supabase.rpc('public_invoice', { p_token: page.params.token });
		inv = data ? normaliseInvoice(data as InvoiceView) : null;
		loaded = true;
	});

	const due = $derived(inv ? balanceDue(inv) : 0);
	// UPI is for rupees only; foreign brands pay by international transfer.
	const foreign = $derived(!!inv && !!inv.currency && inv.currency !== 'INR');
	const upi = $derived(inv && !foreign && inv.seller.upi_id && due > 0 ? upiLink(inv) : '');
	const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent);

	// "I've paid": amount, UTR / reference and date, so she can confirm it.
	let claimOpen = $state(false);
	let claim = $state({ amount: '', ref: '', on: '', name: '' });
	let claimBusy = $state(false);
	let claimErr = $state('');
	function openClaim() {
		claim.amount = String(Math.round(due));
		claim.on = todayIso();
		claimOpen = true;
	}
	async function sendClaim(e: SubmitEvent) {
		e.preventDefault();
		claimErr = '';
		claimBusy = true;
		const { error } = await supabase.rpc('invoice_claim_paid', { p_token: page.params.token, p_amount: Number(claim.amount) || 0, p_ref: claim.ref, p_on: claim.on || null, p_name: claim.name });
		claimBusy = false;
		if (error) return (claimErr = errMessage(error));
		const { data } = await supabase.rpc('public_invoice', { p_token: page.params.token });
		inv = data ? normaliseInvoice(data as InvoiceView) : inv;
		claimOpen = false;
		toast(`Thank you! ${inv?.seller.name ?? 'The creator'} has been told and will confirm it.`, 'check');
	}

	async function download() {
		if (!inv || busy) return;
		busy = true;
		try {
			const { downloadInvoicePdf } = await import('#lib/invoicePdf.ts');
			await downloadInvoicePdf(inv);
		} catch (e) {
			toast(`Couldn't save the PDF: ${errMessage(e)}`, 'alert');
		}
		busy = false;
	}
	// Amounts in the invoice's own currency.
	const cm = (n: number | null | undefined) => money(n, inv?.currency);
</script>

<svelte:head><title>{inv ? `Invoice ${inv.number}` : 'Invoice'}</title><meta name="robots" content="noindex" /></svelte:head>

<div class="page invoice-page">
	<div class="wrap doc-wrap">
		{#if !loaded}
			<div class="loader" style="min-height:50vh"><span class="ring"><span></span></span></div>
		{:else if !inv}
			<div class="empty-card" style="margin-top:40px"><h2>Invoice not found</h2><p>Check the link in your email. It may have been cancelled.</p></div>
		{:else}
			<div class="doc-tools no-print">
				<span class="pill tint {INVOICE_STATUS[inv.status].k}">{INVOICE_STATUS[inv.status].label}</span>
				<button class="btn primary" disabled={busy} onclick={download}>{#if busy}<span class="spinner"></span>{:else}<Icon name="download" />{/if}{busy ? 'Saving PDF…' : 'Download PDF'}</button>
			</div>

			{#if due > 0 && inv.status !== 'cancelled'}
				<section class="pay-card rv no-print">
					<div class="pay-main">
						<span class="lbl">Amount to pay</span>
						<b class="num">{cm(due)}</b>
						<small>{inv.due_date ? `Due ${fmtLong(inv.due_date)}` : ''}{inv.tds_amount ? ` · after ${cm(inv.tds_amount)} TDS` : ''}</small>
						{#if upi}
							<div class="pay-actions">
								{#if isMobile}<a class="btn grad lg" href={upi}><Icon name="send" />Pay with UPI app</a>{/if}
								<button class="btn upi-copy" onclick={() => copyText(inv!.seller.upi_id, 'UPI ID copied')} aria-label={`Copy UPI ID ${inv.seller.upi_id}`}><Icon name="copy" /><span>{inv.seller.upi_id}</span></button>
							</div>
						{/if}
					</div>
					{#if upi}
						<div class="pay-qr">
							<button class="qr-toggle" aria-expanded={qrOpen} aria-controls="invoice-upi-qr" onclick={() => (qrOpen = !qrOpen)}><Icon name="qr" />{qrOpen ? 'Hide payment QR' : 'Scan or download payment QR'}<Icon name={qrOpen ? 'chevU' : 'chevD'} /></button>
							<div id="invoice-upi-qr" class="qr-content" class:expanded={qrOpen}><UpiQr upiId={inv.seller.upi_id} name={inv.seller.name} amount={due} note={`Invoice ${inv.number}`} /></div>
						</div>
					{/if}
				</section>
				{#if inv.claim_at}
					<section class="claim-card rv no-print"><Icon name="clock" /><div><b>Payment reported: {cm(Number(inv.claim_amount))}</b><small>Paid {inv.claim_on ? fmtLong(inv.claim_on) : ''} · ref {inv.claim_ref}. Waiting for {inv.seller.name} to confirm it arrived.</small></div></section>
				{:else if claimOpen}
					<form class="panel claim-form rv no-print" onsubmit={sendClaim}>
						<div class="panel-h"><h2>Tell {inv.seller.name} you've paid</h2><small>so the reminders stop</small></div>
						<div class="form-b">
							<div class="f"><label for="cl-amt">Amount paid ({inv.currency && inv.currency !== 'INR' ? inv.currency : '₹'})</label><input class="inp num" id="cl-amt" type="number" inputmode="decimal" min="1" bind:value={claim.amount} /></div>
							<div class="f"><label for="cl-ref">UTR / transaction reference</label><input class="inp" id="cl-ref" placeholder="e.g. 412345678901" bind:value={claim.ref} /></div>
							<div class="f"><label for="cl-on">Paid on</label><input class="inp" id="cl-on" type="date" bind:value={claim.on} /></div>
							<div class="f"><label for="cl-name">Your name <span class="hint">(optional)</span></label><input class="inp" id="cl-name" bind:value={claim.name} /></div>
						</div>
						{#if claimErr}<div class="err" style="margin:0 20px">{claimErr}</div>{/if}
						<div class="row-btns" style="border:0"><button class="btn ghost" type="button" onclick={() => (claimOpen = false)}>Cancel</button><button class="btn grad" type="submit" disabled={claimBusy || !claim.ref.trim()}>{#if claimBusy}<span class="spinner"></span>{:else}<Icon name="check" />{/if}Send</button></div>
					</form>
				{:else}
					<p class="claim-link no-print"><button class="btn" onclick={openClaim}><Icon name="check" />I've paid this invoice</button></p>
				{/if}
			{:else if inv.status === 'paid'}
				<section class="pay-card paid rv no-print"><div class="pay-main"><span class="lbl">Paid</span><b>Thank you!</b><small>Received {inv.paid_on ? fmtLong(inv.paid_on) : ''}</small></div></section>
			{/if}

			<article class="doc inv-doc">
				<header class="doc-h">
					<div>
						<div class="eb">{inv.seller.gst_registered ? 'Tax invoice' : 'Invoice'} · {inv.number}</div>
						<h1>{inv.seller.name}</h1>
						<small class="hint">{[inv.seller.handle ? `@${inv.seller.handle}` : '', inv.seller.state, inv.seller.pan ? `PAN ${inv.seller.pan}` : '', inv.seller.gstin ? `GSTIN ${inv.seller.gstin}` : ''].filter(Boolean).join(' · ')}</small>
					</div>
					<dl class="inv-meta">
						<div><dt>Date</dt><dd>{fmtLong(inv.issue_date)}</dd></div>
						<div><dt>Due</dt><dd>{inv.due_date ? fmtLong(inv.due_date) : '—'}</dd></div>
						<div><dt>Reference</dt><dd>{inv.bill_to.code}</dd></div>
					</dl>
				</header>
				<section class="doc-parties" style="grid-template-columns:minmax(0,1fr)">
					<div>
						<span class="lbl">Bill to</span><b>{inv.bill_to.name}</b>
						{#if inv.bill_to.gstin}<small>GSTIN {inv.bill_to.gstin}</small>{/if}
						{#if inv.bill_to.address}<small>{inv.bill_to.address}{inv.bill_to.state ? `, ${inv.bill_to.state}` : ''}</small>{/if}
					</div>
				</section>
				<div style="overflow-x:auto">
					<table class="doc-table" aria-label="Invoice items and totals">
						<thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
						<tbody>{#each inv.items as it, i (i)}<tr><td>{it.description}</td><td data-label="Qty">{it.qty}</td><td data-label="Rate">{cm(it.rate)}</td><td data-label="Amount">{cm(it.qty * it.rate)}</td></tr>{/each}</tbody>
						<tfoot>
							<tr class="sub"><td colspan="3">Subtotal</td><td>{cm(inv.subtotal)}</td></tr>
							{#if inv.tax_mode === 'intra'}
								<tr class="sub"><td colspan="3">CGST @ {inv.gst_rate / 2}%</td><td>{cm(inv.cgst)}</td></tr>
								<tr class="sub"><td colspan="3">SGST @ {inv.gst_rate / 2}%</td><td>{cm(inv.sgst)}</td></tr>
							{:else if inv.tax_mode === 'inter'}
								<tr class="sub"><td colspan="3">IGST @ {inv.gst_rate}%</td><td>{cm(inv.igst)}</td></tr>
							{/if}
							<tr><td colspan="3">Total</td><td>{cm(inv.total)}</td></tr>
							{#if inv.tds_amount}
								<tr class="sub"><td colspan="3">Less TDS @ {inv.tds_rate}% (if deducted)</td><td>− {cm(inv.tds_amount)}</td></tr>
								<tr><td colspan="3">Amount payable</td><td>{cm(inv.payable)}</td></tr>
							{/if}
						</tfoot>
					</table>
				</div>
				<p class="hint" style="margin-top:8px">{amountInWords(inv.tds_amount ? inv.payable : inv.total, inv.currency)}</p>
				{#if foreign && inv.seller.intl_bank}<h2>International bank transfer</h2><p style="white-space:pre-wrap">{inv.seller.intl_bank}</p>{:else if inv.seller.bank_details}<h2>Bank transfer</h2><p style="white-space:pre-wrap">{inv.seller.bank_details}</p>{/if}
				<footer class="doc-sign">
					{#if inv.notes}<p>{inv.notes}</p>{/if}
					{#if inv.tax_mode === 'export'}<p class="hint">Supply meant for export under LUT without payment of IGST{inv.seller.lut_arn ? ` (LUT ARN ${inv.seller.lut_arn})` : ''}.</p>{:else if !inv.seller.gst_registered}<p class="hint">The supplier is not registered under GST, so no GST is charged.</p>{/if}
					<p class="hint">{inv.seller.footer}</p>
				</footer>
				{#if inv.miracle_line}<BrandInvite creator={inv.seller.name} from="invoice" />{/if}
			</article>
		{/if}
	</div>
</div>

<style>
	.pay-qr { position: relative; }
	.qr-toggle { display: none; }
	@media screen and (max-width: 640px) {
		.invoice-page .doc-wrap { padding: calc(env(safe-area-inset-top, 0px) + 16px) max(16px, env(safe-area-inset-right, 0px)) calc(env(safe-area-inset-bottom, 0px) + 32px) max(16px, env(safe-area-inset-left, 0px)); }
		.invoice-page .doc-tools { gap: 12px; margin-bottom: 16px; flex-wrap: nowrap; }
		.invoice-page .doc-tools .btn { min-height: 44px; padding: 10px 14px; font-size: 14px; }
		.invoice-page .pay-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; padding: 20px; border-radius: 22px; margin-bottom: 12px; }
		.invoice-page .pay-main { gap: 6px; }
		.invoice-page .pay-main .num { font-size: 38px; }
		.invoice-page .pay-main small { font-size: 13px; line-height: 1.5; }
		.invoice-page .pay-actions { display: grid; gap: 10px; margin-top: 12px; }
		.invoice-page .pay-actions .btn { width: 100%; min-width: 0; min-height: 44px; padding: 10px 12px; font-size: 14px; }
		.upi-copy span { white-space: normal; overflow-wrap: anywhere; min-width: 0; }
		.pay-qr { border-top: 1px solid color-mix(in oklab, var(--hero-ink) 14%, transparent); padding-top: 14px; }
		.qr-toggle { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; padding: 0; border: 0; background: none; color: var(--hero-ink); font-size: 13px; text-align: left; }
		.qr-toggle :global(.ic:last-child) { margin-left: auto; }
		.qr-content { display: none; }
		.qr-content.expanded { display: block; padding-top: 16px; }
		.invoice-page .claim-link { margin: 0 0 20px; text-align: center; }
		.invoice-page .claim-link .btn { width: 100%; min-height: 44px; font-size: 14px; }
		.invoice-page .inv-doc { padding: 20px 16px; border-radius: 22px; font-size: 14px; overflow-wrap: anywhere; }
		.invoice-page .doc-h { display: grid; gap: 18px; padding-bottom: 16px; }
		.invoice-page .doc-h .eb { font-size: 11px; letter-spacing: .1em; }
		.invoice-page .doc-h h1 { font-size: 26px; margin-bottom: 6px; }
		.invoice-page .doc-h small { display: block; font-size: 12px; line-height: 1.6; }
		.invoice-page .inv-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
		.invoice-page .inv-meta > div:last-child { grid-column: 1 / -1; }
		.invoice-page .inv-meta dt { font-size: 11px; }
		.invoice-page .inv-meta dd { font-size: 13px; }
		.invoice-page .doc-parties { padding: 16px 0; }
		.invoice-page .doc-parties > div { padding: 12px; }
		.invoice-page .doc-parties b { font-size: 16px; }
		.invoice-page .doc-parties small { font-size: 12px; }
		.invoice-page .doc-table { display: block; font-size: 14px; }
		.invoice-page .doc-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
		.invoice-page .doc-table tbody, .invoice-page .doc-table tfoot { display: block; }
		.invoice-page .doc-table tbody tr { display: grid; grid-template-columns: minmax(0, .5fr) repeat(2, minmax(0, 1fr)); gap: 10px; padding: 14px 0; border-bottom: 1px solid var(--line); }
		.invoice-page .doc-table tbody td { display: block; min-width: 0; border: 0; padding: 0; text-align: left; white-space: normal; overflow-wrap: anywhere; }
		.invoice-page .doc-table tbody td:first-child { grid-column: 1 / -1; font-weight: 600; }
		.invoice-page .doc-table tbody td::before { content: attr(data-label); display: block; color: var(--ink-3); font-size: 11px; font-weight: 400; margin-bottom: 3px; }
		.invoice-page .doc-table tbody td:first-child::before { display: none; }
		.invoice-page .doc-table tbody td:last-child { text-align: right; font-weight: 600; }
		.invoice-page .doc-table tfoot tr { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, auto); gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); }
		.invoice-page .doc-table tfoot tr:first-child { border-top: 0; }
		.invoice-page .doc-table tfoot tr:not(.sub) { border-top-color: var(--ink); }
		.invoice-page .doc-table tfoot td { display: block; min-width: 0; padding: 0; border: 0; font-size: 16px; white-space: normal; overflow-wrap: anywhere; }
		.invoice-page .doc-table tfoot tr.sub td { font-size: 13px; border: 0; }
		.invoice-page .doc-table tfoot td:first-child { text-align: left; }
		.invoice-page .doc-sign { margin-top: 20px; font-size: 12px; }
		.invoice-page .inv-doc > .hint { font-size: 12px; }
		.invoice-page .claim-card { align-items: flex-start; }
		.invoice-page .claim-card small { overflow-wrap: anywhere; }
	}
</style>
