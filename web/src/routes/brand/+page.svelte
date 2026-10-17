<script lang="ts">
	import { auth } from '#lib/auth.svelte.ts';
	import { brandData } from '#lib/brand.svelte.ts';
	import { pub } from '#lib/publicPage.svelte.ts';
	import { STAGES, compact, delivText, firstName, fmt, inr, stageIndex } from '#lib/util.ts';
	import { milestones } from '#lib/campaign.ts';
	import { money } from '#lib/roi.ts';
	import BrandDetailsForm from '#lib/components/BrandDetailsForm.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { copyText } from '#lib/ui.svelte.ts';

	const acc = $derived(auth.account?.role === 'brand' ? auth.account : null);
	// Their own link for recommending her to other brands.
	let refCode = $state('');
	onMount(() => {
		supabase.rpc('my_ref_code').then(({ data }) => (refCode = (data as string | null) ?? ''));
	});
	const refLink = $derived(refCode ? `${location.origin}/?ref=${refCode}` : '');
	const creator = $derived(firstName(pub.data?.display_name ?? ''));
	// Finished collabs: a quick summary and one-tap repeats.
	const done = $derived(brandData.requests.filter((r) => r.stage === 'live' || r.stage === 'wrapped'));
	const spent = $derived(done.reduce((a, r) => a + (r.type === 'barter' ? 0 : r.fee), 0));
	const lastLive = $derived(done.map((r) => r.live_date).filter(Boolean).sort().at(-1) ?? null);
	// Results across every collab with her, and what it cost per view.
	const views = $derived(done.reduce((a, r) => a + (Number(r.results?.views) || 0), 0));
	const engaged = $derived(done.reduce((a, r) => a + (Number(r.results?.interactions) || 0), 0));
	const paidViews = $derived(done.filter((r) => r.type !== 'barter').reduce((a, r) => a + (Number(r.results?.views) || 0), 0));
	const cpv = $derived(spent && paidViews ? spent / paidViews : null);
	// Everything waiting on the brand, across requests.
	const todo = $derived(
		brandData.requests.flatMap((r) => milestones(r, creator || 'the creator').filter((m) => m.who === 'you').map((m) => ({ r, m })))
	);
	const toPay = $derived(
		brandData.requests.reduce((a, r) => a + (r.invoices ?? []).filter((i) => (i.status === 'sent' || i.status === 'partly_paid') && !i.claimed).reduce((x, i) => x + Number(i.payable), 0), 0)
	);
</script>

<svelte:head><title>My requests</title></svelte:head>

