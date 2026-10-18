<script lang="ts">
	import { studio } from '#lib/studio.svelte.ts';
	import { moneyDash } from '#lib/moneyDash.ts';
	import { fyFromStart, fyOf } from '#lib/reports.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { countUp } from '#lib/ui.svelte.ts';
	import { inr, inrS, today } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import Columns from '#lib/components/charts/Columns.svelte';
	import Lines from '#lib/components/charts/Lines.svelte';
	import Donut from '#lib/components/charts/Donut.svelte';
	import HBars from '#lib/components/charts/HBars.svelte';
	import Gauge from '#lib/components/charts/Gauge.svelte';

	// Money at a glance: the year's earnings, month by month, growth on last year, where it comes from,
	// who pays most, cash or product, what is coming in and how fast brands pay.
	const current = fyOf(today());
	let fyStart = $state(String(current.start));
	const fy = $derived(fyFromStart(Number(fyStart)));
	const m = $derived(moneyDash(studio.collabs, fy, Math.max(0, studio.settings?.monthly_goal || 0)));
	const fyOptions = [current.start - 1, current.start].map((y) => ({ value: String(y), label: fyFromStart(y).label }));
	const catTotal = $derived(m.categories.reduce((a, s) => a + s.value, 0));
	const mixTotal = $derived(m.mix.reduce((a, s) => a + s.value, 0));
	const comingTotal = $derived(m.weeks.reduce((a, w) => a + w.value, 0));
	const RECEIVED = 'linear-gradient(180deg, var(--g2), var(--g1))';
	// Small screens: months as one letter, weeks as the day of the month.
	const mLabel = (l: string) => (phone.on ? l.slice(0, 1) : l);
	const wLabel = (l: string, i: number) => (!phone.on ? l : i === 0 ? 'Now' : l.split(' ')[0]);
</script>

<svelte:head><title>Money · {studio.settings?.app_name}</title></svelte:head>

