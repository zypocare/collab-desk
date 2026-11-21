<script lang="ts">
	import { brandStats } from '#lib/brandStats.ts';
	import MonthlyDeals from '#lib/components/MonthlyDeals.svelte';
	import { studio } from '#lib/studio.svelte.ts';
	import { countUp } from '#lib/ui.svelte.ts';
	import { fmt, hueOf, initials, inr, inrS } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { rollHints } from '#lib/lively.ts';
	import Segmented from '#lib/components/Segmented.svelte';

	let q = $state('');
	let sort = $state<'paid' | 'recent' | 'name'>('paid');
	let filter = $state<'all' | 'fast' | 'due' | 'repeat'>('all');

	const allStats = $derived(
		studio.brands
			.map((b) => brandStats(b, studio.collabs))
			.filter((s) => s.collabs.length > 0)
	);

	const stats = $derived(
		allStats
			.filter((s) => {
				if (filter === 'fast') return s.avgDaysToPay !== null && s.avgDaysToPay <= 7;
				if (filter === 'due') return s.outstanding > 0;
				if (filter === 'repeat') return s.count > 1;
				return true;
			})
			.filter((s) => !q.trim() || `${s.brand.name} ${s.brand.category} ${s.brand.instagram}`.toLowerCase().includes(q.trim().toLowerCase()))
			.sort((a, b) =>
				sort === 'paid' ? b.paid - a.paid : sort === 'recent' ? (b.lastDate ?? '').localeCompare(a.lastDate ?? '') : a.brand.name.localeCompare(b.brand.name)
			)
	);

	const totalPaid = $derived(allStats.reduce((a, s) => a + s.paid, 0));
	const totalDue = $derived(allStats.reduce((a, s) => a + s.outstanding, 0));
	const repeat = $derived(allStats.filter((s) => s.count > 1).length);
	const fastList = $derived(allStats.filter((s) => s.avgDaysToPay !== null && s.avgDaysToPay <= 7));
	const dueList = $derived(allStats.filter((s) => s.outstanding > 0));

	const paySpeeds = $derived(allStats.map((s) => s.avgDaysToPay).filter((d): d is number => d !== null));
	const avgPayDays = $derived(paySpeeds.length ? Math.round(paySpeeds.reduce((a, d) => a + d, 0) / paySpeeds.length) : null);
	const fastest = $derived(
		allStats
			.filter((s) => s.avgDaysToPay !== null)
			.sort((a, b) => (a.avgDaysToPay ?? 999) - (b.avgDaysToPay ?? 999))[0] ?? null
	);
	const topEarner = $derived([...allStats].sort((a, b) => b.paid - a.paid)[0] ?? null);

	const facts = $derived(
		[
			fastest ? { b: fastest.brand.name, t: fastest.avgDaysToPay === 0 ? ' pays the same day' : ` pays in ${fastest.avgDaysToPay}d (fastest)` } : null,
			topEarner && topEarner.paid > 0 ? { b: topEarner.brand.name, t: ` is your top earner (${inrS(topEarner.paid)})` } : null,
			totalDue > 0 ? { b: inrS(totalDue), t: ` waiting across ${dueList.length} brand${dueList.length === 1 ? '' : 's'}` } : null,
			repeat > 0 ? { b: String(repeat), t: ` repeat partner${repeat === 1 ? '' : 's'} came back` } : null
		].filter((x): x is { b: string; t: string } => !!x)
	);
</script>

