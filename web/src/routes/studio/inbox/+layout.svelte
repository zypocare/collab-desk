<script lang="ts">
	import type { Snippet } from 'svelte';
	import { phone } from '#lib/phone.svelte.ts';
	import InboxList from '#lib/components/InboxList.svelte';

	// Laptop: like Instagram on the web, the conversation list on the left and the open chat on the right.
	// Phone: each screen on its own (the list, then a full-screen chat).
	let { children }: { children: Snippet } = $props();
</script>

{#if phone.on}
	{@render children()}
{:else}
	<div class="ibx">
		<aside class="ibx-list"><InboxList /></aside>
		<section class="ibx-pane">{@render children()}</section>
	</div>
{/if}

<style>
	.ibx { display: grid; grid-template-columns: minmax(340px, 400px) minmax(0, 1fr); height: 100vh; position: sticky; top: 0; margin: 0 calc(-1 * var(--sx-gut, 40px)) -64px; border-left: 1px solid color-mix(in oklab, var(--ink) 9%, transparent); background: color-mix(in oklab, var(--bg) 88%, transparent); }
	.ibx-list { min-height: 0; border-right: 1px solid color-mix(in oklab, var(--ink) 12%, transparent); }
	.ibx-pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
</style>
