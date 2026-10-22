<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { brandHome, discoverCreators, loadDashboard } from '#lib/brand.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { compact, errMessage } from '#lib/util.ts';
	import type { BrandCreator } from '#lib/types.ts';
	import Icon from '#lib/components/Icon.svelte';
	import AddToPool from '#lib/components/AddToPool.svelte';
	import PoolsPanel from '#lib/components/PoolsPanel.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import Ticket from '#lib/components/Ticket.svelte';
	import { pools } from '#lib/campaigns.svelte.ts';
	import { rollHints } from '#lib/lively.ts';

	// Creators, laid out like the creator studio's Brands: a header, search and sort, then each creator
	// as a ticket. Yours, Pools and Discover are the section's tabs (the top bar on a phone, the page's top on a laptop).
	const tab = $derived(({ discover: 'discover', pools: 'pools' } as const)[page.url.searchParams.get('tab') ?? ''] ?? 'mine');
	// Arrived from a pool's "Add creators": the tickets add straight to that pool.
	const toPool = $derived(page.url.searchParams.get('pool') ?? '');
	const toPoolName = $derived(pools.list.find((p) => p.id === toPool)?.name ?? 'the pool');
	const at = (slug: string, path: string) => (slug === pageSlug ? path : addressFor(slug, path));

	let q = $state('');
	let sort = $state<'turn' | 'open' | 'name'>('turn');
	let niche = $state('');
	const NICHES = ['Beauty', 'Fashion', 'Food', 'Travel', 'Fitness', 'Lifestyle', 'Tech', 'Parenting'];
	let found = $state<BrandCreator[] | null>(null);
	let err = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let typed = false; // after the first search, wait for a pause in typing

	const mine = $derived(brandHome.dash?.creators ?? []);
	const mineIds = $derived(new Set(mine.map((c) => c.id)));
	const match = (c: BrandCreator) => !q.trim() || [c.name, c.niche, c.city, c.handle].join(' ').toLowerCase().includes(q.trim().toLowerCase());
	const shownMine = $derived(
		mine.filter(match).sort((a, b) =>
			sort === 'turn' ? (b.waiting ?? 0) - (a.waiting ?? 0) || (b.open ?? 0) - (a.open ?? 0) : sort === 'open' ? (b.open ?? 0) + (b.done ?? 0) - ((a.open ?? 0) + (a.done ?? 0)) : a.name.localeCompare(b.name)
		)
	);
	const list = $derived(tab === 'mine' ? shownMine : (found ?? []));
	const openN = $derived(mine.reduce((a, c) => a + (c.open ?? 0), 0));
	const waitingN = $derived(mine.filter((c) => c.waiting).length);

	onMount(() => {
		if (!brandHome.dash) loadDashboard();
	});
	// Discover: searched as they type (a moment after typing stops).
	$effect(() => {
		if (tab !== 'discover') return;
		const query = q, n = niche;
		clearTimeout(timer);
		timer = setTimeout(async () => {
			try {
				found = await discoverCreators(query.trim(), n);
				err = '';
			} catch (e) {
				err = errMessage(e);
			}
		}, typed ? 300 : 0);
		typed = true;
	});
	const where = (c: BrandCreator) => [c.niche?.split(',')[0]?.trim(), c.handle ? `@${c.handle.replace(/^@+/, '')}` : c.city?.trim()].filter(Boolean).join(' · ') || 'Creator';
	// Their reach when Instagram is linked, else how much you've done together.
	const reach = (c: BrandCreator) => (c.followers != null ? compact(c.followers) : String((c.open ?? 0) + (c.done ?? 0)));
	const reachSub = (c: BrandCreator) => (c.followers != null ? (c.engagement != null ? `${Number(c.engagement).toFixed(1)}% eng.` : 'followers') : 'collabs');
</script>

