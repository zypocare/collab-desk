<script lang="ts">
	import { page } from '$app/state';
	import ProblemScreen from '#lib/components/ProblemScreen.svelte';

	// A brand page that doesn't exist (or broke): shown in the app's frame, with a way back to Today.
	const missing = $derived(page.status === 404);
</script>

<svelte:head><title>{missing ? 'Page not found' : 'Something went wrong'} · Miracle</title></svelte:head>

{#if missing}
	<div class="empty-card">
		<h2>This page doesn’t exist</h2>
		<p>The link may be old or mistyped.</p>
		<a class="btn primary" href="/brand">Back to Today</a>
	</div>
{:else}
	<ProblemScreen ref={page.error?.ref} home="/brand" homeLabel="Go to Today" />
{/if}
