<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '../auth.svelte';
	import { discover, loadDiscover } from '../brand.svelte';
	import { blockedCreators, blocks, loadBlocks } from '../safety.svelte';
	import { addressFor } from '../creatorHost';
	import { audienceLine, fit, NO_FILTERS, passes, reelRate, type FitFilters } from '../fit';
	import { phone } from '../phone.svelte';
	import { pageSlug } from '../supabase';
	import { compact, inrS } from '../util';
	import AddToPool from './AddToPool.svelte';
	import Icon from './Icon.svelte';
	import Segmented from './Segmented.svelte';
	import Select from './Select.svelte';
	import Ticket from './Ticket.svelte';

	// Discover: every listed creator, filtered by niche, their audience (from what they share from
	// Instagram), size, price and language, and sorted by how well they fit this brand.
	let { toPool = '' }: { toPool?: string } = $props();
	const acct = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const category = $derived(acct?.brand?.category || acct?.profile?.category || '');
	const company = $derived(acct?.brand?.name || acct?.profile?.name || 'your brand');
	const at = (slug: string, path: string) => (slug === pageSlug ? path : addressFor(slug, path));
	onMount(() => {
		if (!discover.loaded) loadDiscover();
		if (!blocks.loaded) loadBlocks();
	});

	const NICHES = ['Beauty', 'Skincare', 'Fashion', 'Food', 'Travel', 'Fitness', 'Wellness', 'Lifestyle', 'Tech', 'Parenting'];
	const AGES = ['18-24', '25-34', '35-44', '45-54'];
	const LANGS = ['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu', 'Marathi', 'Bengali', 'Malayalam'];
	let f = $state<FitFilters>({ ...NO_FILTERS, niches: [] });
	let q = $state('');
	let city = $state('');
	let sort = $state<'fit' | 'reach' | 'price'>('fit');
	let open = $state(false); // phones: the filters fold away
	const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
	function addCity(e: SubmitEvent) {
		e.preventDefault();
		const c = city.trim();
		if (c && !f.cities.includes(c)) f.cities = [...f.cities, c];
		city = '';
	}
	const count = $derived(
		f.niches.length + f.ages.length + f.cities.length + f.languages.length + (f.women ? 1 : 0) + (f.minFollowers || f.maxFollowers ? 1 : 0) + (f.reelMax ? 1 : 0)
	);

	const shown = $derived.by(() => {
		const words = q.trim().toLowerCase();
		const blocked = blockedCreators();
		return discover.list
			.filter((c) => (c.listed || c.with_me.collabs) && !blocked.has(c.id))
			.filter((c) => !words || [c.name, c.niche, c.city, c.handle].join(' ').toLowerCase().includes(words))
			.filter((c) => passes(c, f))
			.map((c) => ({ c, fit: fit(c, f, category), rate: reelRate(c) }))
			.sort((a, b) => (sort === 'fit' ? b.fit.total - a.fit.total : sort === 'reach' ? (b.c.followers ?? 0) - (a.c.followers ?? 0) : (a.rate ?? 1e9) - (b.rate ?? 1e9)));
	});
	const target = $derived(
		[f.niches.length ? f.niches.join(', ') : category, f.women ? `${f.women}%+ women` : '', f.ages.join(', '), f.cities.join(' and ')].filter(Boolean).join(', ')
	);
</script>

<p class="hint dp-why">{shown.length} creator{shown.length === 1 ? '' : 's'} · sorted by how well they fit {company}{target ? `: ${target}` : ''}. Audience numbers come from what creators share from Instagram.</p>

