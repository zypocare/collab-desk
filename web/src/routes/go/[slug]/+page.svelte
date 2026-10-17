<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';

	// Her short link (/go/abc123): count the tap, then go straight on to the brand's page.
	let missing = $state(false);
	onMount(async () => {
		const { data } = await supabase.rpc('link_go', { p_slug: page.params.slug ?? '' });
		const to = typeof data === 'string' ? data : '';
		if (/^https?:\/\//i.test(to)) location.replace(to);
		else missing = true;
	});
</script>

<svelte:head><title>Opening…</title><meta name="robots" content="noindex" /></svelte:head>

<div class="page">
	<div class="wrap" style="min-height:60vh;display:grid;place-items:center;text-align:center">
		{#if missing}
			<div class="empty-card"><h2>This link has ended</h2><p>The offer may be over. <a class="lnk" href="/">See what's new</a>.</p></div>
		{:else}
			<div class="loader"><span class="ring"><span></span></span></div>
		{/if}
	</div>
</div>
