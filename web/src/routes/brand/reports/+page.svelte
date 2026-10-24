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

	// Reports: everything across the brand's creators, campaigns and money, laid out like the creator's
	// Money overview (the dark hero with tiles, then chart cards), with the whole lot as one Excel file.
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
	<button class="btn grad" onclick={excel} disabled={busy || !r}>{#if busy}<span class="spinner"></span>{:else}<Icon name="download" />{/if}Download Excel</button>
</div>

{#if reports.error}<p class="err-box" role="status">{reports.error}</p>{/if}

{#if !r || !k}
	<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
{:else}
	<section class="md-hero rv" aria-label={label}>
		<div class="mesh" aria-hidden="true"></div>
		<div class="md-main">
			<span class="bx-eb">Paid to creators · {label} <em class="src" title="From the creators' invoices to you: paid ones count as paid">invoices</em></span>
			<b class="md-big num" use:countUp={{ value: k.spent, money: true }}>{inr(k.spent)}</b>
			<div class="md-sub">
				{#if spentChange !== null}<span class="md-chip" class:down={spentChange < 0}>{spentChange >= 0 ? '+' : ''}{spentChange}% vs the period before</span>{/if}
				<span>{k.to_pay ? `${inrS(k.to_pay)} still to pay` : 'Nothing to pay right now'}</span>
			</div>
		</div>
		<div class="md-tiles">
			<a class="md-tile" href="/brand/business/content"><small>Views <em class="src" title="Instagram's numbers for the collab posts, refreshed every day">Instagram</em></small><b class="num">{compact(k.views)}</b><span>{viewsChange !== null ? `${viewsChange >= 0 ? '+' : ''}${viewsChange}% · ` : ''}{k.posts} post{k.posts === 1 ? '' : 's'}</span></a>
			<a class="md-tile" href="/brand/business/content"><small>Cost per view <em class="src" title="Creator fees for posts that went live, divided by Instagram's views">fees ÷ views</em></small><b class="num">{cpv === null ? '—' : `₹${cpv.toFixed(2)}`}</b><span>{engagement === null ? 'from the posts' : `${(engagement * 100).toFixed(1)}% engagement`}</span></a>
			<a class="md-tile" href="/brand/requests"><small>Requests <em class="src" title="Requests you sent in Miracle">Miracle</em></small><b class="num">{k.collabs}</b><span>{k.live} live · {k.talks} in talks</span></a>
			<a class="md-tile" href="/brand/creators"><small>Creators</small><b class="num">{k.creators}</b><span>{k.rebooked} booked again</span></a>
		</div>
	</section>

	<div class="md-grid">
		<BrandAnalyst report={r} {company} period={label} />
		<section class="md-card md-wide rv" style="--i:1">
			<header class="md-h"><div><span class="bx-eb">Month by month</span><h2>What you spent</h2></div><a href="/brand/business/money">Payments<Icon name="arrow" /></a></header>
			<Columns
				items={r.by_month.map((m, i) => ({ label: mLabel(m.month), values: [m.paid, m.due], now: i === r.by_month.length - 1 }))}
				names={['Paid', 'Due']}
				colors={[PAID, 'color-mix(in oklab, var(--warn) 70%, transparent)']}
				stacked
				fmt={inrS}
				height={phone.on ? 170 : 220}
			/>
		</section>

		<section class="md-card rv" style="--i:2">
			<header class="md-h"><div><span class="bx-eb">Results</span><h2>Views from creator posts</h2></div><b class="md-sum num">{compact(k.views)}</b></header>
			{#if k.views}
				<Lines labels={r.by_week.map((w, i) => (i % Math.max(1, Math.ceil(r.by_week.length / (phone.on ? 4 : 7))) === 0 ? wLabel(w.week) : ''))} series={[{ name: 'Views', color: 'var(--g2)', values: r.by_week.map((w) => w.views) }]} fmt={(v) => compact(v)} height={phone.on ? 160 : 190} />
			{:else}
				<p class="md-note">Views show up once creators' posts are live and linked to their requests.</p>
			{/if}
		</section>

		<section class="md-card rv" style="--i:3">
			<header class="md-h"><div><span class="bx-eb">Where it went</span><h2>By creator</h2></div></header>
			{#if slices.length}
				<Donut {slices} center={inrS(sliceTotal)} sub="spent" fmt={inrS} />
			{:else}
				<p class="md-note">Nothing invoiced yet in this period.</p>
			{/if}
		</section>

		<section class="md-card rv" style="--i:4">
			<header class="md-h"><div><span class="bx-eb">Pipeline</span><h2>From request to paid</h2></div></header>
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
			<p class="md-note">{r.funnel.sent ? `${Math.round((r.funnel.agreed / r.funnel.sent) * 100)}% of requests were agreed.` : 'No requests sent in this period.'}</p>
		</section>

		<section class="md-card rv" style="--i:5">
			<header class="md-h"><div><span class="bx-eb">Campaigns</span><h2>Agreed against budget</h2></div><a href="/brand/campaigns">Campaigns<Icon name="arrow" /></a></header>
			{#if r.campaigns.length}
				<HBars
					rows={r.campaigns.slice(0, 6).map((c) => ({ label: c.name, values: [c.spent, Math.max(0, c.budget - c.spent)] }))}
					names={['Agreed', 'Budget left']}
					colors={['var(--g2)', 'color-mix(in oklab, var(--g1) 30%, transparent)']}
					fmt={inrS}
				/>
			{:else}
				<p class="md-note">No campaigns yet. A campaign sends one brief to many creators.</p>
			{/if}
		</section>

		<section class="md-card rv" style="--i:6">
			<header class="md-h"><div><span class="bx-eb">Pace</span><h2>How it's going</h2></div></header>
			<div class="md-gauges">
				<div><Gauge value={r.funnel.sent ? r.funnel.agreed / r.funnel.sent : null} center={r.funnel.sent ? `${Math.round((r.funnel.agreed / r.funnel.sent) * 100)}%` : '—'} sub="agreed" /><span>Requests agreed</span></div>
				<div><Gauge value={budgetUsed} gradient={false} color="var(--h-live)" center={budgetUsed === null ? '—' : `${Math.round(budgetUsed * 100)}%`} sub="used" /><span>Campaign budget</span></div>
				<div><Gauge value={engagement === null ? null : Math.min(1, engagement * 10)} gradient={false} color="var(--ok)" center={engagement === null ? '—' : `${(engagement * 100).toFixed(1)}%`} sub="engaged" /><span>Likes, comments, saves</span></div>
			</div>
		</section>

		<section class="md-card rv" style="--i:7">
			<header class="md-h"><div><span class="bx-eb">Ads and tax</span><h2>Content and GST</h2></div></header>
			<div class="br-nums">
				<a href="/brand/business/content"><small>Posts you can use in ads</small><b class="num">{r.content.with_rights}</b>{#if r.content.ending_soon}<span class="warn">{r.content.ending_soon} lose ad rights within 14 days</span>{/if}</a>
				<a href="/brand/business/money"><small>GST you can claim</small><b class="num">{inrS(r.tax.gst)}</b><span>{inrS(r.tax.tds)} TDS deducted</span></a>
			</div>
		</section>

		<section class="md-card rv" style="--i:8">
			<header class="md-h"><div><span class="bx-eb">Download</span><h2>Everything in one Excel file</h2></div></header>
			<p class="md-note">One .xlsx with a sheet each: Summary, Requests, Invoices, Content, Campaigns, Creators and Shipping, for {label.toLowerCase()}.</p>
			<button class="btn primary" style="align-self:flex-start" onclick={excel} disabled={busy}>{#if busy}<span class="spinner"></span>{:else}<Icon name="download" />{/if}Download .xlsx</button>
		</section>
		<BrandSales />
	</div>

	<!-- Best creators: the app's tickets, cheapest views first. -->
	<section class="hs">
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
				<div class="clear hero-card glow m-none">
					<div class="mesh" aria-hidden="true"></div>
					<span class="clear-ic"><Icon name="chart" /></span>
					<b>No results yet</b>
					<small>Once creators go live, their views and what they cost show up here.</small>
					<div class="clear-acts"><a class="glass-chip" href="/brand/creators?tab=discover"><Icon name="search" />Find creators</a></div>
				</div>
			{/each}
		</div>
	</section>
{/if}

<style>
	/* Where a number comes from: a small tag beside its label (hover for the detail). */
	.src {
		margin-left: 6px;
		padding: 1px 6px;
		border-radius: 999px;
		border: 1px solid var(--line-strong);
		font-size: 9.5px;
		font-style: normal;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		vertical-align: 1px;
		opacity: 0.75;
	}
	.br-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin: 0 0 16px;
	}
	.br-nums {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	.br-nums a {
		display: grid;
		gap: 4px;
		padding: 14px 16px;
		border-radius: 16px;
		background: color-mix(in oklab, var(--ink) 5%, transparent);
		color: inherit;
		text-decoration: none;
	}
	.br-nums small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.br-nums b {
		font-size: 26px;
		font-weight: 600;
		letter-spacing: -0.03em;
	}
	.br-nums span {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.br-nums .warn {
		color: var(--warn);
	}
</style>
