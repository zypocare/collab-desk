<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { studio } from '../studio.svelte';
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
	const isCollab = (t: IgT) => (t.collab_flag === 'likely' || t.collab_flag === 'maybe') && !t.collab_id;
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
			{#each igShown as t (t.igsid)}
				<a class="ib-row" class:unread={t.unread > 0} class:on={current === `/studio/inbox/ig/${t.igsid}`} href="/studio/inbox/ig/{t.igsid}">
					<span class="ib-av" class:ring={t.unread > 0}>{#if t.picture}<img src={t.picture} alt="" referrerpolicy="no-referrer" />{:else}<Mono name={t.username || 'IG'} />{/if}</span>
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
	.ib { display: flex; flex-direction: column; min-height: 0; height: 100%; }
	.ib-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 22px 22px 12px; }
	.ib-me { display: inline-flex; align-items: center; gap: 6px; color: var(--ink); text-decoration: none; min-width: 0; }
	.ib-me b { font-size: 20px; font-weight: 700; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ib-me :global(.ic) { width: 16px; height: 16px; }
	.ib-new { width: 40px; height: 40px; border: 0; border-radius: 50%; background: none; color: var(--ink); display: grid; place-items: center; cursor: pointer; }
	.ib-new:hover { background: color-mix(in oklab, var(--ink) 7%, transparent); }
	.ib-new :global(.ic) { width: 24px; height: 24px; }
	.ib-tabs { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid color-mix(in oklab, var(--ink) 12%, transparent); }
	.ib-tabs button { position: relative; height: 46px; border: 0; background: none; font: 600 15px var(--f-body, inherit); color: var(--ink-3); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
	.ib-tabs button.on { color: var(--ink); }
	.ib-tabs button.on::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--ink); }
	.ib-tabs span { font-size: 11.5px; font-weight: 700; color: #fff; background: var(--g2); border-radius: 99px; padding: 0 7px; line-height: 18px; }
	.ib-search { display: flex; align-items: center; gap: 10px; height: 44px; margin: 14px 18px 6px; padding: 0 16px; border-radius: 999px; background: color-mix(in oklab, var(--ink) 7%, transparent); color: var(--ink-3); }
	.ib-search :global(.ic) { width: 18px; height: 18px; flex: none; }
	.ib-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; color: var(--ink); font: 400 16px var(--f-body, inherit); }
	.ib-scroll { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; padding-bottom: 12px; }
	.ib-notes { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 34px 18px 8px; }
	.ib-notes::-webkit-scrollbar { display: none; }
	.ib-note { position: relative; flex: none; width: 88px; display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--ink); text-decoration: none; }
	.ib-note small { max-width: 100%; font-size: 12.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ib-bubble { position: absolute; top: -26px; left: 50%; transform: translateX(-50%); z-index: 1; max-width: 96px; padding: 5px 10px; border-radius: 14px; background: var(--surface-2, #222); box-shadow: 0 2px 10px rgba(0, 0, 0, .25); font-size: 11.5px; font-weight: 600; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ib-nav { width: 68px; height: 68px; border-radius: 50%; padding: 3px; background: conic-gradient(from 210deg, var(--g3), var(--g2), var(--g1), var(--g3)); display: grid; }
	.ib-nav :global(.mono) { width: 100%; height: 100%; border-radius: 50%; font-size: 20px; border: 3px solid var(--bg); }
	.ib-h { display: flex; align-items: center; justify-content: space-between; padding: 14px 22px 6px; }
	.ib-h b { font-size: 16px; font-weight: 700; }
	.ib-h span { font-size: 14px; color: var(--ink-3); }
	.ib-row { display: flex; align-items: center; gap: 14px; padding: 9px 22px; color: inherit; text-decoration: none; transition: background .12s; }
	.ib-row:hover { background: color-mix(in oklab, var(--ink) 5%, transparent); }
	.ib-row.on { background: color-mix(in oklab, var(--ink) 9%, transparent); }
	.ib-av { flex: none; width: 58px; height: 58px; border-radius: 50%; padding: 2.5px; display: grid; }
	.ib-av.ring { background: conic-gradient(from 210deg, var(--g3), var(--g2), var(--g1), var(--g3)); }
	.ib-av :global(.mono), .ib-av img { width: 100%; height: 100%; border-radius: 50%; font-size: 18px; border: 2.5px solid var(--bg); object-fit: cover; box-sizing: border-box; }
	.ib-b { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
	.ib-b b { font-size: 15.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ib-p { display: flex; min-width: 0; font-size: 14px; color: var(--ink-3); }
	.ib-t { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ib-ago { flex: none; white-space: nowrap; }
	.ib-row.unread b, .ib-row.unread .ib-p { font-weight: 700; color: var(--ink); }
	.ib-collab { gap: 5px; align-items: center; color: var(--g2); font-weight: 600; }
	.ib-collab :global(.ic) { width: 13px; height: 13px; flex: none; }
	.ib-dot { flex: none; width: 9px; height: 9px; border-radius: 50%; background: var(--g2); }
	.ib-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 40px 28px; text-align: center; color: var(--ink-3); font-size: 14px; }
	.ib-empty :global(.ic) { width: 30px; height: 30px; }
	.ib-empty b { color: var(--ink); font-size: 16px; }
	.ib-filter { display: inline-flex; align-items: center; gap: 6px; margin: 10px 22px 4px; height: 32px; padding: 0 14px; border-radius: 999px; border: 1px solid color-mix(in oklab, var(--g2) 40%, transparent); background: none; color: var(--g2); font: 600 13px var(--f-body, inherit); cursor: pointer; }
	.ib-filter.on { background: var(--g2); color: #fff; }
	.ib-filter :global(.ic) { width: 14px; height: 14px; }
	.ib-private { display: flex; gap: 6px; align-items: center; margin: 12px 22px 0; font-size: 12.5px; color: var(--ink-3); }
	.ib-private :global(.ic) { width: 14px; height: 14px; flex: none; }
	.ib-old { display: flex; align-items: center; gap: 12px; margin: 12px 22px 0; padding: 12px 14px; border-radius: 14px; background: color-mix(in oklab, var(--ink) 5%, transparent); }
	.ib-old span { flex: 1; display: flex; flex-direction: column; font-size: 13px; }
	.ib-old small { color: var(--ink-3); }
	@media (max-width: 760px) {
		.ib-top { display: none; }
		.ib-row { padding: 8px 16px; }
		.ib-h { padding: 12px 16px 6px; }
		.ib-search { margin: 10px 16px 4px; height: 40px; }
		.ib-notes { padding: 34px 12px 8px; }
		.ib-scroll { overflow: visible; }
	}
</style>
