<script lang="ts">
	import { portal } from '../portal';
	import { onMount, untrack } from 'svelte';
	import { WAIT_LINE, saveQuote, studio } from '../studio.svelte';
	import type { Collab, Quote, QuoteItem } from '../types';
	import { KINDS, USAGE, fmt, inr, iso, parse, usageOption, payTerms, plural, quoteTotal, rel } from '../util';
	import Icon from './Icon.svelte';
	import ProNote from './ProNote.svelte';
	import { loadPlan, plan } from '../plan.svelte';
	import { quoteOptions, suggestTerms, usageFee as usageFeeFor, type QuoteOption } from '../suggest';
	import Select from './Select.svelte';
	import { loadBench, rangeFor } from '../benchmark.svelte';
	import { CURRENCIES, fromInr, money, rateToday, signOf, type Currency } from '../currency';

	// preset: terms to start from (an offer check's asks, or "Quote with 50% advance" for a new brand).
	type Preset = Partial<{ advance_pct: number | null; pay_days: number | null; usage: string | null; exclusivity_days: number | null; revision_rounds: number | null; wait_advance: boolean }>;
	let { c, base, editing = false, preset, onclose }: { c: Collab; base?: Quote; editing?: boolean; preset?: Preset; onclose: () => void } = $props();

	const rates = studio.settings?.rates ?? {};
	// The free plan runs 5 collabs at a time: say so before she sends a quote for a 6th.
	loadPlan().catch(() => {});
	const cap = $derived(plan.data && (plan.data.rank ?? 1) === 1 ? plan.data.limits?.active_collabs : undefined);
	const counted = $derived(c.quotes.some((q) => q.status === 'sent' || q.status === 'accepted' || q.status === 'changes'));
	const full = $derived(cap != null && !counted && (plan.data?.usage.active_collabs ?? 0) >= cap);
	// The form starts from a copy of the previous version (or the deliverables priced with her rate card).
	const start = untrack(() => ({ base, c }));
	let items = $state<QuoteItem[]>(
		start.base?.items?.length
			? start.base.items.map((i) => ({ ...i }))
			: start.c.deliverables.map((d) => ({ kind: d.kind, qty: d.qty, rate: rates[d.kind] ?? 0 }))
	);
	// Suggestions (new quotes only): three ready options and the terms she usually agrees with this brand.
	const options = start.base ? [] : quoteOptions(start.c, studio.settings!, studio.packages);
	const terms = suggestTerms(start.c, studio.collabs, studio.settings);
	const pre = untrack(() => preset ?? {});
	let picked = $state<QuoteOption['key'] | ''>('');
	let cur = $state<Currency>(((start.base?.currency ?? start.c.brand.currency) || 'INR') as Currency);
	let fx = $state(start.base?.inr_rate ?? 1);
	let usage = $state(pre.usage ?? start.base?.usage ?? start.c.usage ?? 'Organic only');
	let usageFee = $state(start.base?.usage_fee ?? 0);
	let discount = $state(start.base?.discount ?? 0);
	let advance = $state(pre.advance_pct ?? start.base?.advance_pct ?? terms.advance_pct);
	let payDays = $state(pre.pay_days ?? start.base?.pay_days ?? terms.pay_days);
	let rounds = $state(pre.revision_rounds ?? start.base?.revision_rounds ?? terms.revision_rounds);
	let exclusivity = $state(pre.exclusivity_days ?? start.base?.exclusivity_days ?? terms.exclusivity_days);
	let waitAdvance = $state(pre.wait_advance ?? start.base?.wait_advance ?? studio.settings?.terms_wait_advance ?? false);

	// A returning brand (from her "Book again" offer): their % comes off every option.
	const loyaltyPct = untrack(() => start.c.loyalty_pct ?? 0);
	const loyaltyOff = (list: QuoteItem[]) => (loyaltyPct ? Math.round(list.reduce((a, i) => a + i.qty * i.rate, 0) * loyaltyPct / 100) : 0);
	function pick(o: QuoteOption) {
		// Options are priced in rupees: convert when quoting in another currency.
		const k = (v: number) => (fx === 1 ? v : fromInr(v, fx));
		picked = o.key;
		items = o.items.map((i) => ({ ...i, rate: k(i.rate) }));
		usage = o.usage;
		usageFee = k(o.usage_fee);
		discount = k(o.discount + loyaltyOff(o.items));
	}
	// Start from the option that fits best: the brand's budget if they gave one, else the rate card.
	const first0 = options.find((o) => o.key === 'budget') ?? options.find((o) => o.key === 'rate');
	if (first0)
		untrack(() => {
			pick(first0);
			if (pre.usage) usage = pre.usage;
		});
	let validDays = $state(14);
	// Let the brand choose: they see the ready options side by side (the middle one marked most
	// popular) and pick one; the quote becomes that option when they accept.
	let letChoose = $state(options.length >= 2);
	const choices = $derived(
		options.map((o, i) => {
			const off = loyaltyOff(o.items);
			const k = (v: number) => (fx === 1 ? v : fromInr(v, fx));
			return {
				title: o.key === 'budget' ? 'Fits your budget' : o.key === 'rate' ? 'Recommended' : 'Premium',
				sub: o.sub,
				items: o.items.map((x) => ({ ...x, rate: k(x.rate) })),
				usage: o.usage,
				usage_fee: k(o.usage_fee),
				discount: k(o.discount + off),
				total: k(Math.max(0, o.total - off)),
				popular: options.length >= 3 ? i === 1 : o.key === 'rate'
			};
		})
	);
	let notes = $state((start.base?.notes ?? '').replace(WAIT_LINE, '').trim());
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
	// What the brand pays and when, with GST when she charges it (Indian brands).
	const gstK = $derived(studio.settings?.gst_registered && !foreign ? 1 + (studio.settings?.gst_rate || 18) / 100 : 1);
	const advAmt = $derived(Math.round(((total * Math.min(100, advance)) / 100) * gstK));
	const restAmt = $derived(Math.round(total * gstK) - advAmt);
	const golive = $derived(c.live_date ?? c.preferred_live ?? null);
	const restBy = $derived.by(() => {
		if (!golive) return '';
		const d = parse(golive);
		d.setDate(d.getDate() + (Number(payDays) || 0));
		return iso(d);
	});
	const share = $derived(advance === 50 ? 'half' : `${advance}%`);
	const ADV = [
		{ v: 0, l: 'None' },
		{ v: 30, l: '30%' },
		{ v: 50, l: '50%' },
		{ v: 100, l: 'All' }
	];
	const itemsSubtotal = $derived(items.reduce((a, i) => a + i.qty * i.rate, 0));
	const brandBudget = $derived(c.fee);
	onMount(() => first?.querySelector('input')?.focus());
	onMount(loadBench);

	function addItem(kind: string) {
		items.push({ kind, qty: 1, rate: rates[kind] ?? 0 });
	}
	// Something to quote: at least one piece of content with a quantity (and no negative prices).
	const hasContent = $derived(items.some((i) => Number(i.qty) > 0));
	async function submit(send: boolean) {
		if (!items.length || !hasContent) return;
		for (const i of items) i.rate = Math.max(0, Number(i.rate) || 0);
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
				wait_advance: waitAdvance && Number(advance) > 0,
				valid_until: validDays > 0 ? rel(validDays) : null,
				notes,
				currency: cur,
				inr_rate: foreign ? Number(fx) || 1 : 1,
				options: letChoose && choices.length >= 2 && !editing ? choices : null
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
		<p>Prices start from your rate card. {#if brandBudget}The fee on this collab is {inr(brandBudget)}.{/if}{#if loyaltyPct} <b>Returning brand: {loyaltyPct}% off is included in the discount.</b>{/if}</p>
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
			{#if options.length >= 2 && !editing}
				<label class="check-row q-choose"><input type="checkbox" class="cbx" bind:checked={letChoose} /><span><b>Let the brand choose</b> from these {options.length} options (the middle one is shown as most popular). Most brands pick the middle one.</span></label>
			{/if}
		{/if}

		<div class="q-items" bind:this={first}>
			<div class="q-row head"><span>Deliverable</span><span>Qty</span><span>Rate</span><span>Amount</span><span></span></div>
			{#each items as it, i (i)}
				<div class="q-row">
					<span class="q-kind">{plural(it.kind, it.qty)}</span>
					<input class="inp num" type="number" min="1" max="50" aria-label="Quantity of {it.kind}" bind:value={it.qty} />
					<div class="pre"><span>{sign}</span><input class="inp num" type="number" min="0" aria-label="Rate for {it.kind}" bind:value={it.rate} onchange={() => (it.rate = Math.max(0, Number(it.rate) || 0))} /></div>
					<b class="num">{money(it.qty * it.rate, cur)}</b>
					<button class="icon-btn sm" onclick={() => items.splice(i, 1)} aria-label="Remove {it.kind}"><Icon name="x" /></button>
				</div>
			{/each}
			<Select action class="add-sel" ariaLabel="Add a line" placeholder="+ Add a line" options={KINDS.map((k) => ({ value: k, label: k }))} onchange={(k) => addItem(k)} />
		</div>
		{#if !foreign && items.some((i) => rangeFor(i.kind))}
			<p class="hint q-bench">Creators your size charge: {items.filter((i) => rangeFor(i.kind)).map((i) => `${i.kind} ${inr(rangeFor(i.kind)!.low)}–${inr(rangeFor(i.kind)!.high)}`).join(' · ')}</p>
		{/if}

		<div class="fields" style="margin-top:16px">
			<div class="f">
				<label for="q-usage">Usage rights</label>
				<Select id="q-usage" bind:value={usage} options={USAGE.map((u) => ({ value: u, label: usageOption(u) }))} onchange={(u) => (usageFee = usageFeeFor(u, itemsSubtotal, studio.settings!))} />
			</div>
			<div class="f"><label for="q-ufee">Usage fee</label><div class="pre"><span>{sign}</span><input class="inp num" id="q-ufee" type="number" min="0" bind:value={usageFee} /></div></div>
			<div class="f"><label for="q-disc">Discount</label><div class="pre"><span>{sign}</span><input class="inp num" id="q-disc" type="number" min="0" bind:value={discount} /></div></div>
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

		<section class="q-pay" aria-labelledby="q-pay-t">
			<span class="lbl-t" id="q-pay-t">How they pay</span>
			<div class="q-pay-g">
				<small>Before the shoot</small>
				<div class="q-seg" role="radiogroup" aria-label="Advance">
					{#each ADV as a (a.v)}<button type="button" role="radio" aria-checked={advance === a.v} class:on={advance === a.v} onclick={() => (advance = a.v)}>{a.l}</button>{/each}
				</div>
				{#if !base && preset?.advance_pct == null && advance === terms.advance_pct}<small class="hint sug-why">{terms.why}</small>{/if}
			</div>
			{#if advance < 100}
				<div class="q-pay-g">
					<label for="q-days">{advance > 0 ? 'The rest' : 'When they pay'}</label>
					<Select id="q-days" bind:value={payDays} options={[0, 7, 15, 30, 45, 60].map((d) => ({ value: d, label: d ? `Within ${d} days of going live` : 'On the day it goes live' }))} />
				</div>
			{/if}
			{#if advance > 0}
				<div class="switch-row q-wait">
					<div><b>Don't start until the advance arrives</b><small>The shoot date waits; {c.brand.name} sees why</small></div>
					<input type="checkbox" class="tgl" bind:checked={waitAdvance} aria-label="Don't start until the advance arrives" />
				</div>
			{/if}
			{#if total > 0}
				<div class="q-pay-sum">
					{#if advance >= 100}
						<span>{c.brand.name} pays <b>{money(advAmt, cur)}</b> before the shoot{gstK > 1 ? ', with GST' : ''}.</span>
					{:else if advance > 0}
						<span>{c.brand.name} pays <b>{money(advAmt, cur)}</b> before the shoot ({share}{gstK > 1 ? ', with GST' : ''})</span>
						<span>and <b>{money(restAmt, cur)}</b> {restBy ? `by ${fmt(restBy)}, if it goes live on ${fmt(golive)}` : `within ${payDays} days of going live`}.</span>
					{:else}
						<span>{c.brand.name} pays <b>{money(restAmt, cur)}</b>{gstK > 1 ? ' with GST' : ''} {restBy ? `by ${fmt(restBy)}, if it goes live on ${fmt(golive)}` : payDays ? `within ${payDays} days of going live` : 'on the day it goes live'}.</span>
					{/if}
				</div>
			{/if}
			<small class="hint">These become part of the agreement {c.brand.name} accepts. Your usual terms are in <a href="/studio/settings?s=payments">Settings › Invoices &amp; payments</a>.</small>
		</section>

		<div class="q-total">
			<div><span class="lbl">Total</span><b class="num">{money(total, cur)}</b>{#if foreign}<small> ≈ {inr(total * fx)}</small>{/if}</div>
			<small>{payTerms({ advance_pct: advance, pay_days: payDays })}{waitAdvance && advance > 0 ? ' · work starts once it arrives' : ''}{exclusivity ? ` · ${exclusivity} days exclusivity` : ''}</small>
		</div>
		{#if full}<ProNote title="Run more than {cap} collabs at a time" body="You have {cap} collabs in progress, the free plan's most. Wrap one up to send this quote, or go Pro for unlimited." />{/if}
		{#if !c.contact_email}<p class="err">Add the brand's email in the panel first, so they can receive and accept the quote.</p>{/if}

		<div class="row">
			<button class="btn ghost" onclick={onclose}>Cancel</button>
			<button class="btn" disabled={busy || !hasContent} onclick={() => submit(false)}>Save draft</button>
			<button class="btn grad" disabled={busy || !hasContent || !c.contact_email} title={hasContent ? '' : 'Add at least one piece of content'} onclick={() => submit(true)}>
				{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Send to brand
			</button>
		</div>
	</div>
</div>
