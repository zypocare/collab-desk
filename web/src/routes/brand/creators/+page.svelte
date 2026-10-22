<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { brandHome, loadDashboard } from '#lib/brand.svelte.ts';
	import DiscoverPanel from '#lib/components/DiscoverPanel.svelte';
	import { addressFor } from '#lib/creatorHost.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { compact } from '#lib/util.ts';
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
	const mine = $derived(brandHome.dash?.creators ?? []);
	const match = (c: BrandCreator) => !q.trim() || [c.name, c.niche, c.city, c.handle].join(' ').toLowerCase().includes(q.trim().toLowerCase());
	const shownMine = $derived(
		mine.filter(match).sort((a, b) =>
			sort === 'turn' ? (b.waiting ?? 0) - (a.waiting ?? 0) || (b.open ?? 0) - (a.open ?? 0) : sort === 'open' ? (b.open ?? 0) + (b.done ?? 0) - ((a.open ?? 0) + (a.done ?? 0)) : a.name.localeCompare(b.name)
		)
	);
	const openN = $derived(mine.reduce((a, c) => a + (c.open ?? 0), 0));
	const waitingN = $derived(mine.filter((c) => c.waiting).length);

	onMount(() => {
		if (!brandHome.dash) loadDashboard();
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
{:else if tab === 'discover'}
	<DiscoverPanel {toPool} />
{:else}
	<div class="toolbar rv" style="--i:1">
		<label class="search" use:rollHints={mine.slice(0, 8).map((c) => c.name)}
			><Icon name="search" /><span class="sr">Search creators</span><input type="search" placeholder="Search by name, niche or city" bind:value={q} autocomplete="off" /></label
		>
		<Segmented
				label="Sort creators"
				bind:value={sort}
				options={[
					{ value: 'turn', label: 'Your turn' },
					{ value: 'open', label: 'Most work' },
					{ value: 'name', label: 'A–Z' }
				]}
			/>
	</div>

	<!-- Each creator a ticket, like the studio's brands: their colour band, then how it's going. -->
	<section class="tks bk-tks">
		{#if !brandHome.dash}
			<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
		{:else}
			{#each shownMine as c, i (c.id)}
				<Ticket
					name={c.name}
					sub={where(c)}
					money={reach(c)}
					moneySub={reachSub(c)}
					task={`${c.open ?? 0} open · ${c.done ?? 0} done`}
					status={c.waiting ? `${c.waiting} waiting on you` : c.open ? 'In progress' : c.done ? 'Book again' : 'No requests yet'}
					tone={c.waiting ? 'hot' : c.open ? 'warn' : c.done ? 'ok' : 'calm'}
					href="/brand/creator/{c.id}"
					{i}
				>
					<AddToPool creator={c.id} name={c.name} pool={toPool} />
					{#if c.open}
						<a class="btn primary" href={at(c.slug, '/brand/requests')}>Open</a>
					{:else if c.accepting !== false}
						<a class="btn primary" href={at(c.slug, '/brand/new')}>{c.done ? 'Book again' : 'Request'}</a>
					{:else}
						<a class="btn" href={at(c.slug, '/')}>Page</a>
					{/if}
				</Ticket>
			{:else}
				<div class="clear hero-card glow m-none">
					<div class="mesh" aria-hidden="true"></div>
					<span class="clear-ic"><Icon name="users" /></span>
					<b>{q ? 'No creators match' : 'No creators yet'}</b>
					<small>Creators you send a request to show up here.</small>
					<div class="clear-acts"><a class="glass-chip" href="?tab=discover"><Icon name="search" />Discover creators</a></div>
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
