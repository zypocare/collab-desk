<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { brandHome, discoverCreators, loadDashboard } from '#lib/brand.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { compact, errMessage } from '#lib/util.ts';
	import type { BrandCreator } from '#lib/types.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import AddToPool from '#lib/components/AddToPool.svelte';
	import PoolsPanel from '#lib/components/PoolsPanel.svelte';
	import { pools } from '#lib/campaigns.svelte.ts';

	// Creators: the ones this brand works with, and Discover (creators who chose to be listed).
	const tab = $derived(({ discover: 'discover', pools: 'pools' } as const)[page.url.searchParams.get('tab') ?? ''] ?? 'mine');
	const setTab = (t: 'mine' | 'discover' | 'pools') => goto(t === 'mine' ? '?' : `?tab=${t}`, { replaceState: true });
	// Arrived from a pool's "Add creators": the cards add straight to that pool.
	const toPool = $derived(page.url.searchParams.get('pool') ?? '');
	const toPoolName = $derived(pools.list.find((p) => p.id === toPool)?.name ?? 'the pool');
	const at = (slug: string, path: string) => (slug === pageSlug ? path : addressFor(slug, path));

	let q = $state('');
	let niche = $state('');
	const NICHES = ['Beauty', 'Fashion', 'Food', 'Travel', 'Fitness', 'Lifestyle', 'Tech', 'Parenting'];
	let found = $state<BrandCreator[] | null>(null);
	let err = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let typed = false; // after the first search, wait for a pause in typing

	const mine = $derived(brandHome.dash?.creators ?? []);
	const mineIds = $derived(new Set(mine.map((c) => c.id)));
	const shownMine = $derived(
		q.trim()
			? mine.filter((c) => [c.name, c.niche, c.city].join(' ').toLowerCase().includes(q.trim().toLowerCase()))
			: mine
	);

	onMount(() => {
		if (!brandHome.dash) loadDashboard();
	});
	// Discover: searched as she types (a moment after typing stops).
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
	const stats = (c: BrandCreator) => [c.followers != null ? `${compact(c.followers)}|followers` : '', c.engagement != null ? `${Number(c.engagement).toFixed(1)}%|engagement` : ''].filter(Boolean).map((x) => x.split('|'));
	const where = (c: BrandCreator) => [c.niche?.trim(), c.city?.trim()].filter(Boolean).join(' · ');
</script>

<svelte:head><title>Creators · Miracle</title></svelte:head>

