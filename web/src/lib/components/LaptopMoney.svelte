<script lang="ts">
	// Money on a laptop: an exact build of the approved design (artifact "Laptop Money redesign").
	// The year at the top, this month's goal beside it, four numbers in one strip, a line of money
	// facts, month by month next to what is coming in, then who pays most and where it comes from.
	import { studio } from '../studio.svelte';
	import { ui, countUp } from '../ui.svelte';
	import { moneyDash } from '../moneyDash';
	import { fyFromStart, fyOf } from '../reports';
	import { diff, fmt, inr, inrS, outstanding, overdue, today } from '../util';
	import Icon from './Icon.svelte';

	const current = fyOf(today());
	let fyStart = $state(current.start);
	const fy = $derived(fyFromStart(fyStart));
	const s = $derived(studio.settings!);
	const m = $derived(moneyDash(studio.collabs, fy, Math.max(0, s.monthly_goal || 0)));
	const years = [current.start - 1, current.start];

	const monthName = new Date().toLocaleDateString('en-IN', { month: 'long' });
	const nowI = $derived(m.monthly.findIndex((x) => x.now));

	// The hero's soft area: the running total this year, last year's as a dashed line.
	const W = 600;
	const H = 120;
	const area = $derived.by(() => {
		const step = W / 11;
		const now = m.growth.map((g) => g.now).filter((v): v is number => v !== null);
		const last = m.growth.map((g) => g.last);
		const top = Math.max(1, ...now, ...last) * 1.08;
		const y = (v: number) => (H - 6 - (v / top) * (H - 14)).toFixed(1);
		const pts = now.map((v, i) => `${(i * step).toFixed(1)} ${y(v)}`);
		const line = pts.length ? 'M' + pts.join(' L') : '';
		return {
			line,
			fill: pts.length ? `${line} L${((pts.length - 1) * step).toFixed(1)} ${H} L0 ${H} Z` : '',
			last: 'M' + last.map((v, i) => `${(i * step).toFixed(1)} ${y(v)}`).join(' L')
		};
	});

	// This month's goal ring.
	const RING = 2 * Math.PI * 50;
	const pct = $derived(m.goal ? Math.round((m.goalPct ?? 0) * 100) : 0);
	const best = $derived(m.thisMonth > 0 && m.monthly.every((x) => x.now || x.received <= m.thisMonth));
	const goalLine = $derived(!m.goal ? '' : pct >= 100 ? (best ? 'Best month yet.' : 'Goal reached.') : `${inrS(m.goal - m.thisMonth)} to go.`);

	// Month by month.
	const colMax = $derived(Math.max(1, ...m.monthly.map((x) => Math.max(x.received, x.invoiced))));
	const short = (v: number) => (v ? inrS(v) : '');

	// Coming in: what is late first, then what is due in the next eight weeks.
	const comingTotal = $derived(m.weeks.reduce((a, w) => a + w.value, 0));
	const coming = $derived(
		studio.collabs
			.filter((c) => outstanding(c) > 0 && c.pay_due && (overdue(c) || diff(c.pay_due) < 56))
			.sort((a, b) => (a.pay_due! < b.pay_due! ? -1 : 1))
			.slice(0, 5)
			.map((c) => {
				const d = new Date(c.pay_due! + 'T00:00:00');
				const late = overdue(c);
				return {
					c,
					day: d.getDate(),
					mon: d.toLocaleDateString('en-IN', { month: 'short' }),
					late,
					status: late ? `${-diff(c.pay_due!)} days late` : c.pay_status === 'advance' ? 'Advance in' : c.pay_status === 'invoiced' ? 'Invoice sent' : 'Due'
				};
			})
	);

	// Who pays most.
	const bMax = $derived(Math.max(1, ...m.brands.map((b) => b.received + b.due)));

	// Where it comes from, in the design's colours: pink first, then plum, then peach.
	const CAT = ['var(--g2)', 'var(--g1)', 'var(--g3)', 'var(--h-live)', 'var(--h-request)', 'var(--m5)'];
	const catTotal = $derived(m.categories.reduce((a, x) => a + x.value, 0));
	const cats = $derived(m.categories.map((x, i) => ({ ...x, color: CAT[i % CAT.length], p: catTotal ? Math.round((x.value / catTotal) * 100) : 0 })));
	const mix = $derived([
		{ label: 'Cash received', value: m.received, color: 'var(--g2)' },
		{ label: 'Still to come', value: m.due, color: 'var(--g1)' },
		{ label: 'Products', value: m.barter, color: 'var(--g3)' }
	]);
	const mixTotal = $derived(mix.reduce((a, x) => a + x.value, 0));

	// A line of money facts.
	const lateList = $derived(studio.collabs.filter(overdue).sort((a, b) => outstanding(b) - outstanding(a)));
	const paidWeek = $derived(studio.collabs.filter((c) => c.pay_status === 'paid' && c.paid_on && diff(c.paid_on) >= -7).length);
	const nextPay = $derived(coming.find((x) => !x.late));
	const facts = $derived(
		[
			...lateList.slice(0, 2).map((c) => ({ b: inr(outstanding(c)), t: ` from ${c.brand.name} is ${-diff(c.pay_due!)} days late` })),
			{ b: inrS(m.thisMonth), t: ` came in this ${monthName}` },
			m.due ? { b: inrS(m.due), t: ' still to come' } : null,
			m.tds ? { b: inrS(m.tds), t: ' TDS to claim back' } : null,
			nextPay ? { b: nextPay.c.brand.name, t: ` pays next, ${fmt(nextPay.c.pay_due)}` } : null,
			paidWeek ? { b: String(paidWeek), t: ` payment${paidWeek === 1 ? '' : 's'} landed this week` } : null
		].filter((x): x is { b: string; t: string } => !!x)
	);