<svelte:head><title>Creators · Miracle</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">{tab === 'discover' ? 'Find' : tab === 'pools' ? 'Groups' : 'Your team'}</div>
		<h1>{tab === 'discover' ? 'Discover' : tab === 'pools' ? 'Pools' : 'Creators'}</h1>
		<p>
			{#if tab === 'discover'}Creators on Miracle who are open to brands. Send a request or add them to a pool.
			{:else if tab === 'pools'}Groups of creators, like "Bangalore food". Send one campaign to a whole pool.
			{:else}{mine.length} creator{mine.length === 1 ? '' : 's'} · {openN} open request{openN === 1 ? '' : 's'}{waitingN ? ` · ${waitingN} waiting on you` : ''}.{/if}
		</p>
	</div>
</header>

{#if toPool && tab !== 'pools'}
	<div class="cr-banner">Adding to <b>{toPoolName}</b>. Tap Pool on the creators you want. <a href="?tab=pools&pool={toPool}">Done</a></div>
{/if}

{#if tab === 'pools'}
	<PoolsPanel />
{:else}
	<div class="toolbar rv" style="--i:1">
		<label class="search" use:rollHints={(tab === 'discover' ? ['Bangalore food', 'skincare', 'Mumbai'] : mine.slice(0, 8).map((c) => c.name))}
			><Icon name="search" /><span class="sr">Search creators</span><input type="search" placeholder="Search by name, niche or city" bind:value={q} autocomplete="off" /></label
		>
		{#if tab === 'mine'}
			<Segmented
				label="Sort creators"
				bind:value={sort}
				options={[
					{ value: 'turn', label: 'Your turn' },
					{ value: 'open', label: 'Most work' },
					{ value: 'name', label: 'A–Z' }
				]}
			/>
		{/if}
	</div>

	{#if tab === 'discover'}
		<div class="m-stages" role="tablist" aria-label="Niche">
			<button role="tab" aria-selected={!niche} class:on={!niche} onclick={() => (niche = '')}><i class="dt" style="--hue:var(--accent)"></i>All</button>
			{#each NICHES as n, k (n)}<button role="tab" aria-selected={niche === n} class:on={niche === n} onclick={() => (niche = niche === n ? '' : n)}><i class="dt" style="--hue:var(--m{(k % 6) + 1})"></i>{n}</button>{/each}
		</div>
		{#if err}<div class="err-box">{err}</div>{/if}
	{/if}

	<!-- Each creator a ticket, like the studio's brands: their colour band, then how it's going. -->
	<section class="tks bk-tks">
		{#if tab === 'mine' && !brandHome.dash}
			<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
		{:else if tab === 'discover' && found === null}
			<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
		{:else}
			{#each list as c, i (c.id)}
				{@const yours = mineIds.has(c.id)}
				<Ticket
					name={c.name}
					sub={where(c)}
					money={reach(c)}
					moneySub={reachSub(c)}
					task={tab === 'mine' ? `${c.open ?? 0} open · ${c.done ?? 0} done` : yours ? 'You work together' : c.city || 'Open to brands'}
					status={tab === 'mine' ? (c.waiting ? `${c.waiting} waiting on you` : c.open ? 'In progress' : c.done ? 'Book again' : 'No requests yet') : c.accepting ? 'Taking requests' : 'Fully booked'}
					tone={tab === 'mine' ? (c.waiting ? 'hot' : c.open ? 'warn' : c.done ? 'ok' : 'calm') : c.accepting ? 'ok' : 'calm'}
					href={at(c.slug, tab === 'mine' && (c.open || c.done) ? '/brand/requests' : '/')}
					{i}
				>
					<AddToPool creator={c.id} name={c.name} pool={toPool} />
					{#if tab === 'mine' && c.open}
						<a class="btn primary" href={at(c.slug, '/brand/requests')}>Open</a>
					{:else if c.accepting !== false}
						<a class="btn primary" href={at(c.slug, '/brand/new')}>{tab === 'mine' && c.done ? 'Book again' : 'Request'}</a>
					{:else}
						<a class="btn" href={at(c.slug, '/')}>Page</a>
					{/if}
				</Ticket>
			{:else}
				<div class="clear hero-card glow m-none">
					<div class="mesh" aria-hidden="true"></div>
					<span class="clear-ic"><Icon name="users" /></span>
					<b>{tab === 'mine' ? (q ? 'No creators match' : 'No creators yet') : 'No creators found'}</b>
					<small>{tab === 'mine' ? 'Creators you send a request to show up here.' : q || niche ? 'Try another search or niche.' : 'Creators who choose to be listed show up here.'}</small>
					{#if tab === 'mine'}<div class="clear-acts"><a class="glass-chip" href="?tab=discover"><Icon name="search" />Discover creators</a></div>{/if}
				</div>
			{/each}
		{/if}
	</section>
{/if}

<style>
	.cr-banner {
		margin-bottom: 16px;
		padding: 12px 16px;
		border-radius: 14px;
		background: color-mix(in oklab, var(--g2) 12%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--g2) 40%, transparent);
		font-size: 14px;
		color: var(--ink-2);
	}
	.cr-banner b {
		color: var(--ink);
	}
	.cr-banner a {
		margin-left: 8px;
		color: var(--ink);
		font-weight: 700;
	}
</style>