<div class="toolbar rv" style="--i:1">
	<label class="search"><Icon name="search" /><span class="sr">Search creators</span><input type="search" placeholder="Search by name, niche or city" bind:value={q} autocomplete="off" /></label>
	{#if !phone.on}
		<Segmented
			label="Sort"
			bind:value={sort}
			options={[
				{ value: 'fit', label: 'Best fit' },
				{ value: 'reach', label: 'Reach' },
				{ value: 'price', label: 'Price' }
			]}
		/>
	{/if}
</div>
{#if phone.on}
	<!-- Phones: sort and the filters as the app's chips. -->
	<div class="m-stages" role="tablist" aria-label="Sort and filter">
		<button role="tab" aria-selected={open} class:on={open} onclick={() => (open = !open)}><i class="dt" style="--hue:var(--accent)"></i>Filters<span>{count}</span></button>
		{#each [['fit', 'Best fit'], ['reach', 'Reach'], ['price', 'Price']] as const as [k, l] (k)}<button role="tab" aria-selected={sort === k} class:on={sort === k} onclick={() => (sort = k)}>{l}</button>{/each}
	</div>
{/if}

<div class="dp" class:dp-ph={phone.on}>
	{#if !phone.on || open}
		<aside class="panel dp-f" aria-label="Filters">
			<div class="dp-g">
				<span class="lbl-t">Niche</span>
				<div class="m-stages dp-wrap" role="group" aria-label="Niche">
					{#each NICHES as n, k (n)}<button class:on={f.niches.includes(n)} aria-pressed={f.niches.includes(n)} onclick={() => (f.niches = toggle(f.niches, n))}><i class="dt" style="--hue:var(--m{(k % 6) + 1})"></i>{n}</button>{/each}
				</div>
			</div>
			<div class="dp-g">
				<span class="lbl-t">Their audience</span>
				<div class="f">
					<label for="dp-women">Mostly women</label>
					<Select id="dp-women" size="sm" value={String(f.women)} onchange={(v) => (f.women = Number(v))} options={[{ value: '0', label: 'Any' }, { value: '50', label: '50% or more' }, { value: '60', label: '60% or more' }, { value: '70', label: '70% or more' }]} />
				</div>
				<span class="dp-sub">Age</span>
				<div class="m-stages dp-wrap" role="group" aria-label="Age">
					{#each AGES as a (a)}<button class:on={f.ages.includes(a)} aria-pressed={f.ages.includes(a)} onclick={() => (f.ages = toggle(f.ages, a))}>{a}</button>{/each}
				</div>
				<span class="dp-sub">Audience lives in</span>
				<div class="m-stages dp-wrap" role="group" aria-label="Cities">
					{#each f.cities as c (c)}<button class="on" onclick={() => (f.cities = f.cities.filter((x) => x !== c))} aria-label="Remove {c}">{c} ×</button>{/each}
				</div>
				<form class="dp-city" onsubmit={addCity}><input class="inp" placeholder="Add a city, e.g. Bangalore" aria-label="Add a city" bind:value={city} /><button class="btn" disabled={!city.trim()}>Add</button></form>
			</div>
			<div class="dp-g">
				<div class="f">
					<label for="dp-size">Followers</label>
					<Select
						id="dp-size"
						size="sm"
						value={`${f.minFollowers}-${f.maxFollowers}`}
						onchange={(v) => ([f.minFollowers, f.maxFollowers] = v.split('-').map(Number))}
						options={[
							{ value: '0-0', label: 'Any size' },
							{ value: '1000-10000', label: '1K to 10K' },
							{ value: '10000-50000', label: '10K to 50K' },
							{ value: '50000-200000', label: '50K to 200K' },
							{ value: '200000-0', label: '200K and up' }
						]}
					/>
				</div>
				<div class="f">
					<label for="dp-price">Reels up to</label>
					<Select id="dp-price" size="sm" value={String(f.reelMax)} onchange={(v) => (f.reelMax = Number(v))} options={[{ value: '0', label: 'Any price' }, { value: '10000', label: '₹10K' }, { value: '25000', label: '₹25K' }, { value: '50000', label: '₹50K' }, { value: '100000', label: '₹1L' }]} />
				</div>
				{#if f.reelMax}<small class="dp-sub">Only creators who show their rates</small>{/if}
			</div>
			<div class="dp-g">
				<span class="lbl-t">Language</span>
				<div class="m-stages dp-wrap" role="group" aria-label="Language">
					{#each LANGS as l (l)}<button class:on={f.languages.includes(l)} aria-pressed={f.languages.includes(l)} onclick={() => (f.languages = toggle(f.languages, l))}>{l}</button>{/each}
				</div>
			</div>
			{#if count}<button class="btn ghost" onclick={() => (f = { ...NO_FILTERS, niches: [] })}><Icon name="x" />Clear filters</button>{/if}
		</aside>
	{/if}

	<!-- Each creator a ticket, with their fit score where the money goes. -->
	<section class="tks bk-tks dp-list">
		{#if discover.error}<div class="err-box">{discover.error}</div>{/if}
		{#if !discover.loaded}
			<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
		{:else}
			{#each shown as { c, fit: ft, rate }, i (c.id)}
				<Ticket
					name={c.name}
					sub={[c.niche?.split(',')[0]?.trim(), c.city, c.followers != null ? compact(c.followers) : ''].filter(Boolean).join(' · ')}
					money={String(ft.total)}
					moneySub="fit"
					task={audienceLine(c, f)}
					status={phone.on ? `${ft.label}${rate ? ` · from ${inrS(rate)}` : ''}` : `${rate ? `Reels from ${inrS(rate)} · ` : ''}${ft.label}${c.with_me.collabs ? ' · you worked together' : ''}`}
					tone={ft.tone}
					href="/brand/creator/{c.id}"
					{i}
				>
					{#if !phone.on || toPool}<AddToPool creator={c.id} name={c.name} pool={toPool} />{/if}
					{#if c.accepting !== false}<a class="btn primary" href={at(c.slug, '/brand/new')}>Request</a>{:else}<a class="btn" href="/brand/creator/{c.id}">Open</a>{/if}
				</Ticket>
			{:else}
				<div class="clear hero-card glow m-none">
					<div class="mesh" aria-hidden="true"></div>
					<span class="clear-ic"><Icon name="search" /></span>
					<b>No creators match</b>
					<small>Loosen a filter or two. New creators join every week.</small>
					{#if count}<div class="clear-acts"><button class="glass-chip" onclick={() => (f = { ...NO_FILTERS, niches: [] })}><Icon name="x" />Clear filters</button></div>{/if}
				</div>
			{/each}
		{/if}
	</section>
</div>

<style>
	.dp-why {
		margin: -6px 0 14px;
	}
	.dp {
		display: grid;
		grid-template-columns: 280px minmax(0, 1fr);
		gap: 22px;
		align-items: start;
	}
	.dp.dp-ph {
		grid-template-columns: minmax(0, 1fr);
		gap: 14px;
	}
	.dp-f {
		display: grid;
		gap: 18px;
		padding: 18px;
		position: sticky;
		top: 20px;
	}
	.dp-ph .dp-f {
		position: static;
	}
	.dp-g {
		display: grid;
		gap: 8px;
	}
	.dp-sub {
		font-size: 13px;
		color: var(--ink-3);
	}
	.dp-wrap {
		flex-wrap: wrap;
		overflow: visible;
		margin: 0;
	}
	.dp-city {
		display: flex;
		gap: 8px;
	}
	.dp-city .inp {
		flex: 1;
		min-width: 0;
	}
	.dp-list {
		min-width: 0;
	}
</style>
