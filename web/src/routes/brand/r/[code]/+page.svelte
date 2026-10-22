<script lang="ts">
	import QuoteChoices from '#lib/components/QuoteChoices.svelte';
	import DeliverableProgress from '#lib/components/DeliverableProgress.svelte';
	import { langText } from '#lib/languages.ts';
	import { page } from '$app/state';
	import BrandLink from '#lib/components/BrandLink.svelte';
	import { money } from '#lib/currency.ts';
	import { auth, switchBrand } from '#lib/auth.svelte.ts';
	import { brandData, loadRequests, loadUnread } from '#lib/brand.svelte.ts';
	import { pub } from '#lib/publicPage.svelte.ts';
	import ExpectedResults from '#lib/components/ExpectedResults.svelte';
	import { pageSlug, supabase } from '#lib/supabase.ts';
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
		todayIso,
		usageLabel,
		waLink
	} from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import type { BriefDetails, DraftComment } from '#lib/types.ts';
	import BriefView from '#lib/components/BriefView.svelte';
	import DraftPlayer from '#lib/components/DraftPlayer.svelte';
	import BrandUsage from '#lib/components/BrandUsage.svelte';
	import BrandShipping from '#lib/components/BrandShipping.svelte';
	import MessageThread from '#lib/components/MessageThread.svelte';
	import { addressFor } from '#lib/creatorHost.ts';
	import CampaignTimeline from '#lib/components/CampaignTimeline.svelte';
	import CampaignDocs from '#lib/components/CampaignDocs.svelte';
	import DraftChecklist from '#lib/components/DraftChecklist.svelte';

	const r = $derived(brandData.requests.find((x) => x.code.toUpperCase() === (page.params.code ?? '').toUpperCase()));
	// Not in this list: the request is with another creator (open it on their address; the sign-in is
	// shared), or with another of this login's companies here (switch to it). Once per visit.
	let triedSwitch = '';
	$effect(() => {
		const code = page.params.code ?? '';
		const acc = auth.account;
		if (!brandData.loaded || r || triedSwitch === code || acc?.role !== 'brand') return;
		triedSwitch = code;
		supabase.rpc('request_place', { p_code: code }).then(async ({ data }) => {
			const place = data as { brand_id: string; slug: string } | null;
			if (!place) return;
			if (place.slug && place.slug !== pageSlug) return location.replace(addressFor(place.slug, page.url.pathname + page.url.search));
			if (place.brand_id === acc.brand?.id) return;
			await switchBrand(place.brand_id);
			await loadRequests();
			toast(`Switched to ${auth.account?.role === 'brand' ? (auth.account.brand?.name ?? 'that brand') : 'that brand'}`, 'check');
		});
	});
	// Short names for the progress tracker, in stage order.
	const TRACK = ['Sent', 'Talking', 'Agreed', 'Creating', 'Live', 'Done'];
	const si = $derived(r ? (r.stage === 'declined' ? -1 : stageIndex(r.stage)) : 0);
	const creator = $derived(firstName(pub.data?.display_name ?? ''));
	const quote = $derived(r?.quotes?.[0]);
	const held = $derived(r?.stage === 'paused' || r?.stage === 'cancelled');
	const openQuote0 = $derived(!held && quote?.status === 'sent' ? quote : undefined);
	// Several options (Good / Better / Best): the brand picks one; the details below show that one.
	const opts = $derived(openQuote0?.options?.length ? openQuote0.options : null);
	let choice = $state(-1);
	$effect(() => {
		if (opts && choice < 0) choice = Math.max(0, opts.findIndex((o) => o.popular));
	});
	const openQuote = $derived(openQuote0 && opts && opts[choice] ? { ...openQuote0, ...opts[choice], options: opts } : openQuote0);
	const accepted = $derived(r?.quotes?.find((q) => q.status === 'accepted'));
	const expired = $derived(!!openQuote?.valid_until && openQuote.valid_until < todayIso());
	const pendingDraft = $derived(!held ? r?.drafts?.find((d) => d.status === 'pending') : undefined);

	// The draft file and comments pinned to moments in it (the same as on the email link).
	let comments = $state<DraftComment[]>([]);
	$effect(() => {
		const id = pendingDraft?.id;
		comments = [];
		if (id)
			supabase.from('draft_comments').select('id, at_seconds, body, name').eq('draft_id', id).order('at_seconds', { nullsFirst: false }).then(({ data }) => {
				comments = ((data ?? []) as { id: number; at_seconds: number | null; body: string; name: string }[]).map((x) => ({ id: x.id, at: x.at_seconds === null ? null : Number(x.at_seconds), body: x.body, name: x.name }));
			});
	});
	async function addComment(at: number | null, body: string) {
		if (!pendingDraft) return false;
		const { data, error: err } = await supabase.rpc('draft_comment_add_member', { p_draft: pendingDraft.id, p_at: at, p_body: body });
		if (err) {
			error = errMessage(err);
			return false;
		}
		comments = [...comments, { id: (data as { id: number }).id, at, body, name: (data as { name: string }).name }].sort((a, b) => (a.at ?? 1e9) - (b.at ?? 1e9));
		return true;
	}
	async function removeComment(id: number) {
		await supabase.rpc('draft_comment_delete_member', { p_id: id });
		comments = comments.filter((x) => x.id !== id);
	}
	const mmss = (s: number | null) => (s === null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
	function askChanges() {
		if (comments.length && !feedback.trim()) feedback = comments.map((x) => (x.at === null ? `• ${x.body}` : `• ${mmss(x.at)} ${x.body}`)).join('\n');
		draftMode = 'changes';
	}

	// Leaving the page: refresh the unread counts on My requests.
	$effect(() => () => void loadUnread());

	let briefD = $state<BriefDetails | null>(null);
	$effect(() => {
		const code = r?.code;
		if (code) supabase.rpc('brief_info', { p_code: code }).then(({ data }) => (briefD = data && Object.keys(data).length ? (data as BriefDetails) : null));
	});

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
		const { data, error: err } = await supabase.rpc('respond_quote', { p_quote: openQuote.id, p_accept: accept, p_name: signName, p_note: note, p_option: opts && accept ? choice : null });
		busy = false;
		if (err) return (error = errMessage(err));
		mode = '';
		note = '';
		await loadRequests();
		// Over the team's limit: it waits for an Admin or Approver (Business, Team).
		if (accept && (data as { approval?: boolean } | null)?.approval) toast('Sent to your approvers. It is accepted once one of them says yes.');
		else if (accept) {
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
			: r.type === 'barter' || r.stage === 'declined'
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

<a class="back" href="/brand/requests"><Icon name="back" />My requests</a>

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
		<div class="acts">
			<span class="chip tint st-{r.stage === 'declined' ? 'request' : r.stage}" style={r.stage === 'declined' ? '--hue:var(--bad)' : ''}>{r.stage_label}</span>
			{#if pub.data?.whatsapp}<a class="btn wa" href={waLink(pub.data.whatsapp, `Hi ${creator}, about my request ${r.code}: `)} target="_blank" rel="noopener"><Icon name="send" />WhatsApp</a>{/if}
			{#if (r.stage === 'live' || r.stage === 'wrapped') && pub.data?.accepting !== false}<a class="btn grad" href="/brand/new?again={r.code}"><Icon name="refresh" />Book again</a>{/if}
		</div>
	</header>

	<!-- Where it stands, at a glance. -->
	{#if held}
		<div class="warn-box" role="status"><b>{r.stage_label}</b><span>{r.lifecycle_reason}</span>{#if r.resume_on}<span>Review on {fmt(r.resume_on)}. The creator will confirm when work resumes.</span>{/if}<span>Existing invoices and payments remain available below.</span></div>
	{/if}
	<DeliverableProgress deliverables={r.deliverables} />
	{#if r.stage !== 'declined' && !held}
		<ol class="rtrack rv" style="--i:1;--p:{Math.max(0, si) / (STAGES.length - 1)}" aria-label="Progress">
			{#each STAGES as st, i (st.id)}
				<li class:done={i < si} class:now={i === si}><span>{#if i < si}<Icon name="check" />{:else}{i + 1}{/if}</span><b>{TRACK[i]}</b></li>
			{/each}
		</ol>
	{/if}
	{#if error}<div class="err-box">{error}</div>{/if}

	<!-- Quote waiting for an answer -->
	<!-- Wide screens: what needs the brand on the left, status and documents on the right. -->
	<div class="r-grid">
		<div class="r-main">
	{#if quote?.status === 'changes'}
		<div class="date-sug"><Icon name="edit" /><span><b>You asked for changes to quote v{quote.version}</b>{#if quote.response_note}: “{quote.response_note}”{/if}. {pub.data?.display_name?.split(' ')[0] ?? 'The creator'} will send a revised quote.</span></div>
	{/if}
	{#if openQuote}
		<section class="panel rv action-panel" style="--i:1">
			<div class="panel-h"><h2>Quote from {creator}</h2><span class="pill tint k-new">Needs your answer</span></div>
			{#if opts}<div class="qc-wrap"><p class="hint">{creator} has given you {opts.length} options. Pick the one that suits you:</p><QuoteChoices options={opts} bind:value={choice} currency={openQuote0?.currency} /></div>{/if}
			<div class="quote-view">
				<div class="qv-lines">
					{#each openQuote.items as it, i (i)}
						<div class="qv-line"><span>{it.qty} {plural(it.kind, it.qty)}</span><span class="num">{money(it.qty * it.rate, openQuote.currency)}</span></div>
					{/each}
					{#if openQuote.usage_fee}<div class="qv-line"><span>{usageLabel(openQuote.usage)}</span><span class="num">{money(openQuote.usage_fee, openQuote.currency)}</span></div>{/if}
					{#if openQuote.discount}<div class="qv-line"><span>Discount</span><span class="num">− {money(openQuote.discount, openQuote.currency)}</span></div>{/if}
					<div class="qv-line total"><span>Total</span><b class="num">{money(openQuote.total, openQuote.currency)}</b></div>
				</div>
				<ExpectedResults lines={openQuote.items.map((x) => ({ kind: x.kind, qty: x.qty }))} cost={openQuote.total} />
				<dl class="facts" style="margin-top:16px">
					<div><dt>Usage rights</dt><dd>{usageLabel(openQuote.usage)}</dd></div>
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
				{#if pendingDraft.file_path}
					<DraftPlayer path={pendingDraft.preview_path && !pendingDraft.released_at ? pendingDraft.preview_path : pendingDraft.file_path} type={pendingDraft.preview_path && !pendingDraft.released_at ? (pendingDraft.preview_type ?? pendingDraft.file_type) : pendingDraft.file_type} {comments} canComment onadd={addComment} ondelete={removeComment} />
				{/if}
				{#if pendingDraft.link}<a class="btn" href={pendingDraft.link} target="_blank" rel="noopener"><Icon name="eye" />Open the draft</a>{/if}
				{#if pendingDraft.caption}<div class="f" style="margin-top:14px"><span class="lbl-t">Caption</span><p class="draft-cap">{pendingDraft.caption}</p></div>{/if}
				<DraftChecklist draft={pendingDraft.id} onask={(m) => ((feedback = m), (draftMode = 'changes'))} />
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
					<button class="btn" onclick={askChanges}>Ask for changes{comments.length ? ` (${comments.length})` : ''}</button>
					<button class="btn grad lg" disabled={busy} onclick={() => respondDraft(true)}><Icon name="check" />Approve draft</button>
				</div>
			{/if}
		</section>
	{/if}

	{#key r.code}<BrandShipping code={r.code} {creator} onchange={loadRequests} /><BrandUsage code={r.code} {creator} onchange={loadRequests} /><BrandLink code={r.code} {creator} />{/key}

	<section class="panel rv msg-panel" style="--i:3;margin-top:18px">
		<div class="panel-h"><h2>Messages</h2><small>with {pub.data?.display_name ?? 'the creator'}</small></div>
		<div style="padding:0 20px 18px">
			{#key r.id}<MessageThread collabId={r.id} side="brand" otherName={pub.data?.display_name ?? 'the creator'} />{/key}
		</div>
	</section>

	{#if r.brief || briefD}
		<section class="panel rv" style="--i:6;margin-top:18px">
			<div class="panel-h"><h2>Your brief</h2><small>{usageLabel(r.usage)}</small></div>
			{#if briefD}<div style="padding:0 20px"><BriefView d={briefD} /></div>{/if}
			{#if r.brief}<p style="padding:0 20px 20px;white-space:pre-wrap;color:var(--ink-2)">{r.brief}</p>{/if}
		</section>
	{/if}

	{#if r.events.length}
		<section class="panel rv" style="--i:5;margin-top:18px">
			<div class="panel-h"><h2>History</h2></div>
			<ol class="timeline" style="padding:0 20px 14px">
				{#each r.events.slice(0, 4) as ev, i (i)}<li><time>{fmtTime(ev.at)}</time><span>{ev.text}</span></li>{/each}
			</ol>
			{#if r.events.length > 4}
				<details class="hist-more">
					<summary>Show all {r.events.length} updates</summary>
					<ol class="timeline" style="padding:0 20px 14px">
						{#each r.events.slice(4) as ev, i (i)}<li><time>{fmtTime(ev.at)}</time><span>{ev.text}</span></li>{/each}
					</ol>
				</details>
			{/if}
		</section>
	{/if}


		</div>
		<aside class="r-side">
	<CampaignTimeline {r} {creator} />
	<section class="panel rv" style="--i:3;padding:24px;margin-top:18px">
		{#if r.note_for_brand}
			<blockquote class="note"><span>Latest from {creator}</span><p>{r.note_for_brand}</p></blockquote>
		{/if}
		{#if r.stage === 'declined'}
			<p class="hint">{creator} isn't able to take this one on. Thank you for thinking of {creator}.</p>
		{/if}
		<dl class="facts">
			<div><dt>{accepted ? 'Agreed' : 'Offer'}</dt><dd>{r.type === 'barter' ? r.product : `${accepted?.total ? money(accepted.total, accepted.currency) : r.fee ? inr(r.fee) : 'Quote requested'}${r.type === 'hybrid' ? ` + ${r.product}` : ''}`}</dd></div>
			<div><dt>Go-live date</dt><dd>{r.live_date ? fmtLong(r.live_date) : r.preferred_live ? `You asked for ${fmt(r.preferred_live)}` : 'To be agreed'}</dd></div>
			{#if r.content_language}<div><dt>Language</dt><dd>{langText(r.content_language)}</dd></div>{/if}
			<div><dt>Invoice</dt><dd>{payText}</dd></div>
		</dl>
		{#if accepted}
			<a class="btn" style="margin-top:16px" href="/agreement/{accepted.id}"><Icon name="check" />View agreement · accepted {fmt(accepted.responded_at)}</a>
		{/if}
	</section>

	<CampaignDocs {r} />



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

		</aside>
	</div>
{/if}
