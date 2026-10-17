<script lang="ts">
	import { ask } from '../confirm.svelte';
	import SchedulePost from './SchedulePost.svelte';
	import { askAi } from '../ai';
	import { collabFacts } from '../ai';
	import CollabLink from './CollabLink.svelte';
	import { money } from '../currency';
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		addDeliverable,
		byId,
		completeFollow,
		markPaid,
		markReceived,
		sendReport,
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
		usageLabel,
		usageOption,
		fmt,
		fmtTime,
		hasProduct,
		hueOf,
		inr,
		isPaid,
		outstanding,
		overdue,
		plural,
		stageIndex
	} from '../util';
	import Icon from './Icon.svelte';
	import { toast } from '../ui.svelte';
	import { supabase } from '../supabase';
	import { captionStarter, nextStep, replySuggestions, suggestDates } from '../suggest';
	import { savedFor } from '../savedReplies';
	import BriefEditor from './BriefEditor.svelte';
	import BrandRating from './BrandRating.svelte';
	import UsageRights from './UsageRights.svelte';
	import ProductShipping from './ProductShipping.svelte';
	import MessageThread from './MessageThread.svelte';
	import { isRanked } from '../priority';
	import DecisionCard from './DecisionCard.svelte';
	import Select from './Select.svelte';
	import DatePicker from './DatePicker.svelte';
	import { bestTime, timeLabel, timeOptions } from '../postTime';
	import DraftPlayer from './DraftPlayer.svelte';
	import CollabCosts from './CollabCosts.svelte';
	import CollabFiles from './CollabFiles.svelte';
	import { BRIEF_NEEDS, briefMissing } from '../content';
	import Mono from './Mono.svelte';
	import QuoteDialog from './QuoteDialog.svelte';
	import CollabPosts from './CollabPosts.svelte';
	import {
		CHECKLIST,
		DRAFT_STATUS,
		QUOTE_STATUS,
		acceptedQuote,
		captionCheck,
		briefCheck,
		checklistMissing,
		clashes,
		latestDraft,
		payTerms,
		waLink
	} from '../util';
	import { DRAFT_MAX_MB, cancelInvoice, recordPayment, reloadCollabs, setChecklist, setInvoiceFlags, shareDraft, withdrawQuote } from '../studio.svelte';
	import { errMessage, todayIso } from '../util';
	import type { Quote } from '../types';
	import { INVOICE_STATUS, KIND_LABEL, balanceDue, type Invoice } from '../invoice';
	import InvoiceDialog from './InvoiceDialog.svelte';
	import PaymentDialog from './PaymentDialog.svelte';

	// page: shown as its own full page (/studio/c/CODE) instead of a side drawer.
	// Full-page jump bar: only for sections this collab actually shows.
	const JUMPS = [['sec-msg', 'Messages'], ['sec-deal', 'Deal'], ['sec-drafts', 'Drafts'], ['sec-dates', 'Dates'], ['sec-pay', 'Payment'], ['sec-brand', 'Brand'], ['sec-brief', 'Brief'], ['sec-activity', 'Activity']];
	let present = $state<string[]>([]);
	let { page = false }: { page?: boolean } = $props();
	// Full page: only the parts that matter at this stage; everything else one tap away.
	const FOCUS: Record<string, string[]> = {
		request: ['deal', 'quote', 'deliv', 'brief', 'contact'],
		negotiating: ['deal', 'quote', 'deliv', 'brief', 'contact'],
		confirmed: ['quote', 'deliv', 'product', 'dates', 'drafts', 'pay', 'brand', 'brief'],
		creating: ['deliv', 'product', 'dates', 'drafts', 'check', 'link', 'files', 'brand', 'brief'],
		live: ['check', 'posts', 'link', 'pay', 'dates', 'files', 'usage', 'costs'],
		wrapped: ['pay', 'posts', 'link', 'review', 'costs', 'files', 'usage'],
		declined: ['deal', 'activity']
	};
	let showAll = $state(false);
	// Free AI: a caption (and shot list) in her voice, from the brief.
	let capBusy = $state(false);
	let shots = $state<string[]>([]);
	async function writeCaption() {
		if (!c) return;
		capBusy = true;
		try {
			const r = await askAi<{ caption: string; hashtags: string[]; shots: string[] }>('caption', {
				...collabFacts(c, studio.settings),
				brief: c.brief,
				brief_details: c.brief_details,
				post: c.deliverables[0]?.kind ?? 'Reel'
			});
			const tags = r.hashtags.filter((t) => !r.caption.includes(t)).join(' ');
			draftForm.caption = [r.caption, tags].filter(Boolean).join('\n\n');
			shots = r.shots;
		} catch (e) {
			toast((e as Error).message, 'alert');
		}
		capBusy = false;
	}
	const sh = (k: string) => !page || showAll || (FOCUS[c?.stage ?? ''] ?? []).includes(k);
	$effect(() => {
		if (!page) return;
		void c?.id;
		void c?.stage;
		void c?.type;
		void showAll;
		tick().then(() => (present = JUMPS.map(([id]) => id).filter((id) => document.getElementById(id)?.offsetParent)));
	});
	const c = $derived(byId(ui.openCollab));
	// Phones: short stage names so the six labels fit side by side.
	const SHORT_STAGE: Record<string, string> = { request: 'New', negotiating: 'Talks', confirmed: 'Agreed', creating: 'Creating', live: 'Live', wrapped: 'Done' };
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
	let draftFile = $state<File | null>(null);
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
		const ok = await shareDraft(c, draftForm, draftFile);
		draftBusy = false;
		if (ok) {
			draftForm = { link: '', caption: '', note: '' };
			draftFile = null;
		}
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
			if (!page) {
				document.body.style.overflow = 'hidden';
				tick().then(() => setTimeout(() => closeBtn?.focus({ preventScroll: true }), 80));
			}
		}
		if (!id && prevId && !page) {
			document.body.style.overflow = '';
			if (lastFocus instanceof HTMLElement && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
		}
		prevId = id;
	});

	function close() {
		ui.openCollab = null;
		if (page) {
			if (history.length > 1) history.back();
			else goto('/studio/collabs');
		}
	}

	type Field = Exclude<keyof Collab, 'id' | 'brand' | 'deliverables' | 'events'>;
	function save(field: Field, value: unknown) {
		if (!c) return;
		updateCollab(c.id, { [field]: value } as Partial<Collab>);
	}
	// Brief edits come in bursts (one field after another): save the whole brief once, a moment later.
	let briefTimer: ReturnType<typeof setTimeout> | undefined;
	function saveBrief(v: Collab['brief_details']) {
		clearTimeout(briefTimer);
		briefTimer = setTimeout(() => save('brief_details', v), 400);
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
		// Wrapping up with money still to come: ask first.
		if (s === 'wrapped' && isPaid(c) && c.pay_status !== 'paid' && outstanding(c) > 0) {
			const ok = await ask({ title: `${inr(outstanding(c))} not paid yet`, body: 'Wrap it up anyway? Unpaid invoices keep their reminders, but anything not invoiced yet is easy to forget.', ok: 'Wrap anyway', cancel: 'Not yet' });
			if (!ok) return;
		}
		await setStage(c, s);
	}

	// ---- next step: one button that moves the collab forward ----
	const next = $derived(c ? nextStep(c) : null);
	const dates = $derived(c && studio.settings ? suggestDates(c, studio.settings, studio.collabs) : null);
	const best = $derived(bestTime(studio.media));
	const missingBrief = $derived(c ? briefMissing(c) : []);
	let askBusy = $state(false);
	async function askBrief() {
		if (!c) return;
		askBusy = true;
		const { data, error } = await supabase.rpc('ask_brief', { p_collab: c.id });
		askBusy = false;
		if (error) return toast(`Couldn't send: ${errMessage(error)}`, 'alert');
		toast(data ? `Asked ${c.contact_name || c.brand.name} for the missing details` : 'Nothing missing to ask for', data ? 'send' : 'check');
		await reloadCollabs();
	}
	async function scrollTo(id: string, focus?: string) {
		await tick();
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		if (focus) setTimeout(() => (document.querySelector(focus) as HTMLElement | null)?.focus(), 350);
	}
	async function sendMessage(body: string) {
		if (!c) return;
		const { error } = await supabase.from('collab_messages').insert({ collab_id: c.id, sender: 'creator', body });
		if (error) return toast(`Couldn't send: ${error.message}`, 'alert');
		toast('Message sent', 'send');
		scrollTo('sec-msg');
	}
	async function runNext(key: string) {
		if (!c) return;
		const first = c.contact_name ? c.contact_name.split(' ')[0] : 'there';
		const me = (studio.settings?.display_name ?? '').split(' ')[0];
		const q = c.quotes[0];
		const openInv = c.invoices.find((i) => i.status === 'sent' || i.status === 'partly_paid');
		switch (key) {
			case 'reply': return scrollTo('sec-msg', '.drawer .th-box textarea');
			case 'quote': quoteOpen = { editing: false }; return;
			case 'revise-quote': quoteOpen = { base: q, editing: false }; return;
			case 'confirm': return changeStage('confirmed');
			case 'nudge': return sendMessage(`Hi ${first}, just checking in on the quote I sent for ${c.code}. Happy to adjust anything if needed! ${me}`);
			case 'ask-product': return sendMessage(`Hi ${first}, we're all set for ${c.code}! Please ship the product using the address on your request page and add the tracking number there. ${me}`);
			case 'received': return markReceived(c);
			case 'dates': if (dates) { await updateCollab(c.id, { draft_date: dates.draft, live_date: dates.live }); toast('Dates set', 'cal'); } return scrollTo('sec-dates');
			case 'start': return changeStage('creating');
			case 'share-draft': return scrollTo('sec-drafts', '#dr-link');
			case 'go-live': return changeStage('live');
			case 'invoice': invoiceOpen = {}; return;
			case 'paid': if (openInv) paymentOpen = openInv; else markPaid(c); return;
			case 'report': { const r = c.reports.find((x) => x.status === 'ready'); if (r) sendReport(r); return; }
		}
	}
	// A card's next-step button opens the panel and runs the action here.
	$effect(() => {
		if (c && ui.pendingNext) {
			const k = ui.pendingNext;
			ui.pendingNext = null;
			setTimeout(() => runNext(k), 250);
		}
	});

	// The brand's private tracking link: no sign-in to see where things stand.
	const trackUrl = (x: Collab) => `${(studio.settings?.site_url ?? location.origin).replace(/\/$/, '')}/t/${x.track_token}`;
	function statusMessage(x: Collab) {
		const name = (studio.settings?.display_name ?? '').split(' ')[0];
		return `Hi ${x.contact_name ? x.contact_name.split(' ')[0] : 'there'}! You can follow our collaboration (${x.code}) here any time, no sign-up needed: ${trackUrl(x)}\n${name}`;
	}
	let trackBusy = $state(false);
	async function emailTrack(x: Collab) {
		trackBusy = true;
		const { data, error } = await supabase.rpc('send_track_links', { p_ids: [x.id], p_notify: true });
		trackBusy = false;
		if (error) return toast(`Couldn't send: ${errMessage(error)}`, 'alert');
		toast((data as { sent: number }).sent ? `Tracking link emailed to ${x.contact_email}. Status emails are on.` : 'Add their email first', (data as { sent: number }).sent ? 'send' : 'alert');
		reloadCollabs();
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !page && open && !ui.newCollab && !quoteOpen && !invoiceOpen && !paymentOpen && close()} />

