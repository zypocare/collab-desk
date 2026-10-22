<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { setInvoiceFlags, studio } from '#lib/studio.svelte.ts';
	import { balanceDue } from '#lib/invoice.ts';
	import { addDays, daysLate, demandLetter, legalNotice, letterPdf, loadDemands, msmeFrom, samadhaanFields, sendDemand, type Demand } from '#lib/demand.ts';
	import { loadBrandTrust, trust } from '#lib/trust.svelte.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { fmt, inr, todayIso } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PaymentDialog from '#lib/components/PaymentDialog.svelte';

	// Getting paid, step by step: two reminders go by themselves, then a formal demand and, after 45
	// days, an MSME complaint or a legal notice. Steps 3 and 4 always wait for her.
	const found = $derived.by(() => {
		for (const c of studio.collabs) for (const inv of c.invoices) if (inv.id === page.params.id) return { c, inv };
		return null;
	});
	const c = $derived(found?.c);
	const inv = $derived(found?.inv);
	let demands = $state<Demand[]>([]);
	let open = $state<0 | 3 | 4>(0);
	let letter = $state('');
	let to = $state<string[]>([]);
	let busy = $state(false);
	let paying = $state(false);
	const today = todayIso();
	const final = addDays(today, 7);
	onMount(() => loadBrandTrust());
	$effect(() => {
		const id = inv?.id;
		if (id) loadDemands(id).then((d) => (demands = d));
	});

	const late = $derived(inv ? daysLate(inv) : 0);
	const due = $derived(inv ? balanceDue(inv) : 0);
	const usual = $derived(c ? trust.brands[c.brand_id]?.avg_days : null);
	const s = $derived(studio.settings!);
	const auto = $derived(!!inv?.auto_remind && !!s?.reminders_enabled);
	// The reminders sent for this invoice, from the collab's history.
	const sent = $derived(c && inv ? c.events.filter((e) => e.kind === 'reminder' && inv.number && e.text.includes(inv.number) && /reminder/i.test(e.text)).map((e) => e.at.slice(0, 10)).sort() : []);
	const after = (d: string | null | undefined) => (inv?.due_date ? sent.filter((x) => x >= (d ?? inv.due_date!)) : sent);
	const step1 = $derived(inv ? (inv.reminders_sent ?? []).some((x) => x === 0 || x === 3) : false);
	const step2 = $derived(inv ? (inv.reminders_sent ?? []).some((x) => x >= 7) : false);
	const step1On = $derived(inv?.due_date ? (after(inv.due_date)[0] ?? '') : '');
	const step2On = $derived(inv?.due_date ? (after(addDays(inv.due_date, 7))[0] ?? '') : '');
	const demand = $derived(demands.filter((d) => d.kind === 'demand').at(-1));
	const fourth = $derived(demands.filter((d) => d.step === 4).at(-1));
	const step3Ready = $derived(late >= 10 || step2);
	const msmeDay = $derived(inv ? msmeFrom(inv) : today);
	const step4Ready = $derived(today >= msmeDay && (!!demand || late >= 30));
	const active = $derived(!demand ? 3 : !fourth ? 4 : 0);
	const emails = $derived(c && inv ? [...new Set([c.contact_email, inv.send_to, c.brand.accounts_email].map((e) => (e ?? '').trim()).filter(Boolean))] : []);
	const who = $derived(c && inv && s ? { c, inv, s, final } : null);
	const link = $derived(inv ? `${location.origin}/invoice/${inv.public_token}` : '');

	function openStep(n: 3 | 4) {
		if (!who) return;
		open = open === n ? 0 : n;
		letter = n === 3 ? demandLetter(who) : legalNotice(who);
		to = [...emails];
	}
	async function send(step: 3 | 4, kind: Demand['kind'], via: 'email' | 'whatsapp' | 'download') {
		if (!inv || !c) return;
		busy = true;
		try {
			await sendDemand(inv, step, kind, via, via === 'email' ? to : [], step === 3 ? final : null, letter);
			demands = await loadDemands(inv.id);
			if (via === 'email') toast(`Payment demand sent to ${to.join(', ')}`, 'send');
			open = 0;
		} catch (e) {
			toast(e instanceof Error ? e.message : String(e), 'alert');
		} finally {
			busy = false;
		}
	}
	async function pdf(step: 3 | 4) {
		if (!inv || !c) return;
		await letterPdf(step === 3 ? `Payment demand · ${inv.number}` : `Legal notice · ${inv.number}`, letter, `${step === 3 ? 'Payment-demand' : 'Legal-notice'}-${(inv.number ?? '').replace(/\//g, '-')}.pdf`);
		await send(step, step === 3 ? 'demand' : 'legal', 'download');
	}
	function whatsapp() {
		if (!c || !inv) return;
		const phone = (c.contact_phone ?? '').replace(/\D/g, '');
		const msg = `Hi ${c.contact_name || c.brand.name}, invoice ${inv.number} for ${inr(due)} is ${late} days overdue. This is a formal request to pay it by ${fmt(final)}. You can pay here: ${link}`;
		window.open(`https://wa.me/${phone.length === 10 ? `91${phone}` : phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
		send(3, 'demand', 'whatsapp');
	}
	async function copyFields() {
		if (!who) return;
		await copyText(samadhaanFields(who).map(([k, v]) => `${k}: ${v}`).join('\n'), 'Copied. Paste them into the MSME Samadhaan form.');
	}
	async function pause() {
		if (!inv) return;
		await setInvoiceFlags(inv, { auto_remind: !inv.auto_remind });
		toast(inv.auto_remind ? 'Steps paused for this invoice' : 'Steps back on', 'check');
	}
</script>

<svelte:head><title>Getting paid · {inv?.number ?? 'Invoice'} · Miracle</title></svelte:head>

{#if !studio.loaded}
	<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
{:else if !c || !inv}
	<div class="empty-card"><h2>Invoice not found</h2><p>It may have been cancelled.</p><a class="btn" href="/studio/payments">Payments</a></div>
{:else}
	<a class="back rv" href="/studio/payments"><Icon name="back" />Payments</a>
	<header class="ph rv">
		<div>
			<div class="eb">{c.code} · {inv.number}</div>
			<h1>{c.brand.name} <em>{inv.status === 'paid' ? 'paid' : late ? 'is late' : 'pays next'}</em></h1>
		</div>
	</header>

	<div class="lp">
		<section class="lp-hero rv" class:calm={!late}>
			<span class="lp-eb">{inv.status === 'paid' ? 'Paid' : late ? `${late} day${late === 1 ? '' : 's'} late` : 'Not due yet'}</span>
			<b>{inr(due || inv.total)}</b>
			<small>Due {fmt(inv.due_date)}{c.live_date ? ` · went live ${fmt(c.live_date)}` : ''}{usual != null ? ` · they usually pay in ${usual} day${usual === 1 ? '' : 's'}` : ''}</small>
		</section>

		<span class="lbl-t lp-t">Getting paid, step by step</span>
		<section class="lp-steps rv" style="--i:1">
			<div class="lp-s" class:done={step1}>
				<span class="lp-n">{#if step1}✓{:else}1{/if}</span>
				<span class="lp-b"><b>Friendly reminder</b><small>{step1 ? `Sent by Miracle${step1On ? ` on ${fmt(step1On)}` : ''}` : auto ? `Goes by itself on ${fmt(addDays(inv.due_date ?? today, 3))}` : 'Reminders are off for this invoice'}</small></span>
			</div>
			<div class="lp-s" class:done={step2}>
				<span class="lp-n">{#if step2}✓{:else}2{/if}</span>
				<span class="lp-b"><b>Firm reminder with a date</b><small>{step2 ? `Sent by Miracle${step2On ? ` on ${fmt(step2On)} · "please pay by ${fmt(addDays(step2On, 7))}"` : ''}` : auto ? `Goes by itself on ${fmt(addDays(inv.due_date ?? today, 7))}` : 'Reminders are off for this invoice'}</small></span>
			</div>
			<div class="lp-s" class:done={!!demand} class:on={active === 3 && step3Ready}>
				<span class="lp-n">{#if demand}✓{:else}3{/if}</span>
				<span class="lp-b">
					<b>Formal payment demand</b>
					{#if demand}
						<small>{demand.via === 'email' ? 'Emailed' : demand.via === 'whatsapp' ? 'Sent on WhatsApp' : 'Downloaded'} on {fmt(demand.sent_at.slice(0, 10))}{demand.final_date ? ` · final date ${fmt(demand.final_date)}` : ''}</small>
					{:else}
						<small>A signed letter (PDF) to {c.brand.name} and their accounts team: the invoice, the agreement they accepted, and a final date, 7 days away.{step3Ready ? '' : ` From ${fmt(addDays(inv.due_date ?? today, 10))}.`}</small>
						{#if step3Ready && inv.status !== 'paid'}
							<span class="lp-acts"><button class="btn primary" onclick={() => openStep(3)} aria-expanded={open === 3}>Review and send</button><button class="btn" onclick={whatsapp} disabled={busy}>WhatsApp</button></span>
						{/if}
					{/if}
					{#if open === 3}
						<div class="lp-sheet">
							<textarea class="inp" rows="14" bind:value={letter} aria-label="The letter"></textarea>
							<div class="lp-to">
								<small>Send to</small>
								{#each emails as e (e)}<label class="check-row"><input type="checkbox" class="cbx" checked={to.includes(e)} onchange={(ev) => (to = (ev.currentTarget as HTMLInputElement).checked ? [...to, e] : to.filter((x) => x !== e))} />{e}</label>{:else}<small class="hint">No email for {c.brand.name}. Download the PDF and send it yourself.</small>{/each}
							</div>
							<span class="lp-acts"><button class="btn primary" onclick={() => send(3, 'demand', 'email')} disabled={busy || !to.length}>{#if busy}<span class="spinner"></span>{/if}Send by email</button><button class="btn" onclick={() => pdf(3)} disabled={busy}><Icon name="download" />PDF</button></span>
						</div>
					{/if}
				</span>
			</div>
			<div class="lp-s" class:done={!!fourth} class:on={active === 4 && step4Ready}>
				<span class="lp-n">{#if fourth}✓{:else}4{/if}</span>
				<span class="lp-b">
					<b>MSME complaint or legal notice</b>
					{#if fourth}
						<small>{fourth.kind === 'msme' ? 'MSME complaint prepared' : 'Legal notice downloaded'} on {fmt(fourth.sent_at.slice(0, 10))}</small>
					{:else}
						<small>{step4Ready ? 'Now open.' : `From ${fmt(msmeDay)}.`} With Udyam registration, buyers must pay within 45 days, with interest after that; Miracle fills in the MSME Samadhaan answers for you. Without it, a legal notice template.</small>
						{#if step4Ready && inv.status !== 'paid'}<span class="lp-acts"><button class="btn primary" onclick={() => openStep(4)} aria-expanded={open === 4}>{s.udyam_no ? 'Prepare the MSME complaint' : 'Prepare the legal notice'}</button></span>{/if}
					{/if}
					{#if open === 4 && who}
						<div class="lp-sheet">
							{#if s.udyam_no}
								<dl class="lp-fields">{#each samadhaanFields(who) as [k, v] (k)}<dt>{k}</dt><dd>{v || '—'}</dd>{/each}</dl>
								<span class="lp-acts"><button class="btn primary" onclick={copyFields}><Icon name="copy" />Copy the answers</button><a class="btn" href="https://samadhaan.msme.gov.in/" target="_blank" rel="noopener">Open MSME Samadhaan</a><button class="btn ghost" onclick={() => send(4, 'msme', 'download')} disabled={busy}>I filed it</button></span>
							{:else}
								<textarea class="inp" rows="14" bind:value={letter} aria-label="The notice"></textarea>
								<span class="lp-acts"><button class="btn primary" onclick={() => pdf(4)} disabled={busy}><Icon name="download" />Download the notice</button></span>
								<small class="hint">Registered with Udyam? Add the number in <a href="/studio/settings?s=payments">Settings › Invoices &amp; payments</a> to file an MSME complaint instead.</small>
							{/if}
						</div>
					{/if}
				</span>
			</div>
		</section>
		<small class="hint lp-note">Reminders 1 and 2 go by themselves (<a href="/studio/settings?s=payments">Settings › Invoices &amp; payments</a>). Steps 3 and 4 always wait for you.</small>
		{#if inv.status === 'sent' || inv.status === 'partly_paid'}
			<div class="lp-foot">
				<button class="btn" onclick={() => (paying = true)}>They paid</button>
				<button class="btn" onclick={pause}>{inv.auto_remind ? 'Pause steps' : 'Turn steps back on'}</button>
			</div>
		{/if}
	</div>
	{#if paying}<PaymentDialog {inv} onclose={() => (paying = false)} />{/if}
{/if}

<style>
	.lp {
		display: grid;
		gap: 14px;
		max-width: 680px;
	}
	.lp-hero {
		display: grid;
		gap: 8px;
		padding: 20px;
		border-radius: 24px;
		background: radial-gradient(90% 80% at 0% 0%, color-mix(in oklab, var(--bad) 28%, transparent), transparent 60%), var(--surface);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bad) 45%, var(--line));
	}
	.lp-hero.calm {
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.lp-eb {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--bad);
	}
	.lp-hero.calm .lp-eb {
		color: var(--ink-3);
	}
	.lp-hero b {
		font: 400 44px/1 var(--f-serif, Georgia, serif);
	}
	.lp-hero small {
		font-size: 13px;
		color: var(--ink-2);
	}
	.lp-t {
		padding: 0 4px;
	}
	.lp-steps {
		display: grid;
		border-radius: 20px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		overflow: hidden;
	}
	.lp-s {
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr);
		gap: 12px;
		padding: 14px 16px;
	}
	.lp-s + .lp-s {
		border-top: 1px solid var(--line);
	}
	.lp-s.done {
		opacity: 0.7;
	}
	.lp-s.on {
		background: var(--surface-2);
		box-shadow: inset 3px 0 0 var(--accent, var(--bad));
	}
	.lp-n {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink-3);
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 12px;
	}
	.lp-s.done .lp-n {
		box-shadow: none;
		background: var(--surface-2);
		color: var(--ok);
	}
	.lp-s.on .lp-n {
		box-shadow: none;
		background: var(--accent, var(--bad));
		color: #fff;
	}
	.lp-b {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.lp-b > b {
		font-size: 14.5px;
	}
	.lp-b > small {
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--ink-3);
	}
	.lp-acts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.lp-sheet {
		display: grid;
		gap: 10px;
		margin-top: 6px;
	}
	.lp-to {
		display: grid;
		gap: 6px;
	}
	.lp-fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
		gap: 6px 12px;
		margin: 0;
		font-size: 13px;
	}
	.lp-fields dt {
		color: var(--ink-3);
	}
	.lp-fields dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.lp-note {
		padding: 0 4px;
		line-height: 1.5;
	}
	.lp-foot {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
</style>
