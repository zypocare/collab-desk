<script lang="ts">
	import { markPaid, studio } from '#lib/studio.svelte.ts';
	import { useFinancialReport } from '#lib/financialReport.svelte.ts';
	import { moneyDash } from '#lib/moneyDash.ts';
	import { fyFromStart, fyOf } from '#lib/reports.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { countUp, ui } from '#lib/ui.svelte.ts';
	import { delivText, diff, fmt, inr, inrS, outstanding, overdue, today, waShare } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import RingIcons from '#lib/components/RingIcons.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import Ticket from '#lib/components/Ticket.svelte';
	import Columns from '#lib/components/charts/Columns.svelte';
	import Lines from '#lib/components/charts/Lines.svelte';
	import Donut from '#lib/components/charts/Donut.svelte';
	import HBars from '#lib/components/charts/HBars.svelte';
	import Gauge from '#lib/components/charts/Gauge.svelte';
	import LaptopMoney from '#lib/components/LaptopMoney.svelte';
	import OtherIncome from '#lib/components/OtherIncome.svelte';

	// Money at a glance: Wealth Vault cockpit + inline collect tickets + all 7 analytics charts.
	const current = fyOf(today());
	let fyStart = $state(String(current.start));
	const fy = $derived(fyFromStart(Number(fyStart)));
	const liveReport = useFinancialReport(() => Number(fyStart));
	const previousReport = useFinancialReport(() => Number(fyStart) - 1);
	const m = $derived(moneyDash(studio.collabs, fy, Math.max(0, studio.settings?.monthly_goal || 0), liveReport.summary, previousReport.summary));
	const fyOptions = [current.start - 1, current.start].map((y) => ({ value: String(y), label: fyFromStart(y).label }));
	const catTotal = $derived(m.categories.reduce((a, s) => a + s.value, 0));
	const mixTotal = $derived(m.mix.reduce((a, s) => a + s.value, 0));
	const comingTotal = $derived(m.weeks.reduce((a, w) => a + w.value, 0));
	const RECEIVED = 'linear-gradient(180deg, var(--g2), var(--g1))';

	const lateList = $derived(studio.collabs.filter(overdue).sort((a, b) => outstanding(b) - outstanding(a)));
	const openQueue = $derived(
		studio.collabs
			.filter((c) => outstanding(c) > 0 && (c.stage === 'live' || c.stage === 'wrapped'))
			.sort((a, b) => (overdue(b) ? 1 : 0) - (overdue(a) ? 1 : 0) || outstanding(b) - outstanding(a))
			.slice(0, 2)
	);
	const dueN = $derived(studio.collabs.filter((c) => outstanding(c) > 0 && (c.pay_status === 'invoiced' || c.pay_status === 'advance')).length);
	const paidWeek = $derived(studio.collabs.filter((c) => c.pay_status === 'paid' && c.paid_on && diff(c.paid_on) >= -7).length);
	const goalPct = $derived(m.goal ? Math.min(100, Math.round((m.goalPct ?? 0) * 100)) : 0);
	const goalSegs = $derived(m.goal ? Math.min(8, Math.max(1, Math.ceil((goalPct / 100) * 8))) : 0);
	const primaryCollab = $derived(lateList[0] ?? openQueue[0] ?? null);

	const facts = $derived(
		[
			...lateList.slice(0, 2).map((c) => ({ b: inr(outstanding(c)), t: ` from ${c.brand.name} is ${-diff(c.pay_due!)} days late` })),
			{ b: inrS(m.thisMonth), t: ' came in this month' },
			paidWeek ? { b: String(paidWeek), t: ` payment${paidWeek === 1 ? '' : 's'} in this week` } : null,
			m.due ? { b: inrS(m.due), t: ' yet to come' } : null,
			m.tds ? { b: inrS(m.tds), t: ' TDS to claim back' } : null
		].filter((x): x is { b: string; t: string } => !!x)
	);
	const mLabel = (l: string) => (phone.on ? l.slice(0, 1) : l);
	const wLabel = (l: string, i: number) => (!phone.on ? l : i === 0 ? 'Now' : l.split(' ')[0]);
	const nudgeText = (c: (typeof studio.collabs)[number]) =>
		`Hi ${c.brand.name} team! Quick reminder on ${c.invoice_no || 'our collab'} (${inr(outstanding(c))}). Let me know once processed!`;
