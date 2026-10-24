<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { deliv, money, roiOf, type ReportFull } from '#lib/roi.ts';
	import { downloadReport } from '#lib/reportPdf.ts';
	import { countUp } from '#lib/ui.svelte.ts';
	import { compact, fmtLong, localDay } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	let r = $state<ReportFull | null>(null);
	let pdfBusy = $state(false);
	const roi = $derived(r ? roiOf(r) : null);
	let loaded = $state(false);
	onMount(async () => {
		const { data } = await supabase.rpc('public_report', { p_token: page.params.token });
		r = (data as ReportFull) ?? null;
		loaded = true;
	});

	const tiles = $derived(
		r
			? [
					{ label: 'Views', v: r.totals.views },
					{ label: 'Accounts reached', v: r.totals.reach },
					{ label: 'Likes', v: r.totals.likes },
					{ label: 'Comments', v: r.totals.comments },
					{ label: 'Saves', v: r.totals.saves },
					{ label: 'Shares', v: r.totals.shares },
					{ label: 'Link taps', v: r.link?.clicks || null },
					{ label: r.link?.promo_code ? `Orders with ${r.link.promo_code}` : 'Orders', v: r.link?.sales ?? null }
				].filter((t) => t.v !== null && t.v !== undefined)
			: []
	);
</script>

<svelte:head><title>{r ? `Results · ${r.brand} × ${r.creator.name}` : 'Results'}</title><meta name="robots" content="noindex" /></svelte:head>

<div class="page">
	<div class="wrap doc-wrap">
		{#if !loaded}
			<div class="loader" style="min-height:50vh"><span class="ring"><span></span></span></div>
		{:else if !r}
			<div class="empty-card" style="margin-top:40px"><h2>Report not found</h2><p>Check the link in your email.</p></div>
		{:else}
			<div class="doc-tools no-print"><span class="pill tint k-live"><span class="dt pulse"></span>Numbers from Instagram</span><span class="row-btns" style="border:0;padding:0"><button class="btn grad" disabled={pdfBusy} onclick={async () => { pdfBusy = true; await downloadReport(r!).catch(() => {}); pdfBusy = false; }}>{#if pdfBusy}<span class="spinner"></span>{:else}<Icon name="arrow" />{/if}Download PDF</button><button class="btn" onclick={() => print()}><Icon name="copy" />Print</button></span></div>

			<section class="report-hero rv">
				<div class="mesh" aria-hidden="true"></div>
				<div class="hc-in">
					<span class="hc-eb">Collaboration results · {r.code}</span>
					<h1>{r.brand} <em>×</em> {r.creator.name}</h1>
					<p>{deliv(r.deliverables)} · measured {r.days_after} day{r.days_after === 1 ? '' : 's'} after posting · @{r.creator.handle}{r.creator.followers ? ` · ${compact(r.creator.followers)} followers` : ''}</p>
					{#if r.totals.views !== null}
						<div class="report-big"><b use:countUp={{ value: r.totals.views ?? 0 }}>{(r.totals.views ?? 0).toLocaleString('en-IN')}</b><span>views</span></div>
					{/if}
				</div>
			</section>

			<section class="report-tiles">
				{#each tiles as t, i (t.label)}
					<div class="kpi glow rv" style="--i:{i + 1}"><div><div class="lbl">{t.label}</div><div class="big" use:countUp={{ value: Number(t.v) }}>{Number(t.v).toLocaleString('en-IN')}</div></div></div>
				{/each}
				{#if r.engagement_rate !== null}
					<div class="kpi glow rv" style="--i:{tiles.length + 1}"><div><div class="lbl">Engagement rate</div><div class="big">{r.engagement_rate}%</div><div class="sub">interactions ÷ accounts reached</div></div></div>
				{/if}
			</section>

			{#if roi?.latest && roi.growth}
				<p class="roi-now rv"><Icon name="refresh" />Still growing: <b>{compact(roi.views)}</b> views today ({roi.growth > 0 ? '+' : ''}{roi.growth}% since this report).</p>
			{/if}

			{#if roi && roi.cost > 0}
				<section class="panel rv roi-panel" style="--i:7">
					<div class="panel-h"><h2>Return on investment</h2><small>{money(roi.cost)} invested{r.product_value ? ` (incl. ${money(r.product_value)} product)` : ''}</small></div>
					<div class="roi-grid">
						<div><b>{money(roi.cpv)}</b><small>per view</small></div>
						<div><b>{money(roi.cpm)}</b><small>per 1,000 views</small></div>
						<div><b>{money(roi.cpe)}</b><small>per engagement</small></div>
						<div><b>{money(roi.cpr)}</b><small>per account reached</small></div>
					</div>
				</section>
			{/if}

			<section class="panel rv" style="--i:8">
				<div class="panel-h"><h2>Posts</h2></div>
				{#each r.posts as p (p.permalink)}
					<div class="post-row" style="padding:14px 20px;border-top:1px solid var(--line)">
						<div class="post-h">
							<span class="pill tint k-live">{p.type}</span>
							<span class="hint">{fmtLong(p.posted_at.slice(0, 10))}</span>
							<a class="lnk" style="margin-left:auto" href={p.permalink} target="_blank" rel="noopener">View on Instagram</a>
						</div>
						<div class="post-stats">
							<div><b>{compact(p.views)}</b><small>views</small></div>
							<div><b>{compact(p.reach)}</b><small>reach</small></div>
							<div><b>{compact(p.likes)}</b><small>likes</small></div>
							<div><b>{compact(p.comments)}</b><small>comments</small></div>
							<div><b>{compact(p.saves)}</b><small>saves</small></div>
							<div><b>{compact(p.shares)}</b><small>shares</small></div>
						</div>
					</div>
				{/each}
			</section>
			<p class="foot">Figures are Instagram's own numbers for organic activity, taken {fmtLong(localDay(r.generated_at))}. Instagram can take up to 48 hours to update them. "—" means Instagram doesn't share that number.</p>
		{/if}
	</div>
</div>
