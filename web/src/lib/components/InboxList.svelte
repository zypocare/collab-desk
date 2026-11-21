<script lang="ts">
	import { igImg } from '../igImg';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { knownBrandHandle, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast, ui } from '../ui.svelte';
	import { firstName, stageLabel, unreadFor } from '../util';
	import { rollHints } from '../lively';
	import type { Collab } from '../types';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';

	// The conversation list, laid out like Instagram's inbox: who she is, Brands / Instagram tabs,
	// search, a row of collabs to start a chat with, then every conversation, newest first.
	let q = $state('');
	let tab = $state<'app' | 'ig'>(page.url.pathname.startsWith('/studio/inbox/ig') ? 'ig' : 'app');
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
	// The same rule as the Desk AI card: a chat with a brand already on the board isn't a new collab.
	const isCollab = (t: IgT) => (t.collab_flag === 'likely' || t.collab_flag === 'maybe') && !t.collab_id && !knownBrandHandle(t.username || '');
	const igCollabs = $derived(igThreads.filter(isCollab).length);
	const igShown = $derived(
		igThreads
			.filter((t) => (!collabsOnly || isCollab(t)) && (!q.trim() || `${t.username} ${t.name} ${t.last_text} ${t.collab_hint}`.toLowerCase().includes(q.trim().toLowerCase())))
			.sort((a, b) => Number(isCollab(b)) - Number(isCollab(a)))
	);
	const ago = (iso: string | null) => {
		if (!iso) return '';
		const s = (Date.now() - new Date(iso).getTime()) / 1000;
		if (s < 60) return 'now';
		if (s < 3600) return `${Math.floor(s / 60)}m`;
		if (s < 86400) return `${Math.floor(s / 3600)}h`;
		if (s < 604800) return `${Math.floor(s / 86400)}d`;
		return `${Math.floor(s / 604800)}w`;
	};
	const last = (c: Collab) => c.messages[c.messages.length - 1];
	const match = (c: Collab) => !q.trim() || `${c.brand.name} ${c.contact_name} ${c.code}`.toLowerCase().includes(q.trim().toLowerCase());
	const chats = $derived(studio.collabs.filter((c) => c.messages.length && match(c)).sort((a, b) => last(b).created_at.localeCompare(last(a).created_at)));
	// Active collabs nobody has written in yet: the row at the top, like Instagram's notes.
	const quiet = $derived(studio.collabs.filter((c) => !c.messages.length && c.stage !== 'declined' && c.stage !== 'wrapped').slice(0, 12));
	const unreadTotal = $derived(studio.collabs.reduce((a, c) => a + unreadFor(c), 0));
	const current = $derived(page.url.pathname);
	const preview = (c: Collab) => {
		const m = last(c);
		return `${m.sender === 'creator' ? 'You: ' : ''}${m.body}`;
	};
</script>

