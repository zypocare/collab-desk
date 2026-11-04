<script lang="ts">
	import { page } from '$app/state';
	import ExploreView from '#lib/components/ExploreView.svelte';

	// Explore: every creator open to brands, the marketplace (lib/components/ExploreView.svelte).
	const toPool = $derived(page.url.searchParams.get('pool') ?? '');
</script>

<svelte:head><title>Explore creators · Miracle</title></svelte:head>

<ExploreView {toPool} />
