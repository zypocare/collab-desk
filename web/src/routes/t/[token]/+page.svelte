<script lang="ts">
	import DeliverableProgress from '#lib/components/DeliverableProgress.svelte';
	import { page } from '$app/state';
	import { money } from '#lib/currency.ts';
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { loadPublicPage, pub } from '#lib/publicPage.svelte.ts';
	import type { BrandRequest } from '#lib/types.ts';
	import { TYPE_LABEL, delivText, firstName, fmt, fmtLong, inr, usageLabel } from '#lib/util.ts';
	import CampaignTimeline from '#lib/components/CampaignTimeline.svelte';
	import BrandTopbar from '#lib/components/BrandTopbar.svelte';
	import Icon from '#lib/components/Icon.svelte';

	// A brand's private tracking link for a collab she added herself: no sign-in to see where it stands.
	type Track = BrandRequest & { brand: string; contact_email: string };
	let r = $state<Track | null>(null);
	let loaded = $state(false);
	onMount(async () => {
		if (!pub.data) loadPublicPage();
		const { data } = await supabase.rpc('public_track', { p_token: page.params.token });
		r = (data as Track | null) ?? null;
		loaded = true;
	});
	const creator = $derived(firstName(pub.data?.display_name ?? ''));
	const held = $derived(r?.stage === 'paused' || r?.stage === 'cancelled');
	const openQuote = $derived(!held ? r?.quotes?.find((q) => q.status === 'sent') : undefined);
	const pendingDraft = $derived(!held ? r?.drafts?.find((d) => d.status === 'pending') : undefined);
	const unpaid = $derived((r?.invoices ?? []).filter((i) => (i.status === 'sent' || i.status === 'partly_paid') && !i.claimed));
	const signIn = $derived(r ? `/login?next=${encodeURIComponent(`/brand/r/${r.code}`)}${r.contact_email ? `&email=${encodeURIComponent(r.contact_email)}` : ''}` : '/login');
</script>

<svelte:head><title>{r ? `${r.code} · ${r.brand}` : 'Your collab'}</title><meta name="robots" content="noindex" /></svelte:head>

<BrandTopbar />

<div class="page"><div class="wrap">
	{#if !loaded}
		<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
	{:else if !r}
		<div class="empty-card"><h2>This link isn't valid</h2><p>Check that you copied the whole link, or ask {creator || 'the creator'} for a new one.</p></div>
	{:else}
		<header class="ph rv">
			<div>
				<div class="eb">{r.brand} × {pub.data?.display_name ?? ''} · <span class="id">{r.code}</span></div>
				<h1>{delivText(r.deliverables)}</h1>
				<p>{TYPE_LABEL[r.type]}{r.fee && r.type !== 'barter' ? ` · ${inr(r.fee)}` : ''}{r.type !== 'paid' && r.product ? ` · ${r.product}` : ''}</p>
			</div>
			<div class="acts"><span class="chip tint st-{r.stage}">{r.stage_label}</span></div>
		</header>

		{#if held}<div class="warn-box" role="status"><b>{r.stage_label}</b><span>{r.lifecycle_reason}</span>{#if r.resume_on}<span>Review on {fmt(r.resume_on)}.</span>{/if}</div>{/if}
		<DeliverableProgress deliverables={r.deliverables} />
		{#if openQuote || pendingDraft || unpaid.length}
			<section class="panel rv trk-act" style="--i:1">
				<div class="panel-h"><h2>Needs you</h2></div>
				<div class="trk-act-b">
					<ul>
						{#if openQuote}<li>Accept the quote of <b>{money(openQuote.total, openQuote.currency)}</b></li>{/if}
						{#if pendingDraft}<li>Review draft {pendingDraft.round}</li>{/if}
						{#each unpaid as i (i.token)}<li>Pay invoice {i.number} (<b>{money(Number(i.payable), i.currency)}</b>{i.due_date ? `, due ${fmt(i.due_date)}` : ''}) · <a class="lnk" href="/invoice/{i.token}">open the invoice</a></li>{/each}
					</ul>
					{#if openQuote || pendingDraft}
						<a class="btn grad" href={signIn}><Icon name="check" />Sign in to answer</a>
						<p class="hint">Use {r.contact_email || 'your work email'}. You get a 6-digit code, no password.</p>
					{/if}
				</div>
			</section>
		{/if}

		<div class="r-grid">
			<div class="r-main">
				{#if r.note_for_brand}
					<section class="panel rv" style="--i:2;padding:20px"><blockquote class="note" style="margin:0"><span>Latest from {creator}</span><p>{r.note_for_brand}</p></blockquote></section>
				{/if}
				<section class="panel rv" style="--i:3;padding:20px;margin-top:18px">
					<dl class="facts">
						<div><dt>Content</dt><dd>{r.deliverables.map((d) => `${d.qty} × ${d.kind}${d.done ? ' ✓' : ''}`).join(', ')}</dd></div>
						<div><dt>Go-live</dt><dd>{r.live_date ? fmtLong(r.live_date) : r.preferred_live ? `Planned around ${fmt(r.preferred_live)}` : 'To be agreed'}</dd></div>
						<div><dt>Usage</dt><dd>{usageLabel(r.usage)}</dd></div>
					</dl>
				</section>
				{#if r.report_token}
					<a class="panel rv prod-row" href="/report/{r.report_token}" style="--i:4;margin-top:18px;text-decoration:none"><div><b>Results report</b><small>Views, reach and cost per view, from Instagram</small></div><Icon name="chart" /></a>
				{/if}
				{#if r.events.length}
					<section class="panel rv" style="--i:5;margin-top:18px">
						<div class="panel-h"><h2>Updates</h2></div>
						{#each r.events as e, i (i)}
							<div class="prod-row"><div><b>{e.text}</b><small>{fmt(e.at.slice(0, 10))}</small></div></div>
						{/each}
					</section>
				{/if}
			</div>
			<aside class="r-side">
				<CampaignTimeline {r} {creator} />
				<section class="panel rv trk-sign" style="--i:4">
					<b>See everything and act on it</b>
					<small>Sign in with {r.contact_email || 'your work email'} to message {creator}, accept quotes, approve drafts and download files.</small>
					<a class="btn" href={signIn}><Icon name="arrow" />Sign in</a>
				</section>
			</aside>
		</div>
	{/if}
</div></div>
