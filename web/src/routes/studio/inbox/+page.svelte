<script lang="ts">
	import { studio } from '#lib/studio.svelte.ts';
	import { stageLabel, unreadFor } from '#lib/util.ts';
	import type { Collab } from '#lib/types.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { toast } from '#lib/ui.svelte.ts';

	// Every brand conversation in one place, newest first, like a phone's message inbox.
	let q = $state('');
	// Two inboxes: brands writing in the app, and Instagram DMs (when she has allowed them).
	let tab = $state<'app' | 'ig'>('app');
	type IgT = { igsid: string; username: string; name: string; picture: string; last_text: string; last_at: string | null; unread: number; collab_flag: string; collab_hint: string; collab_id: string | null };
	let collabsOnly = $state(false);
	let igThreads = $state<IgT[]>([]);
	let igOn = $state(false);
	let oldChats = $state(0);
	async function forgetOld() {
		const { data, error } = await supabase.rpc('ig_forget_non_collab');
		if (error) return toast(error.message, 'alert');
		oldChats = 0;
		toast(`Removed ${data ?? 0} chat${data === 1 ? '' : 's'} that weren't collabs`, 'check');
		loadIg();
	}
	async function loadIg() {
		const [{ data }, perms] = await Promise.all([supabase.from('ig_threads').select('*').or('collab_id.not.is.null,collab_flag.in.(likely,maybe)').order('last_at', { ascending: false, nullsFirst: false }).limit(60), supabase.rpc('ig_permissions')]);
		igThreads = (data as IgT[]) ?? [];
		// Chats saved before only collabs were kept (other people's messages): offer to remove them.
		const old = await supabase.from('ig_threads').select('igsid', { count: 'exact', head: true }).is('collab_id', null).eq('collab_flag', '');
		oldChats = old.count ?? 0;
		igOn = String(perms.data ?? '').includes('instagram_business_manage_messages');
	}
	onMount(() => {
		loadIg();
		const ch = supabase.channel('ig-inbox').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ig_dms' }, () => loadIg()).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ig_threads' }, () => loadIg()).subscribe();
		return () => {
			supabase.removeChannel(ch);
		};
	});
	const igUnread = $derived(igThreads.reduce((a, t) => a + (t.unread || 0), 0));
	// Chats that look like a collab (and aren't on the board yet) come first.
	const isCollab = (t: IgT) => (t.collab_flag === 'likely' || t.collab_flag === 'maybe') && !t.collab_id;
	const igCollabs = $derived(igThreads.filter(isCollab).length);
	const igShown = $derived(
		igThreads
			.filter((t) => (!collabsOnly || isCollab(t)) && (!q.trim() || `${t.username} ${t.name} ${t.last_text} ${t.collab_hint}`.toLowerCase().includes(q.trim().toLowerCase())))
			.sort((a, b) => Number(isCollab(b)) - Number(isCollab(a)))
	);
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
	{#if igCollabs}<button class="ig-filter" class:on={collabsOnly} onclick={() => (collabsOnly = !collabsOnly)}><Icon name="spark" />{igCollabs} look{igCollabs === 1 ? 's' : ''} like a collab{collabsOnly ? ' · show all' : ''}</button>{/if}
	<div class="dm-list">
		{#each igShown as t (t.igsid)}
			<a class="dm-row" class:unread={t.unread > 0} href="/studio/inbox/ig/{t.igsid}">
				<span class="dm-av" class:ring-on={t.unread > 0}>{#if t.picture}<img src={t.picture} alt="" referrerpolicy="no-referrer" />{:else}<Mono name={t.username || 'IG'} />{/if}</span>
				<span class="dm-b"><b>@{t.username || 'Instagram user'}{#if t.name}<span class="dm-who"> · {t.name}</span>{/if}</b><span class="dm-prev"><span class="dm-txt">{t.last_text}</span></span>{#if isCollab(t)}<span class="collab-tag"><Icon name="spark" /><span class="dm-txt">Collab? {t.collab_hint}</span></span>{/if}</span>
				{#if t.unread}<span class="dm-dot" aria-label="{t.unread} unread"></span>{/if}
			</a>
		{:else}
			<div class="m-empty"><Icon name="send" /><b>No possible collabs yet</b><span>Only DMs that look like a brand collaboration are kept here. Your other messages stay in Instagram.</span></div>
		{/each}
	</div>
	<p class="hint ig-private"><Icon name="info" />Only possible collabs are kept. Other DMs aren't saved and don't alert you.</p>
	{#if oldChats}
		<div class="ig-old"><span><b>{oldChats} older chat{oldChats === 1 ? '' : 's'} from before this</b><small>Saved when every DM was kept. Hidden here; remove them for good?</small></span><button class="btn sm" onclick={forgetOld}>Remove them</button></div>
	{/if}
{/if}
