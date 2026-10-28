<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { studio } from '#lib/studio.svelte.ts';
	import type { PublicInsights } from '#lib/insights.ts';
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
	// Past collabs she's linked posts to, the way brands see them.
	const results = $derived(
		studio.collabs
			.flatMap((c) => c.posts.map((p) => ({ c, m: p.media })))
			.sort((a, b) => b.m.posted_at.localeCompare(a.m.posted_at))
			.slice(0, 6)
			.map(({ c, m }) => ({ permalink: m.permalink, thumbnail: m.thumbnail_url, brand: c.brand.name, kind: m.product_type || m.media_type, views: m.views, reach: m.reach }))
	);
	const shared = $derived(studio.settings?.show_insights ?? false);
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
		<section class="ins-hero rv">
			<Avatar name={d.display_name} src={d.profile_picture_url} />
			<div>
				<div class="eb">Your Instagram insights</div>
				<h1>All your <em>insights</em></h1>
				<div class="handle">@{d.username}{d.niche ? ` · ${d.niche}` : ''}{d.city ? ` · ${d.city}` : ''}</div>
				<span class="ins-verified"><Icon name="check" />From Instagram{d.updated_at ? ` · updated ${fmtUpdated(d.updated_at)}` : ''}</span>
			</div>
		</section>
		<p class="hint mi-note"><Icon name="eye" />{shared ? 'Brands see these numbers on your insights link.' : "Only you see these: brands can't, until you share your insights on My page."}</p>
		<InsightsView {d} {results} />
	{/if}
</div>

<style>
	.mi { display: flex; flex-direction: column; gap: 0; min-width: 0; }
	.mi-back { display: none; align-items: center; gap: 4px; align-self: flex-start; min-height: 44px; margin-bottom: 8px; font-weight: 600; color: var(--ink-2); text-decoration: none; }
	.mi-back :global(.ic) { width: 18px; height: 18px; }
	@media (min-width: 761px) {
		.mi-back { display: inline-flex; }
	}
	.mi-note { display: flex; align-items: center; gap: 8px; margin: 0 0 16px; }
	.mi-note :global(.ic) { width: 16px; height: 16px; flex: none; }
	.mi :global(.ins-hero h1 em) { font-style: italic; }
</style>
