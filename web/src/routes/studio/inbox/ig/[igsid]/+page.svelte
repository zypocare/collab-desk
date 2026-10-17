<script lang="ts">
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { byId, studio } from '#lib/studio.svelte.ts';
	import { askAi, collabFacts } from '#lib/ai.ts';
	import AiThinking from '#lib/components/AiThinking.svelte';
	import { toast, ui } from '#lib/ui.svelte.ts';
	import { errMessage } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Mono from '#lib/components/Mono.svelte';

	// One Instagram DM conversation: read it, reply (within Instagram's 24-hour window), or turn it
	// into a collab.
	type T = { igsid: string; username: string; name: string; picture: string; last_from_them_at: string | null; collab_id: string | null; collab_flag: string; collab_hint: string };
	type M = { mid: string; from_me: boolean; text: string; created_at: string };
	const igsid = $derived(page.params.igsid ?? '');
	let t = $state<T | null>(null);
	let msgs = $state<M[]>([]);
	let text = $state('');
	let busy = $state(false);
	let list = $state<HTMLElement>();
	let drafts = $state<string[]>([]);
	let drafting = $state(false);
	let loaded = $state(false);

	// AI reply ideas: as her, from the chat and (if it's become a collab) the collab's facts.
	async function suggest() {
		drafting = true;
		try {
			const s = studio.settings;
			const c = byId(t?.collab_id);
			const context = {
				channel: 'instagram',
				...(c && s ? collabFacts(c, s) : { creator: s?.display_name, handle: s?.handle, niche: s?.niche, rate_card: s?.rates, reply_time: s?.reply_time }),
				...(t?.collab_hint && !c ? { looks_like: t.collab_hint } : {})
			};
			const r = await askAi<{ replies: string[] }>('reply', { thread: msgs.slice(-12).map((m) => ({ from: m.from_me ? 'creator' : 'brand', text: m.text })), context });
			drafts = r.replies;
			if (!drafts.length) toast("The AI didn't have a suggestion this time. Try again.", 'alert');
		} catch (e) {
			toast((e as Error).message, 'alert');
		}
		drafting = false;
	}

	async function load() {
		const [a, b] = await Promise.all([
			supabase.from('ig_threads').select('*').eq('igsid', igsid).maybeSingle(),
			supabase.from('ig_dms').select('mid, from_me, text, created_at').eq('igsid', igsid).order('created_at')
		]);
		t = (a.data as T | null) ?? null;
		msgs = (b.data as M[]) ?? [];
		loaded = true;
		if (!t) return;
		await supabase.from('ig_threads').update({ unread: 0 }).eq('igsid', igsid);
		await tick();
		list?.scrollTo({ top: list.scrollHeight });
	}
	onMount(() => {
		load();
		const ch = supabase
			.channel(`igdm-${igsid}`)
			.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ig_dms', filter: `igsid=eq.${igsid}` }, () => load())
			.subscribe();
		const ch2 = supabase
			.channel(`igth-${igsid}`)
			.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ig_threads', filter: `igsid=eq.${igsid}` }, (p) => (t = { ...(t as T), ...(p.new as T) }))
			.subscribe();
		return () => {
			supabase.removeChannel(ch);
			supabase.removeChannel(ch2);
		};
	});
	const flagged = $derived(!!t && !t.collab_id && (t.collab_flag === 'likely' || t.collab_flag === 'maybe'));
	const open24 = $derived(!!t?.last_from_them_at && Date.now() - Date.parse(t.last_from_them_at) < 24 * 3600e3);

	async function send(e: SubmitEvent) {
		e.preventDefault();
		const body = text.trim();
		if (!body) return;
		busy = true;
		const { data, error } = await supabase.functions.invoke('instagram-dm', { body: { igsid, text: body } });
		busy = false;
		if (error || (data as { error?: string })?.error) {
			let msg = (data as { error?: string })?.error ?? errMessage(error);
			try {
				msg = (await (error as { context?: Response })?.context?.json())?.error ?? msg;
			} catch {
				/* keep it */
			}
			return toast(msg, 'alert');
		}
		text = '';
		load();
	}
	// Not a collab: the chat is removed from the app (their messages and details), and their later
	// messages stay out.
	async function notCollab() {
		const { error } = await supabase.rpc('ig_not_collab', { p_igsid: igsid });
		if (error) return toast(errMessage(error), 'alert');
		toast('Removed. Their messages will stay out of the app.', 'check');
		history.back();
	}
	function addCollab() {
		// The conversation goes into "Add a collab", where the AI can read it.
		ui.pasteText = msgs.slice(-15).map((m) => `${m.from_me ? studio.settings?.display_name ?? 'Me' : t?.username || 'Brand'}: ${m.text}`).join('\n');
		ui.fromIg = igsid;
		ui.newCollab = true;
	}
	const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
