<script lang="ts">
	import { portal } from '../portal';
	import { onMount, untrack } from 'svelte';
	import { saveQuote, studio } from '../studio.svelte';
	import type { Collab, Quote, QuoteItem } from '../types';
	import { KINDS, USAGE, inr, usageOption, payTerms, plural, quoteTotal, rel } from '../util';
	import Icon from './Icon.svelte';
	import { quoteOptions, suggestTerms, usageFee as usageFeeFor, type QuoteOption } from '../suggest';
	import Select from './Select.svelte';
	import { CURRENCIES, fromInr, money, rateToday, signOf, type Currency } from '../currency';

	let { c, base, editing = false, onclose }: { c: Collab; base?: Quote; editing?: boolean; onclose: () => void } = $props();

	const rates = studio.settings?.rates ?? {};
	// The form starts from a copy of the previous version (or the deliverables priced with her rate card).
	const start = untrack(() => ({ base, c }));
	let items = $state<QuoteItem[]>(
		start.base?.items?.length
			? start.base.items.map((i) => ({ ...i }))
			: start.c.deliverables.map((d) => ({ kind: d.kind, qty: d.qty, rate: rates[d.kind] ?? 0 }))
	);
	// Suggestions (new quotes only): three ready options and the terms she usually agrees with this brand.
	const options = start.base ? [] : quoteOptions(start.c, studio.settings!, studio.packages);
	const terms = suggestTerms(start.c, studio.collabs);
	let picked = $state<QuoteOption['key'] | ''>('');
	let cur = $state<Currency>(((start.base?.currency ?? start.c.brand.currency) || 'INR') as Currency);
	let fx = $state(start.base?.inr_rate ?? 1);
	let usage = $state(start.base?.usage ?? start.c.usage ?? 'Organic only');
	let usageFee = $state(start.base?.usage_fee ?? 0);
	let discount = $state(start.base?.discount ?? 0);
	let advance = $state(start.base?.advance_pct ?? terms.advance_pct);
	let payDays = $state(start.base?.pay_days ?? terms.pay_days);
	let rounds = $state(start.base?.revision_rounds ?? terms.revision_rounds);
	let exclusivity = $state(start.base?.exclusivity_days ?? terms.exclusivity_days);

	function pick(o: QuoteOption) {
		// Options are priced in rupees: convert when quoting in another currency.
		const k = (v: number) => (fx === 1 ? v : fromInr(v, fx));
		picked = o.key;
		items = o.items.map((i) => ({ ...i, rate: k(i.rate) }));
		usage = o.usage;
		usageFee = k(o.usage_fee);
		discount = k(o.discount);
	}
	// Start from the option that fits best: the brand's budget if they gave one, else the rate card.
	const first0 = options.find((o) => o.key === 'budget') ?? options.find((o) => o.key === 'rate');
	if (first0) untrack(() => pick(first0));
	let validDays = $state(14);
	let notes = $state(start.base?.notes ?? '');
	let busy = $state(false);
	let first = $state<HTMLElement>();

	// Foreign brands: the quote is in their currency; her rupee prices are converted at today's rate.
	let fxNote = $state('');
	const foreign = $derived(cur !== 'INR');
	const sign = $derived(signOf(cur).trim());
	async function useCurrency(next: Currency) {
		const before = fx;
		const toInr = (v: number) => (Number(v) || 0) * before;
		const snap = { items: items.map((i) => toInr(i.rate)), usageFee: toInr(usageFee), discount: toInr(discount) };
		cur = next;
		if (next === 'INR') fx = 1;
		else {
			fxNote = 'Getting today\'s rate…';
			const r = await rateToday(next);
			if (r) fx = r;
			fxNote = r ? "Today's rate (European Central Bank). Change it to what your bank gives." : "Couldn't get today's rate. Type it in.";
		}
		const conv = (inr: number) => (next === 'INR' ? Math.round(inr) : fromInr(inr, fx));
		items = items.map((i, k) => ({ ...i, rate: conv(snap.items[k]) }));
		usageFee = conv(snap.usageFee);
		discount = conv(snap.discount);
	}
	onMount(() => {
		if (!start.base && cur !== 'INR') useCurrency(cur);
	});
	/** A new rate re-prices the quote (each line keeps its value in rupees). */
	function setFx(n: number) {
		if (!(n > 0)) return;
		const old = fx;
		fx = n;
		items = items.map((i) => ({ ...i, rate: fromInr(i.rate * old, n) }));
		usageFee = fromInr(usageFee * old, n);
		discount = fromInr(discount * old, n);
	}
	const total = $derived(quoteTotal(items, usageFee, discount));
	const itemsSubtotal = $derived(items.reduce((a, i) => a + i.qty * i.rate, 0));
	const brandBudget = $derived(c.fee);
	onMount(() => first?.querySelector('input')?.focus());

	function addItem(kind: string) {
		items.push({ kind, qty: 1, rate: rates[kind] ?? 0 });
	}
	async function submit(send: boolean) {
		if (!items.length) return;
		busy = true;
		const ok = await saveQuote(
			c,
			{
				items: items.filter((i) => i.qty > 0),
				usage,
				usage_fee: Number(usageFee) || 0,
				discount: Number(discount) || 0,
				advance_pct: Number(advance) || 0,
				pay_days: Number(payDays) || 0,
				revision_rounds: Number(rounds) || 0,
				exclusivity_days: Number(exclusivity) || 0,
				valid_until: validDays > 0 ? rel(validDays) : null,
				notes,
				currency: cur,
				inr_rate: foreign ? Number(fx) || 1 : 1
			},
			send,
			editing ? base?.id : undefined
		);
		busy = false;
		if (ok) onclose();
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog quote-dialog" role="dialog" aria-modal="true" aria-labelledby="q-title">
		<h2 id="q-title">{editing ? 'Edit quote' : base ? `Quote version ${(c.quotes[0]?.version ?? 0) + 1}` : 'Build a quote'} · {c.brand.name}</h2>
		<p>Prices start from your rate card. {#if brandBudget}The brand's budget was {inr(brandBudget)}.{/if}</p>
		<div class="fields cur-row">
			<div class="f"><label for="q-cur">Currency</label><Select id="q-cur" value={cur} options={CURRENCIES} onchange={(v) => useCurrency(v as Currency)} /></div>
			{#if foreign}<div class="f"><label for="q-fx">1 {cur} in rupees</label><div class="pre"><span>₹</span><input class="inp num" id="q-fx" type="number" min="0" step="0.01" value={fx} onchange={(e) => setFx(Number((e.currentTarget as HTMLInputElement).value))} /></div></div>{/if}
		</div>
		{#if foreign && fxNote}<p class="hint" style="margin:6px 0 0">{fxNote}</p>{/if}

		{#if options.length}
			<div class="q-opts" role="radiogroup" aria-label="Suggested quotes">
				{#each options as o (o.key)}
					<button type="button" class="q-opt" class:on={picked === o.key} role="radio" aria-checked={picked === o.key} onclick={() => pick(o)}>
						<span class="q-opt-t">{o.title}</span>
						<b class="num">{foreign ? `≈ ${money(fromInr(o.total, fx), cur)}` : inr(o.total)}</b>
						<small>{o.sub}</small>
					</button>
				{/each}
			</div>
		{/if}

		<div class="q-items" bind:this={first}>
			<div class="q-row head"><span>Deliverable</span><span>Qty</span><span>Rate</span><span>Amount</span><span></span></div>
			{#each items as it, i (i)}
				<div class="q-row">
					<span class="q-kind">{plural(it.kind, it.qty)}</span>
					<input class="inp num" type="number" min="1" max="50" aria-label="Quantity of {it.kind}" bind:value={it.qty} />
					<div class="pre"><span>{sign}</span><input class="inp num" type="number" min="0" aria-label="Rate for {it.kind}" bind:value={it.rate} /></div>
					<b class="num">{money(it.qty * it.rate, cur)}</b>
					<button class="icon-btn sm" onclick={() => items.splice(i, 1)} aria-label="Remove {it.kind}"><Icon name="x" /></button>
				</div>
			{/each}
			<Select action class="add-sel" ariaLabel="Add a line" placeholder="+ Add a line" options={KINDS.map((k) => ({ value: k, label: k }))} onchange={(k) => addItem(k)} />
		</div>

		<div class="fields" style="margin-top:16px">
			<div class="f">
				<label for="q-usage">Usage rights</label>
				<Select id="q-usage" bind:value={usage} options={USAGE.map((u) => ({ value: u, label: usageOption(u) }))} onchange={(u) => (usageFee = usageFeeFor(u, itemsSubtotal, studio.settings!))} />
			</div>
			<div class="f"><label for="q-ufee">Usage fee</label><div class="pre"><span>{sign}</span><input class="inp num" id="q-ufee" type="number" min="0" bind:value={usageFee} /></div></div>
			<div class="f"><label for="q-disc">Discount</label><div class="pre"><span>{sign}</span><input class="inp num" id="q-disc" type="number" min="0" bind:value={discount} /></div></div>
			<div class="f">
				<label for="q-adv">Advance</label>
				<Select id="q-adv" bind:value={advance} options={[{ value: 0, label: 'No advance' }, { value: 30, label: '30% advance' }, { value: 50, label: '50% advance' }, { value: 100, label: '100% upfront' }]} />
				{#if !base && advance === terms.advance_pct}<small class="hint sug-why">{terms.why}</small>{/if}
			</div>
			<div class="f">
				<label for="q-days">Balance due</label>
				<Select id="q-days" bind:value={payDays} disabled={advance >= 100} options={[0, 7, 15, 30, 45].map((d) => ({ value: d, label: d ? `${d} days after going live` : 'On the day it goes live' }))} />
			</div>
			<div class="f">
				<label for="q-rounds">Draft revisions included</label>
				<Select id="q-rounds" bind:value={rounds} options={[0, 1, 2, 3].map((r) => ({ value: r, label: r === 0 ? 'None' : `${r} round${r > 1 ? 's' : ''}` }))} />
			</div>
			<div class="f">
				<label for="q-excl">Exclusivity</label>
				<Select id="q-excl" bind:value={exclusivity} options={[0, 7, 15, 30, 60, 90].map((d) => ({ value: d, label: d ? `${d} days` : 'None' }))} />
			</div>
			<div class="f">
				<label for="q-valid">Quote valid for</label>
				<Select id="q-valid" bind:value={validDays} options={[7, 14, 30, 0].map((d) => ({ value: d, label: d ? `${d} days` : 'No expiry' }))} />
			</div>
			<div class="f span2"><label for="q-notes">Notes for the brand <span class="hint">(optional)</span></label><textarea class="inp" id="q-notes" rows="2" placeholder="e.g. Raw footage not included. One reshoot if the product changes." bind:value={notes}></textarea></div>
		</div>

		<div class="q-total">
			<div><span class="lbl">Total</span><b class="num">{money(total, cur)}</b>{#if foreign}<small> ≈ {inr(total * fx)}</small>{/if}</div>
			<small>{payTerms({ advance_pct: advance, pay_days: payDays })}{exclusivity ? ` · ${exclusivity} days exclusivity` : ''}</small>
		</div>
		{#if !c.contact_email}<p class="err">Add the brand's email in the panel first, so they can receive and accept the quote.</p>{/if}

		<div class="row">
			<button class="btn ghost" onclick={onclose}>Cancel</button>
			<button class="btn" disabled={busy || !items.length} onclick={() => submit(false)}>Save draft</button>
			<button class="btn grad" disabled={busy || !items.length || !c.contact_email} onclick={() => submit(true)}>
				{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Send to brand
			</button>
		</div>
	</div>
</div>
