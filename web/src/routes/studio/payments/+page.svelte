<script lang="ts">
	import { markPaid, markReceived, reloadCollabs, setInvoiceFlags, studio } from '#lib/studio.svelte.ts';
	import { countUp, toast, ui } from '#lib/ui.svelte.ts';
	import { delivText, diff, errMessage, fmt, hasProduct, inr, inrS, isPaid, outstanding, parse, payState, relWord, stageIndex, stageLabel, todayIso, waShare } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import Ticket from '#lib/components/Ticket.svelte';
	import PayPill from '#lib/components/PayPill.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import BankCredits from '#lib/components/BankCredits.svelte';
	import ProNote from '#lib/components/ProNote.svelte';
	import { ensurePlan, hasFeature } from '#lib/plan.svelte.ts';
	import { tdsToCollect } from '#lib/tds.ts';
	import { supabase } from '#lib/supabase.ts';
	import { money } from '#lib/currency.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import type { Collab } from '#lib/types.ts';
	import { ask } from '#lib/confirm.svelte.ts';
	import { page } from '$app/state';
	// Barter: marking a product received (or an experience done) from its card.
	let receiving = $state('');
	async function received(c: Collab) {
		receiving = c.id;
		await markReceived(c);
		receiving = '';
	}

	let filter = $state<'all' | 'due' | 'overdue' | 'confirmed' | 'paid'>('all');
	let swapKey = $state(0);
	let fanPay = $state(false);

	const rows = $derived(studio.collabs.filter((c) => isPaid(c) && stageIndex(c.stage) >= 2));
	// Money is due once the content is out (live, or wrapped up). A collab that's only agreed or still being made is
	// "Confirmed": paid after it goes live, so it isn't counted as due or overdue, even with an invoice already made.
	type St = 'paid' | 'due' | 'overdue' | 'confirmed';
	const stateOf = (c: Collab): St => {
		const st = payState(c);
		return st === 'paid' ? 'paid' : c.stage === 'live' || c.stage === 'wrapped' ? st : 'confirmed';
	};
	const sumLeft = (st: St) => rows.filter((c) => stateOf(c) === st).reduce((a, c) => a + outstanding(c), 0);
	const recd = $derived(rows.reduce((a, c) => a + c.pay_received, 0));
	const od = $derived(sumLeft('overdue'));
	const due = $derived(sumLeft('due'));
	const booked = $derived(sumLeft('confirmed'));
	const nOd = $derived(rows.filter((c) => stateOf(c) === 'overdue').length);
	const bookedRows = $derived(rows.filter((c) => stateOf(c) === 'confirmed'));
	const rank = { overdue: 0, due: 1, confirmed: 2, paid: 3 };
	const list = $derived(
		rows
			.filter((c) => filter === 'all' || stateOf(c) === filter)
			.sort(
				(a, b) =>
					rank[stateOf(a)] - rank[stateOf(b)] ||
					(stateOf(a) === 'paid'
						? (b.paid_on ?? '').localeCompare(a.paid_on ?? '')
						: (a.pay_due ? parse(a.pay_due).getTime() : 9e15) - (b.pay_due ? parse(b.pay_due).getTime() : 9e15))
			)
	);
	// TDS certificates (Form 16A) still to come from brands.
	const certs = $derived(tdsToCollect(studio.collabs));
	let asking = $state('');
	async function askCert(id: string, brand: string) {
		asking = id;
		const { data, error } = await supabase.rpc('request_tds_certificate', { p_invoice: id });
		asking = '';
		if (error) return toast(errMessage(error), 'alert');
		toast(`Asked ${brand} for the certificate (${(data as { to: string }).to})`, 'send');
		await reloadCollabs();
	}
	// Phone: the "Still to come" card, the next payment, and a colour per status.
	const next = $derived(rows.filter((c) => (stateOf(c) === 'due' || stateOf(c) === 'overdue') && c.pay_due).sort((a, b) => a.pay_due!.localeCompare(b.pay_due!))[0]);
	const counts = $derived({ all: rows.length, due: rows.filter((c) => stateOf(c) === 'due').length, overdue: nOd, confirmed: bookedRows.length, paid: rows.filter((c) => stateOf(c) === 'paid').length });
	const HUE = { paid: 'var(--ok)', due: 'var(--warn,#e0a23a)', overdue: 'var(--bad)', confirmed: 'var(--h-confirmed)' } as const;
	// Still owed but no invoice sent yet (the hero's line when no due date is known).
	const notInvoiced = $derived.by(() => {
		const n = rows.filter((c) => (stateOf(c) === 'due' || stateOf(c) === 'overdue') && !c.pay_due && outstanding(c) > 0).length;
		return `${n} collab${n === 1 ? '' : 's'}`;
	});
	const pick = (f: typeof filter) => {
		filter = filter === f ? 'all' : f;
		swapKey++;
	};
	const prods = $derived(studio.collabs.filter((c) => hasProduct(c) && c.product_value && c.stage !== 'declined'));

	// "Remind brands" (also the button on the payment notification): a polite reminder to every brand
	// with an invoice still unpaid. Nobody gets two in a day (the database checks).
	// Only for content that's out: a brand isn't chased for a reel that isn't live yet.
	const toRemind = $derived(rows.filter((c) => (stateOf(c) === 'due' || stateOf(c) === 'overdue') && outstanding(c) > 0 && (c.pay_status === 'invoiced' || c.pay_status === 'advance')));
	let reminding = $state(false);
	async function remindAll() {
		if (!toRemind.length) return toast('No unpaid invoices to remind about. Send the invoices first.', 'alert');
		const names = [...new Set(toRemind.map((c) => c.brand.name))];
		const ok = await ask({
			title: `Remind ${names.length} brand${names.length > 1 ? 's' : ''} about ${toRemind.length} unpaid invoice${toRemind.length > 1 ? 's' : ''}?`,
			body: `${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}. Each gets a polite email with their invoice and amount due. Nobody gets two in a day.`,
			ok: 'Send reminders'
		});
		if (!ok) return;
		reminding = true;
		const { data, error } = await supabase.rpc('send_reminders', { p_ids: toRemind.map((c) => c.id) });
		reminding = false;
		if (error) return toast(`Couldn't send: ${errMessage(error)}`, 'alert');
		const r = data as { payment: number; skipped: number };
		toast(r.payment ? `${r.payment} payment reminder${r.payment > 1 ? 's' : ''} sent${r.skipped ? `. ${r.skipped} were reminded today already` : ''}` : 'Everyone was reminded today already.', r.payment ? 'send' : 'alert');
		await reloadCollabs();
	}
	// Free plan and a brand is late: the moment automatic reminders are worth it.
	ensurePlan();
	const autoPlan = $derived(hasFeature('reminders'));
	// Opened from the notification's "Remind brands" button.
	let fromPush = false;
	$effect(() => {
		if (fromPush || !studio.loaded || page.url.searchParams.get('act') !== 'remind') return;
		fromPush = true;
		history.replaceState(history.state, '', '/studio/payments');
		remindAll();
	});
