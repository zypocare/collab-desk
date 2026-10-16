<script lang="ts">
	import { tick } from 'svelte';
	import {
		addDeliverable,
		byId,
		completeFollow,
		markPaid,
		removeDeliverable,
		saveBrand,
		setDeliverable,
		setStage,
		studio,
		updateCollab
	} from '../studio.svelte';
	import type { Collab, Stage } from '../types';
	import { copyText, ui } from '../ui.svelte';
	import {
		CATS,
		KINDS,
		PAY_LABEL,
		STAGES,
		TYPE_LABEL,
		USAGE,
		fmt,
		fmtTime,
		hasProduct,
		hueOf,
		inr,
		isPaid,
		overdue,
		plural,
		stageIndex
	} from '../util';
	import Icon from './Icon.svelte';
	import ProductShipping from './ProductShipping.svelte';
	import MessageThread from './MessageThread.svelte';
	import { isRanked } from '../priority';
	import PriorityPanel from './PriorityPanel.svelte';
	import Select from './Select.svelte';
	import DatePicker from './DatePicker.svelte';
	import Mono from './Mono.svelte';
	import QuoteDialog from './QuoteDialog.svelte';
	import CollabPosts from './CollabPosts.svelte';
	import {
		CHECKLIST,
		DRAFT_STATUS,
		QUOTE_STATUS,
		acceptedQuote,
		captionCheck,
		checklistMissing,
		clashes,
		latestDraft,
		payTerms
	} from '../util';
	import { cancelInvoice, setChecklist, setInvoiceFlags, shareDraft, withdrawQuote } from '../studio.svelte';
	import type { Quote } from '../types';
	import { INVOICE_STATUS, KIND_LABEL, balanceDue, type Invoice } from '../invoice';
	import InvoiceDialog from './InvoiceDialog.svelte';
	import PaymentDialog from './PaymentDialog.svelte';

	const c = $derived(byId(ui.openCollab));
	const clashList = $derived(c ? clashes(c, studio.collabs, studio.settings?.competitor_window_days ?? 14, studio.notes) : []);
	const quote = $derived(c?.quotes[0]);
	const agreed = $derived(c ? acceptedQuote(c) : undefined);
	const lastDraft = $derived(c ? latestDraft(c) : undefined);
	const roundsIncluded = $derived(agreed?.revision_rounds ?? null);
	const capCheck = $derived(c && lastDraft?.caption ? captionCheck(lastDraft.caption, c.brand.instagram) : null);

	let quoteOpen = $state<{ base?: Quote; editing: boolean } | null>(null);
	let invoiceOpen = $state<{ editing?: Invoice } | null>(null);
	let paymentOpen = $state<Invoice | null>(null);
	const issuedInvoices = $derived(c ? c.invoices.filter((i) => i.status !== 'draft' && i.status !== 'cancelled') : []);
	let confirmLive = $state(false);
	let draftForm = $state({ link: '', caption: '', note: '' });
	let draftBusy = $state(false);
	let showOld = $state(false);

	$effect(() => {
		void ui.openCollab;
		confirmLive = false;
		quoteOpen = null;
		draftForm = { link: '', caption: '', note: '' };
	});

	async function sendDraft(e: SubmitEvent) {
		e.preventDefault();
		if (!c) return;
		draftBusy = true;
		const ok = await shareDraft(c, draftForm);
		draftBusy = false;
		if (ok) draftForm = { link: '', caption: '', note: '' };
	}
	const open = $derived(!!c);
	const si = $derived(c ? stageIndex(c.stage) : 0);
	const done = $derived(c ? c.deliverables.filter((d) => d.done).length : 0);
	const balance = $derived(c ? Math.max(0, c.fee - c.pay_received) : 0);

	let fresh = $state(false);
	let closeBtn = $state<HTMLButtonElement>();
	let lastFocus: Element | null = null;
	let prevId: string | null = null;

	$effect(() => {
		const id = ui.openCollab;
		if (id && id !== prevId) {
			lastFocus = document.activeElement;
			fresh = true;
			setTimeout(() => (fresh = false), 1100);
			document.body.style.overflow = 'hidden';
			tick().then(() => setTimeout(() => closeBtn?.focus({ preventScroll: true }), 80));
		}
		if (!id && prevId) {
			document.body.style.overflow = '';
			if (lastFocus instanceof HTMLElement && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
		}
		prevId = id;
	});

	function close() {
		ui.openCollab = null;
	}

	type Field = Exclude<keyof Collab, 'id' | 'brand' | 'deliverables' | 'events'>;
	function save(field: Field, value: unknown) {
		if (!c) return;
		updateCollab(c.id, { [field]: value } as Partial<Collab>);
	}
	const num = (e: Event) => Math.max(0, Number((e.currentTarget as HTMLInputElement).value) || 0);
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;

	async function changeStage(s: Stage, force = false) {
		if (!c) return;
		// Going live with the disclosure checklist incomplete needs a second click.
		if (s === 'live' && !force && checklistMissing(c).length) {
			confirmLive = true;
			return;
		}
		confirmLive = false;
		await setStage(c, s);
	}

	function statusMessage(x: Collab) {
		const site = (studio.settings?.site_url ?? '').replace(/\/$/, '');
		const name = studio.settings?.display_name ?? '';
		return `Hi ${x.contact_name ? x.contact_name.split(' ')[0] : 'there'}! You can follow our collaboration (${x.code}) any time at ${site}/brand. Sign in with ${x.contact_email || 'your email'} to see the status. ${name}`;
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && open && !ui.newCollab && !quoteOpen && !invoiceOpen && !paymentOpen && close()} />

<div class="scrim" class:on={open} role="presentation" onclick={close}></div>
<aside class="drawer" class:on={open} class:fresh aria-label="Collab details" aria-hidden={!open} inert={!open}>
	{#if c}
		<header class="dr-h" style="--hue:var(--m{hueOf(c.brand.name)})">
			<Mono name={c.brand.name} size="lg" />
			<div class="dr-t">
				<input
					class="title-inp"
					value={c.brand.name}
					aria-label="Brand name"
					autocomplete="off"
					onchange={(e) => {
						const v = val(e).trim();
						if (v && c) saveBrand(c.brand_id, { name: v });
					}}
				/>
				<div class="dr-sub"><span class="id">{c.code}</span> · {TYPE_LABEL[c.type]} · received {fmt(c.received_on)}</div>
			</div>
			<button class="icon-btn" onclick={close} aria-label="Close" bind:this={closeBtn}><Icon name="x" /></button>
		</header>

		<div class="dr-b">
			<section class="sec">
				<h3>Stage {#if c.stage === 'declined'}<span class="danger">Declined</span>{/if}</h3>
				{#if c.stage !== 'declined'}
					<div class="sh" style="--p:{si / 5}">
						<div class="sh-track"><i></i></div>
						{#each STAGES as s, i (s.id)}
							<button class="sh-step st-{s.id}" class:past={i < si} class:on={i === si} aria-pressed={i === si} onclick={() => changeStage(s.id)}>
								<span class="sh-dot">{#if i < si}<Icon name="check" />{/if}</span><span class="sh-l">{s.label}</span>
							</button>
						{/each}
					</div>
				{/if}
				{#if confirmLive}
					<div class="warn-box">
						<b>The posting checklist isn't finished</b>
						<ul>{#each checklistMissing(c) as m (m)}<li>{m}</li>{/each}</ul>
						<div class="row"><button class="btn sm" onclick={() => (confirmLive = false)}>Not yet</button><button class="btn sm primary" onclick={() => changeStage('live', true)}>Move to Live anyway</button></div>
					</div>
				{/if}
				{#each clashList as cl (cl.other.id)}
					<div class="warn-box">
						<b><Icon name="alert" />Possible clash with {cl.other.brand.name}</b>
						<span>{cl.reason[0].toUpperCase() + cl.reason.slice(1)}. <button class="lnk" onclick={() => (ui.openCollab = cl.other.id)}>Open it</button></span>
					</div>
				{/each}
				{#if c.stage === 'request' || c.stage === 'negotiating'}
					<button class="btn sm ghost danger" style="margin-top:14px" onclick={() => changeStage('declined')}><Icon name="x" />Decline this request</button>
				{:else if c.stage === 'declined'}
					<p class="hint" style="margin:0 0 10px">The brand sees this request as "Not going ahead".</p>
					<button class="btn sm" onclick={() => changeStage('request')}><Icon name="refresh" />Reopen request</button>
				{/if}
			</section>

			{#if isRanked(c)}<PriorityPanel {c} />{/if}

			<section class="sec">
				<h3>Messages{#if c.contact_name}<small class="sec-sub">with {c.contact_name}</small>{/if}</h3>
				{#key c.id}
					<MessageThread
						collabId={c.id}
						side="creator"
						otherName={c.contact_name || c.brand.name}
						quick={['Thanks! I’ll get back to you shortly.', 'Could you share the full brief and references?', 'Sounds good, let’s go ahead!']}
					/>
				{/key}
			</section>

			<section class="sec">
				<h3>Deal</h3>
				<div class="fields">
					<div class="f">
						<label for="f-type">Type</label>
						<Select id="f-type" value={c.type as string} options={Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} onchange={(v) => save('type', v)} />
					</div>
					<div class="f">
						<label for="f-usage">Usage rights</label>
						<Select id="f-usage" value={c.usage} options={[...USAGE, ...(USAGE.includes(c.usage) ? [] : [c.usage])].map((u) => ({ value: u, label: u }))} onchange={(v) => save('usage', v)} />
					</div>
					{#if isPaid(c)}
						<div class="f">
							<label for="f-fee">Fee agreed</label>
							<div class="pre"><span>₹</span><input class="inp num" id="f-fee" type="number" inputmode="numeric" min="0" value={c.fee || ''} onchange={(e) => save('fee', num(e))} /></div>
						</div>
					{/if}
					{#if hasProduct(c)}
						<div class="f">
							<label for="f-value">Product value</label>
							<div class="pre"><span>₹</span><input class="inp num" id="f-value" type="number" inputmode="numeric" min="0" value={c.product_value || ''} onchange={(e) => save('product_value', num(e))} /></div>
						</div>
						<div class="f span2">
							<label for="f-product">Product</label>
							<input class="inp" id="f-product" value={c.product} placeholder="What the brand is sending" onchange={(e) => save('product', val(e))} />
						</div>
					{/if}
					<div class="f">
						<label for="f-cat">Category</label>
						<Select id="f-cat" value={c.brand.category} options={CATS.map((cat) => ({ value: cat, label: cat }))} onchange={(v) => c && saveBrand(c.brand_id, { category: v })} />
					</div>
					<div class="f">
						<label for="f-handle">Brand Instagram</label>
						<div class="pre"><span>@</span><input class="inp" id="f-handle" value={c.brand.instagram} onchange={(e) => saveBrand(c.brand_id, { instagram: val(e).replace(/^@/, '') })} /></div>
					</div>
				</div>
				{#if c.preferred_live}<p class="hint" style="margin-top:12px">Brand's preferred go-live date: {fmt(c.preferred_live)}</p>{/if}
			</section>

			<section class="sec">
				<h3>Quote &amp; agreement {#if quote}<span class="pill tint {QUOTE_STATUS[quote.status].k}">{QUOTE_STATUS[quote.status].label}</span>{/if}</h3>
				{#if !quote}
					<p class="hint" style="margin:0 0 12px">No quote yet. Build one from your rate card; the brand accepts it online and it becomes the agreement.</p>
					<button class="btn sm primary" onclick={() => (quoteOpen = { editing: false })}><Icon name="rupee" />Build quote</button>
				{:else}
					<div class="q-card">
						<div class="q-card-h">
							<b class="num">{inr(quote.total)}</b><span class="hint">Version {quote.version}{quote.sent_at ? ` · sent ${fmt(quote.sent_at)}` : ''}</span>
						</div>
						<div class="hint">{quote.items.map((i) => `${i.qty} ${plural(i.kind, i.qty)}`).join(' · ')} · {quote.usage}</div>
						<div class="hint">{payTerms(quote)} · {quote.revision_rounds} revision round{quote.revision_rounds === 1 ? '' : 's'}{quote.exclusivity_days ? ` · ${quote.exclusivity_days} days exclusivity` : ''}</div>
						{#if quote.status === 'changes' && quote.response_note}
							<blockquote class="note" style="margin:12px 0 0"><span>The brand asked</span><p>{quote.response_note}</p></blockquote>
						{/if}
						{#if quote.status === 'accepted'}
							<p class="hint" style="margin-top:8px">Accepted by {quote.accepted_name} ({quote.accepted_email}) on {quote.responded_at ? fmtTime(quote.responded_at) : ''}</p>
						{/if}
						<div class="q-actions">
							{#if quote.status === 'draft'}
								<button class="btn sm primary" onclick={() => (quoteOpen = { base: quote, editing: true })}><Icon name="edit" />Edit and send</button>
							{:else if quote.status === 'sent'}
								<button class="btn sm" onclick={() => (quoteOpen = { base: quote, editing: false })}><Icon name="edit" />New version</button>
								<button class="btn sm ghost" onclick={() => quote && withdrawQuote(quote)}>Withdraw</button>
							{:else if quote.status === 'changes' || quote.status === 'withdrawn'}
								<button class="btn sm primary" onclick={() => (quoteOpen = { base: quote, editing: false })}><Icon name="edit" />Revise quote</button>
							{/if}
							{#if quote.status === 'accepted' || quote.status === 'sent'}
								<a class="btn sm" href="/agreement/{quote.id}" target="_blank" rel="noopener"><Icon name="eye" />{quote.status === 'accepted' ? 'View agreement' : 'Preview'}</a>
							{/if}
						</div>
					</div>
					{#if c.quotes.length > 1}
						<button class="lnk hint" style="margin-top:10px" onclick={() => (showOld = !showOld)}>{showOld ? 'Hide' : 'Show'} earlier versions ({c.quotes.length - 1})</button>
						{#if showOld}
							<ul class="old-list">
								{#each c.quotes.slice(1) as q (q.id)}
									<li><span>Version {q.version}</span><b class="num">{inr(q.total)}</b><span class="pill tint {QUOTE_STATUS[q.status].k}">{QUOTE_STATUS[q.status].label}</span></li>
								{/each}
							</ul>
						{/if}
					{/if}
				{/if}
			</section>

			<section class="sec">
				<h3>Deliverables <span>{done} of {c.deliverables.length} done</span></h3>
				<div class="dl">
					{#each c.deliverables as d (d.id)}
						<div class="dl-row" class:done={d.done}>
							<input type="checkbox" class="cbx" id="dl-{d.id}" checked={d.done} onchange={(e) => setDeliverable(d, { done: (e.currentTarget as HTMLInputElement).checked })} />
							<input class="inp qty num" type="number" min="1" max="50" value={d.qty} aria-label="How many {d.kind}" onchange={(e) => setDeliverable(d, { qty: Math.min(50, Math.max(1, num(e))) })} />
							<label for="dl-{d.id}">{plural(d.kind, d.qty)}</label>
							<button class="icon-btn sm" onclick={() => removeDeliverable(d)} aria-label="Remove {d.kind}"><Icon name="x" /></button>
						</div>
					{:else}
						<p class="hint">Add what the brand is expecting.</p>
					{/each}
				</div>
				<Select action class="add-sel" ariaLabel="Add deliverable" placeholder="+ Add deliverable" options={KINDS.map((k) => ({ value: k, label: k }))} onchange={(k) => c && addDeliverable(c, k)} />
			</section>

			{#if hasProduct(c)}<ProductShipping {c} />{/if}

			<section class="sec">
				<h3>Dates</h3>
				<div class="fields">
					{#if hasProduct(c) || c.product_date}
						<div class="f"><label for="d-product">Product arrives</label><DatePicker id="d-product" value={c.product_date} onchange={(v) => save('product_date', v || null)} /></div>
					{/if}
					<div class="f"><label for="d-draft">Draft due to brand</label><DatePicker id="d-draft" value={c.draft_date} onchange={(v) => save('draft_date', v || null)} /></div>
					<div class="f"><label for="d-live">Go-live date</label><DatePicker id="d-live" value={c.live_date} onchange={(v) => save('live_date', v || null)} /></div>
				</div>
			</section>

			<section class="sec">
				<h3>
					Drafts for approval
					{#if roundsIncluded !== null}<span>{Math.max(0, c.drafts.length - 1)} of {roundsIncluded} revision{roundsIncluded === 1 ? '' : 's'} used</span>{/if}
				</h3>
				{#each c.drafts as d (d.id)}
					<div class="draft-row">
						<div class="draft-h">
							<b>Round {d.round}</b>
							<span class="pill tint {DRAFT_STATUS[d.status].k}">{DRAFT_STATUS[d.status].label}</span>
							<span class="hint">{fmt(d.submitted_at)}</span>
						</div>
						{#if d.link}<a class="lnk draft-link" href={d.link} target="_blank" rel="noopener">{d.link}</a>{/if}
						{#if d.caption}<p class="draft-cap">{d.caption}</p>{/if}
						{#if d.feedback}<blockquote class="note" style="margin:8px 0 0"><span>{d.status === 'approved' ? 'Brand note' : 'Changes asked'} · {d.responded_by}</span><p>{d.feedback}</p></blockquote>{/if}
					</div>
				{/each}
				{#if !lastDraft || lastDraft.status !== 'pending'}
					{#if roundsIncluded !== null && c.drafts.length > roundsIncluded}
						<p class="hint warn-text">This would be an extra round beyond the {roundsIncluded} included in the agreement.</p>
					{/if}
					<form class="draft-form" onsubmit={sendDraft}>
						<div class="f"><label for="dr-link">Link to the draft</label><input class="inp" id="dr-link" placeholder="Google Drive or WeTransfer link" bind:value={draftForm.link} /></div>
						<div class="f"><label for="dr-cap">Caption</label><textarea class="inp" id="dr-cap" rows="3" placeholder="#ad The caption you plan to post, with @brand tag" bind:value={draftForm.caption}></textarea></div>
						<div class="f"><label for="dr-note">Note for the brand <span class="hint">(optional)</span></label><input class="inp" id="dr-note" bind:value={draftForm.note} /></div>
						<button class="btn sm primary" type="submit" disabled={draftBusy || (!draftForm.link.trim() && !draftForm.caption.trim())}><Icon name="send" />Send draft {c.drafts.length + 1} for approval</button>
					</form>
				{:else}
					<p class="hint">Waiting for the brand to review round {lastDraft.round}.</p>
				{/if}
			</section>

			{#if ['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage)}
				<section class="sec">
					<h3>Posting checklist <span>{CHECKLIST.length - checklistMissing(c).length} of {CHECKLIST.length}</span></h3>
					{#each CHECKLIST as item (item.key)}
						<label class="check-row">
							<input type="checkbox" class="cbx" checked={!!c.checklist?.[item.key]} onchange={(e) => c && setChecklist(c, { [item.key]: (e.currentTarget as HTMLInputElement).checked })} />
							<span>{item.label}</span>
							{#if capCheck && item.key === 'ad_tag'}<small class:ok={capCheck.ad_tag}>{capCheck.ad_tag ? 'found in caption' : 'not in caption'}</small>{/if}
							{#if capCheck && item.key === 'brand_tag'}<small class:ok={capCheck.brand_tag}>{capCheck.brand_tag ? `@${c.brand.instagram} found` : `@${c.brand.instagram || 'brand'} missing`}</small>{/if}
						</label>
					{/each}
					<p class="hint" style="margin-top:8px">Indian advertising rules (ASCI) need paid posts and gifted products to be clearly marked.</p>
				</section>
			{/if}

			<CollabPosts {c} />

			{#if isPaid(c)}
				<section class="sec">
					<h3>Payment {#if issuedInvoices.length}<span>{issuedInvoices.length} invoice{issuedInvoices.length === 1 ? '' : 's'}</span>{/if}</h3>
					{#each c.invoices as inv (inv.id)}
						<div class="inv-row" class:muted={inv.status === 'cancelled'}>
							<div class="inv-row-h">
								<b>{inv.number ?? 'Draft invoice'}</b>
								<span class="pill tint {INVOICE_STATUS[inv.status].k}">{INVOICE_STATUS[inv.status].label}</span>
								<span class="hint">{KIND_LABEL[inv.kind]}</span>
								<b class="num" style="margin-left:auto">{inr(inv.total)}</b>
							</div>
							<div class="hint">
								{#if inv.status === 'paid'}Paid {fmt(inv.paid_on)}{inv.tds_deducted ? ` · TDS ${inr(inv.tds_deducted)}` : ''}{inv.payment_ref ? ` · Ref ${inv.payment_ref}` : ''}
								{:else if inv.status !== 'draft' && inv.status !== 'cancelled'}Due {fmt(inv.due_date)} · {inr(balanceDue(inv))} to receive{inv.reminders_sent.length ? ` · ${inv.reminders_sent.length} reminder${inv.reminders_sent.length > 1 ? 's' : ''} sent` : ''}
								{:else if inv.status === 'draft'}Not sent yet{/if}
							</div>
							<div class="q-actions">
								{#if inv.status === 'draft'}
									<button class="btn sm primary" onclick={() => (invoiceOpen = { editing: inv })}><Icon name="edit" />Edit and send</button>
									<button class="btn sm ghost" onclick={() => cancelInvoice(inv)}>Delete</button>
								{:else}
									<a class="btn sm" href="/invoice/{inv.public_token}" target="_blank" rel="noopener"><Icon name="eye" />View / PDF</a>
									<button class="btn sm ghost" onclick={() => copyText(`${location.origin}/invoice/${inv.public_token}`, 'Invoice link copied')}><Icon name="copy" />Link</button>
									{#if inv.status === 'sent' || inv.status === 'partly_paid'}
										<button class="btn sm primary" onclick={() => (paymentOpen = inv)}><Icon name="wallet" />Record payment</button>
										<button class="btn sm ghost danger" onclick={() => cancelInvoice(inv)}>Cancel</button>
									{/if}
									{#if inv.status === 'paid' && inv.tds_deducted > 0}
										<label class="check-row" style="padding:0"><input type="checkbox" class="cbx" checked={inv.tds_certificate} onchange={(e) => setInvoiceFlags(inv, { tds_certificate: (e.currentTarget as HTMLInputElement).checked })} /><span>TDS certificate (Form 16A) received</span></label>
									{/if}
								{/if}
							</div>
						</div>
					{/each}
					<button class="btn sm {issuedInvoices.length ? '' : 'primary'}" style="margin-bottom:14px" onclick={() => (invoiceOpen = {})}><Icon name="plus" />Create invoice</button>
					{#if !issuedInvoices.length}
					<p class="hint" style="margin:0 0 10px">No invoice from the app yet. You can also track a payment by hand:</p>
					<div class="fields">
						<div class="f">
							<label for="p-st">Status</label>
							<Select id="p-st" value={c.pay_status as string} options={(['pending', 'advance', 'invoiced', 'paid'] as const).map((s) => ({ value: s as string, label: PAY_LABEL[s] }))} onchange={(v) => (v === 'paid' && c ? markPaid(c) : save('pay_status', v))} />
						</div>
						<div class="f">
							<label for="p-rec">Received so far</label>
							<div class="pre"><span>₹</span><input class="inp num" type="number" inputmode="numeric" min="0" id="p-rec" value={c.pay_received || ''} onchange={(e) => save('pay_received', num(e))} /></div>
						</div>
						<div class="f"><label for="p-inv">Invoice no.</label><input class="inp" id="p-inv" value={c.invoice_no} placeholder="INV-1048" onchange={(e) => save('invoice_no', val(e))} /></div>
						<div class="f"><label for="p-due">Payment due</label><DatePicker id="p-due" value={c.pay_due} onchange={(v) => save('pay_due', v || null)} /></div>
					</div>
					{/if}
					<div class="balance">
						{#if c.pay_status === 'paid'}
							<span class="pill tint k-pay"><Icon name="check" />Paid in full</span><b>{inr(c.fee)}</b><span class="hint">on {fmt(c.paid_on)}</span>
						{:else}
							<span>Balance</span><b>{inr(balance)}</b>
							{#if overdue(c)}<span class="pill tint k-bad">Overdue</span>{/if}
							<button class="btn sm" onclick={() => c && markPaid(c)}>Mark paid in full</button>
						{/if}
					</div>
				</section>
			{/if}

			<section class="sec">
				<h3>Follow-up reminder</h3>
				<div class="fields">
					<div class="f"><label for="fu-d">Remind me on</label><DatePicker id="fu-d" value={c.follow_date} onchange={(v) => save('follow_date', v || null)} /></div>
					<div class="f"><label for="fu-n">About</label><input class="inp" id="fu-n" value={c.follow_note} placeholder="Ask for product tracking" onchange={(e) => save('follow_note', val(e))} /></div>
				</div>
				{#if c.follow_date}<button class="btn sm follow-done" onclick={() => c && completeFollow(c)}><Icon name="check" />Mark follow-up done</button>{/if}
			</section>

			<section class="sec">
				<h3>Update for the brand</h3>
				<p class="hint">The brand sees this on their status page.</p>
				<textarea class="inp" id="f-note" placeholder="Draft coming your way on Friday." value={c.note_for_brand} onchange={(e) => save('note_for_brand', val(e))}></textarea>
				<div class="switch-row" style="padding:12px 0 0;border:0">
					<div><b>Email the brand when the stage changes</b><small>Sent to {c.contact_email || 'no email yet'}</small></div>
					<input type="checkbox" class="tgl" checked={c.notify_brand} aria-label="Email the brand on stage changes" onchange={(e) => save('notify_brand', (e.currentTarget as HTMLInputElement).checked)} />
				</div>
			</section>

			<section class="sec">
				<h3>Brief</h3>
				<textarea class="inp" id="f-brief" placeholder="Key messages, hashtags, do's and don'ts" value={c.brief} onchange={(e) => save('brief', val(e))}></textarea>
			</section>

			<section class="sec">
				<h3>Brand contact</h3>
				<div class="fields">
					<div class="f"><label for="c-n">Name</label><input class="inp" id="c-n" value={c.contact_name} onchange={(e) => save('contact_name', val(e))} /></div>
					<div class="f"><label for="c-p">Phone</label><input class="inp" id="c-p" value={c.contact_phone} inputmode="tel" onchange={(e) => save('contact_phone', val(e))} /></div>
					<div class="f span2">
						<label for="c-e">Email</label>
						<input class="inp" id="c-e" value={c.contact_email} inputmode="email" onchange={(e) => save('contact_email', val(e).trim().toLowerCase())} />
					</div>
				</div>
				<p class="hint" style="margin-top:10px">The brand signs in with this email to see their requests.</p>
			</section>

			<section class="sec">
				<h3>Activity</h3>
				<ol class="log">
					{#each c.events as ev (ev.id)}
						<li><time>{fmt(ev.at)}</time><span title={fmtTime(ev.at)}>{ev.text}</span></li>
					{/each}
				</ol>
			</section>
		</div>

		<footer class="dr-f">
			<button class="btn" onclick={() => c && copyText(statusMessage(c), 'Status message copied. Paste it in your DM or email.')}><Icon name="link" />Copy status message</button>
			<button class="btn primary" onclick={close}>Done</button>
		</footer>
	{/if}
</aside>

{#if c && quoteOpen}
	<QuoteDialog {c} base={quoteOpen.base} editing={quoteOpen.editing} onclose={() => (quoteOpen = null)} />
{/if}
{#if c && invoiceOpen}
	<InvoiceDialog {c} editing={invoiceOpen.editing} onclose={() => (invoiceOpen = null)} />
{/if}
{#if paymentOpen}
	<PaymentDialog inv={paymentOpen} onclose={() => (paymentOpen = null)} />
{/if}
