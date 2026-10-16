<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { ui } from '#lib/ui.svelte.ts';

	// Android "Share → Collab Desk": the shared message opens in Add collab, already read.
	onMount(() => {
		const q = page.url.searchParams;
		ui.pasteText = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n').trim();
		ui.newCollab = true;
		goto('/studio/collabs', { replace: true });
	});
</script>

<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
