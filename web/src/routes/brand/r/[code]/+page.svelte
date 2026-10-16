<script lang="ts">
	import { page } from '$app/state';
	import { auth } from '#lib/auth.svelte.ts';
	import { brandData, loadRequests, loadUnread } from '#lib/brand.svelte.ts';
	import { pub } from '#lib/publicPage.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { confetti, toast } from '#lib/ui.svelte.ts';
	import {
		DRAFT_STATUS,
		STAGES,
		TYPE_LABEL,
		delivText,
		errMessage,
		firstName,
		fmt,
		fmtLong,
		fmtTime,
		inr,
		payTerms,
		plural,
		stageIndex,
		todayIso
	} from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import BrandUsage from '#lib/components/BrandUsage.svelte';
	import BrandShipping from '#lib/components/BrandShipping.svelte';
	import MessageThread from '#lib/components/MessageThread.svelte';
	import { INVOICE_STATUS } from '#lib/invoice.ts';

	const r = $derived(brandData.requests.find((x) => x.code.toUpperCase() === (page.params.code ?? '').toUpperCase()));
	const si = $derived(r ? (r.stage === 'declined' ? -1 : stageIndex(r.stage)) : 0);
	const creator = $derived(firstName(pub.data?.display_name ?? ''));
	const quote = $derived(r?.quotes?.[0]);
	const openQuote = $derived(quote?.status === 'sent' ? quote : undefined);
	const accepted = $derived(r?.quotes?.find((q) => q.status === 'accepted'));
	const expired = $derived(!!openQuote?.valid_until && openQuote.valid_until < todayIso());
	const pendingDraft = $derived(r?.drafts?.find((d) => d.status === 'pending'));

	// Leaving the page: refresh the unread counts on My requests.
	$effect(() => () => void loadUnread());

	let reports = $state<{ code: string; token: string; sent_at: string }[]>([]);
	$effect(() => {
		supabase.rpc('my_reports').then(({ data }) => (reports = (data as typeof reports) ?? []));
	});
	const myReports = $derived(reports.filter((x) => r && x.code === r.code));

	let mode = $state<'' | 'accept' | 'changes'>('');
	let signName = $state(auth.account?.role === 'brand' ? auth.account.full_name : '');
	let note = $state('');
	let busy = $state(false);
	let error = $state('');
	let draftMode = $state<'' | 'changes'>('');
	let feedback = $state('');

	async function respondQuote(accept: boolean) {
		if (!openQuote) return;
		error = '';
		busy = true;
		const { error: err } = await supabase.rpc('respond_quote', { p_quote: openQuote.id, p_accept: accept, p_name: signName, p_note: note });
		busy = false;
		if (err) return (error = errMessage(err));
		mode = '';
		note = '';
		await loadRequests();
		if (accept) {
			confetti();
			toast('Quote accepted. The agreement is saved.');
		} else toast(`Sent to ${creator}`);
	}

	async function respondDraft(approve: boolean) {
		if (!pendingDraft) return;
		error = '';
		busy = true;
		const { error: err } = await supabase.rpc('respond_draft', { p_draft: pendingDraft.id, p_approve: approve, p_feedback: feedback });
		busy = false;
		if (err) return (error = errMessage(err));
		draftMode = '';
		feedback = '';
		await loadRequests();
		if (approve) {
			confetti();
			toast('Draft approved');
		} else toast(`Your feedback was sent to ${creator}`);
	}

	function detail(id: string, i: number) {
		if (!r) return '';
		if (id === 'request') return `Received ${fmtLong(r.received_on)}`;
		if (id === 'creating' && r.draft_date) return i < si ? `Draft shared ${fmt(r.draft_date)}` : `Draft expected ${fmtLong(r.draft_date)}`;
		if (id === 'live' && r.live_date) return i <= si ? `Went live ${fmtLong(r.live_date)}` : `Planned for ${fmtLong(r.live_date)}`;
		return '';
	}
	const payText = $derived(
		!r
			? ''
			: r.type === 'barter'
				? 'Not applicable'
				: r.pay_status === 'paid'
					? 'Received, thank you'
					: r.pay_status === 'invoiced'
						? `${r.invoice_no || 'Invoice'} · due ${fmt(r.pay_due)}`
						: r.pay_status === 'advance'
							? 'Advance received'
							: 'Invoice after posting'
	);
