<script lang="ts">
	import { onMount } from 'svelte';
	import { campaigns, loadCampaigns } from '#lib/campaigns.svelte.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { delivText, errMessage, fmt, inr } from '#lib/util.ts';

	// Campaigns: one brief sent to many creators, each as a request of their own.
	onMount(() => {
		loadCampaigns().catch((e) => toast(errMessage(e), 'alert'));
	});
	const sub = (c: (typeof campaigns.list)[number]) =>
		[c.brief.deliverables?.length ? `${delivText(c.brief.deliverables)} each` : '', c.budget_total ? `${inr(c.budget_total)} budget` : '', c.sent_at ? `sent ${fmt(c.sent_at.slice(0, 10))}` : 'not sent yet']
			.filter(Boolean)
			.join(' · ');
</script>

<svelte:head><title>Campaigns · Miracle</title></svelte:head>

<header class="cp-h rv">
	<div><h1>Campaigns</h1><p>One brief to many creators. Each gets their own request and replies with their own quote.</p></div>
	<div class="cp-acts"><a class="cp-link" href="/brand/autopilots">Autopilots</a><a class="cp-neo cp-grad" href="/brand/campaigns/new">+ New campaign</a></div>
</header>

{#if !campaigns.loaded}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else if !campaigns.list.length}
	<div class="empty-card"><h2>No campaigns yet</h2><p>Make a pool of creators in Creators, then send them one brief in a few taps.</p><a class="btn grad" href="/brand/campaigns/new">Start a campaign</a></div>
{:else}
	<div class="cp-list">
		{#each campaigns.list as c, i (c.id)}
			<a class="cp-c rv" class:hot={c.waiting > 0} style="--i:{i % 6}" href={c.status === 'draft' ? `/brand/campaigns/new?id=${c.id}` : `/brand/campaigns/${c.id}`}>
				<span class="cp-n"><b>{c.name}</b><small>{sub(c)}</small></span>
				<span class="cp-nums"><span><b>{c.creators}</b> creator{c.creators === 1 ? '' : 's'}</span><span><b>{c.agreed}</b> agreed</span></span>
				{#if c.waiting}<em class="hot">{c.waiting} waiting on you</em>{:else if c.status === 'draft'}<em>Draft</em>{/if}
			</a>
		{/each}
	</div>
{/if}

<style>
	.cp-h {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 24px;
	}
	.cp-h h1 {
		margin: 0;
		font-size: clamp(34px, 4.4vw, 46px);
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.cp-h p {
		margin: 6px 0 0;
		color: var(--ink-3);
		font-size: 14.5px;
	}
	.cp-acts {
		display: flex;
		align-items: center;
		gap: 18px;
	}
	.cp-link {
		color: var(--ink-2);
		font-size: 14px;
		font-weight: 600;
	}
	.cp-neo {
		height: 50px;
		display: inline-flex;
		align-items: center;
		padding: 0 22px;
		text-decoration: none;
		font: 700 12.5px/1 var(--f-body);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		transition: transform 0.12s, box-shadow 0.12s;
	}
	.cp-grad {
		background: var(--grad);
		color: #fff;
		box-shadow: 5px 5px 0 #6a4bc9;
	}
	.cp-neo:hover {
		transform: translate(-2px, -2px);
	}
	.cp-list {
		display: grid;
		gap: 12px;
	}
	.cp-c {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 24px;
		padding: 18px 20px;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink);
		text-decoration: none;
		transition: box-shadow 0.2s;
	}
	.cp-c:hover {
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.cp-c.hot {
		background:
			radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--g3) 14%, transparent), transparent 60%),
			var(--surface);
	}
	.cp-n {
		flex: 1 1 280px;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.cp-n b {
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 26px;
		line-height: 1.1;
	}
	.cp-n small {
		font-size: 13px;
		color: var(--ink-3);
	}
	.cp-nums {
		display: flex;
		gap: 18px;
		font-size: 13px;
		color: var(--ink-3);
	}
	.cp-nums b {
		color: var(--ink);
		font-size: 16px;
	}
	.cp-c em {
		font-style: normal;
		font-size: 12px;
		font-weight: 700;
		padding: 5px 10px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--ink) 8%, transparent);
		color: var(--ink-2);
	}
	.cp-c em.hot {
		background: color-mix(in oklab, var(--g3) 16%, transparent);
		color: var(--g3);
	}
</style>
