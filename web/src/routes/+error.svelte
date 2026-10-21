<script lang="ts">
	import { page } from '$app/state';

	// Public pages: a friendly "not found" instead of a bare 404.
	const missing = $derived(page.status === 404);
</script>

<svelte:head><title>{missing ? 'Page not found' : 'Something went wrong'} · Miracle</title></svelte:head>

<main class="auth-wrap">
	<div class="auth-card">
		<h1>{missing ? 'This page doesn’t exist' : 'Something went wrong'}</h1>
		<p class="lead">{missing ? 'The link may be old or mistyped.' : 'Try again in a moment.'}</p>
		<a class="btn primary" href="/">Go to the home page</a>
	</div>
</main>