</script>

<svelte:head><title>{r ? r.code : 'Request'}</title></svelte:head>

<a class="back" href="/brand"><Icon name="back" />My requests</a>

{#if !brandData.loaded}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else if !r}
	<div class="empty-card"><h2>We couldn't find that request</h2><p>It may belong to a different email address. Sign in with the email you used to send it.</p><a class="btn" href="/brand">My requests</a></div>
{:else}
	<header class="ph rv">
		<div>
			<div class="eb"><span class="id">{r.code}</span> · {TYPE_LABEL[r.type]}</div>
			<h1>{delivText(r.deliverables)}</h1>
		</div>
		<span class="chip tint st-{r.stage === 'declined' ? 'request' : r.stage}" style={r.stage === 'declined' ? '--hue:var(--bad)' : ''}>{r.stage_label}</span>
	</header>

	{#if error}<div class="err-box">{error}</div>{/if}

	<!-- Quote waiting for an answer -->
	{#if openQuote}
		<section class="panel rv action-panel" style="--i:1">
			<div class="panel-h"><h2>Quote from {creator}</h2><span class="pill tint k-new">Needs your answer</span></div>
			<div class="quote-view">
				<div class="qv-lines">
					{#each openQuote.items as it, i (i)}
						<div class="qv-line"><span>{it.qty} {plural(it.kind, it.qty)}</span><span class="num">{inr(it.qty * it.rate)}</span></div>
					{/each}
					{#if openQuote.usage_fee}<div class="qv-line"><span>Usage: {openQuote.usage}</span><span class="num">{inr(openQuote.usage_fee)}</span></div>{/if}
					{#if openQuote.discount}<div class="qv-line"><span>Discount</span><span class="num">− {inr(openQuote.discount)}</span></div>{/if}
					<div class="qv-line total"><span>Total</span><b class="num">{inr(openQuote.total)}</b></div>
				</div>
				<dl class="facts" style="margin-top:16px">
					<div><dt>Usage rights</dt><dd>{openQuote.usage}</dd></div>
					<div><dt>Payment</dt><dd>{payTerms(openQuote)}</dd></div>
					<div><dt>Revisions included</dt><dd>{openQuote.revision_rounds}{openQuote.exclusivity_days ? ` · ${openQuote.exclusivity_days} days exclusivity` : ''}</dd></div>
				</dl>
				{#if openQuote.notes}<p class="hint" style="margin-top:12px;white-space:pre-wrap">{openQuote.notes}</p>{/if}
				{#if openQuote.valid_until}<p class="hint" style="margin-top:8px">{expired ? 'This quote expired on' : 'Valid until'} {fmtLong(openQuote.valid_until)}</p>{/if}
			</div>

			{#if expired}
				<div class="submit-row"><p>This quote has expired. Ask {creator} for a new one.</p></div>
			{:else if mode === 'accept'}
				<div class="bsec">
					<div class="f">
						<label for="sign">Type your full name to accept</label>
						<input class="inp" id="sign" autocomplete="name" bind:value={signName} />
					</div>
					<div class="f" style="margin-top:12px"><label for="anote">Note <span class="hint">(optional)</span></label><input class="inp" id="anote" bind:value={note} /></div>
					<p class="hint" style="margin-top:10px">By accepting, you agree to the deliverables, usage rights and payment terms above. We record your name, email and the time.</p>
				</div>
				<div class="submit-row">
					<button class="btn ghost" onclick={() => (mode = '')}>Back</button>
					<button class="btn grad lg" disabled={busy || !signName.trim()} onclick={() => respondQuote(true)}>{#if busy}<span class="spinner"></span>{:else}<Icon name="check" />{/if}Accept quote</button>
				</div>
			{:else if mode === 'changes'}
				<div class="bsec">
					<div class="f"><label for="cnote">What would you like changed?</label><textarea class="inp" id="cnote" rows="3" placeholder="e.g. Can we do 2 reels and drop the stories, within ₹40,000?" bind:value={note}></textarea></div>
				</div>
				<div class="submit-row">
					<button class="btn ghost" onclick={() => (mode = '')}>Back</button>
					<button class="btn primary" disabled={busy || !note.trim()} onclick={() => respondQuote(false)}>{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Send to {creator}</button>
				</div>
			{:else}
				<div class="submit-row">
					<p>Accepting turns this quote into your agreement with {creator}.</p>
					<button class="btn" onclick={() => (mode = 'changes')}>Ask for changes</button>
					<button class="btn grad lg" onclick={() => (mode = 'accept')}><Icon name="check" />Accept</button>
				</div>
			{/if}
		</section>
	{/if}

	<!-- Draft waiting for review -->
	{#if pendingDraft}
		<section class="panel rv action-panel" style="--i:2;margin-top:18px">
			<div class="panel-h"><h2>Draft {pendingDraft.round} for your review</h2><span class="pill tint k-new">Needs your answer</span></div>
			<div style="padding:0 20px 8px">
				{#if pendingDraft.link}<a class="btn" href={pendingDraft.link} target="_blank" rel="noopener"><Icon name="eye" />Open the draft</a>{/if}
				{#if pendingDraft.caption}<div class="f" style="margin-top:14px"><span class="lbl-t">Caption</span><p class="draft-cap">{pendingDraft.caption}</p></div>{/if}
				{#if pendingDraft.note}<blockquote class="note" style="margin-top:14px"><span>Note from {creator}</span><p>{pendingDraft.note}</p></blockquote>{/if}
				{#if accepted}<p class="hint" style="margin-top:10px">{accepted.revision_rounds} revision round{accepted.revision_rounds === 1 ? '' : 's'} included. This is round {pendingDraft.round}.</p>{/if}
			</div>
			{#if draftMode === 'changes'}
				<div class="bsec"><div class="f"><label for="fb">What should change?</label><textarea class="inp" id="fb" rows="3" bind:value={feedback}></textarea></div></div>
				<div class="submit-row">
					<button class="btn ghost" onclick={() => (draftMode = '')}>Back</button>
					<button class="btn primary" disabled={busy || !feedback.trim()} onclick={() => respondDraft(false)}>{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Send feedback</button>
				</div>
			{:else}
				<div class="submit-row">
					<p>Approve it, or tell {creator} what to change.</p>
					<button class="btn" onclick={() => (draftMode = 'changes')}>Ask for changes</button>
					<button class="btn grad lg" disabled={busy} onclick={() => respondDraft(true)}><Icon name="check" />Approve draft</button>
				</div>
			{/if}
		</section>
	{/if}

	{#key r.code}<BrandShipping code={r.code} {creator} onchange={loadRequests} /><BrandUsage code={r.code} {creator} onchange={loadRequests} />{/key}

	<section class="panel rv msg-panel" style="--i:3;margin-top:18px">
		<div class="panel-h"><h2>Messages</h2><small>with {pub.data?.display_name ?? 'the creator'}</small></div>
		<div style="padding:0 20px 18px">
			{#key r.id}<MessageThread collabId={r.id} side="brand" otherName={pub.data?.display_name ?? 'the creator'} />{/key}
		</div>
	</section>

	<section class="panel rv" style="--i:3;padding:24px;margin-top:18px">
		{#if r.note_for_brand}
			<blockquote class="note"><span>Latest from {creator}</span><p>{r.note_for_brand}</p></blockquote>
		{/if}
		{#if r.stage === 'declined'}
			<p class="hint">{creator} isn't able to take this one on. Thank you for thinking of {creator}.</p>
		{:else}
			<ol class="vs">
				{#each STAGES as s, i (s.id)}
					{@const isDone = i < si || (i === si && s.id === 'wrapped')}
					{@const d = detail(s.id, i)}
					<li class:done={isDone} class:cur={!isDone && i === si} style="--i:{i}">
						<span class="vd">{#if isDone}<Icon name="check" />{/if}</span>
						<div><b>{s.pub}</b>{#if d}<small>{d}</small>{/if}</div>
					</li>
				{/each}
			</ol>
		{/if}
		<dl class="facts">
			<div><dt>{accepted ? 'Agreed' : 'Offer'}</dt><dd>{r.type === 'barter' ? r.product : `${r.fee ? inr(r.fee) : 'Quote requested'}${r.type === 'hybrid' ? ` + ${r.product}` : ''}`}</dd></div>
			<div><dt>Go-live date</dt><dd>{r.live_date ? fmtLong(r.live_date) : r.preferred_live ? `You asked for ${fmt(r.preferred_live)}` : 'To be agreed'}</dd></div>
			<div><dt>Invoice</dt><dd>{payText}</dd></div>
		</dl>
		{#if accepted}
			<a class="btn" style="margin-top:16px" href="/agreement/{accepted.id}"><Icon name="check" />View agreement · accepted {fmt(accepted.responded_at)}</a>
		{/if}
	</section>

	{#if myReports.length}
		<section class="panel rv action-panel" style="--i:3;margin-top:18px">
			<div class="panel-h"><h2>Results</h2><span class="pill tint k-live">From Instagram</span></div>
			{#each myReports as rep (rep.token)}
				<a class="prod-row" href="/report/{rep.token}" style="text-decoration:none"><div><b>Campaign results report</b><small>Shared {fmt(rep.sent_at?.slice(0, 10))}</small></div><Icon name="arrow" /></a>
			{/each}
		</section>
	{/if}

	{#if r.invoices?.length}
		<section class="panel rv" style="--i:4;margin-top:18px">
			<div class="panel-h"><h2>Invoices</h2></div>
			{#each r.invoices as inv (inv.token)}
				<a class="prod-row" href="/invoice/{inv.token}" style="text-decoration:none">
					<div><b>{inv.number}</b><small>{fmt(inv.issue_date)}{inv.status !== 'paid' && inv.due_date ? ` · due ${fmt(inv.due_date)}` : ''}</small></div>
					<span class="v">{inr(inv.payable)}</span>
					<span class="pill tint {INVOICE_STATUS[inv.status as keyof typeof INVOICE_STATUS]?.k ?? 'plain'}">{INVOICE_STATUS[inv.status as keyof typeof INVOICE_STATUS]?.label ?? inv.status}</span>
				</a>
			{/each}
		</section>
	{/if}

	{#if r.drafts.length && !(r.drafts.length === 1 && pendingDraft)}
		<section class="panel rv" style="--i:4;margin-top:18px">
			<div class="panel-h"><h2>Drafts</h2></div>
			{#each r.drafts.filter((d) => d.status !== 'pending') as d (d.id)}
				<div class="prod-row">
					<div><b>Round {d.round}</b><small>{fmt(d.submitted_at)}{d.feedback ? ` · “${d.feedback}”` : ''}</small></div>
					<span class="pill tint {DRAFT_STATUS[d.status].k}">{DRAFT_STATUS[d.status].label}</span>
				</div>
			{/each}
		</section>
	{/if}

	{#if r.events.length}
		<section class="panel rv" style="--i:5;margin-top:18px">
			<div class="panel-h"><h2>History</h2></div>
			<ol class="timeline" style="padding:0 20px 14px">
				{#each r.events as ev, i (i)}<li><time>{fmtTime(ev.at)}</time><span>{ev.text}</span></li>{/each}
			</ol>
		</section>
	{/if}

	{#if r.brief}
		<section class="panel rv" style="--i:6;margin-top:18px">
			<div class="panel-h"><h2>Your brief</h2><small>{r.usage}</small></div>
			<p style="padding:0 20px 20px;white-space:pre-wrap;color:var(--ink-2)">{r.brief}</p>
		</section>
	{/if}
{/if}