{#if acc && !acc.brand}
	<header class="ph rv">
		<div>
			<div class="eb">Welcome</div>
			<h1>Tell us about your <em>brand</em></h1>
			<p>We'll use this on every request you send{creator ? ` to ${creator}` : ''}.</p>
		</div>
	</header>
	<section class="panel rv" style="--i:1;padding:22px"><BrandDetailsForm submitLabel="Continue" /></section>
{:else if acc}
	<header class="ph rv">
		<div>
			<div class="eb">{acc.brand?.name}</div>
			<h1>Your <em>requests</em></h1>
			<p>Everything you've sent{creator ? ` to ${creator}` : ''}, and where each one stands.</p>
		</div>
		<div class="acts">{#if pub.data?.accepting !== false}<a class="btn grad" href="/brand/new"><Icon name="send" />New request</a>{/if}</div>
	</header>

	{#if brandData.error}<div class="err-box">{brandData.error}</div>{/if}

	{#if done.length}
		<section class="again rv" style="--i:1">
			<div class="again-stats">
				<div><b>{done.length}</b><small>collab{done.length === 1 ? '' : 's'} with {creator || 'the creator'}</small></div>
				{#if spent}<div><b>{inr(spent)}</b><small>invested</small></div>{/if}
				{#if views}<div><b>{compact(views)}</b><small>views</small></div>{/if}
				{#if engaged}<div><b>{compact(engaged)}</b><small>likes, comments, saves</small></div>{/if}
				{#if cpv}<div><b>{money(cpv)}</b><small>avg. cost per view</small></div>{/if}
				{#if lastLive}<div><b>{fmt(lastLive)}</b><small>last went live</small></div>{/if}
			</div>
			{#if pub.data?.accepting !== false}
				<div class="again-list">
					<span class="lbl-t">Book again</span>
					{#each done.slice(0, 3) as r (r.id)}
						<a class="again-chip" href="/brand/new?again={r.code}"><Icon name="refresh" /><span>{delivText(r.deliverables)}</span><small>{r.code}</small></a>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	{#if done.length && refLink}
		<section class="panel rv recommend" style="--i:2">
			<div class="rec-in">
				<span class="rec-ic"><Icon name="users" /></span>
				<div><b>Know a brand that would like {creator || 'this creator'}?</b><small>Share your link. They'll see your recommendation, and {creator || 'the creator'} will know it came from you.</small></div>
			</div>
			<div class="rec-acts">
				<button class="btn" onclick={() => copyText(refLink, 'Link copied')}><Icon name="copy" />Copy link</button>
				<a class="btn" href={`https://wa.me/?text=${encodeURIComponent(`Worth working with ${pub.data?.display_name ?? ''}: ${refLink}`)}`} target="_blank" rel="noopener"><Icon name="send" />WhatsApp</a>
			</div>
		</section>
	{/if}

	{#if todo.length || toPay}
		<section class="panel rv needs-you" style="--i:2">
			<div class="panel-h"><h2>Needs you</h2>{#if toPay}<small>{inr(toPay)} to pay</small>{/if}</div>
			{#each todo as t (t.r.code + t.m.key)}
				<a class="prod-row" href="/brand/r/{t.r.code}" style="text-decoration:none"><div><b>{t.m.title}</b><small>{t.r.code} · {delivText(t.r.deliverables)}{t.m.note ? ` · ${t.m.note}` : ''}</small></div><Icon name="chevR" /></a>
			{/each}
		</section>
	{/if}

	{#if !brandData.loaded}
		<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
	{:else if brandData.requests.length === 0}
		<div class="empty-card rv" style="--i:1">
			<h2>No requests yet</h2>
			<p>Send your first collaboration request. You'll be able to follow it here.</p>
			<a class="btn grad lg" href="/brand/new"><Icon name="send" />Send a request</a>
		</div>
	{:else}
		<div class="req-list">
			{#each brandData.requests as r, i (r.id)}
				{@const si = r.stage === 'declined' ? -1 : stageIndex(r.stage)}
				<a class="req" href="/brand/r/{r.code}" style="--i:{i}">
					<div class="req-top">
						<span class="id">{r.code}</span>
						<span class="chip tint st-{r.stage === 'declined' ? 'request' : r.stage}" style={r.stage === 'declined' ? '--hue:var(--bad)' : ''}>{r.stage_label}</span>
					</div>
					<b class="req-t">{delivText(r.deliverables)}</b>
					{#if brandData.unread[r.code] || r.quotes?.[0]?.status === 'sent' || r.drafts?.some((d) => d.status === 'pending')}
						<div class="req-flags">
							{#if r.quotes?.[0]?.status === 'sent' || r.drafts?.some((d) => d.status === 'pending')}<span class="pill tint k-new"><span class="dt pulse"></span>Needs your answer</span>{/if}
							{#if brandData.unread[r.code]}<span class="msg-dot"><Icon name="mail" />{brandData.unread[r.code]} new</span>{/if}
						</div>
					{/if}
					<div class="mini-steps" aria-hidden="true">{#each STAGES as _, k (k)}<i class:on={k <= si}></i>{/each}</div>
					{#if r.note_for_brand}<p>{r.note_for_brand}</p>{/if}
					<small>Sent {fmt(r.received_on)}{r.live_date ? ` · go-live ${fmt(r.live_date)}` : ''}</small>
				</a>
			{/each}
		</div>
	{/if}
{/if}
