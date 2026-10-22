<script lang="ts">
	import { auth } from '#lib/auth.svelte.ts';
	import { brandData } from '#lib/brand.svelte.ts';
	import { pub } from '#lib/publicPage.svelte.ts';
	import { STAGES, HELD_STAGES, delivText, firstName, fmt, inr, inrS, stageIndex } from '#lib/util.ts';
	import { milestones } from '#lib/campaign.ts';
	import CompanyStep from '#lib/components/CompanyStep.svelte';
	import BrandRequestRow from '#lib/components/BrandRequestRow.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Ticket from '#lib/components/Ticket.svelte';
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { copyText, countUp } from '#lib/ui.svelte.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { rollHints } from '#lib/lively.ts';
	import type { BrandRequest, Stage } from '#lib/types.ts';

	// A brand's requests to this creator, laid out like the creator's own Collabs board: the pipeline
	// card, stage chips, then each request (wallet cards on a phone, tickets on a laptop).
	const acc = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const creator = $derived(firstName(pub.data?.display_name ?? ''));
	const all = $derived(brandData.requests);
	// Their own link for recommending the creator to other brands.
	let refCode = $state('');
	onMount(() => {
		supabase.rpc('my_ref_code').then(({ data }) => (refCode = (data as string | null) ?? ''));
	});
	const refLink = $derived(refCode ? `${location.origin}/?ref=${refCode}` : '');

	const ACTIVE: Stage[] = ['request', 'negotiating', 'confirmed', 'creating', 'live'];
	let q = $state('');
	let stage = $state<'active' | Stage>('active');
	const mineTodo = (r: BrandRequest) => milestones(r, creator || 'the creator').some((m) => m.who === 'you');
	const found = $derived(q.trim() ? all.filter((r) => `${r.code} ${delivText(r.deliverables)} ${r.stage_label} ${r.brief}`.toLowerCase().includes(q.trim().toLowerCase())) : all);
	const activeList = $derived(found.filter((r) => ACTIVE.includes(r.stage)));
	const pipeValue = $derived(activeList.reduce((a, r) => a + (r.type === 'barter' ? 0 : Number(r.fee) || 0), 0));
	const pipeProducts = $derived(activeList.reduce((a, r) => a + (r.type === 'paid' ? 0 : Number(r.product_value) || 0), 0));
	const waiting = $derived(found.filter(mineTodo).length);
	const pipeStages = $derived(ACTIVE.map((id) => ({ id, n: activeList.filter((r) => r.stage === id).length })));
	const PIPE_TILES: [Stage, string][] = [['request', 'Sent'], ['negotiating', 'In talks'], ['live', 'Live']];
	const ALL_STAGES = [...STAGES, ...HELD_STAGES, { id: 'declined' as Stage, label: 'Declined' }];
	const tabs = $derived(
		[{ id: 'active' as const, label: 'Active', n: activeList.length }, ...ALL_STAGES.map((s) => ({ id: s.id, label: s.label, n: found.filter((r) => r.stage === s.id).length }))].filter(
			(t) => t.id === 'active' || t.n || t.id === stage
		)
	);
	const groups = $derived(
		ALL_STAGES.map((s) => ({ s, rs: found.filter((r) => r.stage === s.id) }))
			.map((g) => ({ ...g, sum: g.rs.reduce((a, r) => a + r.fee + r.product_value, 0) }))
			.filter((g) => g.rs.length && (stage === 'active' ? ACTIVE.includes(g.s.id) : g.s.id === stage))
	);
	const shown = $derived(groups.flatMap((g) => g.rs));
	const toPay = $derived(
		all.reduce((a, r) => a + (r.invoices ?? []).filter((i) => (i.status === 'sent' || i.status === 'partly_paid') && !i.claimed).reduce((x, i) => x + Number(i.payable), 0), 0)
	);
	// Finished collabs, to book again in one tap.
	const done = $derived(all.filter((r) => r.stage === 'live' || r.stage === 'wrapped'));
	const STAGE_HUE: Record<string, string> = { request: 'var(--h-request)', negotiating: 'var(--h-nego)', confirmed: 'var(--h-confirmed)', creating: 'var(--h-creating)', live: 'var(--h-live)', wrapped: 'var(--h-wrapped)', declined: 'var(--bad)' };
	const nextOf = (r: BrandRequest) => milestones(r, creator || 'the creator').find((m) => m.who !== 'done');
</script>

<svelte:head><title>Requests · Miracle</title></svelte:head>

