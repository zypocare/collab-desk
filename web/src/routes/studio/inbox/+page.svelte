<script lang="ts">
	import { studio } from '#lib/studio.svelte.ts';
	import { stageLabel, unreadFor } from '#lib/util.ts';
	import type { Collab } from '#lib/types.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Mono from '#lib/components/Mono.svelte';

	// Every brand conversation in one place, newest first, like a phone's message inbox.
	let q = $state('');
	const ago = (iso: string) => {
		const s = (Date.now() - new Date(iso).getTime()) / 1000;
		if (s < 60) return 'now';
		if (s < 3600) return `${Math.floor(s / 60)}m`;
		if (s < 86400) return `${Math.floor(s / 3600)}h`;
		if (s < 604800) return `${Math.floor(s / 86400)}d`;
		return `${Math.floor(s / 604800)}w`;
	};
	const last = (c: Collab) => c.messages[c.messages.length - 1];
	const match = (c: Collab) => !q.trim() || `${c.brand.name} ${c.contact_name} ${c.code}`.toLowerCase().includes(q.trim().toLowerCase());
	const chats = $derived(
		studio.collabs
			.filter((c) => c.messages.length && match(c))
			.sort((a, b) => last(b).created_at.localeCompare(last(a).created_at))
	);
	// Active collabs nobody has written in yet: one tap starts the chat.
	const quiet = $derived(studio.collabs.filter((c) => !c.messages.length && c.stage !== 'declined' && c.stage !== 'wrapped' && match(c)));
	const unreadTotal = $derived(studio.collabs.reduce((a, c) => a + unreadFor(c), 0));
</script>

<svelte:head><title>Messages · {studio.settings?.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Inbox</div>
		<h1>Messages</h1>
		<p>{unreadTotal ? `${unreadTotal} unread` : 'All caught up'} · brands reply from their request page</p>
	</div>
</header>

<label class="search ig-search"><Icon name="search" /><span class="sr">Search messages</span><input type="search" placeholder="Search" bind:value={q} autocomplete="off" /></label>

<div class="dm-h"><b>Messages</b>{#if unreadTotal}<span>{unreadTotal} new</span>{/if}</div>
<div class="dm-list">
	{#each chats as c (c.id)}
		{@const m = last(c)}
		{@const n = unreadFor(c)}
		<a class="dm-row" class:unread={n > 0} href="/studio/inbox/{c.code}">
			<span class="dm-av" class:ring-on={n > 0}><Mono name={c.brand.name} /></span>
			<span class="dm-b">
				<b>{c.brand.name}{#if c.contact_name}<span class="dm-who"> · {c.contact_name}</span>{/if}</b>
				<span class="dm-prev"><span class="dm-txt">{m.sender === 'creator' ? 'You: ' : ''}{m.body}</span><span class="dm-time"> · {ago(m.created_at)}</span></span>
			</span>
			{#if n}<span class="dm-dot" aria-label="{n} unread"></span>{/if}
		</a>
	{:else}
		<div class="m-empty"><Icon name="send" /><b>{q ? 'No matches' : 'No messages yet'}</b><span>{q ? 'Try another brand name.' : 'When you or a brand writes about a collab, the chat shows up here.'}</span></div>
	{/each}
</div>

{#if quiet.length}
	<div class="dm-h"><b>Start a chat</b></div>
	<div class="dm-list">
		{#each quiet as c (c.id)}
			<a class="dm-row" href="/studio/inbox/{c.code}">
				<span class="dm-av"><Mono name={c.brand.name} /></span>
				<span class="dm-b"><b>{c.brand.name}</b><span class="dm-prev"><span class="dm-txt">{stageLabel(c.stage)} · {c.code}</span></span></span>
				<span class="dm-go"><Icon name="send" /></span>
			</a>
		{/each}
	</div>
{/if}