</script>

<svelte:head><title>@{t?.username ?? 'Instagram'} · Messages · {studio.settings?.app_name}</title></svelte:head>

{#if loaded && !t}
	<div class="empty-card"><h2>Chat not found</h2><p>It may have been removed, or it was never a possible collab.</p><a class="btn" href="/studio/inbox">All messages</a></div>
{:else}
<div class="chat">
	<header class="chat-h">
		<button class="m-ib" onclick={() => history.back()} aria-label="Back"><Icon name="chevL" /></button>
		<div class="chat-who">
			{#if t?.picture}<img class="ig-pic" src={t.picture} alt="" referrerpolicy="no-referrer" />{:else}<Mono name={t?.username || 'IG'} />{/if}
			<span><b>@{t?.username || 'Instagram user'}</b><small>{t?.name || 'Instagram DM'}</small></span>
		</div>
		{#if t?.collab_id}<a class="m-ib" href="/studio/collabs" aria-label="Collab"><Icon name="info" /></a>{:else if !flagged}<button class="btn sm" onclick={addCollab}><Icon name="plus" />Add as collab</button>{/if}
	</header>
	{#if flagged && t}
		<div class="collab-banner">
			<span class="cb-ic"><Icon name="spark" /></span>
			<div><b>Looks like a collab{t.collab_flag === 'maybe' ? '?' : ''} <span class="ai-tag"><Icon name="spark" />AI</span></b><small>{t.collab_hint || 'A brand may be asking about working together.'}</small></div>
			<button class="btn sm primary" onclick={addCollab}><Icon name="plus" />Add as collab</button>
			<button class="lnk" onclick={notCollab}>Not a collab</button>
		</div>
	{/if}
	<div class="thread">
		<div class="th-list" bind:this={list}>
			{#each msgs as m (m.mid)}
				<div class="bub-row" class:mine={m.from_me}><div class="bub"><p>{m.text}</p><time datetime={m.created_at}>{time(m.created_at)}</time></div></div>
			{:else}
				<div class="th-empty"><Icon name="send" /><p>No messages yet.</p></div>
			{/each}
		</div>
		{#if open24}
			{#if !text}
				<div class="th-ai">
					{#if drafting}<AiThinking label="Writing replies" />{:else}<button type="button" class="btn sm ai-btn" onclick={suggest}><Icon name="spark" />{drafts.length ? 'More replies' : 'Suggest replies'}</button>{/if}
					{#each drafts as d, i (i)}<button type="button" class="ai-draft" onclick={() => ((text = d), (drafts = []))}>{d}</button>{/each}
				</div>
			{/if}
			<form class="th-box" onsubmit={send}>
				<textarea class="inp" rows="1" placeholder="Message…" bind:value={text}></textarea>
				<button class="btn grad send-btn" type="submit" disabled={busy || !text.trim()} aria-label="Send">{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}</button>
			</form>
		{:else}
			<p class="hint ig-closed">Instagram only lets apps reply within 24 hours of their last message. <a class="lnk" href="https://ig.me/m/{t?.username ?? ''}" target="_blank" rel="noopener">Reply in Instagram</a></p>
		{/if}
	</div>
</div>
{/if}
