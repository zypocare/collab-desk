<script lang="ts">
	import { page } from '$app/state';
	import { todayIso, initials } from '#lib/util.ts';
	import { money } from '#lib/currency.ts';
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { amountInWords, balanceDue, INVOICE_STATUS, normaliseInvoice, upiLink, type InvoiceView } from '#lib/invoice.ts';
	import UpiQr from '#lib/components/UpiQr.svelte';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { errMessage, fmtLong } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import BrandInvite from '#lib/components/BrandInvite.svelte';
	import ZeroLoginBrandBar from '#lib/components/ZeroLoginBrandBar.svelte';

	let inv = $state<InvoiceView | null>(null);
	let loaded = $state(false);
	let loadErr = $state('');
	let busy = $state(false);
	let qrOpen = $state(true);
	let upiCopied = $state(false);

	async function fetchInvoiceDirect(token: string): Promise<InvoiceView | null> {
		const url = import.meta.env.VITE_SUPABASE_URL as string;
		const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
		if (!url || !key) {
			const { data } = await supabase.rpc('public_invoice', { p_token: token });
			return data ? normaliseInvoice(data as InvoiceView) : null;
		}
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), 12_000);
		try {
			const r = await fetch(`${url}/rest/v1/rpc/public_invoice`, {
				method: 'POST',
				headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
				body: JSON.stringify({ p_token: token }),
				signal: ctrl.signal
			});
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			const data = await r.json();
			return data ? normaliseInvoice(data as InvoiceView) : null;
		} finally {
			clearTimeout(timer);
		}
	}

	async function loadInvoice(usePrefetch = true) {
		const token = page.params.token ?? '';
		loaded = false;
		loadErr = '';
		try {
			const w = window as unknown as { __invPrefetch?: { token: string; promise: Promise<unknown> } };
			if (usePrefetch && w.__invPrefetch && w.__invPrefetch.token === token) {
				const pre = await w.__invPrefetch.promise;
				delete w.__invPrefetch;
				if (pre) {
					inv = normaliseInvoice(pre as InvoiceView);
					loaded = true;
					return;
				}
			}
			inv = await fetchInvoiceDirect(token);
		} catch {
			loadErr = 'Connection was slow. Tap Retry to open the invoice.';
		} finally {
			loaded = true;
		}
	}

	onMount(() => {
		document.getElementById('app-boot')?.remove();
		loadInvoice(true);
	});

	const due = $derived(inv ? balanceDue(inv) : 0);
	// UPI is for rupees only; foreign brands pay by international transfer.
	const foreign = $derived(!!inv && !!inv.currency && inv.currency !== 'INR');
	const upi = $derived(inv && !foreign && inv.seller.upi_id && due > 0 ? upiLink(inv) : '');
	const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent);

	function copyUpi() {
		if (!inv?.seller.upi_id) return;
		copyText(inv.seller.upi_id, 'UPI ID copied');
		upiCopied = true;
		setTimeout(() => (upiCopied = false), 1600);
	}

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
		const { error } = await supabase.rpc('invoice_claim_paid', {
			p_token: page.params.token,
			p_amount: Number(claim.amount) || 0,
			p_ref: claim.ref,
			p_on: claim.on || null,
			p_name: claim.name
		});
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

<svelte:head>
	<title>{inv ? `Invoice ${inv.number}` : 'Invoice'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if inv}<ZeroLoginBrandBar creator={inv.seller.name} from="invoice" context="invoice" />{/if}

