<script lang="ts">
	import { onMount } from 'svelte';
	import { allRequests, loadAllRequests } from '#lib/brand.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { countUp } from '#lib/ui.svelte.ts';
	import { firstName, fmt, inr, inrS } from '#lib/util.ts';
	import type { BrandRow, Stage } from '#lib/types.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import BrandRowCard from '#lib/components/BrandRowCard.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Ticket from '#lib/components/Ticket.svelte';

	// Requests with every creator, in one place, laid out like the creator's own Collabs board: the
	// pipeline card, filters (what needs you, active, done, and each creator), then each request.
	onMount(loadAllRequests);
	const all = $derived(allRequests.list);
	const ACTIVE: Stage[] = ['request', 'negotiating', 'confirmed', 'creating', 'live'];
	const DONE: Stage[] = ['wrapped', 'declined', 'cancelled'];
	let show = $state<'needs' | 'active' | 'done'>('needs');
	let who = $state<number | null>(null);
	let q = $state('');
	const counts = $derived({
		needs: all.filter((r) => r.needs).length,
		active: all.filter((r) => ACTIVE.includes(r.stage) || r.stage === 'paused').length,
		done: all.filter((r) => DONE.includes(r.stage)).length
	});
	// Open on what needs you, or on everything active when nothing does.
	let picked = false;
	$effect(() => {
		if (!picked && allRequests.loaded) {
			picked = true;
			if (!counts.needs) show = 'active';
		}
	});
	const creators = $derived(
		[...new Map(all.map((r) => [r.creator.id, { ...r.creator, n: all.filter((x) => x.creator.id === r.creator.id).length }])).values()].sort((a, b) => b.n - a.n)
	);
	const words = $derived(q.trim().toLowerCase());
	const list = $derived(
		all
			.filter((r) => (show === 'needs' ? !!r.needs : show === 'active' ? ACTIVE.includes(r.stage) || r.stage === 'paused' : DONE.includes(r.stage)))
			.filter((r) => who === null || r.creator.id === who)
			.filter((r) => !words || `${r.code} ${r.creator.name} ${r.deliverables ?? ''} ${r.stage_label}`.toLowerCase().includes(words))
	);
	const activeList = $derived(all.filter((r) => ACTIVE.includes(r.stage)));
	const pipeValue = $derived(activeList.reduce((a, r) => a + (r.type === 'barter' ? 0 : r.fee), 0));
	const pipeStages = $derived(ACTIVE.map((id) => ({ id, n: activeList.filter((r) => r.stage === id).length })));
	const toPay = $derived(all.filter((r) => r.needs === 'pay').reduce((a, r) => a + (Number(r.invoice_amount) || 0), 0));
	const TILES: [Stage, string][] = [['request', 'Sent'], ['negotiating', 'In talks'], ['creating', 'Creating'], ['live', 'Live']];
	const at = (r: BrandRow, path: string) => (r.creator.slug === pageSlug ? path : addressFor(r.creator.slug, path));
	const task = (r: BrandRow) => (r.needs === 'quote' ? 'Review the quote' : r.needs === 'draft' ? 'Approve the draft' : r.needs === 'pay' ? 'Pay the invoice' : r.unread ? `${r.unread} new message${r.unread === 1 ? '' : 's'}` : r.stage_label);
	const status = (r: BrandRow) =>
		r.needs === 'draft' && r.live_date ? `Goes live ${fmt(r.live_date)}` : r.needs === 'pay' && r.invoice_due ? `Due ${fmt(r.invoice_due)}` : r.needs ? 'Waiting on you' : r.live_date ? `Live ${fmt(r.live_date)}` : `Sent ${fmt(r.received_on)}`;
</script>

<svelte:head><title>Requests · Miracle</title></svelte:head>