{#if acc && !acc.brand}
	<header class="ph rv">
		<div>
			<div class="eb">Welcome</div>
			<h1>Your <em>brand</em></h1>
			<p>We'll use this on every request you send{creator ? ` to ${creator}` : ''}.</p>
		</div>
	</header>
	<CompanyStep {creator} />
{:else if acc}
	<header class="ph rv">
		<div>
			<div class="eb">{creator ? `With ${creator}` : 'Pipeline'}</div>
			<h1>Your <em>requests</em></h1>
			<p>{activeList.length} active, {waiting} waiting for your answer{toPay ? ` · ${inr(toPay)} to pay` : ''}.</p>
		</div>
	</header>
	{#if brandData.error}<div class="err-box">{brandData.error}</div>{/if}

	{#if !brandData.loaded}
		<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
	{:else if !all.length}
		<div class="clear hero-card glow m-none">
			<div class="mesh" aria-hidden="true"></div>
			<span class="clear-ic"><Icon name="send" /></span>
			<b>No requests yet</b>
			<small>Send {creator || 'this creator'} your first request. You'll follow it here, step by step.</small>
			{#if pub.data?.accepting !== false}<div class="clear-acts"><a class="glass-chip" href="/brand/new"><Icon name="plus" />New request</a></div>{/if}
		</div>
	{:else}
		{#if phone.on}
			<section class="hero-card glow m-hero m-pipe" aria-label="Your pipeline">
				<div class="mesh" aria-hidden="true"></div>
				<div class="hc-in">
					<div class="hc-top">
						<span class="hc-eb">With {creator || 'this creator'}</span>
						{#if waiting}<span class="glass-chip"><Icon name="inbox" />{waiting} waiting for you</span>{/if}
					</div>
					<div class="hc-val" use:countUp={{ value: pipeValue, money: true }}>{inr(pipeValue)}</div>
					<div class="hc-sub">in {activeList.length} active request{activeList.length === 1 ? '' : 's'}{pipeProducts ? ` · + ${inrS(pipeProducts)} in products` : ''}</div>
					{#if activeList.length}
						<div class="pipe-bar" aria-hidden="true">{#each pipeStages as st (st.id)}{#if st.n}<i class="st-{st.id}" style="flex:{st.n}"></i>{/if}{/each}</div>
					{/if}
					<div class="hc-foot">
						{#each PIPE_TILES as [id, label] (id)}
							<button class:on={stage === id} onclick={() => (stage = stage === id ? 'active' : id)}><small><span class="dt st-{id}"></span>{label}</small><b>{found.filter((r) => r.stage === id).length}</b></button>
						{/each}
					</div>
				</div>
			</section>
			<label class="search m-search" use:rollHints={all.slice(0, 6).map((r) => r.code)}><Icon name="search" /><span class="sr">Search requests</span><input type="search" placeholder="Search code, content or stage" bind:value={q} autocomplete="off" /></label>
		{:else}
			<section class="cb-hero rv" aria-label="Your pipeline">
				<div class="mesh" aria-hidden="true"></div>
				<div class="cb-main">
					<span class="bx-eb">With {creator || 'this creator'}</span>
					<b class="cb-val num" use:countUp={{ value: pipeValue, money: true }}>{inr(pipeValue)}</b>
					<span class="cb-sub">in {activeList.length} active request{activeList.length === 1 ? '' : 's'}{pipeProducts ? ` · + ${inrS(pipeProducts)} in products` : ''}{waiting ? ` · ${waiting} waiting for your answer` : ''}</span>
					{#if activeList.length}<div class="cb-bar" aria-hidden="true">{#each pipeStages as st (st.id)}{#if st.n}<i class="st-{st.id}" style="flex:{st.n}"></i>{/if}{/each}</div>{/if}
				</div>
				<div class="cb-tiles">
					{#each pipeStages as st (st.id)}
						<button class="cb-tile st-{st.id}" class:on={stage === st.id} onclick={() => (stage = stage === st.id ? 'active' : st.id)}>
							<small><span class="dt"></span>{STAGES.find((x) => x.id === st.id)?.label}</small>
							<b class="num">{st.n}</b>
							<span class="num">{inrS(activeList.filter((r) => r.stage === st.id).reduce((a, r) => a + r.fee, 0)) || '—'}</span>
						</button>
					{/each}
				</div>
			</section>
			<div class="toolbar rv" style="--i:1">
				<label class="search"><Icon name="search" /><span class="sr">Search requests</span><input type="search" placeholder="Search code, content or stage" bind:value={q} autocomplete="off" /></label>
			</div>
		{/if}

		<div class="m-stages" role="tablist" aria-label="Stage">
			{#each tabs as t (t.id)}
				<button role="tab" aria-selected={stage === t.id} class:on={stage === t.id} class="st-{t.id}" onclick={() => (stage = t.id)}><i class="dt"></i>{t.label}<span>{t.n}</span></button>
			{/each}
		</div>

		{#if phone.on}
			{#each groups as g (g.s.id)}
				<section class="m-group st-{g.s.id}">
					<header class="m-gh"><span class="dt"></span><h2>{g.s.label}</h2><span class="m-gn">{g.rs.length}</span>{#if g.sum}<small>{inrS(g.sum)}</small>{/if}</header>
					<div class="m-list m-wallet">
						{#each g.rs as r, i (r.id)}<BrandRequestRow {r} {creator} unread={brandData.unread[r.code] ?? 0} {i} />{/each}
					</div>
				</section>
			{:else}
				<div class="clear hero-card glow m-none">
					<div class="mesh" aria-hidden="true"></div>
					<span class="clear-ic"><Icon name={q ? 'search' : 'board'} /></span>
					<b>{q ? 'No matches' : 'Nothing at this stage'}</b>
					<small>{q ? 'Try another code or word.' : 'Requests show up here as they move along.'}</small>
					<div class="clear-acts">{#if q}<button class="glass-chip" onclick={() => (q = '')}><Icon name="x" />Clear search</button>{:else}<button class="glass-chip" onclick={() => (stage = 'active')}><Icon name="board" />All active</button>{/if}</div>
				</div>
			{/each}
		{:else}
			<!-- Laptop: each request a ticket, its band in the colour of where it stands. -->
			<div class="tks m-plist">
				{#each shown as r, i (r.id)}
					{@const n = nextOf(r)}
					{@const ask = n?.who === 'you'}
					<Ticket
						name={r.code}
						title={delivText(r.deliverables) || 'New request'}
						sub={r.code}
						money={r.fee ? inrS(r.fee) : r.product_value ? inrS(r.product_value) : ''}
						moneySub={r.stage_label}
						hue={STAGE_HUE[r.stage] ?? ''}
						mark={r.stage === 'declined' ? '×' : String(stageIndex(r.stage) + 1)}
						task={ask ? n!.title : brandData.unread[r.code] ? `${brandData.unread[r.code]} new message${brandData.unread[r.code] === 1 ? '' : 's'}` : n ? `${creator || 'Creator'}: ${n.title}` : `Sent ${fmt(r.received_on)}`}
						status={r.live_date ? `Go-live ${fmt(r.live_date)}` : r.stage_label}
						tone={ask ? 'hot' : r.stage === 'declined' ? 'calm' : r.stage === 'wrapped' ? 'ok' : 'warn'}
						href="/brand/r/{r.code}"
						{i}
					>
						<a class={ask ? 'btn primary' : 'btn'} href="/brand/r/{r.code}">{ask ? 'Answer' : 'Open'}</a>
					</Ticket>
				{:else}
					<div class="clear hero-card glow m-none">
						<div class="mesh" aria-hidden="true"></div>
						<span class="clear-ic"><Icon name="board" /></span>
						<b>{q ? 'No matches' : 'Nothing at this stage'}</b>
						<small>Requests show up here as they move along.</small>
					</div>
				{/each}
			</div>
		{/if}

		{#if done.length && pub.data?.accepting !== false}
			<section class="hs">
				<header class="hs-h"><h2>Book again</h2><span class="m-gn">{done.length}</span></header>
				<div class="tks">
					{#each done.slice(0, 3) as r, i (r.id)}
						<Ticket name={r.code} title={delivText(r.deliverables) || 'Collab'} sub={r.code} money={r.fee ? inrS(r.fee) : ''} moneySub={r.fee ? 'last time' : ''} hue="var(--h-wrapped)" mark="↻" task={r.live_date ? `Went live ${fmt(r.live_date)}` : 'Done'} status="Same brief, one tap" tone="ok" href="/brand/new?again={r.code}" {i}>
							<a class="btn primary" href="/brand/new?again={r.code}">Book again</a>
						</Ticket>
					{/each}
				</div>
			</section>
		{/if}
		{#if done.length && refLink}
			<div class="clear hero-card glow">
				<div class="mesh" aria-hidden="true"></div>
				<span class="clear-ic"><Icon name="users" /></span>
				<b>Know a brand that would like {creator || 'this creator'}?</b>
				<small>Share your link. They'll see your recommendation, and {creator || 'the creator'} will know it came from you.</small>
				<div class="clear-acts">
					<button class="glass-chip" onclick={() => copyText(refLink, 'Link copied')}><Icon name="copy" />Copy link</button>
					<a class="glass-chip" href={`https://wa.me/?text=${encodeURIComponent(`Worth working with ${pub.data?.display_name ?? ''}: ${refLink}`)}`} target="_blank" rel="noopener"><Icon name="send" />WhatsApp</a>
				</div>
			</div>
		{/if}
	{/if}
{/if}
