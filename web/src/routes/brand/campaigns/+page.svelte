<script lang="ts">
	import { onMount } from 'svelte';
	import { campaigns, loadCampaigns } from '#lib/campaigns.svelte.ts';
	import { countUp, toast } from '#lib/ui.svelte.ts';
	import { delivText, errMessage, fmt, inr, inrS, todayIso } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Ticket from '#lib/components/Ticket.svelte';

	// Campaigns, laid out like the creator's money screens: one glowing card with the totals, filter
	// chips, then each campaign as a ticket. One brief to many creators, each a request of their own.
	onMount(() => {
		loadCampaigns().catch((e) => toast(errMessage(e), 'alert'));
	});
	type C = (typeof campaigns.list)[number];
	let show = $state<'all' | 'waiting' | 'open' | 'sent' | 'draft'>('all');
	let fan = $state(false);
	// Open brief: listed creators can still apply to it.
	const isOpen = (c: C) => !!c.open && (!c.open_until || c.open_until >= todayIso());
	const pick = (c: C, k: typeof show) => (k === 'all' ? true : k === 'waiting' ? c.waiting > 0 : k === 'open' ? isOpen(c) : k === 'draft' ? c.status === 'draft' : c.status !== 'draft');
	const list = $derived(campaigns.list.filter((c) => pick(c, show)));
	const counts = $derived(Object.fromEntries((['all', 'waiting', 'open', 'sent', 'draft'] as const).map((k) => [k, campaigns.list.filter((c) => pick(c, k)).length])) as Record<typeof show, number>);
	const HUE = { waiting: 'var(--bad)', open: 'var(--g2)', sent: 'var(--ok)', draft: 'var(--warn,#e0a23a)' } as const;
	const newApps = $derived(campaigns.list.reduce((a, c) => a + (c.new_applications || 0), 0));
	const apps = (n: number) => `${n} application${n === 1 ? '' : 's'}`;
	const budget = $derived(campaigns.list.filter((c) => c.status !== 'draft').reduce((a, c) => a + (c.budget_total || 0), 0));
	const creators = $derived(campaigns.list.reduce((a, c) => a + (c.creators || 0), 0));
	const agreed = $derived(campaigns.list.reduce((a, c) => a + (c.agreed || 0), 0));
	const waiting = $derived(campaigns.list.reduce((a, c) => a + (c.waiting || 0), 0));
	const href = (c: C) => (c.status === 'draft' ? `/brand/campaigns/new?id=${c.id}` : `/brand/campaigns/${c.id}`);
	const status = (c: C) =>
		c.waiting
			? `${c.waiting} waiting on you`
			: c.new_applications
				? `${c.new_applications} new application${c.new_applications === 1 ? '' : 's'}`
				: isOpen(c)
					? `Open to applications${c.open_until ? ` until ${fmt(c.open_until)}` : ''}`
					: c.status === 'draft'
						? 'Draft, not sent'
						: c.sent_at
							? `Sent ${fmt(c.sent_at.slice(0, 10))}`
							: 'Sent';
</script>

<svelte:head><title>Campaigns · Miracle</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Plan</div>
		<h1>Campaigns</h1>
		<p>One brief to many creators. Each gets their own request and replies with their own quote.</p>
	</div>
</header>

