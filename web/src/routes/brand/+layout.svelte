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
	const allowed = $derived(!!auth.session && auth.account?.role === 'brand');

	// Brands only. The creator has her own studio.
	$effect(() => {
		if (!auth.session) goto(`/login?next=${encodeURIComponent(page.url.pathname)}`, { replaceState: true });
		else if (auth.account?.role === 'creator') goto('/studio', { replaceState: true });
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
