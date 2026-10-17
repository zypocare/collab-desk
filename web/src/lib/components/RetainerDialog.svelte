<script lang="ts">
	import { portal } from '../portal';
	import { untrack } from 'svelte';
	import { ensureBrand, saveRetainer, studio } from '../studio.svelte';
	import type { Retainer } from '../types';
	import { KINDS, inr, plural } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';
	import Segmented from './Segmented.svelte';

	// Set up (or change) a monthly deal: what each month includes, the monthly fee, for how long.
	let { editing, brandName = '', onclose }: { editing?: Retainer; brandName?: string; onclose: () => void } = $props();
	const e = untrack(() => editing);
	const brandOf = (id: string) => studio.brands.find((b) => b.id === id)?.name ?? '';

	let brand = $state(e ? brandOf(e.brand_id) : untrack(() => brandName));
	let title = $state(e?.title ?? 'Ambassador');
	const rates = studio.settings?.rates ?? {};
	let counts = $state<Record<string, number>>(Object.fromEntries(KINDS.map((k) => [k, e?.deliverables.find((d) => d.kind === k)?.qty ?? (e ? 0 : k === 'Reel' ? 2 : k === 'Story' ? 3 : 0)])));
	let fee = $state(e?.fee ?? 0);
	let feeTouched = $state(!!e);
	// First month: this month or one of the next five.
	const MONTHS = Array.from({ length: 6 }, (_, i) => {
		const d = new Date();
		d.setDate(1);
		d.setMonth(d.getMonth() + i);
		const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
		return { value: v, label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
	});
	let starts = $state(e?.starts_on ?? MONTHS[0].value);
	let months = $state(e ? (e.months === null ? 'open' : String(e.months)) : '6');
	let liveDay = $state(e?.live_day ?? 20);
	let invoiceWhen = $state<'start' | 'live'>(e?.invoice_when ?? 'start');
	let contact = $state(e?.contact_name ?? '');
	let email = $state(e?.contact_email ?? '');
	let brief = $state(e?.brief ?? '');
	let busy = $state(false);

	const ord = (n: number) => n + ([11, 12, 13].includes(n) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
	const deliverables = $derived(Object.entries(counts).filter(([, n]) => n > 0).map(([kind, qty]) => ({ kind, qty })));
	// The rate card's price for a month, until she types her own.
	const cardPrice = $derived(deliverables.reduce((a, d) => a + (Number(rates[d.kind]) || 0) * d.qty, 0));
	$effect(() => {
		if (!feeTouched) fee = cardPrice;
	});
	const total = $derived(months === 'open' ? null : Number(months) * (Number(fee) || 0));
	const startsOptions = $derived(MONTHS.some((m) => m.value === starts) ? MONTHS : [{ value: starts, label: new Date(starts + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) }, ...MONTHS]);

	async function submit(ev: SubmitEvent) {
		ev.preventDefault();
		if (!brand.trim() || !deliverables.length) return;
		busy = true;
		const b = await ensureBrand(brand);
		if (!b) return (busy = false);
		const ok = await saveRetainer({
			id: e?.id,
			brand_id: b.id,
			title: title.trim(),
			deliverables,
			fee: Number(fee) || 0,
			starts_on: starts,
			months: months === 'open' ? null : Number(months),
			live_day: Number(liveDay),
			invoice_when: invoiceWhen,
			contact_name: contact.trim(),
			contact_email: email.trim().toLowerCase(),
			brief,
			...(e ? {} : { active: true })
		});
		busy = false;
		if (ok) onclose();
	}
</script>

<svelte:window onkeydown={(ev) => ev.key === 'Escape' && onclose()} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(ev) => ev.target === ev.currentTarget && onclose()}>
	<div class="dialog quote-dialog" role="dialog" aria-modal="true" aria-labelledby="rt-title">
		<form onsubmit={submit}>
			<h2 id="rt-title">{e ? 'Change monthly deal' : 'Set up a monthly deal'}</h2>
			<p>For ambassador and retainer deals. Each month's collab is created on its own, with its go-live date and invoice.</p>
			<div class="fields">
				<div class="f">
					<label for="rt-brand">Brand</label>
					<input class="inp" id="rt-brand" list="rt-brands" placeholder="Brand name" autocomplete="off" bind:value={brand} required />
					<datalist id="rt-brands">{#each studio.brands as b (b.id)}<option value={b.name}></option>{/each}</datalist>
				</div>
				<div class="f"><label for="rt-title">Name of the deal</label><input class="inp" id="rt-title" placeholder="Ambassador" bind:value={title} /></div>
			</div>

			<div class="lbl-t" style="margin-top:14px">Each month</div>
			<div class="rt-kinds">
				{#each KINDS as k (k)}
					<div class="rt-kind" class:on={counts[k] > 0}>
						<span>{plural(k, Math.max(1, counts[k]))}</span>
						<div class="stepper">
							<button type="button" aria-label="Fewer {k}" onclick={() => (counts[k] = Math.max(0, counts[k] - 1))}>−</button>
							<b>{counts[k]}</b>
							<button type="button" aria-label="More {k}" onclick={() => (counts[k] = counts[k] + 1)}>+</button>
						</div>
					</div>
				{/each}
			</div>

			<div class="fields" style="margin-top:14px">
				<div class="f">
					<label for="rt-fee">Fee a month</label>
					<div class="pre"><span>₹</span><input class="inp num" id="rt-fee" type="number" min="0" bind:value={fee} oninput={() => (feeTouched = true)} /></div>
					{#if cardPrice && Number(fee) !== cardPrice}<small class="hint">Your rate card: {inr(cardPrice)} a month</small>{/if}
				</div>
				<div class="f"><label for="rt-start">First month</label><Select id="rt-start" bind:value={starts} options={startsOptions} /></div>
				<div class="f">
					<label for="rt-months">For how long</label>
					<Select id="rt-months" bind:value={months} options={[{ value: '3', label: '3 months' }, { value: '6', label: '6 months' }, { value: '12', label: '12 months' }, { value: 'open', label: 'Until I stop it' }]} />
				</div>
				<div class="f">
					<label for="rt-day">Go-live each month on</label>
					<Select id="rt-day" bind:value={liveDay} options={Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `the ${ord(i + 1)}` }))} />
				</div>
				<div class="f span2">
					<span class="lbl-t">Invoice each month</span>
					<Segmented label="Invoice each month" bind:value={invoiceWhen} options={[{ value: 'start', label: 'At the start of the month' }, { value: 'live', label: 'When it goes live' }]} />
				</div>
				<div class="f"><label for="rt-contact">Contact <span class="hint">(optional)</span></label><input class="inp" id="rt-contact" placeholder="Name" bind:value={contact} /></div>
				<div class="f"><label for="rt-email">Their email</label><input class="inp" id="rt-email" type="email" placeholder="name@brand.com" bind:value={email} /></div>
				<div class="f span2"><label for="rt-brief">Brief for every month <span class="hint">(optional)</span></label><textarea class="inp" id="rt-brief" rows="3" placeholder="Key message, do's and don'ts, tags" bind:value={brief}></textarea></div>
			</div>
			{#if !email.trim()}<p class="hint warn-text">Without their email, invoices are saved as drafts for you to send.</p>{/if}

			<div class="q-total">
				<div><span class="lbl">{months === 'open' ? 'A month' : 'Whole deal'}</span><b class="num">{total === null ? inr(Number(fee) || 0) : inr(total)}</b></div>
				<small>{deliverables.map((d) => `${d.qty} ${plural(d.kind, d.qty)}`).join(' · ') || 'Pick what each month includes'}{total !== null ? ` · ${inr(Number(fee) || 0)} a month for ${months} months` : ''}</small>
			</div>

			<div class="row">
				<button class="btn ghost" type="button" onclick={onclose}>Cancel</button>
				<button class="btn grad" type="submit" disabled={busy || !brand.trim() || !deliverables.length}>{#if busy}<span class="spinner"></span>{:else}<Icon name="check" />{/if}{e ? 'Save changes' : 'Start the deal'}</button>
			</div>
		</form>
	</div>
</div>
