<script lang="ts">
	import { portal } from '../portal';
	import { onMount, untrack } from 'svelte';
	import { saveBrand, saveInvoice, studio } from '../studio.svelte';
	import { ensurePlan, hasFeature } from '../plan.svelte';
	import type { Collab } from '../types';
	import { INDIAN_STATES, KIND_LABEL, type Invoice, type InvoiceItem } from '../invoice';
	import { acceptedQuote, delivText, inr, parse, rel, todayIso, iso, usageLabel } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';
	import DatePicker from './DatePicker.svelte';
	import { COUNTRIES, CURRENCIES, currencyFor, money, rateToday, type Currency } from '../currency';

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
		// An advance only makes sense before the content is out; after that it's the full amount.
		const posted = c.stage === 'live' || c.stage === 'wrapped';
		if (q && q.advance_pct > 0 && q.advance_pct < 100 && !hasAdvance && invoicedSoFar === 0 && !posted) {
			kind = 'advance';
			amount = Math.round((fee * q.advance_pct) / 100);
		} else if (invoicedSoFar > 0) {
			kind = 'balance';
			amount = Math.max(0, fee - invoicedSoFar);
		}
		const what = `${delivText(c.deliverables)} for ${c.brand.name}${c.usage && c.usage !== 'Organic only' ? `, ${usageLabel(c.usage).toLowerCase()}` : ''} (${c.code})`;
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
	// Same TDS as this brand's last invoice (brands deduct the same rate every time).
	const lastForBrand = untrack(() =>
		studio.collabs
			.filter((x) => x.brand_id === c.brand_id)
			.flatMap((x) => x.invoices)
			.filter((i) => i.status !== 'draft' && i.status !== 'cancelled')
			.sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
	);
	let tdsRate = $state(start.e?.tds_rate ?? lastForBrand?.tds_rate ?? 0);
	let tdsSection = $state<'194J' | '194C'>(start.e?.tds_section ?? lastForBrand?.tds_section ?? '194J');
	let issueDate = $state(start.e?.issue_date ?? todayIso());
	let dueDate = $state(start.due);
	let sendTo = $state(start.e?.send_to ?? start.accounts);
	let notes = $state(start.e?.notes ?? '');
	let autoRemind = $state(start.e?.auto_remind ?? true);
	let busy = $state(false);

	// Foreign brands: the invoice is in their currency, exported without GST under her LUT, no TDS.
	let cur = $state<Currency>(((start.e?.currency ?? untrack(() => c.brand.currency)) || 'INR') as Currency);
	let rate = $state(start.e?.inr_rate ?? 1);
	let rateNote = $state('');
	const foreign = $derived(cur !== 'INR');
	async function useCurrency(next: Currency, convert = true) {
		const from = rate;
		cur = next;
		if (next === 'INR') {
			if (convert) items = items.map((i) => ({ ...i, rate: Math.round(i.rate * from) }));
			rate = 1;
			taxMode = s.gst_registered ? (c.brand.state && s.state && c.brand.state === s.state ? 'intra' : 'inter') : 'none';
			return;
		}
		const inrNow = items.map((i) => i.rate * from);
		// Agreed in this currency: use the quote's rate, so the amounts match the quote exactly.
		const q = acceptedQuote(c);
		if (q && q.currency === next && q.inr_rate > 0) {
			rate = Number(q.inr_rate);
			rateNote = `The rate from the accepted quote (₹${rate}). Change it to the rate your bank gives.`;
		} else {
			rateNote = "Getting today's rate…";
			const r = await rateToday(next);
			rateNote = r ? "Today's rate, from the European Central Bank. Change it to the rate your bank gives." : "Couldn't get today's rate. Type it in.";
			if (r) rate = r;
		}
		if (convert) items = items.map((i, k) => ({ ...i, rate: exact(inrNow[k], rate) }));
		taxMode = s.gst_registered ? 'export' : 'none';
		tdsRate = 0;
	}
	onMount(() => {
		ensurePlan();
		if (!editing && cur !== 'INR') useCurrency(cur);
	});
	/** Invoices are exact to the cent (quotes are rounded; invoices follow them). */
	const exact = (inr: number, r: number) => Math.round(((Number(inr) || 0) / (r || 1)) * 100) / 100;
	/** A new rate re-prices the lines (each keeps its value in rupees). */
	function setRate(n: number) {
		if (!(n > 0)) return;
		const old = rate;
		rate = n;
		items = items.map((i) => ({ ...i, rate: exact(i.rate * old, n) }));
	}

	const subtotal = $derived(items.reduce((a, i) => a + Math.max(0, Number(i.qty) || 0) * Math.max(0, Number(i.rate) || 0), 0));
	const gst = $derived(taxMode === 'none' || taxMode === 'export' ? 0 : Math.round(subtotal * gstRate) / 100);
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
				gst_rate: s.gst_registered && !foreign ? Number(gstRate) : 0,
				tds_rate: foreign ? 0 : Number(tdsRate),
				tds_section: tdsSection,
				currency: cur,
				inr_rate: foreign ? Number(rate) || 1 : 1,
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

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog quote-dialog" role="dialog" aria-modal="true" aria-labelledby="inv-title">
		<h2 id="inv-title">{editing ? 'Edit draft invoice' : 'New invoice'} · {c.brand.name}</h2>
		<p>Fee {inr(start.fee)}{start.invoicedSoFar ? ` · already invoiced ${inr(start.invoicedSoFar)}` : ''}. {foreign ? `Amounts in ${cur}.` : 'Amounts are before GST.'}</p>

		<div class="fields cur-row">
			<div class="f">
				<label for="iv-cur">Currency</label>
				<Select id="iv-cur" value={cur} options={CURRENCIES} onchange={(v) => useCurrency(v as Currency)} />
			</div>
			{#if foreign}
				<div class="f">
					<label for="iv-fx">1 {cur} in rupees</label>
					<div class="pre"><span>₹</span><input class="inp num" id="iv-fx" type="number" min="0" step="0.01" value={rate} onchange={(e) => setRate(Number((e.currentTarget as HTMLInputElement).value))} /></div>
				</div>
			{/if}
		</div>
		{#if foreign && rateNote}<p class="hint" style="margin:6px 0 0">{rateNote}</p>{/if}

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
					<input class="inp" aria-label="Description" placeholder="What it is for" bind:value={it.description} />
					<input class="inp num" type="number" min="1" aria-label="Quantity" bind:value={it.qty} />
					<div class="pre"><span>{CURRENCIES.find((x) => x.value === cur)?.sign.trim()}</span><input class="inp num" type="number" min="0" aria-label="Amount" bind:value={it.rate} /></div>
					<button class="icon-btn sm" onclick={() => items.splice(i, 1)} aria-label="Remove line"><Icon name="x" /></button>
				</div>
			{/each}
			<button class="btn sm ghost" style="align-self:flex-start" onclick={() => items.push({ description: '', qty: 1, rate: 0 })}><Icon name="plus" />Add a line</button>
		</div>

		<div class="fields" style="margin-top:14px">
			{#if s.gst_registered && foreign}
				<div class="f span2">
					<label for="iv-tax">GST</label>
					<Select id="iv-tax" bind:value={taxMode} options={[{ value: 'export' as const, label: 'Export of services under LUT (no GST)' }, { value: 'inter' as const, label: 'IGST (no LUT)' }]} />
				</div>
			{:else if s.gst_registered}
				<div class="f">
					<label for="iv-tax">GST</label>
					<Select id="iv-tax" bind:value={taxMode} options={[{ value: 'intra' as const, label: `CGST + SGST (brand in ${s.state || 'your state'})` }, { value: 'inter' as const, label: 'IGST (brand in another state)' }, { value: 'none' as const, label: 'No GST on this invoice' }]} />
				</div>
				<div class="f"><label for="iv-rate">GST rate</label><Select id="iv-rate" bind:value={gstRate} options={[18, 12, 5].map((r) => ({ value: r, label: `${r}%` }))} /></div>
			{/if}
			{#if !foreign}
				<div class="f">
					<label for="iv-tds">TDS the brand will deduct</label>
					<Select id="iv-tds" bind:value={tdsRate} options={[0, 1, 2, 10].map((r) => ({ value: r, label: r ? `${r}%` : 'None' }))} />
				</div>
				{#if tdsRate > 0}
					<div class="f">
						<label for="iv-tds-s">Under</label>
						<Select id="iv-tds-s" bind:value={tdsSection} onchange={(v) => (tdsRate = v === '194C' ? (tdsRate === 10 ? 1 : tdsRate) : 10)} options={[{ value: '194J' as const, label: '194J · fees for content (10%)' }, { value: '194C' as const, label: '194C · contract work (1% or 2%)' }]} />
						<small class="hint">Section 393 of the new Income-tax Act from 1 April 2026; same rates.</small>
					</div>
				{/if}
			{/if}
			<div class="f"><label for="iv-due">Payment due</label><DatePicker id="iv-due" bind:value={dueDate} /></div>
		</div>

		<details class="bill-details" open={!c.brand.state && s.gst_registered}>
			<summary>Bill to: {c.brand.name}{c.brand.gstin ? ` · GSTIN ${c.brand.gstin}` : ''}{c.brand.state ? ` · ${c.brand.state}` : ''}</summary>
			<div class="fields" style="margin-top:10px">
				<div class="f">
					<label for="iv-bc">Country</label>
					<Select id="iv-bc" value={c.brand.country || 'India'} options={COUNTRIES.map((x) => ({ value: x, label: x }))} onchange={(v) => saveBrand(c.brand_id, { country: v, currency: v === 'India' ? 'INR' : c.brand.currency !== 'INR' ? c.brand.currency : currencyFor(v) })} />
				</div>
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
		<label class="check-row"><input type="checkbox" class="cbx" bind:checked={autoRemind} /><span>Send polite payment reminders automatically{#if !hasFeature('reminders')} <a class="lnk" href="/studio/settings?s=plan">on Creator Pro</a>{/if}</span></label>

		<div class="q-total">
			<div><span class="lbl">Invoice total</span><b class="num">{money(total, cur)}</b></div>
			<small>{#if foreign}About {inr(total * rate)} at ₹{rate} · {taxMode === 'export' ? 'export under LUT, no GST' : taxMode === 'inter' ? 'IGST added' : 'no GST'}{:else}{inr(subtotal)}{gst ? ` + ${inr(gst)} GST` : ''}{tds ? ` · brand pays ${inr(total - tds)} after ${inr(tds)} TDS` : ''}{/if}</small>
		</div>
		{#if foreign && taxMode === 'export' && !s.lut_arn}<p class="hint warn-text">Add your LUT number on My page &gt; Invoices &amp; payments so export invoices show it.</p>{/if}
		{#if foreign && !s.intl_bank_details}<p class="hint warn-text">Add your bank details for international payments (SWIFT) on My page &gt; Invoices &amp; payments.</p>{/if}
		{#if foreign}{:else if !s.upi_id}<p class="hint warn-text">Add your UPI ID on My page so the invoice shows a QR code.</p>{/if}
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