{#if !phone.on}
	<header class="ph rv">
		<div>
			<div class="eb">Money · {fy.label}</div>
			<h1>Money <em>dashboard</em></h1>
			<p>Everything you've earned, what's coming in, and who pays best.</p>
		</div>
		<div class="acts"><Segmented label="Financial year" bind:value={fyStart} options={fyOptions} /></div>
	</header>
{:else}
	<div class="md-fy"><Segmented label="Financial year" bind:value={fyStart} options={fyOptions} /></div>
{/if}

<section class="md-hero rv" aria-label="This year">
	<div class="mesh" aria-hidden="true"></div>
	<div class="md-main">
		<span class="bx-eb">Earned in {fy.label}</span>
		<b class="md-big num" use:countUp={{ value: m.received, money: true }}>{inr(m.received)}</b>
		<div class="md-sub">
			{#if m.vsLast !== null}<span class="md-chip" class:down={m.vsLast < 0}>{m.vsLast >= 0 ? '+' : ''}{m.vsLast}% vs this time in {m.prevLabel}</span>{/if}
			{#if m.tds}<span>{inrS(m.tds)} TDS deducted</span>{/if}
			{#if m.barter}<span>+ {inrS(m.barter)} in products</span>{/if}
		</div>
	</div>
	<div class="md-tiles">
		<a class="md-tile" href="/studio/payments"><small>This month</small><b class="num">{inrS(m.thisMonth)}</b><span>{m.goal ? `${Math.round((m.goalPct ?? 0) * 100)}% of ${inrS(m.goal)} goal` : 'No goal set'}</span></a>
		<a class="md-tile" href="/studio/payments"><small>Still to come</small><b class="num">{inrS(m.due)}</b><span>{m.later ? `${inrS(m.later)} not yet due` : 'from open invoices'}</span></a>
		<a class="md-tile" class:bad={m.late > 0} href="/studio/payments"><small>Overdue</small><b class="num">{inrS(m.late)}</b><span>{m.late ? 'needs a nudge' : 'all on time'}</span></a>
		<a class="md-tile" href="/studio/reports"><small>Average deal</small><b class="num">{m.avgDeal ? inrS(m.avgDeal) : '—'}</b><span>{m.deals} paid deal{m.deals === 1 ? '' : 's'} this year</span></a>
	</div>
</section>

<div class="md-grid">
	<section class="md-card md-wide rv" style="--i:1">
		<header class="md-h"><div><span class="bx-eb">Month by month</span><h2>What came in</h2></div><a href="/studio/reports">Full report<Icon name="arrow" /></a></header>
		<Columns
			items={m.monthly.map((x) => ({ label: mLabel(x.label), values: [x.invoiced, x.received, x.barter], now: x.now }))}
			names={['Invoiced', 'Received', 'Products']}
			colors={['color-mix(in oklab, var(--g1) 30%, transparent)', RECEIVED, 'var(--g3)']}
			fmt={inrS}
			height={phone.on ? 170 : 220}
		/>
	</section>

	<section class="md-card rv" style="--i:2">
		<header class="md-h"><div><span class="bx-eb">Growth</span><h2>This year against last</h2></div></header>
		<Lines
			labels={m.monthly.map((x) => mLabel(x.label))}
			series={[
				{ name: fy.label, color: 'var(--g2)', values: m.growth.map((g) => g.now) },
				{ name: m.prevLabel, color: 'var(--ink-3)', values: m.growth.map((g) => g.last), dashed: true }
			]}
			fmt={inrS}
			height={phone.on ? 160 : 190}
		/>
	</section>

	<section class="md-card rv" style="--i:3">
		<header class="md-h"><div><span class="bx-eb">Where it comes from</span><h2>By brand category</h2></div></header>
		<Donut slices={m.categories} center={inrS(catTotal)} sub="received" fmt={inrS} />
	</section>

	<section class="md-card rv" style="--i:4">
		<header class="md-h"><div><span class="bx-eb">Who pays most</span><h2>Top brands</h2></div><a href="/studio/brands">All brands<Icon name="arrow" /></a></header>
		<HBars rows={m.brands.map((b) => ({ label: b.name, values: [b.received, b.due] }))} names={['Received', 'Still to come']} colors={['var(--g2)', 'color-mix(in oklab, var(--g1) 45%, transparent)']} fmt={inrS} />
	</section>

	<section class="md-card rv" style="--i:5">
		<header class="md-h"><div><span class="bx-eb">Cash or product</span><h2>How you're paid</h2></div></header>
		<Donut slices={m.mix} center={inrS(mixTotal)} sub="in total" fmt={inrS} />
	</section>

	<section class="md-card rv" style="--i:6">
		<header class="md-h"><div><span class="bx-eb">Coming in</span><h2>Next 8 weeks</h2></div><b class="md-sum num">{inrS(comingTotal)}</b></header>
		<Columns items={m.weeks.map((w, i) => ({ label: wLabel(w.label, i), values: [w.value], now: i === 0 }))} names={['Due that week']} colors={['linear-gradient(180deg, var(--h-live), color-mix(in oklab, var(--h-live) 55%, var(--g1)))']} fmt={inrS} height={phone.on ? 140 : 170} />
		{#if m.late || m.later}<p class="md-note">{#if m.late}<span class="bad">{inrS(m.late)} overdue</span>{/if}{#if m.late && m.later} · {/if}{#if m.later}{inrS(m.later)} due later or without a date{/if}</p>{/if}
	</section>

	<section class="md-card rv" style="--i:7">
		<header class="md-h"><div><span class="bx-eb">Pace</span><h2>Goal and payment speed</h2></div></header>
		<div class="md-gauges">
			<div><Gauge value={m.goalPct} center={m.goal ? `${Math.round((m.goalPct ?? 0) * 100)}%` : '—'} sub={m.goal ? `of ${inrS(m.goal)}` : 'no goal'} /><span>This month's goal</span></div>
			<div><Gauge value={m.onTime} gradient={false} color="var(--ok)" center={m.onTime === null ? '—' : `${Math.round(m.onTime * 100)}%`} sub="on time" /><span>Paid by the due date</span></div>
			<div><Gauge value={m.avgWait === null ? null : Math.max(0, 1 - m.avgWait / 60)} gradient={false} color="var(--h-request)" center={m.avgWait === null ? '—' : `${m.avgWait}d`} sub="usual wait" /><span>From going live to paid</span></div>
		</div>
	</section>
</div>

<style>
	.md-fy { display: flex; justify-content: center; margin: 4px 16px 14px; }
	.md-hero { position: relative; overflow: hidden; isolation: isolate; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 26px; align-items: center; padding: 28px 32px; margin-bottom: 20px; border-radius: 28px; background: var(--hero); color: var(--hero-ink); box-shadow: var(--shadow-lg); border: 1px solid color-mix(in oklab, var(--hero-ink) 8%, transparent); }
	.md-hero > :global(.mesh) { opacity: .55; filter: blur(36px); z-index: -1; }
	.md-main { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
	.md-big { font-size: clamp(40px, 4.4vw, 62px); font-weight: 600; letter-spacing: -.05em; line-height: 1.02; color: var(--hero-ink); }
	.md-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; font-size: 14.5px; font-weight: 500; color: color-mix(in oklab, var(--hero-ink) 70%, transparent); }
	.md-chip { display: inline-flex; align-items: center; height: 28px; padding: 0 12px; border-radius: 999px; font-weight: 700; background: color-mix(in oklab, var(--ok) 18%, transparent); color: color-mix(in oklab, var(--ok) 60%, var(--hero-ink)); border: 1px solid color-mix(in oklab, var(--ok) 35%, transparent); }
	.md-chip.down { background: color-mix(in oklab, var(--bad) 18%, transparent); color: color-mix(in oklab, var(--bad) 60%, var(--hero-ink)); border-color: color-mix(in oklab, var(--bad) 35%, transparent); }
	.md-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
	.md-tile { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 16px 18px; border-radius: 18px; text-decoration: none; color: var(--hero-ink); background: color-mix(in oklab, var(--hero-ink) 7%, transparent); border: 1px solid color-mix(in oklab, var(--hero-ink) 12%, transparent); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); transition: background .25s, transform .4s var(--spring); }
	.md-tile:hover { background: color-mix(in oklab, var(--hero-ink) 12%, transparent); transform: translateY(-3px); }
	.md-tile small { font-size: 13.5px; font-weight: 600; color: color-mix(in oklab, var(--hero-ink) 70%, transparent); }
	.md-tile b { font-size: 28px; font-weight: 600; letter-spacing: -.04em; line-height: 1.15; }
	.md-tile span { font-size: 13px; color: color-mix(in oklab, var(--hero-ink) 66%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.md-tile.bad b { color: var(--bad); }

	.md-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
	.md-card { display: flex; flex-direction: column; gap: 18px; min-width: 0; padding: 22px 24px; border-radius: 24px; background: color-mix(in oklab, var(--surface) 94%, transparent); border: 1px solid color-mix(in oklab, var(--line) 85%, transparent); box-shadow: var(--shadow-sm); }
	.md-wide { grid-column: 1 / -1; }
	.md-h { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
	.md-h :global(.bx-eb) { display: block; margin-bottom: 2px; }
	.md-h h2 { margin: 0; font-size: 20px; letter-spacing: -.03em; }
	.md-h a { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 600; color: var(--accent); text-decoration: none; white-space: nowrap; }
	.md-h a :global(.ic) { width: 15px; height: 15px; }
	.md-sum { font-size: 22px; font-weight: 600; letter-spacing: -.03em; }
	.md-note { margin: 0; font-size: 13.5px; color: var(--ink-3); }
	.md-note .bad { color: var(--bad); font-weight: 600; }
	.md-gauges { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; justify-items: center; }
	.md-gauges > div { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
	.md-gauges span { font-size: 13.5px; color: var(--ink-2); font-weight: 500; }

	@media (max-width: 1180px) {
		.md-hero { grid-template-columns: minmax(0, 1fr); }
	}
	@media (max-width: 900px) {
		.md-grid { grid-template-columns: minmax(0, 1fr); }
	}
	/* Phone: the same dashboard, one column, edge to edge like the rest of the app. */
	@media (max-width: 760px) {
		.md-hero { margin: 0 12px 14px; padding: 22px 18px; border-radius: 24px; gap: 18px; }
		.md-big { font-size: 40px; }
		.md-tile { padding: 12px 14px; border-radius: 16px; }
		.md-tile b { font-size: 21px; }
		.md-tile small { font-size: 12.5px; }
		.md-tile span { font-size: 12px; }
		.md-grid { gap: 12px; margin: 0 12px 24px; }
		.md-card { padding: 18px 16px; border-radius: 20px; gap: 14px; }
		.md-h h2 { font-size: 18px; }
		.md-gauges { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
		.md-gauges :global(.ga) { width: 96px !important; height: 96px !important; }
		.md-gauges :global(.ga-c b) { font-size: 18px; }
		.md-gauges span { font-size: 12px; }
	}
</style>
