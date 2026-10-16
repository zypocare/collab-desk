<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';
	import { auth } from '#lib/auth.svelte.ts';
	import { loadRequests } from '#lib/brand.svelte.ts';
	import { loadPublicPage, pub } from '#lib/publicPage.svelte.ts';
	import BrandTopbar from '#lib/components/BrandTopbar.svelte';

	let { children }: LayoutProps = $props();
	// Anyone can start a request (they confirm their email when sending); everything else needs sign-in.
	const guestOk = $derived(!auth.session && page.url.pathname === '/brand/new');
	// While a guest's code is being confirmed they are signed in before the app knows they're a brand;
	// keep the form on screen through that moment so their request isn't lost.
	const confirming = $derived(!!auth.session && !auth.account && page.url.pathname === '/brand/new');
	const allowed = $derived((!!auth.session && auth.account?.role === 'brand') || guestOk || confirming);

	// Brands only. The creator has her own studio.
	$effect(() => {
		if (!auth.session && page.url.pathname !== '/brand/new') goto(`/login?next=${encodeURIComponent(page.url.pathname + page.url.search)}`, { replace: true });
		else if (auth.account?.role === 'creator') goto('/studio', { replace: true });
	});

	onMount(() => {
		if (!pub.data) loadPublicPage();
		if (auth.account?.role === 'brand') loadRequests();
	});
</script>

{#if allowed}
	<BrandTopbar />
	<div class="page"><div class="wrap">{@render children()}</div></div>
{/if}
