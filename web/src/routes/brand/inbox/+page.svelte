<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { allRequests, loadAllRequests } from '#lib/brand.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { firstName } from '#lib/util.ts';
	import type { BrandRow } from '#lib/types.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import MessageThread from '#lib/components/MessageThread.svelte';

	// Messages with every creator in one inbox, laid out like the creator's: the conversations on the
	// left (newest first, unread marked), the open chat on the right. Phones: the list, then the chat.
	onMount(loadAllRequests);
	let q = $state('');
	let unreadOnly = $state(false);
	const open = $derived(page.url.searchParams.get('c'));
	const ago = (iso: string | null) => {
		if (!iso) return '';
		const s = (Date.now() - new Date(iso).getTime()) / 1000;
		if (s < 60) return 'now';
		if (s < 3600) return `${Math.floor(s / 60)}m`;
		if (s < 86400) return `${Math.floor(s / 3600)}h`;
		if (s < 604800) return `${Math.floor(s / 86400)}d`;
		return `${Math.floor(s / 604800)}w`;
	};
	const match = (r: BrandRow) => !q.trim() || `${r.creator.name} ${r.code} ${r.last?.body ?? ''}`.toLowerCase().includes(q.trim().toLowerCase());
	const chats = $derived(
		allRequests.list.filter((r) => r.last && match(r) && (!unreadOnly || r.unread > 0)).sort((a, b) => (b.last?.at ?? '').localeCompare(a.last?.at ?? ''))
	);
	// Live requests nobody has written in yet: start a chat with them (Instagram's notes row).
	const quiet = $derived(allRequests.list.filter((r) => !r.last && !['declined', 'wrapped', 'cancelled'].includes(r.stage)).slice(0, 12));
	const unreadTotal = $derived(allRequests.list.reduce((a, r) => a + r.unread, 0));
	const cur = $derived(allRequests.list.find((r) => r.code === open) ?? null);
	const requestHref = (r: BrandRow) => (r.creator.slug === pageSlug ? `/brand/r/${r.code}` : addressFor(r.creator.slug, `/brand/r/${r.code}`));
	function pick(r: BrandRow) {
		r.unread = 0;
		goto(`/brand/inbox?c=${r.code}`, phone.on ? {} : { replace: true, reset: false });
	}
</script>

<svelte:head><title>{cur ? `${cur.creator.name} · Inbox` : 'Inbox'} · Miracle</title></svelte:head>

{#snippet list()}
	<div class="ib">
		<header class="ib-top">
			<span class="ib-me"><b>Inbox</b></span>
		</header>
		<nav class="ib-tabs" aria-label="Inbox">
			<button class:on={unreadOnly} onclick={() => (unreadOnly = true)}>Unread{#if unreadTotal}<span>{unreadTotal}</span>{/if}</button>
			<button class:on={!unreadOnly} onclick={() => (unreadOnly = false)}>All</button>
		</nav>
		<label class="ib-search"><Icon name="search" /><span class="sr">Search messages</span><input type="search" placeholder="Search creator, code or message" bind:value={q} autocomplete="off" /></label>
		<div class="ib-scroll">
			{#if quiet.length && !q && !unreadOnly}
				<div class="ib-notes" aria-label="Start a chat">
					{#each quiet as r (r.id)}
						<button class="ib-note" onclick={() => pick(r)}>
							<span class="ib-bubble">{r.stage_label}</span>
							<span class="ib-nav"><Avatar name={r.creator.name} src={r.creator.photo} size="68px" /></span>
							<small>{firstName(r.creator.name)}</small>
						</button>
					{/each}
				</div>
			{/if}
			<div class="ib-h"><b>Messages</b>{#if unreadTotal}<span>{unreadTotal} new</span>{/if}</div>
			{#if !allRequests.loaded}
				<div class="loader" style="min-height:20vh"><span class="ring"><span></span></span></div>
			{:else}
				{#each chats as r (r.id)}
					<a class="ib-row" class:unread={r.unread > 0} class:on={r.code === open} href="/brand/inbox?c={r.code}" onclick={(e) => (e.preventDefault(), pick(r))}>
						<span class="ib-av" class:ring={r.unread > 0}><Avatar name={r.creator.name} src={r.creator.photo} size="56px" /></span>
						<span class="ib-b">
							<b>{r.creator.name} · {r.code}</b>
							<span class="ib-p"><span class="ib-t">{r.last?.sender === 'brand' ? 'You: ' : ''}{r.last?.body}</span><span class="ib-ago">&nbsp;·&nbsp;{ago(r.last?.at ?? null)}</span></span>
						</span>
						{#if r.unread}<span class="ib-dot" aria-label="{r.unread} unread"></span>{/if}
					</a>
				{:else}
					<div class="ib-empty"><Icon name="send" /><b>{q ? 'No matches' : unreadOnly ? 'All read' : 'No messages yet'}</b><span>{q ? 'Try another creator or code.' : 'When you or a creator writes about a request, the chat shows up here.'}</span></div>
				{/each}
			{/if}
		</div>
	</div>
{/snippet}

{#snippet chat(r: BrandRow)}
	<div class="chat">
		<header class="chat-h">
			<button class="m-ib" onclick={() => goto('/brand/inbox')} aria-label="Back"><Icon name="chevL" /></button>
			<a class="chat-who" href={requestHref(r)}>
				<Avatar name={r.creator.name} src={r.creator.photo} size="46px" />
				<span><b>{r.creator.name}</b><small>{r.code}{r.deliverables ? ` · ${r.deliverables}` : ''} · {r.stage_label}</small></span>
			</a>
			<a class="btn sm" href={requestHref(r)}>Open request</a>
		</header>
		{#key r.id}
			<MessageThread collabId={r.id} side="brand" otherName={firstName(r.creator.name)} avatar={r.creator.name} />
		{/key}
	</div>
{/snippet}

{#if phone.on}
	{#if cur}{@render chat(cur)}{:else}{@render list()}{/if}
{:else}
	<div class="ibx">
		<aside class="ibx-list">{@render list()}</aside>
		<section class="ibx-pane">
			{#if cur}
				{@render chat(cur)}
			{:else}
				<div class="bi-empty">
					<span class="bi-ring"><Icon name="send" /></span>
					<h2>Your messages</h2>
					<p>Every creator's chat in one place. Pick one on the left.</p>
				</div>
			{/if}
		</section>
	</div>
{/if}

<style>
	.bi-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 40px;
		text-align: center;
	}
	.bi-ring {
		width: 104px;
		height: 104px;
		border-radius: 50%;
		border: 2.5px solid var(--ink);
		display: grid;
		place-items: center;
		margin-bottom: 12px;
	}
	.bi-ring :global(.ic) {
		width: 48px;
		height: 48px;
		stroke-width: 1.4;
	}
	.bi-empty h2 {
		margin: 0;
		font: 400 36px/1.1 var(--f-serif, Georgia, serif);
	}
	.bi-empty p {
		margin: 0;
		color: var(--ink-3);
		font-size: 15px;
	}
	button.ib-note {
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
</style>