<svelte:head><title>Brands · {studio.settings?.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">History</div>
		<h1>Brands</h1>
		<p>{allStats.length} brands · {repeat} came back for more · {inr(totalPaid)} earned in total.</p>
	</div>
</header>

<!-- Money-Inspired Brand Portfolio Vault -->
<section class="b-vault rv" aria-label="Brand portfolio summary">
	<div class="bv-top">
		<span class="bx-eb">Brand portfolio value</span>
		{#if fastest}
			<span class="bv-badge">⚡ Fastest: {fastest.avgDaysToPay === 0 ? 'Same day' : `${fastest.avgDaysToPay}d`}</span>
		{/if}
	</div>
	<b class="bv-big num" use:countUp={{ value: totalPaid, money: true }}>{inr(totalPaid)}</b>
	<div class="bv-sub">
		Across <b>{allStats.length} partner{allStats.length === 1 ? '' : 's'}</b>
		{#if avgPayDays !== null}<span>· Avg pay speed <b>{avgPayDays}d</b></span>{/if}
	</div>
	<div class="bv-kpi3">
		<div><small>Partners</small><b class="num">{allStats.length}</b></div>
		<div><small>Repeat</small><b class="num ok">{repeat}</b></div>
		<div><small>Yet to come</small><b class="num" class:warn={totalDue > 0}>{inrS(totalDue)}</b></div>
	</div>
</section>

<MonthlyDeals />

{#if facts.length}
	<div class="v-ticker" aria-label="Brand insights">
		<div>
			{#each [0, 1] as k (k)}
				{#each facts as f, j (j)}
					<span aria-hidden={k === 1}><b>{f.b}</b>{f.t}</span><em aria-hidden="true">✦</em>
				{/each}
			{/each}
		</div>
	</div>
{/if}

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

<div class="m-stages" role="tablist" aria-label="Filter brands">
	<button type="button" role="tab" aria-selected={filter === 'all'} class:on={filter === 'all'} onclick={() => (filter = 'all')}><i class="dt" style="--hue:var(--g2)"></i>All<span>{allStats.length}</span></button>
	{#if fastList.length}<button type="button" role="tab" aria-selected={filter === 'fast'} class:on={filter === 'fast'} onclick={() => (filter = 'fast')}><i class="dt" style="--hue:var(--ok)"></i>Fast payers<span>{fastList.length}</span></button>{/if}
	{#if dueList.length}<button type="button" role="tab" aria-selected={filter === 'due'} class:on={filter === 'due'} onclick={() => (filter = 'due')}><i class="dt" style="--hue:var(--warn,#e0a23a)"></i>Due<span>{dueList.length}</span></button>{/if}
	{#if repeat}<button type="button" role="tab" aria-selected={filter === 'repeat'} class:on={filter === 'repeat'} onclick={() => (filter = 'repeat')}><i class="dt" style="--hue:var(--g1)"></i>Repeat<span>{repeat}</span></button>{/if}
</div>

<!-- Borderless Elevated Perforated Brand Tickets -->
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
						<small class="hot"><i></i>{inrS(s.outstanding)} yet to come</small>
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
		<div class="empty">No matching brands.</div>
	{/each}
</section>

<style>
	@property --bv-rim { syntax: '<angle>'; initial-value: 0deg; inherits: false; }

	.b-vault {
		position: relative;
		overflow: hidden;
		border-radius: 22px;
		padding: 16px;
		margin-bottom: 14px;
		border: 1px solid transparent;
		background:
			linear-gradient(142deg, #261c2e 0%, #1a141b 56%, #211924 100%) padding-box,
			conic-gradient(from var(--bv-rim), rgba(178, 154, 255, 0.82), rgba(242, 90, 144, 0.75), rgba(122, 184, 255, 0.72), rgba(70, 52, 66, 0.28), rgba(178, 154, 255, 0.82)) border-box;
		animation: bv-spin 11s linear infinite;
		box-shadow: 0 22px 46px -24px rgba(122, 184, 255, 0.34);
	}
	.b-vault::before, .b-vault::after { content: ''; position: absolute; border-radius: 50%; pointer-events: none; filter: blur(34px); opacity: 0.34; }
	.b-vault::before { width: 150px; height: 150px; top: -55px; right: -35px; background: radial-gradient(circle, #7ab8ff, transparent 70%); }
	.b-vault::after { width: 140px; height: 140px; bottom: -60px; left: -30px; background: radial-gradient(circle, var(--g2), transparent 70%); }
	.b-vault > * { position: relative; z-index: 1; }

	.bv-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.bv-badge { display: inline-flex; align-items: center; padding: 4px 8px; border: 1px solid rgba(111, 208, 140, 0.35); background: rgba(111, 208, 140, 0.13); color: var(--ok); font: 700 10px/1 ui-monospace, Consolas, monospace; text-transform: uppercase; }
	.bv-big { display: block; font: 400 40px/1 var(--f-serif, Georgia, serif); letter-spacing: -1.8px; color: var(--ink); margin: 8px 0 4px; }
	.bv-sub { font-size: 11.5px; color: var(--ink-2); display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 13px; }
	.bv-sub b { color: #9fc7ff; }

	.bv-kpi3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
	.bv-kpi3 div { border: 1px solid #382c38; background: rgba(28, 23, 28, 0.72); border-radius: 12px; padding: 8px 9px; display: grid; gap: 2px; }
	.bv-kpi3 small { font-size: 9px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .06em; font-weight: 700; }
	.bv-kpi3 b { font: italic 400 17px/1.1 var(--f-serif, Georgia, serif); color: var(--ink); }
	.bv-kpi3 b.ok { color: var(--ok); }
	.bv-kpi3 b.warn { color: var(--g3); }

	@keyframes bv-spin { to { --bv-rim: 360deg; } }
	
	.v-ticker {
		position: relative;
		overflow: hidden;
		margin: 0 0 14px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
	}
	.v-ticker::before, .v-ticker::after {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		width: 18px;
		z-index: 2;
		pointer-events: none;
	}
	.v-ticker::before { left: 0; background: linear-gradient(90deg, var(--surface), transparent); }
	.v-ticker::after { right: 0; background: linear-gradient(-90deg, var(--surface), transparent); }
	.v-ticker div {
		display: inline-flex;
		gap: 20px;
		padding: 9px 0;
		white-space: nowrap;
		animation: v-tick 26s linear infinite;
		font-size: 12px;
		font-weight: 600;
		color: var(--ink-2);
	}
	.v-ticker b { color: var(--g3); }
	.v-ticker em { font-style: normal; color: var(--g2); }
	@keyframes v-tick { to { transform: translateX(-50%); } }

	@media (prefers-reduced-motion: reduce) { .b-vault, .v-ticker div { animation: none; } }
</style>
