<script lang="ts">
	import { studio } from '#lib/studio.svelte.ts';
	import { stageLabel, unreadFor } from '#lib/util.ts';
	import type { Collab } from '#lib/types.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';

	// Every brand conversation in one place, newest first, like a phone's message inbox.
	let q = $state('');
	// Two inboxes: brands writing in the app, and Instagram DMs (when she has allowed them).
	let tab = $state<'app' | 'ig'>('app');
	type IgT = { igsid: string; username: string; name: string; picture: string; last_text: string; last_at: string | null; unread: number };
	let igThreads = $state<IgT[]>([]);
	let igOn = $state(false);
	async function loadIg() {
		const [{ data }, perms] = await Promise.all([supabase.from('ig_threads').select('*').order('last_at', { ascending: false, nullsFirst: false }).limit(60), supabase.rpc('ig_permissions')]);
		igThreads = (data as IgT[]) ?? [];
		igOn = String(perms.data ?? '').includes('instagram_business_manage_messages');
	}
	onMount(() => {
		loadIg();
		const ch = supabase.channel('ig-inbox').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ig_dms' }, () => loadIg()).subscribe();
		return () => {
			supabase.removeChannel(ch);
		};
	});
	const igUnread = $derived(igThreads.reduce((a, t) => a + (t.unread || 0), 0));
	const igShown = $derived(igThreads.filter((t) => !q.trim() || `${t.username} ${t.name} ${t.last_text}`.toLowerCase().includes(q.trim().toLowerCase())));
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

<div class="inbox-tabs"><Segmented label="Inbox" bind:value={tab} options={[{ value: 'app', label: 'Brands' }, { value: 'ig', label: igUnread ? `Instagram (${igUnread})` : 'Instagram' }]} /></div>

<label class="search ig-search"><Icon name="search" /><span class="sr">Search messages</span><input type="search" placeholder="Search" bind:value={q} autocomplete="off" /></label>

{#if tab === 'app'}
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
{:else if !igOn && !igThreads.length}
	<div class="m-empty ig-setup"><Icon name="send" /><b>Instagram DMs here</b><span>Allow DMs on <a class="lnk" href="/studio/settings?s=profile">Profile &amp; Instagram</a> and brand DMs on Instagram show up here, ready to reply or turn into a collab.</span></div>
{:else}
	<div class="dm-list">
		{#each igShown as t (t.igsid)}
			<a class="dm-row" class:unread={t.unread > 0} href="/studio/inbox/ig/{t.igsid}">
				<span class="dm-av" class:ring-on={t.unread > 0}>{#if t.picture}<img src={t.picture} alt="" referrerpolicy="no-referrer" />{:else}<Mono name={t.username || 'IG'} />{/if}</span>
				<span class="dm-b"><b>@{t.username || 'Instagram user'}{#if t.name}<span class="dm-who"> · {t.name}</span>{/if}</b><span class="dm-prev"><span class="dm-txt">{t.last_text}</span></span></span>
				{#if t.unread}<span class="dm-dot" aria-label="{t.unread} unread"></span>{/if}
			</a>
		{:else}
			<div class="m-empty"><Icon name="send" /><b>No Instagram DMs yet</b><span>New DMs to your account show up here.</span></div>
		{/each}
	</div>
{/if}
