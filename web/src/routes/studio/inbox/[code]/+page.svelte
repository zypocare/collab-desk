<script lang="ts">
	import { page } from '$app/state';
	import { collabFacts } from '#lib/ai.ts';
	import { byCode, studio } from '#lib/studio.svelte.ts';
	import { stageLabel } from '#lib/util.ts';
	import { savedFor } from '#lib/savedReplies.ts';
	import { replySuggestions } from '#lib/suggest.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import MessageThread from '#lib/components/MessageThread.svelte';

	// One conversation, full screen: who it's with on top, the chat, the box at the bottom.
	const c = $derived(studio.loaded ? byCode(page.params.code ?? '') : undefined);
	const back = () => (history.length > 1 ? history.back() : (location.href = '/studio/inbox'));
</script>

<svelte:head><title>{c ? `${c.brand.name} · Messages` : 'Messages'} · {studio.settings?.app_name}</title></svelte:head>

{#if !c}
	<div class="empty-card"><h2>Chat not found</h2><p>The collab may have been deleted.</p><a class="btn" href="/studio/inbox">All messages</a></div>
{:else}
	<div class="chat">
		<header class="chat-h">
			<button class="m-ib" onclick={back} aria-label="Back"><Icon name="chevL" /></button>
			<a class="chat-who" href="/studio/c/{c.code}">
				<Mono name={c.brand.name} />
				<span><b>{c.brand.name}</b><small>{c.contact_name ? `${c.contact_name} · ` : ''}{stageLabel(c.stage)}</small></span>
			</a>
			<a class="m-ib" href="/studio/c/{c.code}" aria-label="Collab details"><Icon name="info" /></a>
		</header>
		{#key c.id}
			<MessageThread
				collabId={c.id}
				side="creator"
				otherName={c.contact_name || c.brand.name}
				quick={studio.settings ? [...savedFor(c, studio.settings), ...replySuggestions(c, studio.settings)] : []}
				facts={collabFacts(c, studio.settings)}
			/>
		{/key}
	</div>
{/if}
