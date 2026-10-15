<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import type { ReportData } from '#lib/types.ts';
	import { countUp } from '#lib/ui.svelte.ts';
	import { compact, fmtLong } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	let r = $state<ReportData | null>(null);
	let loaded = $state(false);
	onMount(async () => {
		const { data } = await supabase.rpc('public_report', { p_token: page.params.token });
		r = (data as ReportData) ?? null;
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
					{ label: 'Shares', v: r.totals.shares }
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
			<div class="doc-tools no-print"><span class="pill tint k-live"><span class="dt pulse"></span>Numbers from Instagram</span><button class="btn" onclick={() => print()}><Icon name="copy" />Print or save as PDF</button></div>

			<section class="report-hero rv">
				<div class="mesh" aria-hidden="true"></div>
				<div class="hc-in">
					<span class="hc-eb">Collaboration results · {r.code}</span>
					<h1>{r.brand} <em>×</em> {r.creator.name}</h1>
					<p>{r.deliverables} · measured {r.days_after} day{r.days_after === 1 ? '' : 's'} after posting · @{r.creator.handle}{r.creator.followers ? ` · ${compact(r.creator.followers)} followers` : ''}</p>
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
			<p class="foot">Figures are Instagram's own numbers for organic activity, taken {fmtLong((r.generated_at ?? '').slice(0, 10))}. Instagram can take up to 48 hours to update them. "—" means Instagram doesn't share that number.</p>
		{/if}
	</div>
</div>
