<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '#lib/auth.svelte.ts';
	import { downloadExcel, loadReports, perView, PERIODS, range, reports, type Period } from '#lib/brandReports.svelte.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { countUp, toast } from '#lib/ui.svelte.ts';
	import { compact, errMessage, firstName, inr, inrS } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import BrandSales from '#lib/components/BrandSales.svelte';
	import BrandAnalyst from '#lib/components/BrandAnalyst.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import Ticket from '#lib/components/Ticket.svelte';
	import Columns from '#lib/components/charts/Columns.svelte';
	import Lines from '#lib/components/charts/Lines.svelte';
	import Donut from '#lib/components/charts/Donut.svelte';
	import HBars from '#lib/components/charts/HBars.svelte';
	import Gauge from '#lib/components/charts/Gauge.svelte';

	// Reports: everything across the brand's creators, campaigns and money, styled to match
	// Miracle's creator-side obsidian-violet cockpit, with the whole lot as one Excel file.
	const acct = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const company = $derived(acct?.brand?.name || acct?.profile?.name || 'Your brand');
	let period = $state<Period>(reports.period);
	onMount(() => loadReports(period));
	$effect(() => {
		if (period !== reports.period) loadReports(period);
	});
	const r = $derived(reports.data);
	const k = $derived(r?.kpi);
	const label = $derived(range(period).label);
	const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
	const spentChange = $derived(k ? change(k.spent, k.spent_prev) : null);
	const viewsChange = $derived(k ? change(k.views, k.views_prev) : null);
	const cpv = $derived(k ? perView(k.post_fees, k.views) : null);
	const engagement = $derived(k && k.reach ? k.acts / k.reach : k && k.views ? k.acts / k.views : null);
	const MONTH = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' });
	const mLabel = (m: string) => (phone.on ? MONTH(m).slice(0, 1) : MONTH(m));
	const wLabel = (w: string) => new Date(`${w}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
	const PAID = 'linear-gradient(180deg, var(--g2), var(--g1))';
	const COLORS = ['var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--h-live)', 'var(--h-request)'];
	const slices = $derived.by(() => {
		const list = (r?.by_creator ?? []).filter((c) => c.spent > 0);
		const top = list.slice(0, 4).map((c, i) => ({ label: firstName(c.name), value: c.spent, color: COLORS[i] }));
		const rest = list.slice(4).reduce((a, c) => a + c.spent, 0);
		return rest ? [...top, { label: `${list.length - 4} others`, value: rest, color: COLORS[4] }] : top;
	});
	const sliceTotal = $derived(slices.reduce((a, s) => a + s.value, 0));
	// Best creators by results: cheapest views first, then the most spent with.
	const best = $derived(
		[...(r?.by_creator ?? [])].sort((a, b) => (perView(a.fees, a.views) ?? 1e9) - (perView(b.fees, b.views) ?? 1e9) || b.spent - a.spent).slice(0, phone.on ? 3 : 6)
	);
	const budgetUsed = $derived.by(() => {
		const c = (r?.campaigns ?? []).filter((x) => x.budget > 0);
		const budget = c.reduce((a, x) => a + x.budget, 0);
		return budget ? Math.min(1, c.reduce((a, x) => a + x.spent, 0) / budget) : null;
	});
	const orbPct = $derived(budgetUsed !== null ? Math.round(budgetUsed * 100) : 0);
	const stars = (n: number | null) => (n === null ? 'Not rated' : '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n)));

	let busy = $state(false);
	async function excel() {
		busy = true;
		try {
			await downloadExcel(company);
			toast('Excel file ready', 'download');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Reports · Miracle</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Reports · {label}</div>
		<h1>Your brand at a <em>glance</em></h1>
		<p>Every creator, campaign and rupee, across all your creators.</p>
	</div>
</header>

<div class="br-bar">
	<Segmented label="Period" bind:value={period} options={PERIODS.map((p) => ({ value: p.id, label: p.label }))} />
	<button class="br-excel-btn" onclick={excel} disabled={busy || !r}>
		{#if busy}<span class="spinner"></span>{:else}<Icon name="download" />{/if}
		Download Excel
	</button>
</div>

{#if reports.error}<p class="err-box" role="status">{reports.error}</p>{/if}

{#if !r || !k}
	<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
{:else}
	<section class="br-hero rv" aria-label={label}>
		<div class="br-hero-top">
			<div class="br-hero-main">
				<div class="br-eb-row">
					<span class="br-eb-grad">Paid to creators · {label}</span>
					<em class="br-src" title="From the creators' invoices to you: paid ones count as paid">invoices</em>
				</div>
				<b class="br-big num" use:countUp={{ value: k.spent, money: true }}>{inr(k.spent)}</b>
				<div class="br-sub">
					{#if spentChange !== null}
						<span class="br-chip" class:down={spentChange < 0}>{spentChange >= 0 ? '+' : ''}{spentChange}% vs the period before</span>
					{/if}
					<span>{k.to_pay ? `${inrS(k.to_pay)} still to pay` : 'Nothing to pay right now'}</span>
				</div>
			</div>
			<div class="br-orb" title="Campaign budget utilized">
				<div class="br-orb-ring" style="--pct:{orbPct}"></div>
				<div class="br-orb-in">
					<b class="num">{budgetUsed === null ? '0%' : `${orbPct}%`}</b>
					<small>budget</small>
				</div>
			</div>
		</div>

		<div class="br-tiles">
			<a class="br-tile" href="/brand/business/content">
				<div class="br-tile-h">
					<span class="br-tile-lbl">Views</span>
					<em class="br-tile-src" title="Instagram's numbers for the collab posts, refreshed every day">Instagram</em>
				</div>
				<b class="br-tile-val num">{compact(k.views)}</b>
				<span class="br-tile-foot">
					{#if viewsChange !== null}<strong class:pos={viewsChange >= 0} class:neg={viewsChange < 0}>{viewsChange >= 0 ? '+' : ''}{viewsChange}%</strong> · {/if}{k.posts} post{k.posts === 1 ? '' : 's'}
				</span>
			</a>

			<a class="br-tile" href="/brand/business/content">
				<div class="br-tile-h">
					<span class="br-tile-lbl">Cost per view</span>
					<em class="br-tile-src" title="Creator fees for posts that went live, divided by Instagram's views">fees ÷ views</em>
				</div>
				<b class="br-tile-val num">{cpv === null ? '—' : `₹${cpv.toFixed(2)}`}</b>
				<span class="br-tile-foot">{engagement === null ? 'from the posts' : `${(engagement * 100).toFixed(1)}% engagement`}</span>
			</a>

			<a class="br-tile" href="/brand/requests">
				<div class="br-tile-h">
					<span class="br-tile-lbl">Requests</span>
					<em class="br-tile-src" title="Requests you sent in Miracle">Miracle</em>
				</div>
				<b class="br-tile-val num">{k.collabs}</b>
				<span class="br-tile-foot">{k.live} live · {k.talks} in talks</span>
			</a>

			<a class="br-tile" href="/brand/creators">
				<div class="br-tile-h">
					<span class="br-tile-lbl">Creators</span>
					<em class="br-tile-src">Roster</em>
				</div>
				<b class="br-tile-val num">{k.creators}</b>
				<span class="br-tile-foot">{k.rebooked} booked again</span>
			</a>
		</div>
	</section>

	<div class="br-grid">
		<BrandAnalyst report={r} {company} period={label} />

		<section class="br-card br-wide rv" style="--i:1">
			<header class="br-h">
				<div><span class="br-eb-grad">Month by month</span><h2>What you spent</h2></div>
				<a class="br-link" href="/brand/business/money">Payments<Icon name="arrow" /></a>
			</header>
			<Columns
				items={r.by_month.map((m, i) => ({ label: mLabel(m.month), values: [m.paid, m.due], now: i === r.by_month.length - 1 }))}
				names={['Paid', 'Due']}
				colors={[PAID, 'color-mix(in oklab, var(--warn) 70%, transparent)']}
				stacked
				fmt={inrS}
				height={phone.on ? 170 : 220}
			/>
		</section>

		<section class="br-card rv" style="--i:2">
			<header class="br-h">
				<div><span class="br-eb-grad">Results</span><h2>Views from creator posts</h2></div>
				<b class="br-sum num">{compact(k.views)}</b>
			</header>
			{#if k.views}
				<Lines labels={r.by_week.map((w, i) => (i % Math.max(1, Math.ceil(r.by_week.length / (phone.on ? 4 : 7))) === 0 ? wLabel(w.week) : ''))} series={[{ name: 'Views', color: 'var(--g2)', values: r.by_week.map((w) => w.views) }]} fmt={(v) => compact(v)} height={phone.on ? 160 : 190} />
			{:else}
				<p class="br-note">Views show up once creators' posts are live and linked to their requests.</p>
			{/if}
		</section>

		<section class="br-card rv" style="--i:3">
			<header class="br-h">
				<div><span class="br-eb-grad">Where it went</span><h2>By creator</h2></div>
			</header>
			{#if slices.length}
				<Donut {slices} center={inrS(sliceTotal)} sub="spent" fmt={inrS} />
			{:else}
				<p class="br-note">Nothing invoiced yet in this period.</p>
			{/if}
		</section>

		<section class="br-card rv" style="--i:4">
			<header class="br-h">
				<div><span class="br-eb-grad">Pipeline</span><h2>From request to paid</h2></div>
			</header>
			<HBars
				rows={[
					{ label: 'Sent', values: [r.funnel.sent] },
					{ label: 'Agreed', values: [r.funnel.agreed] },
					{ label: 'Went live', values: [r.funnel.live] },
					{ label: 'Paid', values: [r.funnel.paid] }
				]}
				names={['Requests']}
				colors={['var(--g2)']}
				fmt={(v) => String(v)}
			/>
			<p class="br-note">{r.funnel.sent ? `${Math.round((r.funnel.agreed / r.funnel.sent) * 100)}% of requests were agreed.` : 'No requests sent in this period.'}</p>
		</section>

		<section class="br-card rv" style="--i:5">
			<header class="br-h">
				<div><span class="br-eb-grad">Campaigns</span><h2>Agreed against budget</h2></div>
				<a class="br-link" href="/brand/campaigns">Campaigns<Icon name="arrow" /></a>
			</header>
			{#if r.campaigns.length}
				<HBars
					rows={r.campaigns.slice(0, 6).map((c) => ({ label: c.name, values: [c.spent, Math.max(0, c.budget - c.spent)] }))}
					names={['Agreed', 'Budget left']}
					colors={['var(--g2)', 'color-mix(in oklab, var(--g1) 30%, transparent)']}
					fmt={inrS}
				/>
			{:else}
				<p class="br-note">No campaigns yet. A campaign sends one brief to many creators.</p>
			{/if}
		</section>

		<section class="br-card rv" style="--i:6">
			<header class="br-h">
				<div><span class="br-eb-grad">Pace</span><h2>How it's going</h2></div>
			</header>
			<div class="br-gauges">
				<div class="br-gauge-box"><Gauge value={r.funnel.sent ? r.funnel.agreed / r.funnel.sent : null} center={r.funnel.sent ? `${Math.round((r.funnel.agreed / r.funnel.sent) * 100)}%` : '—'} sub="agreed" /><span>Requests agreed</span></div>
				<div class="br-gauge-box"><Gauge value={budgetUsed} gradient={false} color="var(--h-live)" center={budgetUsed === null ? '—' : `${Math.round(budgetUsed * 100)}%`} sub="used" /><span>Campaign budget</span></div>
				<div class="br-gauge-box"><Gauge value={engagement === null ? null : Math.min(1, engagement * 10)} gradient={false} color="var(--ok)" center={engagement === null ? '—' : `${(engagement * 100).toFixed(1)}%`} sub="engaged" /><span>Likes, comments, saves</span></div>
			</div>
		</section>

		<section class="br-card rv" style="--i:7">
			<header class="br-h">
				<div><span class="br-eb-grad">Ads and tax</span><h2>Content and GST</h2></div>
			</header>
			<div class="br-nums">
				<a href="/brand/business/content"><small>Posts you can use in ads</small><b class="num">{r.content.with_rights}</b>{#if r.content.ending_soon}<span class="warn">{r.content.ending_soon} lose ad rights within 14 days</span>{:else}<span>Ad-ready creator posts</span>{/if}</a>
				<a href="/brand/business/money"><small>GST you can claim</small><b class="num">{inrS(r.tax.gst)}</b><span>{inrS(r.tax.tds)} TDS deducted</span></a>
			</div>
		</section>

		<section class="br-card br-wide rv" style="--i:8">
			<header class="br-h">
				<div><span class="br-eb-grad">Download</span><h2>Everything in one Excel file</h2></div>
			</header>
			<p class="br-note">One .xlsx with a sheet each: Summary, Requests, Invoices, Content, Campaigns, Creators and Shipping, for {label.toLowerCase()}.</p>
			<div>
				<button class="br-white-btn" onclick={excel} disabled={busy}>
					{#if busy}<span class="spinner"></span>{:else}<Icon name="download" />{/if}
					Download .xlsx
				</button>
			</div>
		</section>

		<BrandSales />
	</div>

	<!-- Best creators: the app's tickets, cheapest views first. -->
	<section class="hs br-best">
		<header class="hs-h"><h2>Best creators by results</h2>{#if r.by_creator.length}<span class="hs-n">{r.by_creator.length}</span>{/if}</header>
		<div class="tks m-plist">
			{#each best as c, i (c.id)}
				{@const v = perView(c.fees, c.views)}
				<Ticket
					name={c.name}
					sub={`${compact(c.views)} views${v === null ? '' : ` · ₹${v.toFixed(2)} per view`}`}
					money={inrS(c.spent)}
					moneySub="spent"
					task={`${c.collabs} request${c.collabs === 1 ? '' : 's'} · ${stars(c.rating)}`}
					status={c.rating === null ? 'Rate them' : i === 0 && v !== null ? 'Cheapest views' : 'Rated'}
					tone={c.rating === null ? 'warn' : 'ok'}
					href="/brand/creator/{c.id}"
					{i}
				>
					<a class="btn {c.rating === null ? '' : 'primary'}" href="/brand/creator/{c.id}">{c.rating === null ? 'Rate' : 'Open'}</a>
				</Ticket>
			{:else}
				<div class="br-empty">
					<span class="br-empty-ic"><Icon name="chart" /></span>
					<b>No results yet</b>
					<small>Once creators go live, their views and what they cost show up here.</small>
					<a class="br-excel-btn" href="/brand/explore"><Icon name="search" />Find creators</a>
				</div>
			{/each}
		</div>
	</section>
{/if}

<style>
	.br-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin: 0 0 16px;
	}

	.br-excel-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		padding: 10px 16px;
		border: 0;
		border-radius: 10px;
		background: linear-gradient(135deg, #9c7bff 0%, #f25a90 52%, #ffae6b 100%);
		color: #120b14;
		font: 800 12.5px/1 var(--f-body, system-ui, sans-serif);
		letter-spacing: 0.01em;
		text-decoration: none;
		cursor: pointer;
		box-shadow: 3px 3px 0 0 rgba(156, 123, 255, 0.55), 0 8px 22px rgba(242, 90, 144, 0.25);
		transition: transform 0.14s ease, box-shadow 0.14s ease, filter 0.14s ease;
	}
	.br-excel-btn:hover:not(:disabled) {
		filter: brightness(1.06);
		transform: translate(-1px, -1px);
		box-shadow: 4px 4px 0 0 rgba(156, 123, 255, 0.65), 0 10px 26px rgba(242, 90, 144, 0.32);
	}
	.br-excel-btn:active:not(:disabled) {
		transform: translate(2px, 2px);
		box-shadow: 1px 1px 0 0 rgba(156, 123, 255, 0.5);
	}
	.br-excel-btn:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.br-excel-btn :global(.ic) {
		width: 15px;
		height: 15px;
	}

	.br-white-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		padding: 10px 15px;
		border: 0;
		border-radius: 10px;
		background: #faf7fc;
		color: #140e16;
		font: 800 12.5px/1 var(--f-body, system-ui, sans-serif);
		letter-spacing: 0.01em;
		cursor: pointer;
		box-shadow: 0 3px 0 0 #f25a90;
		transition: transform 0.14s ease, box-shadow 0.14s ease;
	}
	.br-white-btn:active:not(:disabled) {
		transform: translateY(2px);
		box-shadow: 0 1px 0 0 #f25a90;
	}
	.br-white-btn:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.br-white-btn :global(.ic) {
		width: 15px;
		height: 15px;
	}

	/* Hero Spend Vault */
	.br-hero {
		position: relative;
		border-radius: 26px;
		padding: 20px 18px 18px;
		margin: 0 0 16px;
		background:
			radial-gradient(120% 90% at 92% 6%, rgba(242, 90, 144, 0.28), transparent 58%),
			radial-gradient(90% 80% at 8% 0%, rgba(156, 123, 255, 0.22), transparent 58%),
			linear-gradient(165deg, #211626 0%, #151018 55%, #120d14 100%);
		border: 1px solid rgba(255, 255, 255, 0.11);
		box-shadow: 0 18px 46px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08);
		color: #faf7fc;
		overflow: hidden;
	}
	.br-hero::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1px;
		background: linear-gradient(135deg, rgba(156, 123, 255, 0.55), rgba(242, 90, 144, 0.4), rgba(255, 174, 107, 0.22), transparent 70%);
		-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		pointer-events: none;
	}

	.br-hero-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 14px;
		margin-bottom: 18px;
	}
	.br-hero-main {
		min-width: 0;
		flex: 1;
	}
	.br-eb-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 7px;
		margin-bottom: 6px;
	}
	.br-eb-grad {
		display: inline-block;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		background: linear-gradient(90deg, #9c7bff 0%, #f25a90 52%, #ffae6b 100%);
		-webkit-background-clip: text; background-clip: text;
		-webkit-text-fill-color: transparent;
	}
	.br-src {
		display: inline-flex;
		align-items: center;
		padding: 2px 7px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.14);
		color: #cfc6d6;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 9px;
		font-style: normal;
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.br-big {
		display: block;
		font-family: var(--f-serif, 'Instrument Serif', Georgia, serif);
		font-size: 52px;
		font-weight: 400;
		line-height: 0.98;
		letter-spacing: -0.02em;
		color: #faf7fc;
		margin: 4px 0 8px;
	}
	.br-sub {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 12.5px;
		color: #cfc6d6;
	}
	.br-chip {
		display: inline-flex;
		align-items: center;
		padding: 3px 9px;
		border-radius: 999px;
		background: rgba(60, 226, 155, 0.14);
		border: 1px solid rgba(60, 226, 155, 0.28);
		color: #3ce29b;
		font-size: 11px;
		font-weight: 700;
	}
	.br-chip.down {
		background: rgba(255, 107, 126, 0.14);
		border-color: rgba(255, 107, 126, 0.3);
		color: #ff6b7e;
	}

	/* Orbital Budget Ring */
	.br-orb {
		width: 78px;
		height: 78px;
		position: relative;
		flex-shrink: 0;
		display: grid;
		place-items: center;
	}
	.br-orb-ring {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: conic-gradient(
			from -90deg,
			#9c7bff 0%,
			#f25a90 calc(var(--pct, 0) * 0.6%),
			#ffae6b calc(var(--pct, 0) * 1%),
			rgba(255, 255, 255, 0.09) calc(var(--pct, 0) * 1%)
		);
		-webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 6px));
		mask: radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 6px));
	}
	.br-orb-in {
		text-align: center;
		line-height: 1.05;
	}
	.br-orb-in b {
		display: block;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 15px;
		font-weight: 700;
		color: #faf7fc;
	}
	.br-orb-in small {
		font-size: 9px;
		color: #8f8499;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	/* 4 KPI Tiles */
	.br-tiles {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	@media (min-width: 840px) {
		.br-tiles {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	.br-tile {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
		padding: 13px 13px 12px;
		border-radius: 16px;
		background: rgba(16, 12, 18, 0.62);
		border: 1px solid rgba(255, 255, 255, 0.09);
		text-decoration: none;
		color: inherit;
		transition: border-color 0.18s ease, transform 0.16s ease, background 0.18s ease;
	}
	.br-tile:hover {
		border-color: rgba(242, 90, 144, 0.42);
		background: rgba(28, 21, 32, 0.84);
		transform: translateY(-1px);
	}
	.br-tile-h {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
	}
	.br-tile-lbl {
		font-size: 11.5px;
		font-weight: 600;
		color: #cfc6d6;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.br-tile-src {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 8.5px;
		font-style: normal;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #8f8499;
		padding: 2px 6px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.09);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.br-tile-val {
		font-family: var(--f-serif, 'Instrument Serif', Georgia, serif);
		font-size: 30px;
		font-weight: 400;
		line-height: 1;
		color: #faf7fc;
	}
	.br-tile-foot {
		font-size: 11px;
		color: #8f8499;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.br-tile-foot .pos {
		color: #3ce29b;
		font-weight: 600;
	}
	.br-tile-foot .neg {
		color: #ff6b7e;
		font-weight: 600;
	}

	/* Bento Cards Grid */
	.br-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 14px;
		margin: 0 0 24px;
	}
	@media (min-width: 840px) {
		.br-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 16px;
		}
		.br-wide {
			grid-column: span 2;
		}
	}

	.br-card {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
		padding: 18px 17px;
		border-radius: 22px;
		background: linear-gradient(180deg, rgba(31, 24, 34, 0.94) 0%, rgba(21, 16, 23, 0.98) 100%);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
	}
	.br-h {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.br-h h2 {
		margin: 3px 0 0;
		font-family: var(--f-serif, 'Instrument Serif', Georgia, serif);
		font-size: 25px;
		font-weight: 400;
		line-height: 1.08;
		letter-spacing: -0.01em;
		color: var(--ink, #faf7fc);
	}
	.br-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: #f25a90;
		font-size: 12.5px;
		font-weight: 700;
		text-decoration: none;
		white-space: nowrap;
	}
	.br-link:hover {
		color: #ffae6b;
	}
	.br-link :global(.ic) {
		width: 14px;
		height: 14px;
	}
	.br-sum {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 14px;
		font-weight: 700;
		color: var(--ink, #faf7fc);
		padding: 4px 10px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.09);
		white-space: nowrap;
	}
	.br-note {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--ink-3, #8f8499);
	}

	/* Pace Gauges */
	.br-gauges {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
	.br-gauge-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 8px;
		padding: 12px 6px;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.07);
	}
	.br-gauge-box span {
		font-size: 11px;
		color: var(--ink-2, #cfc6d6);
		line-height: 1.25;
	}

	/* Ads & Tax Tiles */
	.br-nums {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	.br-nums a {
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 14px;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: inherit;
		text-decoration: none;
		transition: border-color 0.16s ease;
	}
	.br-nums a:hover {
		border-color: rgba(242, 90, 144, 0.45);
	}
	.br-nums small {
		font-size: 11.5px;
		color: var(--ink-3, #8f8499);
	}
	.br-nums b {
		font-family: var(--f-serif, 'Instrument Serif', Georgia, serif);
		font-size: 30px;
		font-weight: 400;
		line-height: 1.05;
		color: var(--ink, #faf7fc);
	}
	.br-nums span {
		font-size: 11.5px;
		color: var(--ink-2, #cfc6d6);
	}
	.br-nums .warn {
		color: var(--warn, #ffb85c);
		font-weight: 600;
	}

	/* Empty Best Creators Vault */
	.br-empty {
		border-radius: 22px;
		padding: 28px 20px;
		text-align: center;
		background:
			radial-gradient(80% 70% at 50% 0%, rgba(156, 123, 255, 0.16), transparent 65%),
			#1b151d;
		border: 1px solid rgba(255, 255, 255, 0.12);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}
	.br-empty-ic {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.06);
		display: grid;
		place-items: center;
		color: #f25a90;
	}
	.br-empty b {
		font-family: var(--f-serif, 'Instrument Serif', Georgia, serif);
		font-size: 24px;
		font-weight: 400;
	}
	.br-empty small {
		font-size: 12.5px;
		color: var(--ink-3, #8f8499);
		max-width: 280px;
		line-height: 1.45;
		margin-bottom: 6px;
	}

	@media (max-width: 420px) {
		.br-big {
			font-size: 44px;
		}
		.br-orb {
			width: 68px;
			height: 68px;
		}
		.br-tile {
			padding: 11px 11px 10px;
		}
		.br-tile-val {
			font-size: 26px;
		}
	}
</style>
