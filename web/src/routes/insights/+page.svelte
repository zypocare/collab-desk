<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { supabase } from '#lib/supabase.ts';
	import { loadPublicPage, pub } from '#lib/publicPage.svelte.ts';
	import type { PublicInsights, SectionKey } from '#lib/insights.ts';
	import { fmtUpdated } from '#lib/util.ts';
	import { copyText } from '#lib/ui.svelte.ts';
	import { downloadMediaKit } from '#lib/mediaKitPdf.ts';
	import BrandTopbar from '#lib/components/BrandTopbar.svelte';
	import BrandFooter from '#lib/components/BrandFooter.svelte';
	import InsightsView from '#lib/components/InsightsView.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';

	// The profile insights brands ask for, live from Instagram: one link instead of screenshots.
	// A brand's own link (?for=...) tells the creator when it's opened and may leave some sections out.
	let d = $state<PublicInsights | null>(null);
	let status = $state<'loading' | 'ok' | 'off'>('loading');
	let forLabel = $state('');
	let hide = $state(new Set<SectionKey>());
	onMount(async () => {
		loadPublicPage();
		const token = page.url.searchParams.get('for');
		const [{ data }, link] = await Promise.all([supabase.rpc('public_insights'), token ? supabase.rpc('insight_link_open', { p_token: token }) : Promise.resolve({ data: null })]);
		d = (data as PublicInsights | null) ?? null;
		const l = link.data as { label: string; hide: SectionKey[] } | null;
		if (l) {
			forLabel = l.label;
			hide = new Set(l.hide ?? []);
		}
		status = d ? 'ok' : 'off';
	});
	const results = $derived(pub.data?.results ?? []);
	const reviews = $derived(pub.data?.reviews ?? []);
	let kitBusy = $state(false);
	async function kit() {
		if (!pub.data) return;
		kitBusy = true;
		await downloadMediaKit(pub.data, location.origin, [...hide]).catch(() => {});
		kitBusy = false;
	}
</script>

<svelte:head>
	<title>{d ? `${d.display_name} · Instagram insights` : 'Insights'}</title>
	{#if d}<meta name="description" content="Live Instagram insights for @{d.username}: reach, views, engagement and audience." />{/if}
</svelte:head>

<BrandTopbar />

<div class="page"><div class="wrap ins-wrap">
	{#if status === 'loading'}
		<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
	{:else if status === 'off' || !d}
		<div class="empty-card">
			<h2>Insights aren't shared right now</h2>
			<p>Ask the creator for a media kit, or send a collaboration request.</p>
			<a class="btn primary" href="/">Go to the brand page</a>
		</div>
	{:else}
		<section class="ins-hero rv">
			<Avatar name={d.display_name} src={d.profile_picture_url} />
			<div>
				<div class="eb">Instagram insights{forLabel ? ` · prepared for ${forLabel}` : ''}</div>
				<h1>{d.display_name}</h1>
				<div class="handle">@{d.username}{d.niche ? ` · ${d.niche}` : ''}{d.city ? ` · ${d.city}` : ''}</div>
				<span class="ins-verified"><Icon name="check" />Verified from Instagram{d.updated_at ? ` · updated ${fmtUpdated(d.updated_at)}` : ''}</span>
			</div>
			<div class="ins-acts">
				<button class="btn sm" onclick={() => copyText(location.href, 'Link copied')}><Icon name="copy" />Copy link</button>
				<button class="btn sm" disabled={kitBusy || !pub.data} onclick={kit}>{#if kitBusy}<span class="spinner"></span>{:else}<Icon name="film" />{/if}Media kit PDF</button>
			</div>
		</section>

		<InsightsView {d} {hide} {results} />

		{#if reviews.length}
			<p class="hint ins-reviews rv">{(reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1)} ★ from {reviews.length} brand review{reviews.length === 1 ? '' : 's'} · <a class="lnk" href="/">see them on the brand page</a></p>
		{/if}

		<section class="ins-cta rv">
			<div><b>Like what you see?</b><small>Send a request in 2 minutes. No sign-up needed.</small></div>
			<a class="btn grad lg" href="/brand/new"><Icon name="send" />Send a collaboration request</a>
		</section>
	{/if}
</div></div>
<BrandFooter />
