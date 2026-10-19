<script lang="ts">
	import { brandStats } from '#lib/brandStats.ts';
	import MonthlyDeals from '#lib/components/MonthlyDeals.svelte';
	import { studio } from '#lib/studio.svelte.ts';
	import { fmt, inr } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { rollHints } from '#lib/lively.ts';
	import Mono from '#lib/components/Mono.svelte';
	import Segmented from '#lib/components/Segmented.svelte';

	let q = $state('');
	let sort = $state<'paid' | 'recent' | 'name'>('paid');

	const stats = $derived(
		studio.brands
			.map((b) => brandStats(b, studio.collabs))
			.filter((s) => s.collabs.length > 0)
			.filter((s) => !q.trim() || `${s.brand.name} ${s.brand.category} ${s.brand.instagram}`.toLowerCase().includes(q.trim().toLowerCase()))
			.sort((a, b) =>
				sort === 'paid' ? b.paid - a.paid : sort === 'recent' ? (b.lastDate ?? '').localeCompare(a.lastDate ?? '') : a.brand.name.localeCompare(b.brand.name)
			)
	);
	const totalPaid = $derived(stats.reduce((a, s) => a + s.paid, 0));
	const repeat = $derived(stats.filter((s) => s.count > 1).length);
</script>

<svelte:head><title>Brands · {studio.settings?.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">History</div>
		<h1>Brands</h1>
		<p>{stats.length} brands · {repeat} came back for more · {inr(totalPaid)} earned in total.</p>
	</div>
</header>

<MonthlyDeals />

<div class="toolbar rv" style="--i:1">
	<label class="search" use:rollHints={studio.brands.slice(0, 8).map((b) => b.name)}><Icon name="search" /><span class="sr">Search brands</span><input type="search" placeholder="Search brands" bind:value={q} autocomplete="off" /></label>
	<Segmented
		label="Sort brands"
		bind:value={sort}
		options={[
			{ value: 'paid', label: 'Top earning' },
			{ value: 'recent', label: 'Recent' },
			{ value: 'name', label: 'A–Z' }
		]}
	/>
</div>

<section class="panel rv" style="--i:2">
	<div class="brand-row head"><span>Brand</span><span>Collabs</span><span>Earned</span><span class="hide-sm">Pays in</span><span class="hide-sm">Last collab</span></div>
	{#each stats as s, i (s.brand.id)}
		<a class="brand-row" href="/studio/brands/{s.brand.id}" style="--i:{i}">
			<span class="who"><Mono name={s.brand.name} /><div><b>{s.brand.name}</b><small>{s.brand.category}{s.brand.instagram ? ` · @${s.brand.instagram}` : ''}</small></div></span>
			<span class="n hide-sm">{s.count}<span class="m">{s.active ? `${s.active} active` : 'none active'}</span></span>
			<span class="n">{inr(s.paid)}<span class="m">{s.barter ? `+ ${inr(s.barter)} products` : s.outstanding ? `${inr(s.outstanding)} due` : ''}</span></span>
			<span class="n hide-sm">{s.avgDaysToPay === null ? '—' : `${s.avgDaysToPay} days`}<span class="m">{s.onTimeRate === null ? '' : `${Math.round(s.onTimeRate * 100)}% on time`}</span></span>
			<span class="n hide-sm">{fmt(s.lastDate)}</span>
		</a>
	{:else}
		<div class="empty">No brands yet.</div>
	{/each}
</section>