<header class="cr-h rv">
	<h1>Creators</h1>
	<div class="cr-bar">
		<div class="cr-tabs" role="tablist" aria-label="Creators">
			<button role="tab" aria-selected={tab === 'mine'} class:on={tab === 'mine'} onclick={() => setTab('mine')}>Your creators{mine.length ? ` · ${mine.length}` : ''}</button>
			<button role="tab" aria-selected={tab === 'pools'} class:on={tab === 'pools'} onclick={() => setTab('pools')}>Pools{pools.loaded && pools.list.length ? ` · ${pools.list.length}` : ''}</button>
			<button role="tab" aria-selected={tab === 'discover'} class:on={tab === 'discover'} onclick={() => setTab('discover')}>Discover</button>
		</div>
		{#if tab !== 'pools'}<label class="cr-search">
			<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
			<span class="sr">Search creators</span>
			<input type="search" placeholder="Search by name, niche or city" bind:value={q} />
		</label>{/if}
	</div>
</header>

{#if toPool && tab !== 'pools'}
	<div class="cr-banner">Adding to <b>{toPoolName}</b>. Tap Add on the creators you want. <a href="?tab=pools&pool={toPool}">Done</a></div>
{/if}
{#if tab === 'pools'}
	<PoolsPanel />
{:else if tab === 'mine'}
	{#if !brandHome.dash}
		<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
	{:else if !mine.length}
		<div class="empty-card"><h2>No creators yet</h2><p>Send a request on a creator's page and they'll show up here.</p><button class="btn grad" onclick={() => setTab('discover')}>Discover creators</button></div>
	{:else}
		<div class="cr-grid">
			{#each shownMine as c, i (c.id)}
				<article class="cr-card rv" class:hot={!!c.waiting} style="--i:{i % 6}">
					<div class="cr-id"><Avatar name={c.name} src={c.photo} size="62px" /><div><h2>{c.name}</h2>{#if where(c)}<small>{where(c)}</small>{/if}</div></div>
					{#if stats(c).length}<div class="cr-nums">{#each stats(c) as [n, l] (l)}<span><b>{n}</b> {l}</span>{/each}</div>{/if}
					<div class="cr-chips">
						{#if c.waiting}<span class="hot">{c.waiting === 1 ? 'Waiting on you' : `${c.waiting} waiting on you`}</span>{/if}
						<span>{c.open ? `${c.open} open` : ''}{c.open && c.done ? ' · ' : ''}{c.done ? `${c.done} done` : ''}{!c.open && !c.done ? 'No requests yet' : ''}</span>
					</div>
					<div class="cr-acts">
						{#if c.open}
							<a class="cr-neo cr-light" href={at(c.slug, '/brand/requests')}>Open requests</a>
						{:else}
							<a class="cr-neo cr-grad" href={at(c.slug, '/brand/new')}>{c.done ? 'Book again' : 'Send a request'}</a>
						{/if}
						<a class="cr-neo cr-ghost" href={at(c.slug, '/')}>Page</a>
						{#if !toPool}<AddToPool creator={c.id} name={c.name} />{/if}
					</div>
					{#if toPool}<AddToPool creator={c.id} name={c.name} pool={toPool} />{/if}
				</article>
			{/each}
		</div>
	{/if}
{:else}
	<div class="cr-niches" role="group" aria-label="Niche">
		<button class:on={!niche} onclick={() => (niche = '')}>All</button>
		{#each NICHES as n (n)}<button class:on={niche === n} onclick={() => (niche = niche === n ? '' : n)}>{n}</button>{/each}
	</div>
	{#if err}<div class="err-box">{err}</div>{/if}
	{#if found === null}
		<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
	{:else if !found.length}
		<div class="empty-card"><h2>No creators found</h2><p>{q || niche ? 'Try another search or niche.' : 'Creators who choose to be listed show up here.'}</p></div>
	{:else}
		<div class="cr-grid">
			{#each found as c, i (c.id)}
				<article class="cr-card rv" style="--i:{i % 6}">
					<div class="cr-id"><Avatar name={c.name} src={c.photo} size="62px" /><div><h2>{c.name}</h2>{#if where(c)}<small>{where(c)}</small>{/if}</div></div>
					{#if stats(c).length}<div class="cr-nums">{#each stats(c) as [n, l] (l)}<span><b>{n}</b> {l}</span>{/each}</div>{/if}
					<div class="cr-chips">
						{#if mineIds.has(c.id)}<span>You work together</span>{/if}
						{#if !c.accepting}<span>Fully booked</span>{/if}
					</div>
					<div class="cr-acts">
						{#if c.accepting}<a class="cr-neo cr-grad" href={at(c.slug, '/brand/new')}>Send a request</a>{/if}
						<a class="cr-neo cr-ghost" href={at(c.slug, '/')}>Page</a>
						{#if !toPool}<AddToPool creator={c.id} name={c.name} />{/if}
					</div>
					{#if toPool}<AddToPool creator={c.id} name={c.name} pool={toPool} />{/if}
				</article>
			{/each}
		</div>
	{/if}
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
	.cr-h h1 {
		margin: 0 0 18px;
		font-size: clamp(34px, 4.4vw, 46px);
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.cr-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 22px;
	}
	.cr-tabs {
		display: flex;
		gap: 4px;
		padding: 4px;
		border-radius: 14px;
		background: color-mix(in oklab, var(--ink) 5%, var(--bg));
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.cr-tabs button {
		height: 40px;
		padding: 0 18px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--ink-2);
		font: 600 14px/1 var(--f-body);
		cursor: pointer;
	}
	.cr-tabs button.on {
		background: var(--surface);
		color: var(--ink);
		box-shadow: inset 0 0 0 1.5px var(--g2);
	}
	.cr-search {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 44px;
		width: min(320px, 100%);
		padding: 0 14px;
		background: color-mix(in oklab, var(--ink) 5%, var(--bg));
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.cr-search:focus-within {
		box-shadow: inset 0 0 0 1.5px var(--g2);
	}
	.cr-search svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: var(--ink-3);
		stroke-width: 2;
		stroke-linecap: round;
		flex: none;
	}
	.cr-search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		outline: 0;
		color: var(--ink);
		font: 14px/1 var(--f-body);
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.cr-niches {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 18px;
	}
	.cr-niches button {
		height: 36px;
		padding: 0 14px;
		border: 0;
		border-radius: 99px;
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink-2);
		font: 600 13px/1 var(--f-body);
		cursor: pointer;
	}
	.cr-niches button.on {
		background: color-mix(in oklab, var(--g2) 16%, transparent);
		box-shadow: none;
		color: var(--g2);
	}
	.cr-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 16px;
	}
	.cr-card {
		display: grid;
		align-content: start;
		gap: 14px;
		padding: 20px;
		border-radius: 22px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.cr-card.hot {
		background:
			radial-gradient(120% 70% at 0% 0%, color-mix(in oklab, var(--g2) 14%, transparent), transparent 60%),
			var(--surface);
	}
	.cr-id {
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
	}
	.cr-id > div {
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.cr-id h2 {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 28px;
		line-height: 1.05;
	}
	.cr-id small {
		font-size: 13px;
		color: var(--ink-3);
	}
	.cr-nums {
		display: flex;
		gap: 18px;
		font-size: 13px;
		color: var(--ink-3);
	}
	.cr-nums b {
		color: var(--ink);
		font-size: 16px;
	}
	.cr-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.cr-chips span {
		font-size: 12px;
		padding: 5px 10px;
		border-radius: 99px;
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink-2);
	}
	.cr-chips span:empty {
		display: none;
	}
	.cr-chips span.hot {
		box-shadow: none;
		background: color-mix(in oklab, var(--g3) 16%, transparent);
		color: var(--g3);
		font-weight: 700;
	}
	.cr-acts {
		display: flex;
		gap: 10px;
		margin-top: 2px;
	}
	.cr-neo {
		flex: 1;
		height: 44px;
		display: grid;
		place-items: center;
		padding: 0 14px;
		text-decoration: none;
		font: 700 12px/1 var(--f-body);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		transition: transform 0.12s, box-shadow 0.12s;
	}
	.cr-light {
		background: var(--ink);
		color: var(--bg);
		box-shadow: 4px 4px 0 var(--g2);
	}
	.cr-grad {
		background: var(--grad);
		color: #fff;
		box-shadow: 4px 4px 0 #6a4bc9;
	}
	.cr-ghost {
		flex: none;
		color: var(--ink);
		box-shadow:
			inset 0 0 0 1.5px var(--ink-3),
			4px 4px 0 var(--line);
	}
	.cr-neo:hover {
		transform: translate(-2px, -2px);
	}
	.cr-neo:active {
		transform: translate(4px, 4px);
		box-shadow: none;
	}
	@media (max-width: 560px) {
		.cr-search {
			width: 100%;
		}
		.cr-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
