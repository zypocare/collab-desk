<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';

	// A scanned QR code (/q/abc1234): count the scan, then open her page or the request form.
	// On the live site the server does this before the page loads; this is the fallback.
	let missing = $state(false);
	onMount(async () => {
		const slug = (page.params.slug ?? '').toLowerCase();
		const { data } = await supabase.rpc('qr_go', { p_slug: slug });
		if (data === '/' || data === '/brand/new') location.replace(`${data}?qr=${encodeURIComponent(slug)}`);
		else missing = true;
	});
</script>

<svelte:head><title>Opening…</title><meta name="robots" content="noindex" /></svelte:head>

<div class="page">
	<div class="wrap" style="min-height:60vh;display:grid;place-items:center;text-align:center">
		{#if missing}
			<div class="empty-card"><h2>This QR code has been removed</h2><p><a class="lnk" href="/">Open the brand page</a> instead.</p></div>
		{:else}
			<div class="loader"><span class="ring"><span></span></span></div>
		{/if}
	</div>
</div>
