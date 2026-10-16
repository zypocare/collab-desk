<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { amountInWords, balanceDue, INVOICE_STATUS, normaliseInvoice, qrSvgPath, upiLink, type InvoiceView } from '#lib/invoice.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { errMessage, fmtLong, inr } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	let inv = $state<InvoiceView | null>(null);
	let loaded = $state(false);
	let busy = $state(false);

	onMount(async () => {
		const { data } = await supabase.rpc('public_invoice', { p_token: page.params.token });
		inv = data ? normaliseInvoice(data as InvoiceView) : null;
		loaded = true;
	});

	const due = $derived(inv ? balanceDue(inv) : 0);
	const upi = $derived(inv && inv.seller.upi_id && due > 0 ? upiLink(inv) : '');
	const qr = $derived(upi ? qrSvgPath(upi) : null);
	const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent);

	// "I've paid": amount, UTR / reference and date, so she can confirm it.
	let claimOpen = $state(false);
	let claim = $state({ amount: '', ref: '', on: '', name: '' });
	let claimBusy = $state(false);
	let claimErr = $state('');
	function openClaim() {
		claim.amount = String(Math.round(due));
		claim.on = new Date().toISOString().slice(0, 10);
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
		if (!inv) return;
		busy = true;
		try {
			const { downloadInvoicePdf } = await import('#lib/invoicePdf.ts');
			await downloadInvoicePdf(inv);
		} catch (e) {
			toast(`Couldn't make the PDF: ${errMessage(e)}`, 'alert');
		}
		busy = false;
	}
</script>

<svelte:head><title>{inv ? `Invoice ${inv.number}` : 'Invoice'}</title><meta name="robots" content="noindex" /></svelte:head>

<div class="page">
	<div class="wrap doc-wrap">
		{#if !loaded}
			<div class="loader" style="min-height:50vh"><span class="ring"><span></span></span></div>
		{:else if !inv}
			<div class="empty-card" style="margin-top:40px"><h2>Invoice not found</h2><p>Check the link in your email. It may have been cancelled.</p></div>
		{:else}
			<div class="doc-tools no-print">
				<span class="pill tint {INVOICE_STATUS[inv.status].k}">{INVOICE_STATUS[inv.status].label}</span>
				<button class="btn primary" disabled={busy} onclick={download}>{#if busy}<span class="spinner"></span>{:else}<Icon name="arrow" />{/if}Download PDF</button>
			</div>

			{#if due > 0 && inv.status !== 'cancelled'}
				<section class="pay-card rv no-print">
					<div class="pay-main">
						<span class="lbl">Amount to pay</span>
						<b class="num">{inr(due)}</b>
						<small>{inv.due_date ? `Due ${fmtLong(inv.due_date)}` : ''}{inv.tds_amount ? ` · after ${inr(inv.tds_amount)} TDS` : ''}</small>
						{#if upi}
							<div class="pay-actions">
								{#if isMobile}<a class="btn grad lg" href={upi}><Icon name="send" />Pay with UPI app</a>{/if}
								<button class="btn" onclick={() => copyText(inv!.seller.upi_id, 'UPI ID copied')}><Icon name="copy" />{inv.seller.upi_id}</button>
							</div>
						{/if}
					</div>
					{#if qr}
						<figure class="qr">
							<svg viewBox="-2 -2 {qr.size + 4} {qr.size + 4}" role="img" aria-label="UPI QR code for {inr(due)}"><rect x="-2" y="-2" width={qr.size + 4} height={qr.size + 4} fill="#fff" /><path d={qr.d} fill="#000" /></svg>
							<figcaption>Scan with GPay, PhonePe, Paytm or any UPI app</figcaption>
						</figure>
					{/if}
				</section>
				{#if inv.claim_at}
					<section class="claim-card rv no-print"><Icon name="clock" /><div><b>Payment reported: {inr(Number(inv.claim_amount))}</b><small>Paid {inv.claim_on ? fmtLong(inv.claim_on) : ''} · ref {inv.claim_ref}. Waiting for {inv.seller.name} to confirm it arrived.</small></div></section>
				{:else if claimOpen}
					<form class="panel claim-form rv no-print" onsubmit={sendClaim}>
						<div class="panel-h"><h2>Tell {inv.seller.name} you've paid</h2><small>so the reminders stop</small></div>
						<div class="form-b">
							<div class="f"><label for="cl-amt">Amount paid (₹)</label><input class="inp num" id="cl-amt" type="number" inputmode="decimal" min="1" bind:value={claim.amount} /></div>
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
					<table class="doc-table">
						<thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
						<tbody>{#each inv.items as it, i (i)}<tr><td>{it.description}</td><td>{it.qty}</td><td>{inr(it.rate)}</td><td>{inr(it.qty * it.rate)}</td></tr>{/each}</tbody>
						<tfoot>
							<tr class="sub"><td colspan="3">Subtotal</td><td>{inr(inv.subtotal)}</td></tr>
							{#if inv.tax_mode === 'intra'}
								<tr class="sub"><td colspan="3">CGST @ {inv.gst_rate / 2}%</td><td>{inr(inv.cgst)}</td></tr>
								<tr class="sub"><td colspan="3">SGST @ {inv.gst_rate / 2}%</td><td>{inr(inv.sgst)}</td></tr>
							{:else if inv.tax_mode === 'inter'}
								<tr class="sub"><td colspan="3">IGST @ {inv.gst_rate}%</td><td>{inr(inv.igst)}</td></tr>
							{/if}
							<tr><td colspan="3">Total</td><td>{inr(inv.total)}</td></tr>
							{#if inv.tds_amount}
								<tr class="sub"><td colspan="3">Less TDS @ {inv.tds_rate}% (if deducted)</td><td>− {inr(inv.tds_amount)}</td></tr>
								<tr><td colspan="3">Amount payable</td><td>{inr(inv.payable)}</td></tr>
							{/if}
						</tfoot>
					</table>
				</div>
				<p class="hint" style="margin-top:8px">{amountInWords(inv.tds_amount ? inv.payable : inv.total)}</p>
				{#if inv.seller.bank_details}<h2>Bank transfer</h2><p style="white-space:pre-wrap">{inv.seller.bank_details}</p>{/if}
				<footer class="doc-sign">
					{#if inv.notes}<p>{inv.notes}</p>{/if}
					{#if !inv.seller.gst_registered}<p class="hint">The supplier is not registered under GST, so no GST is charged.</p>{/if}
					<p class="hint">{inv.seller.footer}</p>
				</footer>
			</article>
		{/if}
	</div>
</div>