</script>

<div class="lm">
	<!-- The same header as Payments and Reports; the shared top bar carries the tabs and buttons. -->
	<header class="ph rv">
		<div>
			<div class="eb">Money · {fy.label}</div>
			<h1>Money</h1>
			<p>Everything you've earned, what's coming in, and who pays best.</p>
		</div>
	</header>

	<!-- Row 1: the year + this month's goal -->
	<div class="lm-r1">
		<section class="lm-hero">
			<div class="lm-ht">
				<span>Earned this year</span>
				<div class="lm-fy" role="group" aria-label="Financial year">
					{#each years as y (y)}
						<button class:on={fyStart === y} aria-pressed={fyStart === y} onclick={() => (fyStart = y)}>{fyFromStart(y).label}</button>
					{/each}
				</div>
			</div>
			<div class="lm-big">
				{#key fyStart}<b use:countUp={{ value: m.received, money: true }}>{inr(m.received)}</b>{/key}
				{#if m.vsLast !== null}<span class="lm-vs" class:down={m.vsLast < 0}>{m.vsLast >= 0 ? '▲' : '▼'} {Math.abs(m.vsLast)}% vs this time last year</span>{/if}
			</div>
			<div class="lm-facts">
				{#if m.tds}<span><b>{inr(m.tds)}</b> TDS deducted</span>{/if}
				{#if m.barter}<span><b>{inr(m.barter)}</b> in products</span>{/if}
				<span><b>{m.deals}</b> paid collab{m.deals === 1 ? '' : 's'}</span>
			</div>
			<svg class="lm-area" viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="Money received through the year">
				<defs>
					<linearGradient id="lm-ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F25A90" stop-opacity=".45"></stop><stop offset="1" stop-color="#F25A90" stop-opacity="0"></stop></linearGradient>
					<linearGradient id="lm-ln" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9C7BFF"></stop><stop offset=".6" stop-color="#F25A90"></stop><stop offset="1" stop-color="#FFAE6B"></stop></linearGradient>
				</defs>
				{#if area.fill}<path d={area.fill} fill="url(#lm-ar)"></path>{/if}
				{#if area.line}<path d={area.line} fill="none" stroke="url(#lm-ln)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>{/if}
				<path d={area.last} fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.6" stroke-dasharray="5 6" vector-effect="non-scaling-stroke"></path>
			</svg>
			<div class="lm-ml">{#each m.monthly as x, i (x.label)}<span class:now={x.now} class:later={nowI >= 0 && i > nowI}>{x.label}</span>{/each}</div>
		</section>

		<section class="lm-card lm-goal">
			<div class="lm-sh"><span>{monthName} goal</span><a href="/studio/settings?s=payments">{m.goal ? 'Change' : 'Set one'} →</a></div>
			<div class="lm-ring">
				<svg width="190" height="190" viewBox="0 0 120 120" aria-hidden="true">
					<defs><linearGradient id="lm-gr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9C7BFF"></stop><stop offset=".55" stop-color="#F25A90"></stop><stop offset="1" stop-color="#FFAE6B"></stop></linearGradient></defs>
					<circle cx="60" cy="60" r="50" fill="none" class="lm-track" stroke-width="9"></circle>
					{#if m.goal}<circle cx="60" cy="60" r="50" fill="none" stroke="url(#lm-gr)" stroke-width="9" stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="{(RING * Math.min(1, m.goalPct ?? 0)).toFixed(1)} {RING.toFixed(1)}"></circle>{/if}
				</svg>
				<span><b>{m.goal ? `${pct}%` : '—'}</b><small>{m.goal ? `of ${inrS(m.goal)}` : 'no goal'}</small></span>
			</div>
			<p class="lm-say">{inrS(m.thisMonth)} in so far.{#if goalLine}{' '}<em>{goalLine}</em>{/if}</p>
			<div class="lm-pace">
				<div><small>Paid on time</small><b>{m.onTime === null ? '—' : `${Math.round(m.onTime * 100)}%`}</b></div>
				<div><small>Usual wait</small><b>{m.avgWait === null ? '—' : `${m.avgWait} day${m.avgWait === 1 ? '' : 's'}`}</b></div>
			</div>
		</section>
	</div>

	<!-- Row 2: the four numbers that matter -->
	<section class="lm-strip" aria-label="At a glance">
		<a href="/studio/payments"><span class="lm-k"><i style="background: linear-gradient(135deg, var(--g1), var(--g2))"></i>This month</span><b>{inrS(m.thisMonth)}</b><span>{m.goal ? `${pct}% of the ${inrS(m.goal)} goal` : 'no monthly goal set'}</span></a>
		<a href="/studio/payments"><span class="lm-k"><i style="background: #EFB35A"></i>Still to come</span><b>{inrS(m.due)}</b><span>{m.later ? `${inrS(m.later)} not yet due` : 'from open invoices'}</span></a>
		<a href="/studio/payments"><span class="lm-k"><i style="background: {m.late ? 'var(--bad)' : '#6FD08C'}"></i>Overdue</span><b>{inrS(m.late)}</b><span>{m.late ? 'needs a nudge' : 'every brand on time'}</span></a>
		<a href="/studio/reports"><span class="lm-k"><i style="background: #7EA2FF"></i>Average deal</span><b>{m.avgDeal ? inrS(m.avgDeal) : '—'}</b><span>across {m.deals} paid collab{m.deals === 1 ? '' : 's'}</span></a>
	</section>

	{#if facts.length}
		<div class="lm-tick" aria-label="Money facts"><div>{#each [0, 1] as k (k)}{#each facts as f, j (j)}<span aria-hidden={k === 1}><b>{f.b}</b>{f.t}</span><i aria-hidden="true">✦</i>{/each}{/each}</div></div>
	{/if}

	<!-- Row 3: month by month + coming in -->
	<div class="lm-r1">
		<section class="lm-card lm-mm">
			<div class="lm-ch">
				<div><span class="lm-eb">Month by month</span><h2>What came in</h2></div>
				<div class="lm-leg"><span><i class="rec"></i>Received</span><span><i class="inv"></i>Invoiced</span><span><i class="prod"></i>Products</span></div>
				<a href="/studio/reports">Full report →</a>
			</div>
			<div class="lm-cols">
				{#each m.monthly as x, i (x.label)}
					<div class="lm-col" class:now={x.now} class:later={nowI >= 0 && i > nowI} title="{x.label}: {inr(x.received)} received, {inr(x.invoiced)} invoiced{x.barter ? `, ${inr(x.barter)} in products` : ''}">
						<small>{short(x.received)}</small>
						<span class="lm-bar">
							<i class="inv" style="height: {Math.round((x.invoiced / colMax) * 100)}%"></i>
							<i class="rec" style="height: {Math.round((x.received / colMax) * 100)}%; --d: {i * 60}ms"></i>
						</span>
						<span class="lm-pd" class:on={x.barter > 0}></span>
						<small class="lm-cl">{x.label}</small>
					</div>
				{/each}
			</div>
		</section>

		<section class="lm-card lm-come">
			<div><span class="lm-eb">Coming in · next 8 weeks</span><h2>{comingTotal ? `${inrS(comingTotal)} on the way` : 'Nothing due soon'}</h2></div>
			<div class="lm-list">
				{#each coming as x (x.c.id)}
					<button onclick={() => (ui.openCollab = x.c.id)}>
						<span class="lm-d"><b>{x.day}</b><small>{x.mon}</small></span>
						<span class="lm-w"><b>{x.c.brand.name}</b><span class:late={x.late}>{x.status}</span></span>
						<b class="lm-v">{inr(outstanding(x.c))}</b>
					</button>
				{:else}
					<p class="lm-none">No payments due in the next eight weeks.</p>
				{/each}
			</div>
			<a class="lm-neo lm-dark lm-all" href="/studio/payments">All payments</a>
		</section>
	</div>

	<!-- Row 4: who pays most + where it comes from -->
	<div class="lm-r4">
		<section class="lm-card lm-brands">
			<div class="lm-ch"><div><span class="lm-eb">Who pays most</span><h2>Your top brands</h2></div><a href="/studio/brands">All brands →</a></div>
			<ol>
				{#each m.brands as b, i (b.name + i)}
					<li class:top={i === 0}>
						<span class="lm-n">{String(i + 1).padStart(2, '0')}</span>
						<span class="lm-bn"><b>{b.name}</b><span class="lm-bt"><i style="width: {(b.received / bMax) * 100}%"></i><i class="due" style="left: {(b.received / bMax) * 100}%; width: {(b.due / bMax) * 100}%"></i></span></span>
						<span class="lm-bv"><b>{inrS(b.received)}</b><small>{b.due ? `+ ${inrS(b.due)} to come` : 'all paid'}</small></span>
					</li>
				{:else}
					<li class="lm-none">No brand has paid yet this year.</li>
				{/each}
			</ol>
		</section>

		<section class="lm-card lm-where">
			<div><span class="lm-eb">Where it comes from</span><h2>{#if cats.length}<em>{cats[0].label}</em> brands bring the most{:else}Nothing received yet{/if}</h2></div>
			{#if cats.length}
				<div class="lm-split">
					<span class="lm-eb">By brand category</span>
					<div class="lm-stack">{#each cats as c (c.label)}<span style="flex: {Math.max(c.p, 2)}; background: {c.color}"></span>{/each}</div>
					<div class="lm-rows">
						{#each cats as c (c.label)}<div><i style="background: {c.color}"></i><span>{c.label}</span><b>{inrS(c.value)}</b><small>{c.p}%</small></div>{/each}
					</div>
				</div>
			{/if}
			{#if mixTotal}
				<div class="lm-split">
					<span class="lm-eb">Cash or product</span>
					<div class="lm-stack">{#each mix as c (c.label)}{#if c.value}<span style="flex: {Math.max(Math.round((c.value / mixTotal) * 100), 2)}; background: {c.color}"></span>{/if}{/each}</div>
					<div class="lm-mix">{#each mix as c (c.label)}<span><i style="background: {c.color}"></i>{c.label} <b>{inrS(c.value)}</b></span>{/each}</div>
				</div>
			{/if}
		</section>
	</div>
</div>

<style>
	/* Every size, gap and colour below is taken from the approved laptop Money design. */
	.lm { display: flex; flex-direction: column; gap: 26px; padding-bottom: 56px; color: var(--ink); font-family: var(--f-body, Inter, system-ui, sans-serif); }
	.lm-eb, .lm-sh span, .lm-ht > span { font-size: 11px; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; color: var(--ink-3); }
	h2 { margin: 0; font-family: var(--f-serif, Georgia, serif); font-weight: 400; letter-spacing: -.01em; }
	h2 em { background: linear-gradient(90deg, var(--g1), var(--g2) 60%, var(--g3)); -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: 4px; }

	/* NeoPOP buttons */
	.lm-neo { position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 0; font: 700 14px var(--f-body, inherit); text-decoration: none; cursor: pointer; transition: transform .07s, box-shadow .07s; }
	.lm-neo:active { transform: translate(3px, 3px); box-shadow: none !important; }
	.lm-neo :global(.ic) { width: 17px; height: 17px; stroke-width: 2.4; }
	.lm-dark { border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); box-shadow: 3px 3px 0 var(--line-strong); }

	.lm-r1 { display: grid; grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr); gap: 22px; }
	.lm-r4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 22px; align-items: start; }
	.lm-card { border-radius: 26px; padding: 24px 26px; border: 1px solid var(--line); background: var(--surface); display: flex; flex-direction: column; gap: 14px; min-width: 0; }
	.lm-card h2 { font-size: 30px; line-height: 1.05; }
	.lm-card > div:first-child { display: grid; gap: 6px; }
	.lm-sh { display: flex !important; align-items: center; }
	.lm-sh a, .lm-ch > a { margin-left: auto; font-size: 13px; color: var(--ink-2); text-decoration: none; }
	.lm-sh a:hover, .lm-ch > a:hover { color: var(--g3); }
	.lm-ch { display: flex !important; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
	.lm-ch > div:first-child { display: grid; gap: 6px; }

	/* The year */
	.lm-hero { position: relative; overflow: hidden; border-radius: 26px; padding: 28px 30px 24px; color: #fff; display: flex; flex-direction: column; gap: 18px; min-width: 0;
		background: radial-gradient(120% 90% at 0% 0%, rgba(242, 90, 144, .35), transparent 55%), radial-gradient(90% 90% at 100% 100%, rgba(156, 123, 255, .30), transparent 60%), linear-gradient(140deg, #2a1424, #160c14 70%); }
	.lm-ht { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
	.lm-ht > span { color: rgba(255, 255, 255, .72); }
	.lm-fy { margin-left: auto; display: flex; border: 1px solid rgba(255, 255, 255, .25); }
	.lm-fy button { height: 34px; padding: 0 14px; border: 0; border-radius: 0; background: transparent; color: rgba(255, 255, 255, .7); font: 800 10.5px var(--f-body, inherit); letter-spacing: .12em; cursor: pointer; transition: transform .07s, box-shadow .07s; }
	.lm-fy button.on { position: relative; z-index: 1; background: #F4EEF2; color: #1E171C; box-shadow: 3px 3px 0 #F25A90; }
	.lm-fy button:active { transform: translate(3px, 3px); box-shadow: none; }
	.lm-big { display: flex; align-items: flex-end; gap: 22px; flex-wrap: wrap; }
	.lm-big > b { font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 84px; line-height: .95; letter-spacing: -.02em; }
	.lm-vs { margin-bottom: 10px; height: 30px; padding: 0 12px; display: inline-flex; align-items: center; gap: 6px; background: rgba(111, 208, 140, .16); border: 1px solid rgba(111, 208, 140, .4); color: #8BE0A5; font-size: 12.5px; font-weight: 700; }
	.lm-vs.down { background: rgba(255, 123, 112, .14); border-color: rgba(255, 123, 112, .4); color: #FF9B92; }
	.lm-facts { display: flex; gap: 22px; flex-wrap: wrap; font-size: 13.5px; color: rgba(255, 255, 255, .75); }
	.lm-facts b { color: #fff; }
	.lm-area { width: 100%; height: 120px; display: block; }
	.lm-ml { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); margin-top: -10px; font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: rgba(255, 255, 255, .55); text-align: center; }
	.lm-ml .now { color: #fff; }
	.lm-ml .later { color: rgba(255, 255, 255, .3); }

	/* This month's goal */
	.lm-goal { padding: 26px; gap: 18px; background: radial-gradient(120% 60% at 100% 0%, color-mix(in oklab, var(--g1) 16%, transparent), transparent 60%), var(--surface); }
	.lm-ring { position: relative; width: 190px; height: 190px; align-self: center; }
	.lm-ring svg { display: block; }
	.lm-track { stroke: var(--line); }
	.lm-ring > span { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
	.lm-ring b { display: block; font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 46px; line-height: 1; }
	.lm-ring small { font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-3); }
	.lm-say { margin: 0; text-align: center; font-family: var(--f-serif, Georgia, serif); font-size: 24px; line-height: 1.15; }
	.lm-say em { color: var(--g3); }
	.lm-pace { display: grid !important; grid-template-columns: 1fr 1fr; gap: 0 !important; border-top: 1px solid var(--line); margin-top: auto; }
	.lm-pace > div { padding: 14px 0 0; display: grid; gap: 4px; }
	.lm-pace > div + div { padding-left: 18px; border-left: 1px solid var(--line); }
	.lm-pace small, .lm-k { font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-3); }
	.lm-pace b { font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 30px; }

	/* Four numbers in one strip */
	.lm-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-radius: 22px; border: 1px solid var(--line); background: var(--surface); overflow: hidden; }
	.lm-strip a { padding: 22px 24px; display: grid; gap: 8px; color: var(--ink); text-decoration: none; transition: background .2s; }
	.lm-strip a + a { border-left: 1px solid var(--line); }
	.lm-strip a:hover { background: color-mix(in oklab, var(--ink) 4%, transparent); }
	.lm-k { display: flex; align-items: center; gap: 8px; font-size: 10.5px; letter-spacing: .15em; }
	.lm-k i { width: 8px; height: 8px; border-radius: 50%; }
	.lm-strip b { font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 40px; line-height: 1; }
	.lm-strip a > span:last-child { font-size: 12.5px; color: var(--ink-3); }

	/* Ticker: full width, between two thin lines */
	.lm-tick { overflow: hidden; margin: 0 -40px; background: var(--chrome, #09070A); border-block: 1px solid #1f191f; }
	.lm-tick > div { display: inline-flex; gap: 26px; padding: 11px 0; white-space: nowrap; font-size: 12.5px; color: rgba(255, 255, 255, .72); animation: lm-tick 40s linear infinite; }
	.lm-tick b { color: #FFAE6B; }
	.lm-tick i { font-style: normal; color: #F25A90; }
	@keyframes lm-tick { to { transform: translateX(-50%); } }

	/* Month by month */
	.lm-mm { gap: 18px; }
	.lm-leg { margin-left: auto; display: flex; gap: 16px; font-size: 12px; color: var(--ink-2); }
	.lm-leg span { display: inline-flex; align-items: center; gap: 6px; }
	.lm-leg i { width: 10px; height: 10px; }
	.lm-leg i.rec { background: linear-gradient(180deg, #F25A90, #9C7BFF); }
	.lm-leg i.inv { background: var(--line-strong); }
	.lm-leg i.prod { border-radius: 50%; background: #FFAE6B; }
	.lm-cols { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 10px; align-items: end; height: 230px; }
	.lm-col { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 8px; }
	.lm-col > small:first-child { min-height: 14px; font-size: 11px; font-weight: 700; color: var(--ink-3); white-space: nowrap; }
	.lm-col.now > small:first-child { color: var(--ink); }
	.lm-bar { position: relative; width: 26px; height: 170px; border-radius: 999px; background: color-mix(in oklab, var(--ink) 7%, transparent); overflow: hidden; }
	.lm-bar i { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 999px; transform-origin: bottom; animation: lm-grow .9s cubic-bezier(.2, .9, .25, 1) both; animation-delay: var(--d, 0ms); }
	.lm-bar i.inv { background: var(--line-strong); }
	.lm-bar i.rec { background: linear-gradient(0deg, #6B3FD4, #F25A90); }
	.lm-col.now .lm-bar i.rec { background: linear-gradient(0deg, #9C7BFF, #F25A90 60%, #FFAE6B); box-shadow: 0 0 22px -2px rgba(242, 90, 144, .7); }
	@keyframes lm-grow { from { transform: scaleY(0); } }
	.lm-pd { width: 6px; height: 6px; border-radius: 50%; }
	.lm-pd.on { background: #FFAE6B; }
	.lm-cl { font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); }
	.lm-col.now .lm-cl { color: var(--ink); }
	.lm-col.later .lm-cl { color: color-mix(in oklab, var(--ink-3) 55%, transparent); }

	/* Coming in */
	.lm-come { background: radial-gradient(120% 60% at 100% 0%, rgba(76, 207, 194, .12), transparent 60%), var(--surface); }
	.lm-list { display: flex; flex-direction: column; }
	.lm-list button { display: grid; grid-template-columns: 62px minmax(0, 1fr) auto; align-items: center; gap: 12px; width: 100%; padding: 12px 0; border: 0; border-bottom: 1px solid var(--line); background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
	.lm-list button:hover .lm-w b { color: var(--g3); }
	.lm-d { display: grid; gap: 2px; }
	.lm-d b { font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 24px; line-height: 1; }
	.lm-d small { font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); }
	.lm-w { min-width: 0; display: grid; gap: 3px; }
	.lm-w b { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.lm-w span { font-size: 10.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #4CCFC2; }
	.lm-w span.late { color: var(--bad); }
	.lm-v { font-size: 15px; }
	.lm-all { margin-top: auto; height: 44px; font-size: 13.5px; }
	.lm-none { margin: 0; padding: 14px 0; font-size: 13.5px; color: var(--ink-3); }

	/* Who pays most */
	.lm-brands { padding-bottom: 14px; gap: 10px; }
	.lm-brands ol { list-style: none; margin: 0; padding: 0; }
	.lm-brands li { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 13px 0; border-bottom: 1px solid var(--line); }
	.lm-brands li:last-child { border-bottom: 0; }
	.lm-n { font-family: var(--f-serif, Georgia, serif); font-style: italic; font-size: 28px; line-height: 1; color: color-mix(in oklab, var(--ink-3) 70%, transparent); }
	li.top .lm-n { background: linear-gradient(90deg, var(--g1), var(--g2) 60%, var(--g3)); -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: 4px; }
	.lm-bn { min-width: 0; display: grid; gap: 7px; }
	.lm-bn b { font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.lm-bt { position: relative; height: 4px; background: var(--line); }
	.lm-bt i { position: absolute; left: 0; top: 0; bottom: 0; background: #F25A90; }
	li.top .lm-bt i:first-child { background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3)); }
	.lm-bt i.due { background: color-mix(in oklab, var(--g1) 45%, transparent); }
	.lm-bv { text-align: right; display: grid; gap: 2px; }
	.lm-bv b { font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 22px; }
	.lm-bv small { font-size: 11px; color: var(--ink-3); }

	/* Where it comes from */
	.lm-where { gap: 22px; }
	.lm-split { display: grid !important; gap: 12px !important; }
	.lm-split .lm-eb { font-size: 10.5px; letter-spacing: .15em; }
	.lm-stack { display: flex; height: 18px; gap: 3px; }
	.lm-rows { display: flex; flex-direction: column; }
	.lm-rows > div { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto 46px; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
	.lm-rows i, .lm-mix i { width: 10px; height: 10px; border-radius: 50%; }
	.lm-rows small { text-align: right; font-size: 12.5px; color: var(--ink-3); }
	.lm-mix { display: flex; gap: 22px; flex-wrap: wrap; }
	.lm-mix span { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-2); }
	.lm-mix b { color: var(--ink); }

	@media (max-width: 1180px) {
		.lm-r1 { grid-template-columns: minmax(0, 1fr); }
		.lm-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.lm-strip a:nth-child(3) { border-left: 0; }
		.lm-strip a:nth-child(n + 3) { border-top: 1px solid var(--line); }
	}
	@media (prefers-reduced-motion: reduce) {
		.lm-tick > div, .lm-bar i { animation: none; }
	}
</style>
