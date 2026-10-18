<script lang="ts">
	import { goto } from '$app/navigation';
	import { studio } from '#lib/studio.svelte.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { ui } from '#lib/ui.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import InboxList from '#lib/components/InboxList.svelte';

	// Phone: the list itself. Laptop: the list sits on the left (see +layout); this is the empty right side.
	const firstQuiet = $derived(studio.collabs.find((c) => c.stage !== 'declined' && c.stage !== 'wrapped'));
	function start() {
		if (firstQuiet) goto(`/studio/inbox/${firstQuiet.code}`);
		else ui.newCollab = true;
	}
</script>

<svelte:head><title>Messages · {studio.settings?.app_name}</title></svelte:head>

{#if phone.on}
	<InboxList />
{:else}
	<div class="ibx-empty">
		<span class="ibx-ring"><Icon name="send" /></span>
		<h2>Your messages</h2>
		<p>Pick a chat on the left, or send a message to a brand to start one.</p>
		<button class="btn ibx-btn" onclick={start}>Send message</button>
	</div>
{/if}

<style>
	.ibx-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 40px; text-align: center; }
	.ibx-ring { width: 104px; height: 104px; border-radius: 50%; border: 2.5px solid var(--ink); display: grid; place-items: center; margin-bottom: 12px; }
	.ibx-ring :global(.ic) { width: 48px; height: 48px; stroke-width: 1.4; }
	.ibx-empty h2 { margin: 0; font-size: 22px; font-weight: 500; letter-spacing: -.01em; }
	.ibx-empty p { margin: 0 0 12px; color: var(--ink-3); font-size: 15px; }
	:global([data-side='studio']) .ibx-btn { background: #4a5df9; color: #fff; border-color: transparent; }
	:global([data-side='studio']) .ibx-btn:hover:not([disabled]) { background: #3b4ee6; border-color: transparent; }
</style>
