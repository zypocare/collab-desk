<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BrandDetailsForm from '#lib/components/BrandDetailsForm.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { loadRequests } from '#lib/brand.svelte.ts';

	// Adding another brand to this login. Company details themselves live in Settings now.
	const isNew = $derived(page.url.searchParams.get('new') === '1');
	$effect(() => {
		if (!isNew) goto('/brand/settings', { replace: true });
	});
</script>

<svelte:head><title>Add a brand</title></svelte:head>

{#if isNew}
	<a class="back" href="/brand/settings?s=brands"><Icon name="back" />Settings</a>
	<header class="ph rv">
		<div>
			<div class="eb">Your account</div>
			<h1>Add a <em>brand</em></h1>
			<p>Manage several brands from one login, for example as an agency. Switch between them in Settings.</p>
		</div>
	</header>
	<section class="panel rv" style="--i:1;padding:22px"><BrandDetailsForm isNew submitLabel="Add brand" onsaved={() => (loadRequests(), goto('/brand/settings?s=brands'))} /></section>
{/if}
