<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { studio } from '#lib/studio.svelte.ts';
	import type { PublicInsights } from '#lib/insights.ts';
	import { copyText } from '#lib/ui.svelte.ts';
	import { errMessage, fmtUpdated } from '#lib/util.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import InsightsView from '#lib/components/InsightsView.svelte';

	// All her Instagram insights on a screen of their own (from Grow): the numbers brands see on her insights link,
	// whether or not she shows them to brands, with the story numbers she may keep off it.
	let d = $state<PublicInsights | null>(null);
	let status = $state<'loading' | 'ok' | 'off' | 'error'>('loading');
	let err = $state('');

	onMount(async () => {
		const { data, error } = await supabase.rpc('my_insights');
		if (error) {
			err = errMessage(error);
			status = 'error';
			return;
		}
		d = (data as PublicInsights | null) ?? null;
		status = d ? 'ok' : 'off';
	});

	const results = $derived(
		studio.collabs
			.flatMap((c) => c.posts.map((p) => ({ c, m: p.media })))
			.sort((a, b) => b.m.posted_at.localeCompare(a.m.posted_at))
			.slice(0, 6)
			.map(({ c, m }) => ({
				permalink: m.permalink,
				thumbnail: m.thumbnail_url,
				brand: c.brand.name,
				kind: m.product_type || m.media_type,
				views: m.views,
				reach: m.reach
			}))
	);

	const shared = $derived(studio.settings?.show_insights ?? false);
	const insightsUrl = $derived.by(() => {
		const base = (studio.settings?.site_url || '').replace(/\/$/, '');
		return base ? `${base}/insights` : '';
	});
</script>

<svelte:head><title>Your insights · Miracle</title></svelte:head>

<div class="mi">
	<a class="mi-back" href="/studio/grow"><Icon name="chevL" />Grow</a>

	{#if status === 'loading'}
		<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
	{:else if status === 'off' || !d}
		<div class="clear hero-card glow m-none">
			<div class="mesh" aria-hidden="true"></div>
			<span class="clear-ic"><Icon name="chart" /></span>
			<b>Connect Instagram to see your insights</b>
			<small>Reach, views, engagement, your audience and your best posts: the same numbers brands see.</small>
			<div class="clear-acts"><a class="glass-chip" href="/studio/settings?s=profile"><Icon name="link" />Connect Instagram</a></div>
		</div>
	{:else if status === 'error'}
		<p class="err">{err}</p>
	{:else}
		<section class="mi-id rv">
			<Avatar name={d.display_name} src={d.profile_picture_url} />
			<div class="mi-meta">
				<div class="mi-top">
					<b>@{d.username}</b>
					<span class="mi-sync">
						<i class="mi-dot" aria-hidden="true"></i>
						<span>{d.updated_at ? `Synced ${fmtUpdated(d.updated_at)}` : 'From Instagram'}</span>
					</span>
				</div>
				{#if d.niche || d.city}
					<small>{[d.niche, d.city].filter(Boolean).join(' · ')}</small>
				{/if}
			</div>
		</section>

		<div class="mi-vis rv">
			<span class="mi-vis-l">
				<Icon name="eye" />
				<span>{shared ? 'Brands see these live numbers on your insights link.' : "Only you see these until you share insights on My page."}</span>
			</span>
			{#if shared && insightsUrl}
				<button type="button" class="mi-copy" onclick={() => copyText(insightsUrl, 'Insights link copied')}>Copy link</button>
			{/if}
		</div>

		<InsightsView {d} {results} />
	{/if}
</div>

<style>
	.mi {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
		padding-bottom: 24px;
	}
	.mi-back {
		display: none;
		align-items: center;
		gap: 4px;
		align-self: flex-start;
		min-height: 40px;
		font-weight: 600;
		color: var(--ink-2);
		text-decoration: none;
	}
	.mi-back :global(.ic) {
		width: 18px;
		height: 18px;
	}
	@media (min-width: 761px) {
		.mi-back {
			display: inline-flex;
		}
	}
	.mi-id {
		display: flex;
		align-items: center;
		gap: 13px;
	}
	.mi-meta {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 3px;
	}
	.mi-top {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.mi-top b {
		font-size: 16px;
		font-weight: 600;
		color: var(--ink);
	}
	.mi-sync {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 9px;
		border-radius: 99px;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 10.5px;
		font-weight: 600;
		color: var(--ok);
		background: color-mix(in oklab, var(--ok) 12%, var(--surface));
		border: 1px solid color-mix(in oklab, var(--ok) 32%, var(--line));
		white-space: nowrap;
	}
	.mi-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--ok);
	}
	.mi-meta small {
		font-size: 12.5px;
		color: var(--ink-3);
		line-height: 1.38;
	}
	.mi-vis {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 13px;
		border-radius: 13px;
		background: var(--surface);
		border: 1px solid var(--line);
		font-size: 12.5px;
		color: var(--ink-2);
	}
	.mi-vis-l {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.mi-vis-l :global(.ic) {
		width: 15px;
		height: 15px;
		color: var(--g1);
		flex: none;
	}
	.mi-copy {
		border: 0;
		background: none;
		padding: 0;
		color: var(--g1);
		font: 600 12px var(--f-body, inherit);
		white-space: nowrap;
		cursor: pointer;
	}
</style>
