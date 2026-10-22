<script lang="ts">
	import { auth } from '#lib/auth.svelte.ts';
	import { brandData } from '#lib/brand.svelte.ts';
	import { pub } from '#lib/publicPage.svelte.ts';
	import { STAGES, compact, delivText, firstName, fmt, inr, inrS, stageIndex } from '#lib/util.ts';
	import { milestones } from '#lib/campaign.ts';
	import { money } from '#lib/roi.ts';
	import CompanyStep from '#lib/components/CompanyStep.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { copyText } from '#lib/ui.svelte.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import BrandRequestCard from '#lib/components/BrandRequestCard.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import Ticket from '#lib/components/Ticket.svelte';

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
	// Laptop: filter the list.
	let show = $state<'all' | 'active' | 'done' | 'declined' | 'paused' | 'cancelled'>('all');
	const groups = $derived({
		all: brandData.requests,
		active: brandData.requests.filter((r) => !['declined', 'wrapped', 'paused', 'cancelled'].includes(r.stage) && !(r.stage === 'live' && r.deliverables.every((d) => d.done) && (r.type === 'barter' || r.pay_status === 'paid'))),
		// Completed: wrapped, or live with nothing left to settle.
		done: brandData.requests.filter((r) => r.stage === 'wrapped' || (r.stage === 'live' && r.deliverables.every((d) => d.done) && (r.type === 'barter' || r.pay_status === 'paid'))),
		paused: brandData.requests.filter((r) => r.stage === 'paused'),
		cancelled: brandData.requests.filter((r) => r.stage === 'cancelled'),
		declined: brandData.requests.filter((r) => r.stage === 'declined')
	});
	const ig = $derived(pub.data?.instagram ?? null);
	const toPay = $derived(
		brandData.requests.reduce((a, r) => a + (r.invoices ?? []).filter((i) => (i.status === 'sent' || i.status === 'partly_paid') && !i.claimed).reduce((x, i) => x + Number(i.payable), 0), 0)
	);
	// Phone: each request a ticket, its band in the colour of where it stands.
	const STAGE_HUE: Record<string, string> = { request: 'var(--h-request)', negotiating: 'var(--h-nego)', confirmed: 'var(--h-confirmed)', creating: 'var(--h-creating)', live: 'var(--h-live)', wrapped: 'var(--h-wrapped)', declined: 'var(--bad)' };
	const needsAnswer = (r: (typeof brandData.requests)[number]) => !['paused', 'cancelled'].includes(r.stage) && (r.quotes?.[0]?.status === 'sent' || !!r.drafts?.some((d) => d.status === 'pending'));
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
	<CompanyStep {creator} />
{:else if acc}
	<header class="ph rv rq-head">
		<div>
			<div class="eb">{acc.brand?.name}</div>
			<h1>Your <em>requests</em></h1>
			<p>Everything you've sent{creator ? ` to ${creator}` : ''}, and where each one stands.</p>
		</div>
		<div class="acts">{#if pub.data?.accepting !== false}<a class="btn grad" href="/brand/new"><Icon name="send" />New request</a>{/if}</div>
	</header>

	{#if brandData.error}<div class="err-box">{brandData.error}</div>{/if}

	<div class="bd-grid"><div class="bd-main">

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
			{#if phone.on}
				<div class="tks">
					{#each todo as t, i (t.r.code + t.m.key)}
						<Ticket name={t.r.code} title={delivText(t.r.deliverables)} sub={`${t.r.code} · ${t.r.stage_label}`} money={t.r.fee ? inrS(t.r.fee) : ''} moneySub={t.r.fee ? 'fee' : ''} hue={STAGE_HUE[t.r.stage] ?? ''} mark={String(stageIndex(t.r.stage) + 1)} task={t.m.title} status={t.m.note || 'Waiting on you'} tone="hot" href="/brand/r/{t.r.code}" {i}>
							<a class="btn primary" href="/brand/r/{t.r.code}">Open</a>
						</Ticket>
					{/each}
				</div>
			{:else}
			{#each todo as t (t.r.code + t.m.key)}
				<a class="prod-row" href="/brand/r/{t.r.code}" style="text-decoration:none"><div><b>{t.m.title}</b><small>{t.r.code} · {delivText(t.r.deliverables)}{t.m.note ? ` · ${t.m.note}` : ''}</small></div><Icon name="chevR" /></a>
			{/each}
			{/if}
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
	{:else if !phone.on}
		<div class="brq-tabs" role="tablist">
			{#each [['all', 'All'], ['active', 'Active'], ['done', 'Completed'], ['paused', 'Paused'], ['cancelled', 'Cancelled'], ['declined', 'Not going ahead']] as [k, label] (k)}
				{#if k === 'all' || groups[k as 'active'].length}
					<button role="tab" aria-selected={show === k} class:on={show === k} onclick={() => (show = k as typeof show)}>{label}<span>{groups[k as 'all'].length}</span></button>
				{/if}
			{/each}
		</div>
		<div class="brq-list">
			{#each groups[show] as r (r.id)}
				<BrandRequestCard {r} {creator} unread={brandData.unread[r.code] ?? 0} />
			{:else}
				<p class="hint">Nothing here.</p>
			{/each}
		</div>
	{:else}
		<div class="hs-h br-h"><h2>Your requests</h2><span class="hs-n">{brandData.requests.length}</span></div>
		<div class="tks">
			{#each brandData.requests as r, i (r.id)}
				{@const ask = needsAnswer(r)}
				<Ticket
					name={r.code}
					title={delivText(r.deliverables)}
					sub={r.code}
					money={r.fee ? inrS(r.fee) : r.product_value ? inrS(r.product_value) : ''}
					moneySub={r.stage_label}
					hue={STAGE_HUE[r.stage] ?? ''}
					mark={r.stage === 'declined' ? '×' : String(stageIndex(r.stage) + 1)}
					task={ask ? 'Needs your answer' : brandData.unread[r.code] ? `${brandData.unread[r.code]} new message${brandData.unread[r.code] === 1 ? '' : 's'}` : r.note_for_brand || `Sent ${fmt(r.received_on)}`}
					status={r.live_date ? `Go-live ${fmt(r.live_date)}` : r.stage_label}
					tone={ask ? 'hot' : r.stage === 'declined' ? 'calm' : r.stage === 'wrapped' ? 'ok' : 'warn'}
					href="/brand/r/{r.code}"
					{i}
				>
					<a class={ask ? 'btn primary' : 'btn'} href="/brand/r/{r.code}">{ask ? 'Answer' : 'Open'}</a>
				</Ticket>
			{/each}
		</div>
	{/if}
	</div>
	<aside class="bd-side">
		<section class="bd-creator">
			<div class="bdc-head">
				{#if ig?.profile_picture_url}<img src={ig.profile_picture_url} alt="" referrerpolicy="no-referrer" />{:else}<Mono name={pub.data?.display_name ?? 'C'} />{/if}
				<div><b>{pub.data?.display_name ?? ''}</b><small>@{pub.data?.handle ?? ''}{pub.data?.city ? ` · ${pub.data.city}` : ''}</small></div>
			</div>
			{#if pub.data?.niche}<p class="bdc-niche">{pub.data.niche}</p>{/if}
			<div class="bdc-stats">
				<div><b>{ig?.followers ? compact(ig.followers) : pub.data?.followers || '—'}</b><small>followers</small></div>
				<div><b>{ig?.engagement_rate ? `${ig.engagement_rate}%` : pub.data?.engagement || '—'}</b><small>engagement</small></div>
				<div><b>{ig?.avg_views ? compact(ig.avg_views) : '—'}</b><small>avg. views</small></div>
			</div>
			<p class="bdc-reply"><span class="dt" style="--hue:var(--ok)"></span>Usually replies within {pub.data?.reply_time ?? 'a few days'}</p>
			{#if pub.data?.accepting !== false}<a class="btn grad bdc-cta" href="/brand/new"><Icon name="send" />New request</a>{/if}
			<a class="btn bdc-cta" href="/insights"><Icon name="chart" />See audience insights</a>
		</section>
	</aside>
	</div>
{/if}