{#snippet creatorChips()}
	{#each creators as c (c.id)}
		<button role="tab" aria-selected={who === c.id} class:on={who === c.id} class="br-cr" onclick={() => (who = who === c.id ? null : c.id)}><Avatar name={c.name} src={c.photo} size="24px" />{firstName(c.name)}<span>{c.n}</span></button>
	{/each}
{/snippet}

<header class="ph rv">
	<div>
		<div class="eb">Pipeline · all creators</div>
		<h1>Your <em>requests</em></h1>
		<p>{counts.active} active with {creators.length} creator{creators.length === 1 ? '' : 's'}, {counts.needs} waiting for your answer{toPay ? ` · ${inr(toPay)} to pay` : ''}.</p>
	</div>
</header>
{#if allRequests.error}<div class="err-box">{allRequests.error}</div>{/if}

{#if !allRequests.loaded}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else if !all.length}
	<div class="clear hero-card glow m-none">
		<div class="mesh" aria-hidden="true"></div>
		<span class="clear-ic"><Icon name="send" /></span>
		<b>No requests yet</b>
		<small>Find a creator and send your first request. Everything you send, to any creator, shows up here.</small>
		<div class="clear-acts"><a class="glass-chip" href="/brand/creators?tab=discover"><Icon name="search" />Find creators</a><a class="glass-chip" href="/brand/campaigns"><Icon name="send" />Start a campaign</a></div>
	</div>
{:else}
	{#if phone.on}
		<section class="hero-card glow m-hero m-pipe" aria-label="Your pipeline">
			<div class="mesh" aria-hidden="true"></div>
			<div class="hc-in">
				<div class="hc-top">
					<span class="hc-eb">With every creator</span>
					{#if counts.needs}<button class="glass-chip" onclick={() => (show = 'needs')}><Icon name="inbox" />{counts.needs} waiting for you</button>{/if}
				</div>
				<div class="hc-val" use:countUp={{ value: pipeValue, money: true }}>{inr(pipeValue)}</div>
				<div class="hc-sub">in {activeList.length} active request{activeList.length === 1 ? '' : 's'} with {creators.length} creator{creators.length === 1 ? '' : 's'}</div>
				{#if activeList.length}<div class="pipe-bar" aria-hidden="true">{#each pipeStages as st (st.id)}{#if st.n}<i class="st-{st.id}" style="flex:{st.n}"></i>{/if}{/each}</div>{/if}
			</div>
		</section>
	{:else}
		<section class="cb-hero rv" aria-label="Your pipeline">
			<div class="mesh" aria-hidden="true"></div>
			<div class="cb-main">
				<span class="bx-eb">With every creator</span>
				<b class="cb-val num" use:countUp={{ value: pipeValue, money: true }}>{inr(pipeValue)}</b>
				<span class="cb-sub">in {activeList.length} active request{activeList.length === 1 ? '' : 's'} · {counts.needs} waiting for your answer</span>
				{#if activeList.length}<div class="cb-bar" aria-hidden="true">{#each pipeStages as st (st.id)}{#if st.n}<i class="st-{st.id}" style="flex:{st.n}"></i>{/if}{/each}</div>{/if}
			</div>
			<div class="cb-tiles">
				{#each TILES as [id, label] (id)}
					<div class="cb-tile st-{id}"><small><span class="dt"></span>{label}</small><b class="num">{activeList.filter((r) => r.stage === id).length}</b><span class="num">{inrS(activeList.filter((r) => r.stage === id).reduce((a, r) => a + r.fee, 0)) || '—'}</span></div>
				{/each}
			</div>
		</section>
		<div class="toolbar rv" style="--i:1">
			<label class="search"><Icon name="search" /><span class="sr">Search requests</span><input type="search" placeholder="Search creator, code or content" bind:value={q} autocomplete="off" /></label>
		</div>
	{/if}

	<div class="m-stages" role="tablist" aria-label="Show">
		{#each [['needs', 'Needs you', 'var(--bad)'], ['active', 'Active', 'var(--accent)'], ['done', 'Done', 'var(--ok)']] as const as [k, label, hue] (k)}
			<button role="tab" aria-selected={show === k} class:on={show === k} onclick={() => (show = k)}><i class="dt" style="--hue:{hue}"></i>{label}<span>{counts[k]}</span></button>
		{/each}
		{#if !phone.on}{@render creatorChips()}{/if}
	</div>
	{#if phone.on}<div class="m-stages" role="tablist" aria-label="Creators">{@render creatorChips()}</div>{/if}

	{#if phone.on}
		<div class="m-list m-wallet">
			{#each list as r, i (r.id)}<BrandRowCard {r} {i} />{/each}
		</div>
	{:else}
		<div class="tks m-plist">
			{#each list as r, i (r.id)}
				<Ticket
					name={r.creator.name}
					sub={`${r.code} · ${r.deliverables || 'Details to fill'}`}
					money={r.needs === 'quote' && r.quote_total ? inrS(r.quote_total) : r.needs === 'pay' && r.invoice_amount ? inrS(r.invoice_amount) : r.fee ? inrS(r.fee) : r.product_value ? inrS(r.product_value) : ''}
					moneySub={r.needs === 'quote' ? 'quote' : r.needs === 'pay' ? 'to pay' : r.stage_label}
					task={task(r)}
					status={status(r)}
					tone={r.needs ? 'hot' : r.unread ? 'warn' : DONE.includes(r.stage) ? 'calm' : 'ok'}
					href={at(r, `/brand/r/${r.code}`)}
					{i}
				>
					{#if r.needs === 'pay'}<a class="btn primary" href="/brand/business/money">Pay</a>
					{:else}<a class="btn {r.needs ? 'grad' : ''}" href={at(r, `/brand/r/${r.code}`)}>{r.needs === 'quote' ? 'Review' : r.needs === 'draft' ? 'Approve' : 'Open'}</a>{/if}
				</Ticket>
			{/each}
		</div>
	{/if}
	{#if !list.length}
		<div class="clear hero-card glow m-none">
			<div class="mesh" aria-hidden="true"></div>
			<span class="clear-ic"><Icon name={show === 'needs' ? 'check' : 'board'} /></span>
			<b>{show === 'needs' ? "You're all caught up" : q ? 'No matches' : 'Nothing here'}</b>
			<small>{show === 'needs' ? 'Quotes, drafts and invoices that need you show up here.' : 'Requests show up here as they move along.'}</small>
			{#if show === 'needs'}<div class="clear-acts"><button class="glass-chip" onclick={() => (show = 'active')}><Icon name="board" />See active</button></div>{/if}
		</div>
	{/if}
{/if}

<style>
	.br-cr {
		gap: 8px;
	}
</style>
