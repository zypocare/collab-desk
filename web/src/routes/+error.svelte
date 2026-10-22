<script lang="ts">
	import { page } from '$app/state';
	import ProblemScreen from '#lib/components/ProblemScreen.svelte';

	// Public pages: a friendly "not found", or the "Something broke" screen with its reference.
	const missing = $derived(page.status === 404);
</script>

<svelte:head><title>{missing ? 'Page not found' : 'Something went wrong'} · Miracle</title></svelte:head>

{#if missing}
	<main class="auth-wrap">
		<div class="auth-card">
			<h1>This page doesn’t exist</h1>
			<p class="lead">The link may be old or mistyped.</p>
			<a class="btn primary" href="/">Go to the home page</a>
		</div>
	</main>
{:else}
	<ProblemScreen ref={page.error?.ref} full home="/" homeLabel="Go to the home page" />
{/if}