<div class="ib">
	<header class="ib-top">
		<a class="ib-me" href="/studio/profile" title="Your profile">
			<b>{studio.settings?.handle || 'Messages'}</b><Icon name="chevD" />
		</a>
		<button class="ib-new" onclick={() => (ui.newCollab = true)} aria-label="New collab" title="New collab"><Icon name="edit" /></button>
	</header>

	<nav class="ib-tabs" aria-label="Inbox">
		<button class:on={tab === 'app'} onclick={() => (tab = 'app')}>Brands{#if unreadTotal}<span>{unreadTotal}</span>{/if}</button>
		<button class:on={tab === 'ig'} onclick={() => (tab = 'ig')}>Instagram{#if igUnread}<span>{igUnread}</span>{/if}</button>
	</nav>

	<label class="ib-search" use:rollHints={[...new Set(studio.collabs.filter((c) => c.contact_name).map((c) => firstName(c.contact_name)))].slice(0, 4).concat(studio.brands.slice(0, 4).map((b) => b.name))}><Icon name="search" /><span class="sr">Search messages</span><input type="search" placeholder="Search" bind:value={q} autocomplete="off" /></label>

	<div class="ib-scroll">
		{#if tab === 'app'}
			{#if quiet.length && !q}
				<div class="ib-notes" aria-label="Start a chat">
					<a class="ib-note me" href="/studio/profile">
						<span class="ib-bubble">Your page</span>
						<Avatar name={studio.settings?.display_name ?? ''} src={studio.ig?.connected ? studio.ig.profile_picture_url : ''} size="68px" />
						<small>{firstName(studio.settings?.display_name ?? 'You')}</small>
					</a>
					{#each quiet as c (c.id)}
						<a class="ib-note" href="/studio/inbox/{c.code}">
							<span class="ib-bubble">{stageLabel(c.stage)}</span>
							<span class="ib-nav"><Mono name={c.brand.name} /></span>
							<small>{c.brand.name}</small>
						</a>
					{/each}
				</div>
			{/if}
			<div class="ib-h"><b>Messages</b>{#if unreadTotal}<span>{unreadTotal} new</span>{/if}</div>
			{#each chats as c (c.id)}
				{@const n = unreadFor(c)}
				<a class="ib-row" class:unread={n > 0} class:on={current === `/studio/inbox/${c.code}`} href="/studio/inbox/{c.code}">
					<span class="ib-av" class:ring={n > 0}><Mono name={c.brand.name} /></span>
					<span class="ib-b">
						<b>{c.contact_name ? `${c.contact_name} · ${c.brand.name}` : c.brand.name}</b>
						<span class="ib-p"><span class="ib-t">{preview(c)}</span><span class="ib-ago">&nbsp;·&nbsp;{ago(last(c).created_at)}</span></span>
					</span>
					{#if n}<span class="ib-dot" aria-label="{n} unread"></span>{/if}
				</a>
			{:else}
				<div class="ib-empty"><Icon name="send" /><b>{q ? 'No matches' : 'No messages yet'}</b><span>{q ? 'Try another brand name.' : 'When you or a brand writes about a collab, the chat shows up here.'}</span></div>
			{/each}
		{:else if !igOn && !igThreads.length}
			<div class="ib-empty"><Icon name="send" /><b>Instagram DMs here</b><span>Allow DMs on <a class="lnk" href="/studio/settings?s=profile">Profile &amp; Instagram</a> and brand DMs, including message requests, show up here.</span></div>
		{:else}
			{#if igCollabs}<button class="ib-filter" class:on={collabsOnly} onclick={() => (collabsOnly = !collabsOnly)}><Icon name="spark" />{igCollabs} look{igCollabs === 1 ? 's' : ''} like a collab{collabsOnly ? ' · show all' : ''}</button>{/if}
			{#if igCollabs}<a class="ail-more ib-all" href="/studio/possible-collabs">All possible collabs, in one place<Icon name="chevR" /></a>{/if}
			{#each igShown as t (t.igsid)}
				<a class="ib-row" class:lead={isCollab(t)} class:unread={t.unread > 0} class:on={current === `/studio/inbox/ig/${t.igsid}`} href="/studio/inbox/ig/{t.igsid}">
					<span class="ib-av" class:ring={t.unread > 0}>{#if t.picture}<img src={igImg(t.picture)} alt="" referrerpolicy="no-referrer" />{:else}<Mono name={t.username || 'IG'} />{/if}</span>
					<span class="ib-b">
						<b>{t.name || `@${t.username || 'Instagram user'}`}</b>
						{#if isCollab(t)}<span class="ib-p ib-collab"><Icon name="spark" /><span class="ib-t">Collab? {t.collab_hint}</span></span>
						{:else}<span class="ib-p"><span class="ib-t">{t.last_text}</span><span class="ib-ago">&nbsp;·&nbsp;{ago(t.last_at)}</span></span>{/if}
					</span>
					{#if t.unread}<span class="ib-dot" aria-label="{t.unread} unread"></span>{/if}
				</a>
			{:else}
				<div class="ib-empty"><Icon name="send" /><b>No possible collabs yet</b><span>Only DMs that look like a brand collaboration are kept here. Your other messages stay in Instagram.</span></div>
			{/each}
			<p class="ib-private"><Icon name="info" />Only possible collabs are kept, including ones from message requests.</p>
			{#if oldChats}
				<div class="ib-old"><span><b>{oldChats} older chat{oldChats === 1 ? '' : 's'}</b><small>Saved when every DM was kept. Remove them?</small></span><button class="btn sm" onclick={forgetOld}>Remove</button></div>
			{/if}
		{/if}
	</div>
</div>

<style>
	@property --ib-rim { syntax: '<angle>'; initial-value: 0deg; inherits: false; }

	.ib-tabs {
		display: grid !important;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin: 8px 14px 10px !important;
		padding: 0 !important;
		border: 1px solid #3e343e !important;
		background: #191419 !important;
		gap: 0 !important;
	}
	.ib-tabs button {
		height: 40px !important;
		border: 0 !important;
		border-radius: 0 !important;
		background: transparent !important;
		color: #a39aa1 !important;
		font: 700 10.5px/1 system-ui !important;
		letter-spacing: .12em;
		text-transform: uppercase;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
	}
	.ib-tabs button + button {
		border-left: 1px solid #2e262e !important;
	}
	.ib-tabs button.on {
		position: relative;
		z-index: 2;
		background: var(--ink) !important;
		color: var(--bg) !important;
		box-shadow: 3px 3px 0 var(--g2) !important;
	}
	.ib-tabs button.on::after {
		display: none !important;
	}

	.ib-filter {
		margin: 4px 14px 8px !important;
		border-radius: 0 !important;
		border: 1px solid transparent !important;
		background:
			linear-gradient(135deg, #271a2d, #18121a 65%) padding-box,
			conic-gradient(from var(--ib-rim), rgba(156, 123, 255, 0.8), rgba(242, 90, 144, 0.8), rgba(255, 174, 107, 0.65), rgba(70, 52, 66, 0.3), rgba(156, 123, 255, 0.8)) border-box !important;
		animation: ib-spin 11s linear infinite;
		box-shadow: 2.5px 2.5px 0 #382c38;
	}
	.ib-filter.on {
		background: var(--ink) !important;
		color: var(--bg) !important;
		box-shadow: 3px 3px 0 var(--g2) !important;
	}

	.ib-row {
		margin: 0 12px 9px !important;
		padding: 12px 13px !important;
		border-radius: 18px !important;
		border: 1px solid #2e2430 !important;
		background: linear-gradient(155deg, #1d161f, #151016 70%) !important;
		transition: transform .16s, border-color .16s;
	}
	.ib-row:active {
		transform: scale(.985);
	}
	.ib-row.lead {
		border-color: rgba(242, 90, 144, 0.36) !important;
		background: linear-gradient(135deg, rgba(242, 90, 144, 0.11), rgba(156, 123, 255, 0.06) 45%, #161118 85%) !important;
	}
	.ib-collab {
		display: inline-flex !important;
		align-items: center;
		gap: 5px;
		margin-top: 3px;
		padding: 3px 8px;
		border-radius: 7px;
		background: rgba(242, 90, 144, 0.15);
		border: 1px solid rgba(242, 90, 144, 0.3);
		color: #ff9ec0 !important;
		font-size: 11px !important;
		font-weight: 650;
		max-width: 100%;
	}

	@keyframes ib-spin { to { --ib-rim: 360deg; } }
	@media (prefers-reduced-motion: reduce) {
		.ib-filter { animation: none; }
	}
</style>
