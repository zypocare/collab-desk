<script lang="ts">
	import { brandStats } from '#lib/brandStats.ts';
	import MonthlyDeals from '#lib/components/MonthlyDeals.svelte';
	import { studio } from '#lib/studio.svelte.ts';
	import { fmt, hueOf, initials, inr, inrS } from '#lib/util.ts';
	import { phone } from '#lib/phone.svelte.ts';
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

{#if phone.on}
	<!-- Phone: each brand a ticket, like Needs you on Today: its colour band, then how it's going. -->
	<section class="tks bk-tks">
		{#each stats as s, i (s.brand.id)}
			<article class="tk" style="--h:var(--m{hueOf(s.brand.name)});--i:{Math.min(i, 8)}">
				<a class="tk-band" href="/studio/brands/{s.brand.id}">
					<span class="tk-tile">{initials(s.brand.name)}</span>
					<span class="tk-who"><b>{s.brand.name}</b><small>{s.brand.category || 'Brand'}{#if s.brand.instagram}{' · '}<span class="tk-ig">@{s.brand.instagram.replace(/^@+/, '')}</span>{/if}</small></span>
					<span class="tk-money"><b>{s.paid ? inrS(s.paid) : s.barter ? inrS(s.barter) : '—'}</b><small>{s.paid ? 'earned' : s.barter ? 'in products' : 'nothing yet'}</small></span>
				</a>
				<div class="tk-cut" aria-hidden="true"></div>
				<div class="tk-foot">
					<span class="tk-task">
						<b>{s.count} collab{s.count === 1 ? '' : 's'} · {s.active ? `${s.active} active` : 'none active'}</b>
						{#if s.outstanding > 0}
							<small class="hot"><i></i>{inrS(s.outstanding)} still to come</small>
						{:else if s.avgDaysToPay !== null}
							<small class="ok"><i></i>{s.avgDaysToPay === 0 ? 'Pays the same day' : `Pays in ${s.avgDaysToPay} day${s.avgDaysToPay === 1 ? '' : 's'}`}{s.onTimeRate !== null ? ` · ${Math.round(s.onTimeRate * 100)}% on time` : ''}</small>
						{:else}
							<small class="calm"><i></i>Last collab {fmt(s.lastDate)}</small>
						{/if}
					</span>
					<a class="btn primary" href="/studio/brands/{s.brand.id}">Open</a>
				</div>
			</article>
		{:else}
			<div class="empty">No brands yet.</div>
		{/each}
	</section>
{:else}
<section class="panel rv" style="--i:2">
	<div class="brand-row head"><span>Brand</span><span>Collabs</span><span>Earned</span><span class="hide-sm">Pays in</span><span class="hide-sm">Last collab</span></div>
	{#each stats as s, i (s.brand.id)}
		<a class="brand-row" href="/studio/brands/{s.brand.id}" style="--i:{i}">
			<span class="who"><Mono name={s.brand.name} /><div><b>{s.brand.name}</b><small>{s.brand.category}{s.brand.instagram ? ` · @${s.brand.instagram.replace(/^@+/, '')}` : ''}</small></div></span>
			<span class="n hide-sm">{s.count}<span class="m">{s.active ? `${s.active} active` : 'none active'}</span></span>
			<span class="n">{inr(s.paid)}<span class="m">{s.barter ? `+ ${inr(s.barter)} products` : s.outstanding ? `${inr(s.outstanding)} due` : ''}</span></span>
			<span class="n hide-sm">{s.avgDaysToPay === null ? '—' : `${s.avgDaysToPay} days`}<span class="m">{s.onTimeRate === null ? '' : `${Math.round(s.onTimeRate * 100)}% on time`}</span></span>
			<span class="n hide-sm">{fmt(s.lastDate)}</span>
		</a>
	{:else}
		<div class="empty">No brands yet.</div>
	{/each}
</section>
{/if}
