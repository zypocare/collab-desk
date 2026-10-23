<script lang="ts">
	import { AD_HOW, rightsRows, type RightsRow } from '#lib/rights.ts';
	import { studio } from '#lib/studio.svelte.ts';
	import { fmt, usageLabel } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	// Her rights ledger: every brand that may run ads with her content, until when, how, and the
	// exclusivities she agreed to, with any deal that clashes with one.
	const rows = $derived(rightsRows(studio.collabs));
	const ads = $derived(rows.filter((r) => r.paid));
	const excl = $derived(rows.filter((r) => r.exclDays));
	const ending = $derived(ads.filter((r) => r.state === 'ending').length);
	const clashes = $derived(excl.reduce((a, r) => a + r.clashes.length, 0));
	const noCode = $derived(ads.filter((r) => r.c.ad_how === 'partnership' && !r.c.ad_code).length);
	const pill = (r: RightsRow) =>
		r.state === 'forever' ? 'No end date' : r.state === 'waiting' ? 'Not live yet' : r.state === 'ended' ? `Ended ${fmt(r.ends)}` : `${r.left} day${r.left === 1 ? '' : 's'} left`;
</script>

<svelte:head><title>Usage rights · Miracle</title></svelte:head>

<a class="back rv" href="/studio/collabs"><Icon name="back" />Collabs</a>
<header class="ph rv">
	<div>
		<div class="eb">Ads, usage and exclusivity</div>
		<h1>Your <em>usage rights</em></h1>
	</div>
</header>

<div class="rt-stats rv" style="--i:1">
	<div><b>{ads.filter((r) => r.state !== 'ended').length}</b><small>brands can run ads</small></div>
	<div class:warn={ending}><b>{ending}</b><small>ending this week</small></div>
	<div class:warn={clashes}><b>{clashes}</b><small>exclusivity clashes</small></div>
	<div class:warn={noCode}><b>{noCode}</b><small>ad codes to share</small></div>
</div>

<section class="panel rv" style="--i:2" aria-labelledby="rt-ads">
	<div class="panel-h"><h2 id="rt-ads">Brand ads with your content</h2><small>When the time is up, the brand must stop the ads or pay to extend</small></div>
	{#if ads.length}
		<ul class="rt-list">
			{#each ads as r (r.c.id)}
				<li>
					<a href="/studio/c/{r.c.code}">
						<span class="rt-who"><b>{r.c.brand.name}</b><small>{usageLabel(r.usage)} · {AD_HOW[r.c.ad_how ?? '']}{r.c.territory && r.c.territory !== 'India' ? ` · ${r.c.territory}` : ''}</small></span>
						<span class="rt-pill {r.state}">{pill(r)}</span>
					</a>
					{#if r.c.ad_how === 'partnership' && !r.c.ad_code}<small class="rt-todo"><Icon name="alert" />Share your partnership ad code so they can run it.</small>{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="rt-empty">No brand has paid to run ads with your content yet. Add usage to a quote ("Brand ads for 30 days") and it shows here.</p>
	{/if}
</section>

<section class="panel rv" style="--i:3" aria-labelledby="rt-ex">
	<div class="panel-h"><h2 id="rt-ex">Exclusivity you agreed to</h2><small>Deals with a rival brand inside the window are flagged</small></div>
	{#if excl.length}
		<ul class="rt-list">
			{#each excl as r (r.c.id)}
				<li>
					<a href="/studio/c/{r.c.code}">
						<span class="rt-who"><b>{r.c.brand.name}</b><small>No {r.c.excl_scope || r.c.brand.category || 'competing'} brands for {r.exclDays} days{r.exclEnds ? `, until ${fmt(r.exclEnds)}` : ', from the day it goes live'}</small></span>
						<span class="rt-pill" class:ending={r.clashes.length}>{r.clashes.length ? `${r.clashes.length} clash${r.clashes.length === 1 ? '' : 'es'}` : 'Clear'}</span>
					</a>
					{#each r.clashes as o (o.id)}<small class="rt-todo"><Icon name="alert" />{o.brand.name} goes live {fmt(o.live_date)}.</small>{/each}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="rt-empty">No exclusivity on your deals right now.</p>
	{/if}
</section>

<style>
	.rt-stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
		margin-bottom: 16px;
	}
	@media (max-width: 700px) {
		.rt-stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.rt-stats div {
		display: grid;
		gap: 2px;
		padding: 14px 16px;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--line);
	}
	.rt-stats b {
		font: 400 30px/1 var(--f-serif, Georgia, serif);
	}
	.rt-stats small {
		color: var(--ink-3);
	}
	.rt-stats .warn b {
		color: var(--warn);
	}
	.panel {
		margin-bottom: 16px;
	}
	.rt-list {
		list-style: none;
		margin: 0;
		padding: 0 18px 12px;
		display: grid;
	}
	.rt-list li {
		display: grid;
		gap: 4px;
		padding: 12px 0;
		border-bottom: 1px solid var(--line);
	}
	.rt-list li:last-child {
		border-bottom: 0;
	}
	.rt-list a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		color: inherit;
		text-decoration: none;
	}
	.rt-who {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.rt-who small {
		color: var(--ink-3);
	}
	.rt-pill {
		flex: none;
		padding: 4px 10px;
		border-radius: 99px;
		font-size: 12px;
		font-weight: 700;
		background: color-mix(in oklab, var(--ok) 16%, transparent);
		color: var(--ok);
	}
	.rt-pill.waiting {
		background: var(--surface-2);
		color: var(--ink-2);
	}
	.rt-pill.ending {
		background: color-mix(in oklab, var(--warn) 18%, transparent);
		color: var(--warn);
	}
	.rt-pill.ended {
		background: color-mix(in oklab, var(--bad) 16%, transparent);
		color: var(--bad);
	}
	.rt-todo {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--warn);
	}
	.rt-empty {
		margin: 0;
		padding: 0 18px 18px;
		color: var(--ink-3);
	}
</style>