<div class="inv-page">
	<div class="inv-shell">
		{#if !loaded}
			<div class="inv-skel" aria-busy="true" aria-label="Loading invoice">
				<div class="inv-sk-h"><span></span><i></i></div>
				<div class="inv-sk-card">
					<b></b>
					<em></em>
					<u></u>
					<p>Opening invoice…</p>
				</div>
			</div>
		{:else if loadErr}
			<div class="inv-empty">
				<h2>Couldn’t load invoice</h2>
				<p>{loadErr}</p>
				<button type="button" class="inv-retry" onclick={() => loadInvoice(false)}>Retry</button>
			</div>
		{:else if !inv}
			<div class="inv-empty">
				<h2>Invoice not found</h2>
				<p>Check the link in your email. It may have been cancelled.</p>
			</div>
		{:else}
			<!-- Top Utility Row -->
			<div class="inv-tools no-print">
				<div class="inv-tools-left">
					<span class="inv-status {INVOICE_STATUS[inv.status].k}"><i></i>{INVOICE_STATUS[inv.status].label}</span>
					<span class="inv-num">{inv.number}</span>
				</div>
				<button type="button" class="inv-pdf-btn" disabled={busy} onclick={download}>
					{#if busy}<span class="spinner"></span>{:else}<Icon name="download" />{/if}
					{busy ? 'Saving PDF…' : 'Download PDF'}
				</button>
			</div>

			<!-- Payment Vault Hero Card -->
			{#if due > 0 && inv.status !== 'cancelled'}
				<section class="inv-vault no-print" aria-label="Payment details">
					<div class="inv-vault-top">
						<div class="inv-amt-wrap">
							<span class="inv-eb">Amount to pay</span>
							<b class="inv-amt num">{cm(due)}</b>
							<div class="inv-meta-line">
								{#if inv.due_date}<span>Due {fmtLong(inv.due_date)}</span>{/if}
								{#if inv.due_date && inv.tds_amount}<span class="sep">·</span>{/if}
								{#if inv.tds_amount}<span>After {cm(inv.tds_amount)} TDS</span>{:else}<span>Net payable</span>{/if}
							</div>
						</div>
						<div class="inv-creator-chip">
							<span class="inv-av" aria-hidden="true">{initials(inv.seller.name)}</span>
							<div>
								<b>{inv.seller.name}</b>
								{#if inv.seller.handle}<small>@{inv.seller.handle}</small>{/if}
							</div>
						</div>
					</div>

					{#if upi}
						<div class="inv-pay-acts">
							{#if isMobile}
								<a class="inv-grad-btn" href={upi}><Icon name="send" />Pay with UPI app</a>
							{/if}
							<button type="button" class="inv-upi-row" onclick={copyUpi} aria-label={`Copy UPI ID ${inv.seller.upi_id}`}>
								<span class="inv-upi-left"><Icon name="copy" /><span>{inv.seller.upi_id}</span></span>
								<span class="inv-upi-tag">{upiCopied ? 'Copied' : 'Copy UPI'}</span>
							</button>
						</div>

						<div class="inv-qr-sec">
							<button type="button" class="inv-qr-toggle" aria-expanded={qrOpen} aria-controls="invoice-upi-qr" onclick={() => (qrOpen = !qrOpen)}>
								<span class="inv-qr-tl"><Icon name="qr" />{qrOpen ? 'Hide payment QR' : 'Scan or download payment QR'}</span>
								<Icon name={qrOpen ? 'chevU' : 'chevD'} />
							</button>
							{#if qrOpen}
								<div id="invoice-upi-qr" class="inv-qr-tray">
									<UpiQr upiId={inv.seller.upi_id} name={inv.seller.name} amount={due} note={`Invoice ${inv.number}`} />
								</div>
							{/if}
						</div>
					{/if}

					<!-- Integrated "I've paid" / Claim Form / Reported Banner -->
					<div class="inv-vault-foot">
						{#if inv.claim_at}
							<div class="inv-claim-banner">
								<Icon name="clock" />
								<div>
									<b>Payment reported: {cm(Number(inv.claim_amount))}</b>
									<small>Paid {inv.claim_on ? fmtLong(inv.claim_on) : ''} · ref {inv.claim_ref}. Waiting for {inv.seller.name} to confirm it arrived.</small>
								</div>
							</div>
						{:else if claimOpen}
							<form class="inv-claim-form" onsubmit={sendClaim}>
								<div class="inv-claim-h">
									<h3>Tell {inv.seller.name} you've paid</h3>
									<small>Share your UTR or reference so reminders stop automatically.</small>
								</div>
								<div class="inv-md-fields">
									<div class="inv-md-f">
										<label for="cl-amt">Amount paid ({inv.currency && inv.currency !== 'INR' ? inv.currency : '₹'})</label>
										<input class="inv-md-inp num" id="cl-amt" type="number" inputmode="decimal" min="1" bind:value={claim.amount} />
									</div>
									<div class="inv-md-f">
										<label for="cl-ref">UTR / Transaction ref</label>
										<input class="inv-md-inp" id="cl-ref" placeholder="e.g. 412345678901" bind:value={claim.ref} />
									</div>
									<div class="inv-md-f">
										<label for="cl-on">Paid on</label>
										<input class="inv-md-inp" id="cl-on" type="date" bind:value={claim.on} />
									</div>
									<div class="inv-md-f">
										<label for="cl-name">Your name (optional)</label>
										<input class="inv-md-inp" id="cl-name" bind:value={claim.name} />
									</div>
								</div>
								{#if claimErr}<div class="inv-err">{claimErr}</div>{/if}
								<div class="inv-claim-acts">
									<button type="button" class="inv-ghost-btn" onclick={() => (claimOpen = false)}>Cancel</button>
									<button type="submit" class="inv-grad-btn sm" disabled={claimBusy || !claim.ref.trim()}>
										{#if claimBusy}<span class="spinner"></span>{:else}<Icon name="check" />{/if}Confirm payment
									</button>
								</div>
							</form>
						{:else}
							<button type="button" class="inv-paid-btn" onclick={openClaim}>
								<Icon name="check" />I've paid this invoice
							</button>
						{/if}
					</div>
				</section>
			{:else if inv.status === 'paid'}
				<section class="inv-vault paid-vault no-print" aria-label="Payment received">
					<div class="inv-paid-hero">
						<span class="inv-paid-ic" aria-hidden="true"><Icon name="check" /></span>
						<div>
							<span class="inv-eb ok">Paid in full</span>
							<h2>Thank you!</h2>
							<small>Received {inv.paid_on ? fmtLong(inv.paid_on) : ''}</small>
						</div>
					</div>
				</section>
			{/if}

			<!-- Editorial Invoice Breakdown Sheet -->
			<article class="inv-sheet">
				<header class="inv-sheet-h">
					<div class="inv-seller">
						<span class="inv-eb">{inv.seller.gst_registered ? 'Tax invoice' : 'Invoice'} · {inv.number}</span>
						<h1>{inv.seller.name}</h1>
						<small>{[inv.seller.handle ? `@${inv.seller.handle}` : '', inv.seller.state, inv.seller.pan ? `PAN ${inv.seller.pan}` : '', inv.seller.gstin ? `GSTIN ${inv.seller.gstin}` : ''].filter(Boolean).join(' · ')}</small>
					</div>
					<dl class="inv-meta">
						<div><dt>Date</dt><dd>{fmtLong(inv.issue_date)}</dd></div>
						<div><dt>Due</dt><dd>{inv.due_date ? fmtLong(inv.due_date) : '—'}</dd></div>
						<div><dt>Reference</dt><dd>{inv.bill_to.code}</dd></div>
					</dl>
				</header>

				<section class="inv-billto">
					<span class="inv-eb">Bill to</span>
					<b>{inv.bill_to.name}</b>
					{#if inv.bill_to.gstin}<small>GSTIN {inv.bill_to.gstin}</small>{/if}
					{#if inv.bill_to.address}<small>{inv.bill_to.address}{inv.bill_to.state ? `, ${inv.bill_to.state}` : ''}</small>{/if}
				</section>

				<div class="inv-table-wrap">
					<table class="inv-table" aria-label="Invoice items and totals">
						<thead>
							<tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
						</thead>
						<tbody>
							{#each inv.items as it, i (i)}
								<tr>
									<td>{it.description}</td>
									<td>{it.qty}</td>
									<td>{cm(it.rate)}</td>
									<td>{cm(it.qty * it.rate)}</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr><td colspan="3">Subtotal</td><td>{cm(inv.subtotal)}</td></tr>
							{#if inv.tax_mode === 'intra'}
								<tr><td colspan="3">CGST @ {inv.gst_rate / 2}%</td><td>{cm(inv.cgst)}</td></tr>
								<tr><td colspan="3">SGST @ {inv.gst_rate / 2}%</td><td>{cm(inv.sgst)}</td></tr>
							{:else if inv.tax_mode === 'inter'}
								<tr><td colspan="3">IGST @ {inv.gst_rate}%</td><td>{cm(inv.igst)}</td></tr>
							{/if}
							<tr class:inv-total-row={!inv.tds_amount}><td colspan="3">Total</td><td>{cm(inv.total)}</td></tr>
							{#if inv.tds_amount}
								<tr><td colspan="3">Less TDS @ {inv.tds_rate}% (if deducted)</td><td>− {cm(inv.tds_amount)}</td></tr>
								<tr class="inv-total-row"><td colspan="3">Amount payable</td><td>{cm(inv.payable)}</td></tr>
							{/if}
						</tfoot>
					</table>
				</div>

				<p class="inv-words">{amountInWords(inv.tds_amount ? inv.payable : inv.total, inv.currency)}</p>

				{#if foreign && inv.seller.intl_bank}
					<section class="inv-bank">
						<span class="inv-eb">International bank transfer</span>
						<p>{inv.seller.intl_bank}</p>
					</section>
				{:else if inv.seller.bank_details}
					<section class="inv-bank">
						<span class="inv-eb">Bank transfer</span>
						<p>{inv.seller.bank_details}</p>
					</section>
				{/if}

				<footer class="inv-foot">
					{#if inv.notes}<p>{inv.notes}</p>{/if}
					{#if inv.tax_mode === 'export'}
						<p>Supply meant for export under LUT without payment of IGST{inv.seller.lut_arn ? ` (LUT ARN ${inv.seller.lut_arn})` : ''}.</p>
					{:else if !inv.seller.gst_registered}
						<p>The supplier is not registered under GST, so no GST is charged.</p>
					{/if}
					{#if inv.seller.footer}<p>{inv.seller.footer}</p>{/if}
				</footer>

				{#if inv.miracle_line}<BrandInvite creator={inv.seller.name} from="invoice" />{/if}
			</article>
		{/if}
	</div>
</div>

<style>
	@property --inv-rim {
		syntax: '<angle>';
		initial-value: 0deg;
		inherits: false;
	}
	@keyframes invSpin {
		to { --inv-rim: 360deg; }
	}

	.inv-page {
		min-height: 100vh;
		background:
			radial-gradient(560px 320px at 88% -40px, rgba(242, 90, 144, 0.14), transparent 65%),
			radial-gradient(500px 300px at 8% 8%, rgba(156, 123, 255, 0.12), transparent 60%),
			var(--bg, #0d0a0e);
		color: var(--ink, #faf7fc);
	}
	.inv-shell {
		max-width: 680px;
		margin: 0 auto;
		padding: 20px max(16px, env(safe-area-inset-right, 0px)) calc(48px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
		display: grid;
		gap: 18px;
	}
	.inv-empty {
		margin-top: 40px;
		padding: 28px 22px;
		border-radius: 20px;
		background: #19131e;
		border: 1px solid rgba(255, 255, 255, 0.09);
		text-align: center;
	}
	.inv-empty h2 {
		margin: 0 0 6px;
		font: 400 26px/1.1 var(--f-serif, Georgia, serif);
	}
	.inv-empty p {
		margin: 0;
		font-size: 13.5px;
		color: #9b8fa8;
	}

	/* Top Utility Row */
	.inv-tools {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.inv-tools-left {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.inv-status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		border-radius: 999px;
		font: 700 10.5px/1 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		background: rgba(129, 140, 248, 0.14);
		border: 1px solid rgba(129, 140, 248, 0.34);
		color: #a5b4fc;
	}
	.inv-status i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}
	.inv-status.ok,
	.inv-status.paid {
		background: rgba(74, 222, 128, 0.14);
		border-color: rgba(74, 222, 128, 0.34);
		color: #4ade80;
	}
	.inv-status.warn,
	.inv-status.overdue {
		background: rgba(251, 191, 36, 0.14);
		border-color: rgba(251, 191, 36, 0.34);
		color: #fbbf24;
	}
	.inv-num {
		font: 600 11.5px/1 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #8f8499;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.inv-pdf-btn {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 38px;
		padding: 0 14px;
		border: 0;
		border-radius: 0;
		background: #ffffff;
		color: #120b14;
		font: 700 12.5px/1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
		box-shadow: 3px 3px 0 0 #f25a90;
		white-space: nowrap;
	}
	.inv-pdf-btn :global(.ic) {
		width: 15px;
		height: 15px;
	}

	/* Payment Vault Card */
	.inv-vault {
		position: relative;
		border-radius: 22px;
		padding: 22px 20px 18px;
		display: grid;
		gap: 16px;
		background:
			radial-gradient(120% 90% at 95% 0%, rgba(242, 90, 144, 0.18), transparent 55%),
			radial-gradient(95% 95% at 5% 100%, rgba(156, 123, 255, 0.15), transparent 55%),
			#19131e;
		box-shadow: 0 22px 48px -26px rgba(0, 0, 0, 0.75);
	}
	.inv-vault::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1.25px;
		background: conic-gradient(from var(--inv-rim), #9c7bff, #f25a90, #ffae6b, rgba(255, 255, 255, 0.08) 46%, #9c7bff);
		-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		pointer-events: none;
		animation: invSpin 11s linear infinite;
	}
	.inv-vault.paid-vault::before {
		background: linear-gradient(135deg, rgba(74, 222, 128, 0.55), rgba(255, 255, 255, 0.08));
		animation: none;
	}

	.inv-vault-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 14px;
		flex-wrap: wrap;
	}
	.inv-amt-wrap {
		display: grid;
		gap: 4px;
	}
	.inv-eb {
		font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #8f8499;
	}
	.inv-eb.ok {
		color: #4ade80;
	}
	.inv-amt {
		font: 400 clamp(40px, 9vw, 52px)/1 var(--f-serif, Georgia, serif);
		letter-spacing: -0.02em;
		color: #faf7fc;
	}
	.inv-meta-line {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		font-size: 12.5px;
		color: #cfc6d6;
	}
	.inv-meta-line .sep {
		color: #8f8499;
	}

	.inv-creator-chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 11px 6px 6px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.09);
	}
	.inv-av {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: linear-gradient(135deg, #9c7bff, #f25a90);
		color: #ffffff;
		font: 600 10.5px/1 var(--f-mono, ui-monospace, monospace);
		display: grid;
		place-items: center;
	}
	.inv-creator-chip div {
		display: grid;
		gap: 1px;
	}
	.inv-creator-chip b {
		font-size: 12px;
		font-weight: 600;
		color: #faf7fc;
		line-height: 1.15;
	}
	.inv-creator-chip small {
		font-size: 10.5px;
		color: #8f8499;
		line-height: 1.15;
	}

	/* Primary & UPI Actions */
	.inv-pay-acts {
		display: grid;
		gap: 10px;
	}
	.inv-grad-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		width: 100%;
		min-height: 48px;
		padding: 0 18px;
		border: 0;
		border-radius: 0;
		background: linear-gradient(95deg, #9c7bff 0%, #f25a90 55%, #ffae6b 100%);
		color: #ffffff;
		font: 700 14.5px/1 var(--f-body, system-ui, sans-serif);
		text-decoration: none;
		cursor: pointer;
		box-shadow: 3.5px 3.5px 0 0 rgba(156, 123, 255, 0.45);
	}
	.inv-grad-btn.sm {
		min-height: 44px;
		font-size: 13.5px;
	}
	.inv-grad-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.inv-grad-btn :global(.ic) {
		width: 16px;
		height: 16px;
	}

	.inv-upi-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		width: 100%;
		padding: 11px 13px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 0;
		background: rgba(255, 255, 255, 0.025);
		color: #faf7fc;
		cursor: pointer;
		text-align: left;
	}
	.inv-upi-left {
		display: flex;
		align-items: center;
		gap: 9px;
		min-width: 0;
	}
	.inv-upi-left :global(.ic) {
		width: 15px;
		height: 15px;
		flex-shrink: 0;
		color: #cfc6d6;
	}
	.inv-upi-left span {
		font: 500 13.5px/1.2 var(--f-mono, ui-monospace, monospace);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.inv-upi-tag {
		font: 700 10px/1 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #ffae6b;
		flex-shrink: 0;
	}

	/* Expandable QR Tray */
	.inv-qr-sec {
		border-top: 1px solid rgba(255, 255, 255, 0.09);
		padding-top: 14px;
		display: grid;
		gap: 12px;
	}
	.inv-qr-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		padding: 2px 0;
		border: 0;
		background: transparent;
		color: #cfc6d6;
		font: 500 13px/1.2 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
	}
	.inv-qr-tl {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.inv-qr-toggle :global(.ic) {
		width: 16px;
		height: 16px;
	}
	.inv-qr-tray {
		display: grid;
		justify-items: center;
		padding: 16px;
		border-radius: 16px;
		background: rgba(11, 8, 13, 0.55);
		border: 1px solid rgba(255, 255, 255, 0.09);
	}

	/* Integrated Footer inside Vault */
	.inv-vault-foot {
		border-top: 1px solid rgba(255, 255, 255, 0.09);
		padding-top: 14px;
	}
	.inv-paid-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		min-height: 44px;
		padding: 0 16px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 0;
		background: rgba(255, 255, 255, 0.03);
		color: #faf7fc;
		font: 600 13.5px/1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
	}
	.inv-paid-btn :global(.ic) {
		width: 16px;
		height: 16px;
	}

	/* Inline Claim Form (matches Set up a monthly deal bottom-hairline inputs) */
	.inv-claim-form {
		display: grid;
		gap: 16px;
	}
	.inv-claim-h h3 {
		margin: 0 0 3px;
		font: 400 22px/1.1 var(--f-serif, Georgia, serif);
		color: #faf7fc;
	}
	.inv-claim-h small {
		font-size: 12.5px;
		color: #8f8499;
	}
	.inv-md-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px 18px;
	}
	@media (max-width: 520px) {
		.inv-md-fields {
			grid-template-columns: 1fr;
		}
	}
	.inv-md-f {
		display: grid;
		gap: 5px;
	}
	.inv-md-f label {
		font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #8f8499;
	}
	.inv-md-inp {
		width: 100%;
		box-sizing: border-box;
		border: 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 0;
		background: transparent;
		color: #faf7fc;
		font: 400 15px/1.35 var(--f-body, system-ui, sans-serif);
		padding: 7px 0 8px;
		outline: none;
	}
	.inv-md-inp:focus {
		border-bottom-color: #f25a90;
	}
	.inv-err {
		font-size: 12.5px;
		color: #fda4af;
	}
	.inv-claim-acts {
		display: grid;
		grid-template-columns: 1fr 1.4fr;
		gap: 10px;
	}
	.inv-ghost-btn {
		min-height: 44px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 0;
		background: transparent;
		color: #faf7fc;
		font: 600 13.5px/1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
	}

	.inv-claim-banner {
		display: flex;
		align-items: flex-start;
		gap: 11px;
		padding: 13px 14px;
		border-radius: 14px;
		background: rgba(251, 191, 36, 0.1);
		border: 1px solid rgba(251, 191, 36, 0.3);
	}
	.inv-claim-banner :global(.ic) {
		width: 18px;
		height: 18px;
		color: #fbbf24;
		flex-shrink: 0;
		margin-top: 2px;
	}
	.inv-claim-banner b {
		display: block;
		font-size: 13.5px;
		color: #faf7fc;
	}
	.inv-claim-banner small {
		display: block;
		font-size: 12px;
		color: #cfc6d6;
		margin-top: 2px;
		line-height: 1.45;
	}

	.inv-paid-hero {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.inv-paid-ic {
		width: 46px;
		height: 46px;
		border-radius: 14px;
		background: rgba(74, 222, 128, 0.14);
		border: 1px solid rgba(74, 222, 128, 0.35);
		color: #4ade80;
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}
	.inv-paid-ic :global(.ic) {
		width: 22px;
		height: 22px;
	}
	.inv-paid-hero h2 {
		margin: 2px 0 3px;
		font: 400 28px/1.05 var(--f-serif, Georgia, serif);
		color: #faf7fc;
	}
	.inv-paid-hero small {
		font-size: 12.5px;
		color: #cfc6d6;
	}

	/* Editorial Invoice Breakdown Sheet */
	.inv-sheet {
		display: grid;
		gap: 20px;
		padding: 22px 20px;
		border-radius: 22px;
		background: #140f17;
		border: 1px solid rgba(255, 255, 255, 0.09);
	}
	.inv-sheet-h {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		padding-bottom: 18px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.09);
	}
	.inv-seller h1 {
		margin: 5px 0 4px;
		font: 400 28px/1.08 var(--f-serif, Georgia, serif);
		color: #faf7fc;
	}
	.inv-seller small {
		display: block;
		font-size: 12px;
		color: #8f8499;
		line-height: 1.45;
	}
	.inv-meta {
		display: grid;
		grid-template-columns: repeat(3, auto);
		gap: 10px 18px;
		margin: 0;
	}
	.inv-meta dt {
		font: 700 9.5px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #8f8499;
	}
	.inv-meta dd {
		margin: 3px 0 0;
		font-size: 13px;
		font-weight: 500;
		color: #faf7fc;
	}

	.inv-billto {
		display: grid;
		gap: 4px;
		padding-bottom: 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.09);
	}
	.inv-billto b {
		font-size: 15px;
		font-weight: 600;
		color: #faf7fc;
	}
	.inv-billto small {
		font-size: 12.5px;
		color: #8f8499;
		line-height: 1.45;
	}

	.inv-table-wrap {
		overflow-x: auto;
	}
	.inv-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13.5px;
	}
	.inv-table th {
		text-align: left;
		padding: 0 0 10px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.16);
		font: 700 10px/1 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #8f8499;
	}
	.inv-table th:not(:first-child),
	.inv-table td:not(:first-child) {
		text-align: right;
		white-space: nowrap;
		padding-left: 12px;
	}
	.inv-table tbody td {
		padding: 13px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.09);
		color: #faf7fc;
	}
	.inv-table tfoot td {
		padding: 9px 0 0;
		color: #cfc6d6;
	}
	.inv-table tfoot tr.inv-total-row td {
		padding-top: 13px;
		border-top: 1px solid rgba(255, 255, 255, 0.16);
		color: #faf7fc;
		font-weight: 700;
		font-size: 15px;
	}
	.inv-words {
		margin: 0;
		font-size: 12px;
		color: #8f8499;
		font-style: italic;
	}
	.inv-bank {
		padding-top: 16px;
		border-top: 1px solid rgba(255, 255, 255, 0.09);
		display: grid;
		gap: 8px;
	}
	.inv-bank p {
		margin: 0;
		white-space: pre-wrap;
		font: 500 13px/1.55 var(--f-mono, ui-monospace, monospace);
		color: #cfc6d6;
	}
	.inv-foot {
		padding-top: 14px;
		border-top: 1px solid rgba(255, 255, 255, 0.09);
		display: grid;
		gap: 6px;
		font-size: 12px;
		color: #8f8499;
		line-height: 1.5;
	}
	.inv-foot p {
		margin: 0;
	}

	@media print {
		.inv-page { background: #fff; color: #111; }
		.inv-sheet { background: #fff; border: 0; padding: 0; }
		.inv-seller h1, .inv-meta dd, .inv-billto b, .inv-table tbody td, .inv-table tfoot tr.inv-total-row td { color: #111; }
	}

	.inv-skel { display: grid; gap: 16px; padding: 24px 0; }
	.inv-sk-h { display: flex; justify-content: space-between; align-items: center; }
	.inv-sk-h span, .inv-sk-h i { display: block; height: 22px; border-radius: 8px; background: rgba(255, 255, 255, 0.07); }
	.inv-sk-h span { width: 130px; }
	.inv-sk-h i { width: 88px; }
	.inv-sk-card { display: grid; gap: 14px; padding: 24px 20px; border-radius: 20px; border: 1px solid rgba(156, 123, 255, 0.2); background: rgba(255, 255, 255, 0.03); }
	.inv-sk-card b, .inv-sk-card em, .inv-sk-card u { display: block; border-radius: 8px; background: rgba(255, 255, 255, 0.08); }
	.inv-sk-card b { height: 34px; width: 55%; }
	.inv-sk-card em { height: 18px; width: 82%; }
	.inv-sk-card u { height: 96px; width: 100%; }
	.inv-sk-card p { margin: 4px 0 0; font-size: 13.5px; color: var(--ink-2, #c9beca); text-align: center; }
	.inv-retry { margin-top: 12px; height: 42px; padding: 0 20px; border: 0; border-radius: 0; background: var(--ink, #fff); color: var(--bg, #110d11); font-weight: 700; box-shadow: 3px 3px 0 var(--g2, #f25a90); cursor: pointer; }
</style>
