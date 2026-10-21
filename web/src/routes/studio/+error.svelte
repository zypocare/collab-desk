<script lang="ts">
	import { page } from '$app/state';

	// A page that doesn't exist (or broke) inside the studio: shown in the normal frame, with a way back.
	const missing = $derived(page.status === 404);
</script>

<svelte:head><title>{missing ? 'Page not found' : 'Something went wrong'} · Miracle</title></svelte:head>

<div class="empty-card">
	<h2>{missing ? 'This page doesn’t exist' : 'Something went wrong'}</h2>
	<p>{missing ? 'The link may be old or mistyped.' : 'Try again in a moment. If it keeps happening, reload the app.'}</p>
	<a class="btn primary" href="/studio">Back to Today</a>
</div>
