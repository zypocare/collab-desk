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

