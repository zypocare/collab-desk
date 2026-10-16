<script lang="ts">
	import { untrack } from 'svelte';
	import { saveBrand, saveInvoice, studio } from '../studio.svelte';
	import type { Collab } from '../types';
	import { INDIAN_STATES, KIND_LABEL, type Invoice, type InvoiceItem } from '../invoice';
	import { acceptedQuote, delivText, inr, parse, rel, todayIso, iso } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';
	import DatePicker from './DatePicker.svelte';

	let { c, editing, onclose }: { c: Collab; editing?: Invoice; onclose: () => void } = $props();
	const s = studio.settings!;

	const start = untrack(() => {
		const q = acceptedQuote(c);
		const issued = c.invoices.filter((i) => i.status !== 'draft' && i.status !== 'cancelled');
		const invoicedSoFar = issued.reduce((a, i) => a + i.subtotal, 0);
		const hasAdvance = issued.some((i) => i.kind === 'advance');
		const fee = c.fee || q?.total || 0;
		let kind: Invoice['kind'] = 'full';
		let amount = fee;
		if (q && q.advance_pct > 0 && q.advance_pct < 100 && !hasAdvance && invoicedSoFar === 0) {
			kind = 'advance';
			amount = Math.round((fee * q.advance_pct) / 100);
		} else if (invoicedSoFar > 0) {
			kind = 'balance';
			amount = Math.max(0, fee - invoicedSoFar);
		}
		const what = `${delivText(c.deliverables)} for ${c.brand.name}${c.usage && c.usage !== 'Organic only' ? `, ${c.usage} usage` : ''} (${c.code})`;
		const label = kind === 'advance' ? `Advance (${q?.advance_pct}%)` : kind === 'balance' ? 'Balance' : 'Content collaboration';
		let due = rel(15);
		if (kind === 'advance') due = rel(7);
		else if (q && c.live_date) {
			const d = parse(c.live_date);
			d.setDate(d.getDate() + q.pay_days);
			due = iso(d) < todayIso() ? rel(7) : iso(d);
		}
		const sameState = !!c.brand.state && !!s.state && c.brand.state === s.state;
		return {
			kind,
			items: editing?.items?.length ? editing.items.map((i) => ({ ...i })) : [{ description: `${label}: ${what}`, qty: 1, rate: amount }],
			tax_mode: editing?.tax_mode ?? (s.gst_registered ? (sameState ? 'intra' : 'inter') : 'none'),
			due: editing?.due_date ?? due,
			invoicedSoFar,
			fee,
			e: editing,
			accounts: c.brand.accounts_email ?? ''
		};
	});

	let kind = $state<Invoice['kind']>(start.e?.kind ?? start.kind);
	let items = $state<InvoiceItem[]>(start.items);
	let taxMode = $state<Invoice['tax_mode']>(start.tax_mode as Invoice['tax_mode']);
	let gstRate = $state(start.e?.gst_rate || s.gst_rate || 18);
	let tdsRate = $state(start.e?.tds_rate ?? 0);
	let issueDate = $state(start.e?.issue_date ?? todayIso());
	let dueDate = $state(start.due);
	let sendTo = $state(start.e?.send_to ?? start.accounts);
	let notes = $state(start.e?.notes ?? '');
	let autoRemind = $state(start.e?.auto_remind ?? true);
	let busy = $state(false);

	const subtotal = $derived(items.reduce((a, i) => a + Math.max(0, Number(i.qty) || 0) * Math.max(0, Number(i.rate) || 0), 0));
	const gst = $derived(taxMode === 'none' ? 0 : Math.round(subtotal * gstRate) / 100);
	const total = $derived(subtotal + gst);
	const tds = $derived(Math.round((subtotal * tdsRate) / 100));
	const canSend = $derived(!!(c.contact_email || sendTo.trim()));

	function brandState(v: string) {
		saveBrand(c.brand_id, { state: v });
		if (s.gst_registered) taxMode = v && s.state && v === s.state ? 'intra' : 'inter';
	}

	async function submit(issue: boolean) {
		busy = true;
		const ok = await saveInvoice(
			c,
			{
				kind,
				items: items.filter((i) => i.description.trim() && i.qty > 0),
				tax_mode: s.gst_registered ? taxMode : 'none',
				gst_rate: s.gst_registered ? Number(gstRate) : 0,
				tds_rate: Number(tdsRate),
				issue_date: issueDate,
				due_date: dueDate || null,
				send_to: sendTo.trim().toLowerCase(),
				notes,
				auto_remind: autoRemind
			},
			issue,
			editing?.id
		);
		busy = false;
		if (ok) onclose();
	}
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="dialog-scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog quote-dialog" role="dialog" aria-modal="true" aria-labelledby="inv-title">
		<h2 id="inv-title">{editing ? 'Edit draft invoice' : 'New invoice'} · {c.brand.name}</h2>
		<p>Fee {inr(start.fee)}{start.invoicedSoFar ? ` · already invoiced ${inr(start.invoicedSoFar)}` : ''}. Amounts are before GST.</p>

		<div class="fields">
			<div class="f">
				<label for="iv-kind">Invoice for</label>
				<Select id="iv-kind" bind:value={kind} options={Object.entries(KIND_LABEL).map(([k, l]) => ({ value: k as Invoice['kind'], label: l }))} />
			</div>
			<div class="f"><label for="iv-date">Invoice date</label><DatePicker id="iv-date" bind:value={issueDate} clearable={false} /></div>
		</div>

		<div class="q-items" style="margin-top:14px">
			<div class="q-row head inv"><span>Description</span><span>Qty</span><span>Amount</span><span></span></div>
			{#each items as it, i (i)}
				<div class="q-row inv">
					<input class="inp" aria-label="Description" bind:value={it.description} />
					<input class="inp num" type="number" min="1" aria-label="Quantity" bind:value={it.qty} />
					<div class="pre"><span>₹</span><input class="inp num" type="number" min="0" aria-label="Amount" bind:value={it.rate} /></div>
					<button class="icon-btn sm" onclick={() => items.splice(i, 1)} aria-label="Remove line"><Icon name="x" /></button>
				</div>
			{/each}
			<button class="btn sm ghost" style="align-self:flex-start" onclick={() => items.push({ description: '', qty: 1, rate: 0 })}><Icon name="plus" />Add a line</button>
		</div>

		<div class="fields" style="margin-top:14px">
			{#if s.gst_registered}
				<div class="f">
					<label for="iv-tax">GST</label>
					<Select id="iv-tax" bind:value={taxMode} options={[{ value: 'intra' as const, label: `CGST + SGST (brand in ${s.state || 'your state'})` }, { value: 'inter' as const, label: 'IGST (brand in another state)' }, { value: 'none' as const, label: 'No GST on this invoice' }]} />
				</div>
				<div class="f"><label for="iv-rate">GST rate</label><Select id="iv-rate" bind:value={gstRate} options={[18, 12, 5].map((r) => ({ value: r, label: `${r}%` }))} /></div>
			{/if}
			<div class="f">
				<label for="iv-tds">TDS the brand will deduct</label>
				<Select id="iv-tds" bind:value={tdsRate} options={[0, 1, 2, 10].map((r) => ({ value: r, label: r ? `${r}%` : 'None' }))} />
			</div>
			<div class="f"><label for="iv-due">Payment due</label><DatePicker id="iv-due" bind:value={dueDate} /></div>
		</div>

		<details class="bill-details" open={!c.brand.state && s.gst_registered}>
			<summary>Bill to: {c.brand.name}{c.brand.gstin ? ` · GSTIN ${c.brand.gstin}` : ''}{c.brand.state ? ` · ${c.brand.state}` : ''}</summary>
			<div class="fields" style="margin-top:10px">
				<div class="f"><label for="iv-bg">Brand GSTIN</label><input class="inp" id="iv-bg" value={c.brand.gstin} placeholder="27AAACB1234C1Z5" onchange={(e) => saveBrand(c.brand_id, { gstin: val(e).toUpperCase().trim() })} /></div>
				<div class="f">
					<label for="iv-bs">Brand state</label>
					<Select id="iv-bs" value={c.brand.state} placeholder="Not known" options={INDIAN_STATES.map((st) => ({ value: st, label: st }))} onchange={(v) => brandState(v)} />
				</div>
				<div class="f span2"><label for="iv-ba">Billing address</label><input class="inp" id="iv-ba" value={c.brand.billing_address} onchange={(e) => saveBrand(c.brand_id, { billing_address: val(e) })} /></div>
			</div>
		</details>

		<div class="fields" style="margin-top:12px">
			<div class="f"><label for="iv-to">Also email to <span class="hint">(accounts team)</span></label><input class="inp" id="iv-to" type="email" placeholder="accounts@brand.com" bind:value={sendTo} /></div>
			<div class="f"><label for="iv-notes">Note on invoice <span class="hint">(optional)</span></label><input class="inp" id="iv-notes" bind:value={notes} /></div>
		</div>
		<label class="check-row"><input type="checkbox" class="cbx" bind:checked={autoRemind} /><span>Send polite payment reminders automatically</span></label>

		<div class="q-total">
			<div><span class="lbl">Invoice total</span><b class="num">{inr(total)}</b></div>
			<small>{inr(subtotal)}{gst ? ` + ${inr(gst)} GST` : ''}{tds ? ` · brand pays ${inr(total - tds)} after ${inr(tds)} TDS` : ''}</small>
		</div>
		{#if !s.upi_id}<p class="hint warn-text">Add your UPI ID on My page so the invoice shows a QR code.</p>{/if}
		{#if s.gst_registered && !s.gstin}<p class="hint warn-text">Add your GSTIN on My page before sending GST invoices.</p>{/if}
		{#if !canSend}<p class="err">Add the brand's email (in the panel) or an accounts email above to send this invoice.</p>{/if}

		<div class="row">
			<button class="btn ghost" onclick={onclose}>Cancel</button>
			<button class="btn" disabled={busy || !items.length} onclick={() => submit(false)}>Save draft</button>
			<button class="btn grad" disabled={busy || !items.length || !canSend || subtotal <= 0} onclick={() => submit(true)}>
				{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Issue and send
			</button>
		</div>
	</div>
</div>