{#if !page}<div class="scrim" class:on={open} role="presentation" onclick={close}></div>{/if}
<aside class="drawer" class:as-page={page} class:on={open} class:fresh aria-label="Collab details" aria-hidden={!open} inert={!open}>
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
				<div class="dr-sub"><span class="id">{c.code}</span> · {TYPE_LABEL[c.type]} · received {fmt(c.received_on)}{#if c.referred_by && studio.brands.find((b) => b.id === c.referred_by)} · <span class="ref-by"><Icon name="users" />Referred by {studio.brands.find((b) => b.id === c.referred_by)?.name}</span>{/if}</div>
			</div>
			<button class="icon-btn" onclick={close} aria-label={page ? 'Back' : 'Close'} bind:this={closeBtn}><Icon name={page ? 'back' : 'x'} /></button>
		</header>

		<div class="dr-b">
			{#if page}
				<!-- Full page: jump straight to a part of the collab. -->
				<nav class="cx-nav" aria-label="Jump to">
					{#each JUMPS.filter(([id]) => present.includes(id)) as [id, label] (id)}
						<a href="#{id}" onclick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{label}</a>
					{/each}
				</nav>
			{/if}
			{#if next}
				<div class="next-bar">
					<span class="nb-ic"><Icon name={next.icon} /></span>
					<div><small>Next step</small><b>{next.hint}</b></div>
					<button class="btn grad" onclick={() => runNext(next.key)}><Icon name={next.icon} />{next.label}</button>
				</div>
			{/if}
			<section class="sec">
				<h3>Stage {#if c.stage === 'declined'}<span class="danger">Declined</span>{/if}</h3>
				{#if c.stage !== 'declined'}
					<div class="sh" style="--p:{si / 5}">
						<div class="sh-track"><i></i></div>
						{#each STAGES as s, i (s.id)}
							<button class="sh-step st-{s.id}" class:past={i < si} class:on={i === si} aria-pressed={i === si} onclick={() => changeStage(s.id)}>
								<span class="sh-dot">{#if i < si}<Icon name="check" />{/if}</span><span class="sh-l"><span class="sh-full">{s.label}</span><span class="sh-short" aria-hidden="true">{SHORT_STAGE[s.id]}</span></span>
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
					<button class="btn sm ghost danger" style="margin-top:14px" onclick={async () => (await ask({ title: `Decline ${c.brand.name}?`, body: c.notify_brand ? 'The brand is told politely that you can’t take this on. You can reopen it later.' : 'It moves to Declined. You can reopen it later.', ok: 'Decline', danger: true })) && changeStage('declined')}><Icon name="x" />Decline this request</button>
				{:else if c.stage === 'declined'}
					<p class="hint" style="margin:0 0 10px">The brand sees this request as "Not going ahead".</p>
					<button class="btn sm" onclick={() => changeStage('request')}><Icon name="refresh" />Reopen request</button>
				{/if}
			</section>

			{#if isRanked(c)}<DecisionCard {c} />{/if}

			<section class="sec" id="sec-msg">
				<h3>Messages{#if c.contact_name}<small class="sec-sub">with {c.contact_name}</small>{/if}</h3>
				{#if page}
					{@const lastMsg = c.messages[c.messages.length - 1]}
					<!-- Phones: the chat opens on its own screen. -->
					<a class="m-open-chat" href="/studio/inbox/{c.code}">
						<Mono name={c.brand.name} />
						<span><b>{c.contact_name || c.brand.name}</b><small>{lastMsg ? `${lastMsg.sender === 'creator' ? 'You: ' : ''}${lastMsg.body}` : 'No messages yet. Say hello.'}</small></span>
						<span class="btn sm primary">Message</span>
					</a>
				{/if}
				{#key c.id}
					<MessageThread
						collabId={c.id}
						side="creator"
						otherName={c.contact_name || c.brand.name}
						quick={studio.settings ? [...savedFor(c, studio.settings), ...replySuggestions(c, studio.settings)] : []}
						facts={collabFacts(c, studio.settings)}
					/>
				{/key}
			</section>

			<section class="sec" id="sec-deal" hidden={!sh('deal')}>
				<h3>Deal</h3>
				<div class="fields">
					<div class="f">
						<label for="f-type">Type</label>
						<Select id="f-type" value={c.type as string} options={Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} onchange={(v) => save('type', v)} />
					</div>
					<div class="f">
						<label for="f-usage">Usage rights</label>
						<Select id="f-usage" value={c.usage} options={[...USAGE, ...(USAGE.includes(c.usage) ? [] : [c.usage])].map((u) => ({ value: u, label: usageOption(u) }))} onchange={(v) => save('usage', v)} />
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

			<section class="sec" hidden={!sh('quote')}>
				<h3>Quote &amp; agreement {#if quote}<span class="pill tint {QUOTE_STATUS[quote.status].k}">{QUOTE_STATUS[quote.status].label}</span>{/if}</h3>
				{#if !quote}
					<p class="hint" style="margin:0 0 12px">No quote yet. Build one from your rate card; the brand accepts it online and it becomes the agreement.</p>
					<button class="btn sm primary" onclick={() => (quoteOpen = { editing: false })}><Icon name="rupee" />Build quote</button>
				{:else}
					<div class="q-card">
						<div class="q-card-h">
							<b class="num">{money(quote.total, quote.currency)}</b><span class="hint">Version {quote.version}{quote.sent_at ? ` · sent ${fmt(quote.sent_at)}` : ''}</span>
						</div>
						<div class="hint">{quote.items.map((i) => `${i.qty} ${plural(i.kind, i.qty)}`).join(' · ')} · {usageLabel(quote.usage)}</div>
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
								<button class="btn sm ghost" onclick={async () => quote && (await ask({ title: `Withdraw quote v${quote.version}?`, body: 'The brand can no longer accept it. You can send a new version any time.', ok: 'Withdraw', danger: true })) && withdrawQuote(quote)}>Withdraw</button>
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
									<li><span>Version {q.version}</span><b class="num">{money(q.total, q.currency)}</b><span class="pill tint {QUOTE_STATUS[q.status].k}">{QUOTE_STATUS[q.status].label}</span></li>
								{/each}
							</ul>
						{/if}
					{/if}
				{/if}
			</section>

			<section class="sec" hidden={!sh('deliv')}>
				<h3>Deliverables <span>{done} of {c.deliverables.length} done</span></h3>
				<div class="dl">
					{#each c.deliverables as d (d.id)}
						<div class="dl-row" class:done={d.done}>
							<input type="checkbox" class="cbx" id="dl-{d.id}" checked={d.done} onchange={(e) => setDeliverable(d, { done: (e.currentTarget as HTMLInputElement).checked })} />
							<input class="inp qty num" type="number" min="1" max="50" value={d.qty} aria-label="How many {d.kind}" onchange={(e) => setDeliverable(d, { qty: Math.min(50, Math.max(1, num(e))) })} />
							<label for="dl-{d.id}">{plural(d.kind, d.qty)}</label>
							<button class="icon-btn sm" onclick={async () => (await ask({ title: `Remove ${d.kind}?`, body: 'It comes off this collab’s deliverables.', ok: 'Remove', danger: true })) && removeDeliverable(d)} aria-label="Remove {d.kind}"><Icon name="x" /></button>
						</div>
					{:else}
						<p class="hint">Add what the brand is expecting.</p>
					{/each}
				</div>
				<Select action class="add-sel" ariaLabel="Add deliverable" placeholder="+ Add deliverable" options={KINDS.map((k) => ({ value: k, label: k }))} onchange={(k) => c && addDeliverable(c, k)} />
			</section>

			{#if c.stage === 'live' || c.stage === 'wrapped'}<section class="sec" hidden={!sh('review')}><h3>How was {c.brand.name}?<small class="sec-sub">private</small></h3><BrandRating brand={c.brand} compact /></section>{/if}
			{#if c.usage_ends}<section class="sec" hidden={!sh('usage')}><h3>Usage rights</h3><UsageRights {c} /></section>{/if}
			{#if hasProduct(c)}<div class="sec-wrap" hidden={!sh('product')}><ProductShipping {c} /></div>{/if}

			<section class="sec" id="sec-dates" hidden={!sh('dates')}>
				<h3>Dates</h3>
				{#if dates && c.stage !== 'live' && c.stage !== 'wrapped' && c.stage !== 'declined' && (c.draft_date !== dates.draft || c.live_date !== dates.live)}
					<div class="date-sug">
						<Icon name="spark" />
						<span><b>Suggested:</b> draft {fmt(dates.draft)}, live {fmt(dates.live)}{dates.why ? ` (${dates.why})` : ''}</span>
						<button class="btn sm" onclick={() => c && dates && updateCollab(c.id, { draft_date: dates.draft, live_date: dates.live })}>Use</button>
					</div>
				{/if}
				<div class="fields">
					{#if hasProduct(c) || c.product_date}
						<div class="f"><label for="d-product">Product arrives</label><DatePicker id="d-product" value={c.product_date} onchange={(v) => save('product_date', v || null)} /></div>
					{/if}
					{#if ['confirmed', 'creating'].includes(c.stage) || c.shoot_date}
						<div class="f"><label for="d-shoot">Shoot day</label><DatePicker id="d-shoot" value={c.shoot_date} onchange={(v) => save('shoot_date', v || null)} /></div>
					{/if}
					<div class="f"><label for="d-draft">Draft due to brand</label><DatePicker id="d-draft" value={c.draft_date} onchange={(v) => save('draft_date', v || null)} /></div>
					<div class="f"><label for="d-live">Go-live date</label><DatePicker id="d-live" value={c.live_date} onchange={(v) => save('live_date', v || null)} /></div>
					{#if c.live_date && !['live', 'wrapped', 'declined'].includes(c.stage)}
						<div class="f"><label for="d-time">Post at <span class="hint">(alert 30 min before)</span></label><Select id="d-time" value={c.live_time?.slice(0, 5) ?? undefined} placeholder="Pick a time" options={timeOptions(c.live_time)} onchange={(v) => save('live_time', v)} /></div>
					{/if}
				</div>
				{#if best && c.live_date && !['live', 'wrapped', 'declined'].includes(c.stage) && c.live_time?.slice(0, 5) !== best.value}
					<div class="date-sug">
						<Icon name="spark" />
						<span><b>Your best time:</b> {best.label}. Your posts then get {best.lift}% more interactions.</span>
						<button class="btn sm" onclick={() => best && save('live_time', best.value)}>Use {timeLabel(best.value)}</button>
					</div>
				{/if}
			</section>

			<section class="sec" id="sec-drafts" hidden={!sh('drafts')}>
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
						{#if d.file_path}<DraftPlayer path={d.file_path} type={d.file_type} comments={(d.comments ?? []).map((x) => ({ id: x.id, at: x.at_seconds === null ? null : Number(x.at_seconds), body: x.body, name: x.name })).sort((a, b) => (a.at ?? 1e9) - (b.at ?? 1e9))} />{/if}
						{#if d.link}<a class="lnk draft-link" href={d.link} target="_blank" rel="noopener">{d.link}</a>{/if}
						{#if d.caption}<p class="draft-cap">{d.caption}</p>{/if}
						{#if d.feedback}<blockquote class="note" style="margin:8px 0 0"><span>{d.status === 'approved' ? 'Brand note' : 'Changes asked'} · {d.responded_by}</span><p>{d.feedback}</p></blockquote>{/if}
						<SchedulePost {c} {d} />
					</div>
				{/each}
				{#if !lastDraft || lastDraft.status !== 'pending'}
					{#if roundsIncluded !== null && c.drafts.length > roundsIncluded}
						<p class="hint warn-text">This would be an extra round beyond the {roundsIncluded} included in the agreement.</p>
					{/if}
					<form class="draft-form" onsubmit={sendDraft}>
						<div class="f">
							<label for="dr-file">Upload the draft <span class="hint">(video or photo, up to {DRAFT_MAX_MB} MB)</span></label>
							<input class="inp" id="dr-file" type="file" accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,image/heic" onchange={(e) => (draftFile = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} />
							{#if draftFile && draftFile.size > DRAFT_MAX_MB * 1024 * 1024}<p class="hint warn-text" style="margin-top:6px">{Math.round(draftFile.size / 1048576)} MB is too big. Add a Drive link below instead.</p>{/if}
						</div>
						<div class="f"><label for="dr-link">Or a link to it</label><input class="inp" id="dr-link" placeholder="Google Drive or WeTransfer link" bind:value={draftForm.link} /></div>
						<div class="f"><label for="dr-cap">Caption <span class="cap-start">Start from the brief: <button type="button" class="lnk" onclick={() => c && (draftForm.caption = captionStarter(c, 'short'))}>Short</button> · <button type="button" class="lnk" onclick={() => c && (draftForm.caption = captionStarter(c, 'detailed'))}>Detailed</button> · <button type="button" class="lnk ai-lnk" disabled={capBusy} onclick={writeCaption}><Icon name="spark" />{capBusy ? 'Writing…' : 'Write with AI'}</button></span></label><textarea class="inp" id="dr-cap" rows="3" placeholder="#ad The caption you plan to post, with @brand tag" bind:value={draftForm.caption}></textarea>{#if shots.length}<div class="ai-shots"><span class="lbl-t">Shot list</span><ol>{#each shots as sh, i (i)}<li>{sh}</li>{/each}</ol></div>{/if}
							{#if draftForm.caption.trim()}
								{@const bc = briefCheck(draftForm.caption, c.brand.instagram, c.brief_details, c.type)}
								<div class="cap-check" aria-live="polite">
									{#each bc.items as it (it.label)}<span class:ok={it.ok}><Icon name={it.ok ? 'check' : 'x'} />{it.label}</span>{/each}
								</div>
							{/if}
						</div>
						<div class="f"><label for="dr-note">Note for the brand <span class="hint">(optional)</span></label><input class="inp" id="dr-note" bind:value={draftForm.note} /></div>
						<button class="btn sm primary" type="submit" disabled={draftBusy || (!draftFile && !draftForm.link.trim() && !draftForm.caption.trim())}><Icon name="send" />Send draft {c.drafts.length + 1} for approval</button>
					</form>
				{:else}
					<p class="hint">Waiting for the brand to review round {lastDraft.round}.</p>
				{/if}
			</section>

			{#if ['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage)}
				<section class="sec" hidden={!sh('check')}>
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

			<div class="sec-wrap" hidden={!sh('posts')}><CollabPosts {c} /></div>
			{#if c.type !== 'barter' || c.links?.length}<div class="sec-wrap" hidden={!sh('link')}><CollabLink {c} /></div>{/if}

			{#if isPaid(c)}
				<section class="sec" id="sec-pay" hidden={!sh('pay')}>
					<h3>Payment {#if issuedInvoices.length}<span>{issuedInvoices.length} invoice{issuedInvoices.length === 1 ? '' : 's'}</span>{/if}</h3>
					{#each c.invoices as inv (inv.id)}
						<div class="inv-row" class:muted={inv.status === 'cancelled'}>
							<div class="inv-row-h">
								<b>{inv.number ?? 'Draft invoice'}</b>
								<span class="pill tint {INVOICE_STATUS[inv.status].k}">{INVOICE_STATUS[inv.status].label}</span>
								<span class="hint">{KIND_LABEL[inv.kind]}</span>
								<b class="num" style="margin-left:auto">{money(inv.total, inv.currency)}</b>
							</div>
							<div class="hint">
								{#if inv.status === 'paid'}Paid {fmt(inv.paid_on)}{inv.tds_deducted ? ` · TDS ${inr(inv.tds_deducted)}` : ''}{inv.payment_ref ? ` · Ref ${inv.payment_ref}` : ''}
								{:else if inv.status !== 'draft' && inv.status !== 'cancelled'}Due {fmt(inv.due_date)} · {inr(balanceDue(inv))} to receive{inv.reminders_sent.length ? ` · ${inv.reminders_sent.length} reminder${inv.reminders_sent.length > 1 ? 's' : ''} sent` : ''}
								{:else if inv.status === 'draft'}Not sent yet{/if}
							</div>
							{#if inv.claim_at && (inv.status === 'sent' || inv.status === 'partly_paid')}
								<div class="claim-box">
									<Icon name="wallet" />
									<span><b>{c.brand.name} says they paid {inr(Number(inv.claim_amount))}</b> on {fmt(inv.claim_on)} · ref {inv.claim_ref}. Check your bank.</span>
									<button class="btn sm primary" onclick={() => recordPayment(inv, { amount: Number(inv.claim_amount) || 0, tds: inv.tds_amount, date: inv.claim_on ?? todayIso(), ref: inv.claim_ref ?? '' })}><Icon name="check" />It arrived</button>
									<button class="btn sm ghost" onclick={async () => { if (await ask({ title: 'Not received yet?', body: 'The brand sees that the payment hasn’t arrived yet, and reminders start again.', ok: 'Not received' })) { await supabase.rpc('invoice_claim_reject', { p_invoice: inv.id }); reloadCollabs(); } }}>Not received</button>
								</div>
							{/if}
							<div class="q-actions">
								{#if inv.status === 'draft'}
									<button class="btn sm primary" onclick={() => (invoiceOpen = { editing: inv })}><Icon name="edit" />Edit and send</button>
									<button class="btn sm ghost" onclick={async () => (await ask({ title: 'Delete this draft invoice?', ok: 'Delete', danger: true })) && cancelInvoice(inv)}>Delete</button>
								{:else}
									<a class="btn sm" href="/invoice/{inv.public_token}" target="_blank" rel="noopener"><Icon name="eye" />View / PDF</a>
									<button class="btn sm ghost" onclick={() => copyText(`${location.origin}/invoice/${inv.public_token}`, 'Invoice link copied')}><Icon name="copy" />Link</button>
									{#if inv.status === 'sent' || inv.status === 'partly_paid'}
										<button class="btn sm primary" onclick={() => (paymentOpen = inv)}><Icon name="wallet" />Record payment</button>
										<button class="btn sm ghost danger" onclick={async () => (await ask({ title: `Cancel invoice ${inv.number}?`, body: 'It is marked cancelled (the number is kept for your records) and payment reminders stop.', ok: 'Cancel invoice', cancel: 'Keep it', danger: true })) && cancelInvoice(inv)}>Cancel</button>
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
					<p class="hint" style="margin:0 0 10px">{c.stage === 'live' || c.stage === 'wrapped' ? 'Not invoiced yet. Tap Create invoice: it fills in from the agreed quote.' : studio.settings?.autopilot_invoice && c.type !== 'barter' ? (c.contact_email ? 'Auto-pilot sends the invoice when the post goes live (and any advance when the quote is accepted).' : 'Add the brand email under Brand contact and auto-pilot sends the invoice when the post goes live.') : 'No invoice from the app yet.'}</p>
					<details class="by-hand">
					<summary>Track a payment by hand instead</summary>
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
					</details>
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

			{#if ['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage) || c.files?.length}<div class="sec-wrap" hidden={!sh('files')}><CollabFiles {c} /></div>{/if}
			{#if ['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage) || c.expenses?.length}<div class="sec-wrap" hidden={!sh('costs')}><CollabCosts {c} /></div>{/if}

			<section class="sec" hidden={!sh('follow')}>
				<h3>Follow-up reminder</h3>
				<div class="fields">
					<div class="f"><label for="fu-d">Remind me on</label><DatePicker id="fu-d" value={c.follow_date} onchange={(v) => save('follow_date', v || null)} /></div>
					<div class="f"><label for="fu-n">About</label><input class="inp" id="fu-n" value={c.follow_note} placeholder="Ask for product tracking" onchange={(e) => save('follow_note', val(e))} /></div>
				</div>
				{#if c.follow_date}<button class="btn sm follow-done" onclick={() => c && completeFollow(c)}><Icon name="check" />Mark follow-up done</button>{/if}
			</section>

			<section class="sec" id="sec-brand" hidden={!sh('brand')}>
				<h3>Brand access {#if c.track_sent_at}<span>link sent {fmt(c.track_sent_at.slice(0, 10))}</span>{/if}</h3>
				<div class="trk-box">
					<span class="lbl-t">Private tracking link</span>
					<p class="hint" style="margin:0 0 10px">The brand sees the status, dates and what's next, without signing up. Send it in their DM or by email.</p>
					<div class="row-btns" style="border:0;padding:0">
						<button class="btn sm" onclick={() => c && copyText(statusMessage(c), 'Message with the link copied. Paste it in their DM')}><Icon name="copy" />Copy for DM</button>
						<button class="btn sm ghost" onclick={() => c && copyText(trackUrl(c), 'Link copied')}><Icon name="link" />Link only</button>
						{#if c.contact_email}<button class="btn sm primary" disabled={trackBusy} onclick={() => c && emailTrack(c)}>{#if trackBusy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}{c.track_sent_at ? 'Email again' : 'Email it'}</button>{:else}<span class="hint" style="margin:0;align-self:center">Add their email below to send it by email</span>{/if}
					</div>
				</div>
				<p class="hint" style="margin-top:14px">Update for the brand: shown on their tracking page.</p>
				<textarea class="inp" id="f-note" placeholder="Draft coming your way on Friday." value={c.note_for_brand} onchange={(e) => save('note_for_brand', val(e))}></textarea>
				<div class="switch-row" style="padding:12px 0 0;border:0">
					<div><b>Email the brand when the stage changes</b><small>Sent to {c.contact_email || 'no email yet'}</small></div>
					<input type="checkbox" class="tgl" checked={c.notify_brand} aria-label="Email the brand on stage changes" onchange={(e) => save('notify_brand', (e.currentTarget as HTMLInputElement).checked)} />
				</div>
			</section>

			<section class="sec" id="sec-brief" hidden={!sh('brief')}>
				<h3>Brief</h3>
				{#if missingBrief.length && !['declined', 'wrapped'].includes(c.stage)}
					<div class="date-sug brief-gap">
						<Icon name="alert" />
						<span><b>Missing:</b> {missingBrief.map((k) => BRIEF_NEEDS[k]).join(', ')}{c.brief_asked_at ? `. Asked ${fmt(c.brief_asked_at.slice(0, 10))}` : ''}</span>
						{#if c.contact_email}<button class="btn sm" disabled={askBusy} onclick={askBrief}>{c.brief_asked_at ? 'Ask again' : 'Ask the brand'}</button>{/if}
					</div>
				{/if}
				{#key c.id}<BriefEditor value={c.brief_details ?? {}} idp="f" category={c.brand.category} onchange={saveBrief} />{/key}
				<div class="f" style="margin-top:12px"><label for="f-brief">Notes</label><textarea class="inp" id="f-brief" placeholder="Anything else from the brand" value={c.brief} onchange={(e) => save('brief', val(e))}></textarea></div>
			</section>

			<section class="sec" hidden={!sh('contact')}>
				<h3>Brand contact</h3>
				<div class="fields">
					<div class="f"><label for="c-n">Name</label><input class="inp" id="c-n" value={c.contact_name} onchange={(e) => save('contact_name', val(e))} /></div>
					<div class="f"><label for="c-p">Phone</label><input class="inp" id="c-p" value={c.contact_phone} inputmode="tel" onchange={(e) => save('contact_phone', val(e))} /></div>
					<div class="f span2">
						<label for="c-e">Email</label>
						<input class="inp" id="c-e" value={c.contact_email} inputmode="email" onchange={(e) => save('contact_email', val(e).trim().toLowerCase())} />
					</div>
				</div>
				{#if waLink(c.contact_phone, '')}
					<a class="btn sm wa" style="margin-top:10px" href={waLink(c.contact_phone, statusMessage(c))} target="_blank" rel="noopener"><Icon name="send" />WhatsApp {c.contact_name ? c.contact_name.split(' ')[0] : 'them'} the status</a>
				{/if}
				<p class="hint" style="margin-top:10px">The brand signs in with this email to see their requests.</p>
			</section>

			<section class="sec" id="sec-activity" hidden={!sh('activity')}>
				<h3>Activity</h3>
				<ol class="log">
					{#each c.events as ev (ev.id)}
						<li><time>{fmt(ev.at)}</time><span title={fmtTime(ev.at)}>{ev.text}</span></li>
					{/each}
				</ol>
			</section>
			{#if page}
				<div class="more-row">
					<button class="btn" onclick={() => (showAll = !showAll)}><Icon name={showAll ? 'chevL' : 'layers'} />{showAll ? 'Show only what this stage needs' : 'Show all details'}</button>
				</div>
			{/if}
		</div>

		<footer class="dr-f">
			<button class="btn" onclick={() => c && copyText(statusMessage(c), 'Status message copied. Paste it in your DM or email.')}><Icon name="link" /><span class="nav-long">Copy status message</span><span class="nav-short">Copy status</span></button>
			{#if page && next}<button class="btn grad m-next" onclick={() => next && runNext(next.key)}><Icon name={next.icon} />{next.label}</button>{/if}
			<button class="btn primary" onclick={close}>{#if page}<span class="nav-long">Back to collabs</span><span class="nav-short">Back</span>{:else}Done{/if}</button>
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