{#if !campaigns.loaded}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else}
	<section class="hero-card glow m-hero m-pipe" aria-label="Your campaigns">
		<div class="mesh" aria-hidden="true"></div>
		<div class="hc-in">
			<div class="hc-top">
				<span class="hc-eb">Budget in campaigns</span>
				{#if waiting}<button class="glass-chip" onclick={() => (show = 'waiting')}><Icon name="inbox" />{waiting} waiting on you</button>{/if}
				{#if newApps}<button class="glass-chip" onclick={() => (show = 'open')}><Icon name="users" />{newApps} new application{newApps === 1 ? '' : 's'}</button>{/if}
				<a class="glass-chip" href="/brand/campaigns/new"><Icon name="plus" />New</a>
			</div>
			<div class="hc-val" use:countUp={{ value: budget, money: true }}>{inr(budget)}</div>
			<div class="hc-sub">across {campaigns.list.length} campaign{campaigns.list.length === 1 ? '' : 's'} · {creators} creator{creators === 1 ? '' : 's'} asked</div>
			{#if creators}
				<div class="pipe-bar" aria-hidden="true">
					{#if agreed}<i style="flex:{agreed};--hue:var(--ok)"></i>{/if}
					{#if waiting}<i style="flex:{waiting};--hue:var(--bad)"></i>{/if}
					{#if creators - agreed - waiting > 0}<i style="flex:{creators - agreed - waiting};--hue:var(--warn,#e0a23a)"></i>{/if}
				</div>
			{/if}
			<div class="hc-foot">
				<button class:on={show === 'sent'} onclick={() => (show = show === 'sent' ? 'all' : 'sent')}><small><span class="dt" style="--hue:var(--ok)"></span>Agreed</small><b>{agreed}</b></button>
				<button class:on={show === 'waiting'} onclick={() => (show = show === 'waiting' ? 'all' : 'waiting')}><small><span class="dt" style="--hue:var(--bad)"></span>Waiting on you</small><b>{waiting}</b></button>
				<button class:on={show === 'draft'} onclick={() => (show = show === 'draft' ? 'all' : 'draft')}><small><span class="dt" style="--hue:var(--warn,#e0a23a)"></span>Drafts</small><b>{counts.draft}</b></button>
			</div>
		</div>
	</section>

	<div class="m-stages" role="tablist" aria-label="Filter campaigns">
		{#each [['all', 'All'], ['waiting', 'Waiting on you'], ['open', 'Open briefs'], ['sent', 'Sent'], ['draft', 'Drafts']] as const as [k, label] (k)}
			{#if k !== 'open' || counts.open}
				<button role="tab" aria-selected={show === k} class:on={show === k} onclick={() => (show = k)}><i class="dt" style="--hue:{k === 'all' ? 'var(--accent)' : HUE[k]}"></i>{label}<span>{counts[k]}</span></button>
			{/if}
		{/each}
	</div>

	<div class="tks m-plist">
		{#each fan ? list : list.slice(0, 6) as c, i (c.id)}
			<Ticket
				name={c.name}
				sub={c.brief.deliverables?.length ? `${delivText(c.brief.deliverables)} each` : 'No deliverables yet'}
				money={c.budget_total ? inrS(c.budget_total) : ''}
				moneySub={c.budget_total ? 'budget' : ''}
				task={`${c.creators} creator${c.creators === 1 ? '' : 's'} · ${c.agreed} agreed${c.open || c.applications ? ` · ${apps(c.applications || 0)}` : ''}`}
				status={status(c)}
				tone={c.waiting || c.new_applications ? 'hot' : c.status === 'draft' ? 'warn' : 'ok'}
				href={href(c)}
				{i}
			>
				{#if !c.waiting && c.new_applications}
					<a class="btn primary" href="/brand/campaigns/{c.id}?tab=applications">See {c.new_applications} new</a>
				{:else}
					<a class={c.waiting || c.status === 'draft' ? 'btn primary' : 'btn'} href={href(c)}>{c.status === 'draft' ? 'Finish' : c.waiting ? 'Review' : 'Open'}</a>
				{/if}
			</Ticket>
		{:else}
			<div class="clear hero-card glow m-none">
				<div class="mesh" aria-hidden="true"></div>
				<span class="clear-ic"><Icon name="send" /></span>
				<b>{show === 'all' ? 'No campaigns yet' : 'Nothing here'}</b>
				<small>Make a pool of creators, then send them one brief in a few taps.</small>
				<div class="clear-acts">
					<a class="glass-chip" href="/brand/campaigns/new"><Icon name="plus" />Start a campaign</a>
					<a class="glass-chip" href="/brand/creators?tab=pools"><Icon name="layers" />Make a pool</a>
				</div>
			</div>
		{/each}
		{#if !fan && list.length > 6}<span class="cr-edge tk-edge" aria-hidden="true"></span>{/if}
	</div>
	{#if list.length > 6}<button class="cr-more" onclick={() => (fan = !fan)}>{fan ? 'Show less' : `+${list.length - 6} more`}</button>{/if}
{/if}