</script>

<svelte:head><title>Payments · {studio.settings?.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Money</div>
		<h1>Payments</h1>
		<p>Track every invoice from fee agreed to money in the bank.</p>
	</div>
	{#if toRemind.length}<button class="btn" onclick={remindAll} disabled={reminding}>{#if reminding}<span class="spinner"></span>{:else}<Icon name="bell" />{/if}Remind brands ({toRemind.length})</button>{/if}
</header>


	<section class="hero-card glow m-hero m-pipe" aria-label="Money still to come">
		<div class="mesh" aria-hidden="true"></div>
		<div class="hc-in">
			<div class="hc-top">
				<span class="hc-eb">Due to you</span>
				{#if nOd}<button class="glass-chip" onclick={() => pick('overdue')}><Icon name="alert" />{nOd} overdue</button>{/if}
				{#if toRemind.length}<button class="glass-chip" onclick={remindAll} disabled={reminding}><Icon name="bell" />Remind</button>{/if}
			</div>
			<div class="hc-val" use:countUp={{ value: due + od, money: true }}>{inr(due + od)}</div>
			<div class="hc-sub">{next ? `Next: ${next.brand.name} · ${fmt(next.pay_due)}` : due + od > 0 ? `${notInvoiced} not invoiced yet` : 'Nothing waiting to be paid'}</div>
			{#if recd + due + od > 0}
				<div class="pipe-bar" aria-hidden="true">
					{#if recd}<i style="flex:{recd};--hue:var(--ok)"></i>{/if}
					{#if due}<i style="flex:{due};--hue:var(--warn,#e0a23a)"></i>{/if}
					{#if od}<i style="flex:{od};--hue:var(--bad)"></i>{/if}
				</div>
			{/if}
			<div class="hc-foot">
				{#each [['paid', 'Received', recd], ['due', 'Due', due], ['overdue', 'Overdue', od]] as const as [k, label, v] (k)}
					<button class:on={filter === k} onclick={() => pick(k)}><small><span class="dt" style="--hue:{HUE[k]}"></span>{label}</small><b>{inrS(v)}</b></button>
				{/each}
			</div>
		</div>
	</section>
	<!-- Agreed but not live yet: paid after it goes live, so it has its own card (and isn't in Due above). -->
	{#if bookedRows.length}
		<button class="hero-card m-booked rv" class:on={filter === 'confirmed'} onclick={() => pick('confirmed')} aria-label="Confirmed collabs, paid after they go live">
			<span class="mb-l"><span class="hc-eb"><span class="dt" style="--hue:{HUE.confirmed}"></span>Confirmed</span><small>{bookedRows.length} collab{bookedRows.length === 1 ? '' : 's'} agreed · paid once {bookedRows.length === 1 ? "it's" : "they're"} live</small></span>
			<b>{inrS(booked)}</b>
		</button>
	{/if}
	{#if nOd && !autoPlan}<div class="rv" style="margin:14px 0"><ProNote title="Turn on automatic reminders" body={`${nOd} invoice${nOd === 1 ? ' is' : 's are'} overdue. Creator Pro chases them on time, every time, and matches the money when it lands.`} /></div>{/if}
	<BankCredits />
	<div class="m-stages" role="tablist" aria-label="Filter payments">
		{#each [['all', 'All'], ['due', 'Due'], ['overdue', 'Overdue'], ['confirmed', 'Confirmed'], ['paid', 'Paid']] as const as [k, label] (k)}
			<button role="tab" aria-selected={filter === k} class:on={filter === k} onclick={() => ((filter = k), swapKey++)}><i class="dt" style="--hue:{k === 'all' ? 'var(--accent)' : HUE[k]}"></i>{label}<span>{counts[k]}</span></button>
		{/each}
	</div>
	<!-- Each payment a ticket (like Needs you on Today): three, the edge of the rest, "+N more". -->
	<div class="tks m-plist">
		{#key swapKey}
			{#each fanPay ? list : list.slice(0, 3) as c, i (c.id)}
				{@const st = stateOf(c)}
				<Ticket
					name={c.brand.name}
					sub={delivText(c.deliverables) || 'Collab'}
					money={inrS(st === 'paid' ? c.fee : outstanding(c))}
					moneySub={st === 'paid' ? 'paid' : st === 'overdue' ? 'overdue' : st === 'confirmed' ? 'after live' : c.pay_received > 0 ? 'left to pay' : c.pay_due ? 'due' : 'not invoiced'}
					task={c.invoice_no ? `Invoice ${c.invoice_no}` : st === 'paid' ? 'Paid in full' : st === 'confirmed' ? `${stageLabel(c.stage)}, not live yet` : 'No invoice sent yet'}
					status={st === 'paid' ? `Paid ${fmt(c.paid_on)}` : st === 'confirmed' ? 'Paid after it goes live' : c.pay_due ? (diff(c.pay_due) < 0 ? `${-diff(c.pay_due)} day${diff(c.pay_due) === -1 ? '' : 's'} late` : diff(c.pay_due) === 0 ? 'Due today' : `Due ${fmt(c.pay_due)}`) : 'Send the invoice'}
					tone={st === 'paid' ? 'ok' : st === 'overdue' ? 'hot' : st === 'confirmed' ? 'calm' : c.pay_due ? 'warn' : 'calm'}
					onopen={() => (ui.openCollab = c.id)}
					{i}
				>
					{@const lateInv = st === 'overdue' ? c.invoices.find((x) => (x.status === 'sent' || x.status === 'partly_paid') && x.due_date && x.due_date < todayIso()) : undefined}
					{@const openInv = !lateInv && st !== 'paid' ? c.invoices.find((x) => x.status === 'sent' || x.status === 'partly_paid') : undefined}
					{#if lateInv}<a class="btn" href="/studio/payments/late/{lateInv.id}">Next steps</a>
					{:else if openInv}<a class="btn wa" href={waShare(c.contact_phone, `Hi ${c.contact_name ? c.contact_name.split(' ')[0] : ''}, here's invoice ${openInv.number} for ${inr(outstanding(c))}${openInv.due_date ? `, due ${fmt(openInv.due_date)}` : ''}. You can pay by UPI or bank transfer here: ${location.origin}/invoice/${openInv.public_token}`)} target="_blank" rel="noopener" aria-label="Send {c.brand.name} the invoice on WhatsApp">WhatsApp</a>{/if}
					{#if st !== 'paid'}<button class="btn primary" onclick={() => markPaid(c)} aria-label="Mark {c.brand.name} as paid">Paid?</button>{:else}<button class="btn" onclick={() => (ui.openCollab = c.id)}>Open</button>{/if}
				</Ticket>
			{:else}
				<div class="clear hero-card glow m-none">
					<div class="mesh" aria-hidden="true"></div>
					<span class="clear-ic"><Icon name="wallet" /></span>
					<b>{filter === 'overdue' ? 'Nothing overdue' : filter === 'paid' ? 'No payments yet' : filter === 'confirmed' ? 'Nothing waiting to go live' : 'Nothing due'}</b>
					<small>{filter === 'overdue' ? 'Every brand has paid on time.' : filter === 'confirmed' ? 'Agreed collabs show up here until their content is live.' : 'Payments show up here once the content is live.'}</small>
				</div>
			{/each}
		{/key}
		{#if !fanPay && list.length > 3}<span class="cr-edge tk-edge" aria-hidden="true"></span>{/if}
	</div>
	{#if list.length > 3}<button class="cr-more" onclick={() => (fanPay = !fanPay)}>{fanPay ? 'Show less' : `+${list.length - 3} more`}</button>{/if}
	{#if certs.length}
		<section class="hs">
			<header class="hs-h"><h2>TDS certificates</h2><span class="m-gn">{certs.length}</span></header>
			<div class="tks">
				{#each certs as t, i (t.inv.id)}
					<Ticket
						name={t.c.brand.name}
						sub="Invoice {t.inv.number}"
						money={money(t.inv.tds_deducted, t.inv.currency)}
						moneySub="TDS"
						task="Form 16A certificate"
						status={t.overdue ? `Due since ${fmt(t.due)}` : `Due by ${fmt(t.due)}`}
						tone={t.overdue ? 'hot' : 'warn'}
						onopen={() => (ui.openCollab = t.c.id)}
						{i}
					>
						{#if t.overdue}<button class="btn" disabled={asking === t.inv.id || t.askedRecently} onclick={() => askCert(t.inv.id, t.c.brand.name)}>{#if asking === t.inv.id}<span class="spinner"></span>{/if}{t.askedRecently ? 'Asked' : 'Ask'}</button>{/if}
						<button class="btn primary" onclick={() => setInvoiceFlags(t.inv, { tds_certificate: true })}>Got it</button>
					</Ticket>
				{/each}
			</div>
		</section>
	{/if}
	{#if prods.length}
		<section class="hs">
			<header class="hs-h"><h2>Barter products</h2><span class="m-gn">{prods.length}</span><small class="m-hs-r">{inr(prods.reduce((a, c) => a + c.product_value, 0))}</small></header>
			<div class="tks">
				{#each prods as c, i (c.id)}
					<Ticket
						name={c.brand.name}
						sub={stageLabel(c.stage)}
						money={inr(c.product_value)}
						moneySub={c.barter_kind === 'experience' ? 'experience' : 'product'}
						task={c.product || (c.barter_kind === 'experience' ? 'Experience' : 'Product')}
						status={c.barter_kind === 'experience'
							? c.product_received_at ? `Done ${fmt(c.product_received_at.slice(0, 10))}` : 'Not done yet'
							: c.product_received_at ? `Received ${fmt(c.product_received_at.slice(0, 10))}` : c.shipped_at ? 'On the way' : 'Not received yet'}
						tone={c.product_received_at ? 'ok' : c.shipped_at ? 'warn' : 'calm'}
						onopen={() => (ui.openCollab = c.id)}
						{i}
					>
						<!-- Most barter never comes with a tracking number: she marks it here when it's in (or, for a stay or a meal, done). -->
						{#if c.product_received_at}
							<button class="btn" onclick={() => (ui.openCollab = c.id)}>Open</button>
						{:else}
							<button class="btn primary" disabled={receiving === c.id} onclick={() => received(c)}>{#if receiving === c.id}<span class="spinner"></span>{:else}<Icon name="check" />{/if}{c.barter_kind === 'experience' ? 'Done' : 'Got it'}</button>
						{/if}
					</Ticket>
				{/each}
			</div>
		</section>
	{/if}


<style>
	.m-booked { min-height: 0; display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 14px; margin: 12px 0 4px; padding: 16px 18px; text-align: left; color: var(--hero-ink, var(--ink)); font: inherit; cursor: pointer; border: 1px solid color-mix(in oklab, var(--h-confirmed) 40%, transparent); }
	.m-booked.on { box-shadow: 0 0 0 2px var(--h-confirmed); }
	.m-booked .mb-l { display: grid; gap: 4px; min-width: 0; }
	.m-booked .hc-eb { display: flex; align-items: center; gap: 7px; }
	.m-booked .dt { width: 7px; height: 7px; border-radius: 50%; background: var(--hue); flex: none; }
	.m-booked small { font-size: 13px; opacity: .7; }
	.m-booked b { font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 28px; white-space: nowrap; }
</style>