</script>

<svelte:head><title>Money · {studio.settings?.app_name}</title></svelte:head>

{#if !phone.on}
	<LaptopMoney />
{:else}
	{#if liveReport.error || previousReport.error}<p class="err-box" role="status">{liveReport.error || previousReport.error}</p>{/if}

	<div class="md-fy"><Segmented label="Financial year" bind:value={fyStart} options={fyOptions} /></div>

	<!-- Wealth Vault Hero Cockpit -->
	<section class="vault rv" aria-label="This year">
		<div class="vault-top">
			<span class="bx-eb">Earned in {fy.label}</span>
			{#if m.vsLast !== null}
				<span class="v-yoy" class:down={m.vsLast < 0}>{m.vsLast >= 0 ? '↑ +' : ''}{m.vsLast}% vs {m.prevLabel}</span>
			{/if}
		</div>

		<b class="v-big num" use:countUp={{ value: m.received, money: true }}>{inr(m.received)}</b>

		<div class="v-sub">
			{#if m.tds}<span><b>{inrS(m.tds)}</b> TDS deducted</span>{/if}
			{#if m.tds && m.barter}<span>·</span>{/if}
			{#if m.barter}<span><b>+{inrS(m.barter)}</b> in products</span>{/if}
		</div>

		<a class="v-goal" href="/studio/settings">
			<span class="v-goal-h">
				<strong><i aria-hidden="true"></i>{m.goal ? `Monthly Goal · ${goalPct}%` : 'Set a monthly goal'}</strong>
				<small>{m.goal ? `${inrS(m.thisMonth)} / ${inrS(m.goal)}` : 'Tap to set'} <Icon name="chevR" /></small>
			</span>
			{#if m.goal}
				<span class="v-track" aria-hidden="true">
					{#each [0, 1, 2, 3, 4, 5, 6, 7] as idx (idx)}
						<i class:done={idx < goalSegs - 1} class:current={idx === goalSegs - 1}></i>
					{/each}
				</span>
			{/if}
		</a>

		<div class="v-kpi4">
			<a href="/studio/payments"><small>This mo</small><b class="num">{inrS(m.thisMonth)}</b></a>
			<a class="warn" href="/studio/payments"><small>To come</small><b class="num">{inrS(m.due)}</b></a>
			<a class:bad={m.late > 0} href="/studio/payments"><small>Overdue</small><b class="num">{inrS(m.late)}</b></a>
			<a class="ok" href="/studio/reports"><small>Avg deal</small><b class="num">{m.avgDeal ? inrS(m.avgDeal) : '—'}</b></a>
		</div>

		{#if primaryCollab}
			<a class="btn primary v-cta" href="/studio/payments">
				<Icon name="bell" />
				<span>Collect {inr(outstanding(primaryCollab))}{overdue(primaryCollab) ? ' overdue' : ''} ({primaryCollab.brand.name})</span>
				<Icon name="arrow" />
			</a>
		{:else}
			<a class="btn primary v-cta" href="/studio/invoices">
				<Icon name="doc" />
				<span>Create new 0%-fee UPI invoice</span>
				<Icon name="arrow" />
			</a>
		{/if}
	</section>

	<nav class="cr-rings" aria-label="Money shortcuts">
		<a class="cr-ring" style="--rt:var(--g3)" href="/studio/payments"><i><span><RingIcons i={0} icons={['wallet', 'rupee', 'check']} /></span></i>{#if lateList.length}<b>{lateList.length} LATE</b>{:else if dueN}<b>{dueN} DUE</b>{/if}<small>Payments</small></a>
		<a class="cr-ring" style="--rt:var(--h-request)" href="/studio/reports"><i><span><RingIcons i={1} icons={['chart', 'eye', 'layers']} /></span></i><small>Reports</small></a>
		<a class="cr-ring" style="--rt:var(--g2)" href="/studio/invoices"><i><span><RingIcons i={2} icons={['doc', 'send', 'check']} /></span></i><small>Invoices</small></a>
		<a class="cr-ring" style="--rt:var(--h-live)" href="/studio/tax"><i><span><RingIcons i={3} icons={['rupee', 'shield', 'scale']} /></span></i><small>Tax desk</small></a>
		<a class="cr-ring" style="--rt:var(--g1)" href="/studio/calendar"><i><span><RingIcons i={4} icons={['cal', 'clock', 'bell']} /></span></i><small>Due dates</small></a>
	</nav>

	{#if facts.length}
		<div class="cr-ticker" aria-label="Money facts"><div>{#each [0, 1] as k (k)}{#each facts as f, j (j)}<span aria-hidden={k === 1}><b>{f.b}</b>{f.t}</span><span aria-hidden="true">✦</span>{/each}{/each}</div></div>
	{/if}

	{#if openQueue.length}
		<section class="v-queue rv" aria-label="To collect right now">
			<header class="v-qh">
				<div><span class="bx-eb">Action queue</span><h2>To collect right now</h2></div>
				<a class="btn sm" href="/studio/payments">All payments</a>
			</header>
			<div class="tks">
				{#each openQueue as c, i (c.id)}
					{@const isLate = overdue(c)}
					<Ticket
						name={c.brand.name}
						sub={delivText(c.deliverables)}
						money={inrS(outstanding(c))}
						moneySub={isLate ? 'overdue' : c.pay_due ? 'due' : 'not invoiced'}
						task={c.invoice_no ? `Invoice ${c.invoice_no}` : 'Send the invoice'}
						status={c.pay_due ? (diff(c.pay_due) < 0 ? `${-diff(c.pay_due)}d late` : `Due ${fmt(c.pay_due)}`) : 'Not invoiced yet'}
						tone={isLate ? 'hot' : 'warn'}
						onopen={() => (ui.openCollab = c.id)}
						{i}
					>
						<a class="btn wa" href={waShare(c.contact_phone, nudgeText(c))} target="_blank" rel="noopener">WhatsApp</a>
						<button type="button" class="btn primary" onclick={() => markPaid(c)}>Paid?</button>
					</Ticket>
				{/each}
			</div>
		</section>
	{/if}

	<div class="md-grid">
		<section class="md-card md-wide rv" style="--i:1">
			<header class="md-h"><div><span class="bx-eb">Month by month</span><h2>What came in</h2></div><a href="/studio/reports">Full report<Icon name="arrow" /></a></header>
			<Columns
				items={m.monthly.map((x) => ({ label: mLabel(x.label), values: [x.invoiced, x.received, x.barter], now: x.now }))}
				names={['Invoiced', 'Received', 'Products']}
				colors={['color-mix(in oklab, var(--g1) 30%, transparent)', RECEIVED, 'var(--g3)']}
				fmt={inrS}
				height={170}
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
				height={160}
			/>
		</section>

		<section class="md-card rv" style="--i:3">
			<header class="md-h"><div><span class="bx-eb">Where it comes from</span><h2>By brand category</h2></div></header>
			<Donut slices={m.categories} center={inrS(catTotal)} sub="received" fmt={inrS} />
		</section>

		<section class="md-card rv" style="--i:4">
			<header class="md-h"><div><span class="bx-eb">Who pays most</span><h2>Top brands</h2></div><a href="/studio/brands">All brands<Icon name="arrow" /></a></header>
			<HBars rows={m.brands.map((b) => ({ label: b.name, values: [b.received, b.due] }))} names={['Received', 'Yet to come']} colors={['var(--g2)', 'color-mix(in oklab, var(--g1) 45%, transparent)']} fmt={inrS} />
		</section>

		<section class="md-card rv" style="--i:5">
			<header class="md-h"><div><span class="bx-eb">Cash or product</span><h2>How you're paid</h2></div></header>
			<Donut slices={m.mix} center={inrS(mixTotal)} sub="in total" fmt={inrS} />
		</section>

		<section class="md-card rv" style="--i:6">
			<header class="md-h"><div><span class="bx-eb">Coming in</span><h2>Next 8 weeks</h2></div><b class="md-sum num">{inrS(comingTotal)}</b></header>
			<Columns items={m.weeks.map((w, i) => ({ label: wLabel(w.label, i), values: [w.value], now: i === 0 }))} names={['Due that week']} colors={['linear-gradient(180deg, var(--h-live), color-mix(in oklab, var(--h-live) 55%, var(--g1)))']} fmt={inrS} height={140} />
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
	<OtherIncome {fy} received={m.received} />
{/if}

<style>
	@property --v-rim { syntax: '<angle>'; initial-value: 0deg; inherits: false; }

	.vault {
		position: relative;
		overflow: hidden;
		border-radius: 22px;
		padding: 16px;
		margin-bottom: 14px;
		border: 1px solid transparent;
		background:
			linear-gradient(142deg, #271b2a 0%, #1a141b 55%, #241822 100%) padding-box,
			conic-gradient(from var(--v-rim), rgba(178, 154, 255, 0.85), rgba(242, 90, 144, 0.8), rgba(255, 174, 107, 0.75), rgba(70, 52, 66, 0.28), rgba(178, 154, 255, 0.85)) border-box;
		animation: v-spin 10s linear infinite;
		box-shadow: 0 22px 46px -24px rgba(169, 122, 255, 0.42);
	}
	.vault::before, .vault::after { content: ''; position: absolute; border-radius: 50%; pointer-events: none; filter: blur(34px); opacity: 0.35; }
	.vault::before { width: 150px; height: 150px; top: -55px; right: -35px; background: radial-gradient(circle, var(--g2), transparent 70%); }
	.vault::after { width: 140px; height: 140px; bottom: -60px; left: -30px; background: radial-gradient(circle, var(--g1), transparent 70%); }
	.vault > * { position: relative; z-index: 1; }

	.vault-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.v-yoy { display: inline-flex; align-items: center; padding: 4px 8px; border: 1px solid rgba(111, 208, 140, 0.35); background: rgba(111, 208, 140, 0.13); color: var(--ok); font: 700 10px/1 ui-monospace, Consolas, monospace; text-transform: uppercase; }
	.v-yoy.down { border-color: rgba(245, 107, 107, 0.4); background: rgba(245, 107, 107, 0.13); color: var(--bad); }
	.v-big { display: block; font: 400 42px/1 var(--f-serif, Georgia, serif); letter-spacing: -2px; color: var(--ink); margin: 8px 0 4px; text-shadow: 0 6px 24px rgba(242, 90, 144, 0.22); }
	.v-sub { font-size: 11.5px; color: var(--ink-2); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 13px; }
	.v-sub b { color: var(--g3); font-weight: 650; }

	.v-goal { display: grid; gap: 7px; padding: 10px 11px; border-radius: 14px; background: rgba(17, 13, 17, 0.62); border: 1px solid #3c2f3d; margin-bottom: 12px; text-decoration: none; color: inherit; }
	.v-goal-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.v-goal-h strong { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; }
	.v-goal-h strong i { width: 7px; height: 7px; border-radius: 50%; background: var(--g2); }
	.v-goal-h small { font-size: 11.5px; color: var(--ink-3); display: inline-flex; align-items: center; gap: 4px; }
	.v-goal-h :global(svg) { width: 13px; height: 13px; }
	.v-track { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 4px; }
	.v-track i { height: 5px; border-radius: 999px; background: #312632; }
	.v-track i.done { background: linear-gradient(90deg, var(--g1), #d17cff); }
	.v-track i.current { background: linear-gradient(90deg, var(--g2), var(--g3), var(--g1)); box-shadow: 0 0 12px -1px rgba(242, 90, 144, 0.72); }

	.v-kpi4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-bottom: 12px; }
	.v-kpi4 a { border: 1px solid #382c38; background: rgba(28, 23, 28, 0.75); border-radius: 12px; padding: 8px 7px; text-decoration: none; display: grid; gap: 2px; }
	.v-kpi4 small { font-size: 9px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .06em; font-weight: 700; }
	.v-kpi4 b { font: italic 400 16px/1.1 var(--f-serif, Georgia, serif); color: var(--ink); }
	.v-kpi4 a.warn b { color: var(--g3); }
	.v-kpi4 a.bad b { color: var(--bad); }
	.v-kpi4 a.ok b { color: var(--ok); }

	.v-cta { width: 100%; justify-content: space-between; }
	.v-cta span { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.v-queue { display: grid; gap: 10px; margin: 14px 0 16px; }
	.v-qh { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; }
	.v-qh h2 { margin: 2px 0 0; font-size: 16px; }

	@keyframes v-spin { to { --v-rim: 360deg; } }
	@media (prefers-reduced-motion: reduce) { .vault { animation: none; } }
</style>
