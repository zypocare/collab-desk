<script lang="ts">
	import { page } from '$app/state';
	import { onDestroy, untrack } from 'svelte';
	import { byCode, studio } from '#lib/studio.svelte.ts';
	import { ui } from '#lib/ui.svelte.ts';
	import CollabDrawer from '#lib/components/CollabDrawer.svelte';

	// One collab on its own page: everything about it, with room to breathe.
	const c = $derived(studio.loaded ? byCode(page.params.code ?? '') : undefined);
	$effect(() => {
		const id = c?.id ?? null;
		untrack(() => {
			if (ui.openCollab !== id) ui.openCollab = id;
		});
	});
	// Leaving the page closes it (so other screens don't jump back here).
	onDestroy(() => (ui.openCollab = null));
</script>

<svelte:head><title>{c ? `${c.brand.name} · ${c.code}` : 'Collab'} · {studio.settings?.app_name}</title></svelte:head>

{#if !studio.loaded}
	<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
{:else if !c}
	<div class="empty-card"><h2>Collab not found</h2><p>It may have been deleted.</p><a class="btn" href="/studio/collabs">All collabs</a></div>
{:else}
	<CollabDrawer page />
{/if}
