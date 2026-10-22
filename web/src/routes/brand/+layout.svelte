<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';
	import { auth } from '#lib/auth.svelte.ts';
	import { ui } from '#lib/ui.svelte.ts';
	import { loadRequests } from '#lib/brand.svelte.ts';
	import { joinTeam } from '#lib/business.svelte.ts';
	import { appAddress, isAppHost } from '#lib/creatorHost.ts';
	import { loadPublicPage, pub } from '#lib/publicPage.svelte.ts';
	import BrandTopbar from '#lib/components/BrandTopbar.svelte';
	import BrandFooter from '#lib/components/BrandFooter.svelte';
	import BrandSide from '#lib/components/BrandSide.svelte';
	import { loadBrandIg } from '#lib/brandIg.svelte.ts';
	import { PHONE_Q, phone } from '#lib/phone.svelte.ts';

	let { children }: LayoutProps = $props();
	// Anyone can start a request (they confirm their email when sending); everything else needs sign-in.
	const guestOk = $derived(!auth.session && page.url.pathname === '/brand/new');
	// While a guest's code is being confirmed they are signed in before the app knows they're a brand;
	// keep the form on screen through that moment so their request isn't lost.
	const confirming = $derived(!!auth.session && !auth.account && page.url.pathname === '/brand/new');
	const allowed = $derived((!!auth.session && auth.account?.role === 'brand') || guestOk || confirming);

	// Brands only. The creator has her own studio.
	$effect(() => {
		if (!auth.session && page.url.pathname !== '/brand/new') goto(`/login?next=${encodeURIComponent(page.url.pathname + page.url.search)}`, { replaceState: true });
		else if (auth.account?.role === 'creator' && !ui.holdRedirect) goto('/studio', { replaceState: true });
		// Waiting to be approved as a creator: her request's status is on /join.
		else if (auth.account?.role === 'pending' && !ui.holdRedirect) location.replace(appAddress('/signup'));
	});

	// Miracle's own address has no creator: a brand that hasn't signed up finishes sign-up first, and
	// requests (which belong to a creator's address) are reached from the dashboard instead.
	const onApp = isAppHost(location.hostname);
	$effect(() => {
		if (!onApp) return;
		const a = auth.account;
		const path = page.url.pathname;
		if (a?.role === 'brand' && !(a.profile || a.brand || a.companies?.length || a.creators?.length)) goto('/signup?as=brand', { replaceState: true });
		else if (path === '/brand/new') goto('/brand/creators?tab=discover', { replaceState: true });
		else if (path === '/brand/requests') goto('/brand', { replaceState: true });
	});

	// Invited to a company's team: join it on the first visit after signing in.
	$effect(() => {
		if (auth.account?.role === 'brand') joinTeam();
	});

	onMount(() => {
		if (!pub.data) loadPublicPage();
		if (auth.account?.role === 'brand') loadRequests();
	});
	$effect(() => {
		if (auth.account?.role === 'brand') loadBrandIg();
	});
	// Laptops: the creator studio's frame (side menu + page). Phones and signed-out visitors keep the bar.
	// The phone bar starts the phone behaviours, but on a laptop it isn't shown, so the width is watched here too.
	const mq = matchMedia(PHONE_Q);
	phone.on = mq.matches;
	onMount(() => {
		const on = () => (phone.on = mq.matches);
		mq.addEventListener('change', on);
		return () => mq.removeEventListener('change', on);
	});
	const desk = $derived(!phone.on && auth.account?.role === 'brand');
</script>

{#if allowed}
	{#if desk}
		<div class="app at brand-desk">
			<BrandSide />
			<main class="main"><div class="pg">{@render children()}</div></main>
		</div>
	{:else}
		<BrandTopbar />
		<div class="page"><div class="wrap">{@render children()}</div></div>
		<BrandFooter />
	{/if}
{/if}
