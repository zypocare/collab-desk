<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { askAi } from '../ai';
	import { supabase } from '../supabase';
	import type { Collab, Message } from '../types';
	import { toast } from '../ui.svelte';
	import { errMessage, firstName } from '../util';
	import AiThinking from './AiThinking.svelte';
	import Icon from './Icon.svelte';
	import NegotiateSheet from './NegotiateSheet.svelte';

	let {
		collabId,
		side,
		otherName,
		quick = [],
		facts,
		collab
	}: {
		collabId: string;
		side: 'creator' | 'brand';
		otherName: string;
		/** Suggested replies shown above the box: tap to put the text in the box, edit, send. */
		quick?: (string | { label: string; text: string; saved?: boolean })[];
		/** Creator side: facts the AI may use to draft replies. */
		facts?: Record<string, unknown>;
		/** Creator side: the collab, for the negotiation helper. */
		collab?: Collab;
	} = $props();
	let negotiating = $state(false);

	// Free AI: three reply drafts from the conversation so far.
	let drafts = $state<string[]>([]);
	let drafting = $state(false);
	async function suggestReplies() {
		drafting = true;
		try {
			const r = await askAi<{ replies: string[] }>('reply', { thread: messages.map((m) => ({ from: m.sender, text: m.body })), context: facts ?? {} });
			drafts = r.replies;
			if (!drafts.length) toast("The AI didn't have a suggestion this time. Try again.", 'alert');
		} catch (e) {
			toast((e as Error).message, 'alert');
		}
		drafting = false;
	}

	const other = $derived(side === 'creator' ? 'brand' : 'creator');
	let messages = $state<Message[]>([]);
	let otherRead = $state('');
	let loaded = $state(false);
	let text = $state('');
	let sending = $state(false);
	let list = $state<HTMLElement>();
	let box = $state<HTMLTextAreaElement>();

	const lastMine = $derived([...messages].reverse().find((m) => m.sender === side));
	const seen = $derived(!!lastMine && !!otherRead && otherRead >= lastMine.created_at);

	async function scrollEnd(smooth = true) {
		await tick();
		list?.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
	}

	function markRead() {
		// Only when she's actually looking: the tab is showing and the window has focus.
		if (document.visibilityState === 'visible' && document.hasFocus()) supabase.rpc('mark_thread_read', { p_collab: collabId }).then(() => {});
	}

	async function load() {
		const [m, r] = await Promise.all([
			supabase.from('collab_messages').select('id, collab_id, sender, body, created_at').eq('collab_id', collabId).order('created_at'),
			supabase.from('collab_reads').select('side, read_at').eq('collab_id', collabId)
		]);
		messages = (m.data as Message[]) ?? [];
		otherRead = ((r.data as { side: string; read_at: string }[]) ?? []).find((x) => x.side === other)?.read_at ?? '';
		loaded = true;
		scrollEnd(false);
		markRead();
	}

	onMount(() => {
		load();
		const ch = supabase
			.channel(`thread-${collabId}-${side}`)
			.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'collab_messages', filter: `collab_id=eq.${collabId}` }, (p) => {
				const m = p.new as Message;
				if (messages.some((x) => x.id === m.id)) return;
				messages = [...messages.filter((x) => !(x.id.startsWith('tmp-') && x.body === m.body && x.sender === m.sender)), m];
				scrollEnd();
				if (m.sender !== side) markRead();
			})
			.on('postgres_changes', { event: '*', schema: 'public', table: 'collab_reads', filter: `collab_id=eq.${collabId}` }, (p) => {
				const r = p.new as { side: string; read_at: string };
				if (r?.side === other) otherRead = r.read_at;
			})
			.subscribe();
		const onVis = () => markRead();
		document.addEventListener('visibilitychange', onVis);
		window.addEventListener('focus', onVis);
		return () => {
			supabase.removeChannel(ch);
			document.removeEventListener('visibilitychange', onVis);
			window.removeEventListener('focus', onVis);
		};
	});

	async function send(body = text) {
		const clean = body.trim();
		if (!clean || sending) return;
		sending = true;
		const tmp: Message = { id: `tmp-${Date.now()}`, collab_id: collabId, sender: side, body: clean, created_at: new Date().toISOString() };
		messages = [...messages, tmp];
		if (body === text) text = '';
		scrollEnd();
		const { data, error } = await supabase.from('collab_messages').insert({ collab_id: collabId, sender: side, body: clean }).select('id, collab_id, sender, body, created_at').single();
		sending = false;
		if (error) {
			messages = messages.filter((m) => m.id !== tmp.id);
			text = clean;
			toast(`Couldn't send: ${errMessage(error)}`, 'alert');
			return;
		}
		messages = messages.some((m) => m.id === (data as Message).id) ? messages.filter((m) => m.id !== tmp.id) : messages.map((m) => (m.id === tmp.id ? (data as Message) : m));
		box?.focus();
	}

	// A suggestion goes into the box (not straight out), so she can tweak it first.
	async function useReply(t: string) {
		text = t;
		await tick();
		if (box) {
			box.style.height = 'auto';
			box.style.height = Math.min(220, box.scrollHeight) + 'px';
			box.focus();
		}
	}

	function keydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			send();
		}
	}

	const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
	const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
</script>

{#if negotiating && collab}<NegotiateSheet c={collab} thread={messages.map((m) => ({ from: m.sender, text: m.body }))} onuse={useReply} onclose={() => (negotiating = false)} />{/if}

<div class="thread">
	<div class="th-list" bind:this={list} aria-live="polite">
		{#if !loaded}
			<div class="th-empty"><span class="spinner"></span></div>
		{:else if !messages.length}
			<div class="th-empty">
				<Icon name="mail" />
				<p>{side === 'brand' ? `Questions about this request? Message ${firstName(otherName)} here.` : `Message ${otherName} here. They get an email and reply from their request page.`}</p>
			</div>
		{:else}
			{#each messages as m, i (m.id)}
				{#if i === 0 || day(messages[i - 1].created_at) !== day(m.created_at)}<div class="th-day"><span>{day(m.created_at)}</span></div>{/if}
				<div class="bub-row" class:mine={m.sender === side}>
					<div class="bub" class:pending={m.id.startsWith('tmp-')}>
						<p>{m.body}</p>
						<time datetime={m.created_at}>{time(m.created_at)}</time>
					</div>
				</div>
			{/each}
			{#if seen}<div class="th-seen"><Icon name="check" />Seen</div>{/if}
		{/if}
	</div>
	{#if facts && !text}
		<div class="th-ai">
			{#if drafting}<AiThinking label="Writing replies" />{:else}<span class="th-ai-btns"><button type="button" class="btn sm ai-btn" onclick={suggestReplies}><Icon name="spark" />{drafts.length ? 'More replies' : 'Suggest replies'}</button>{#if collab && collab.stage !== 'declined' && collab.stage !== 'wrapped'}<button type="button" class="btn sm" onclick={() => (negotiating = true)} title="Brand asking for a lower price? Get three replies that protect your rate"><Icon name="scale" />Negotiate</button>{/if}</span>{/if}
			{#each drafts as d, i (i)}<button type="button" class="ai-draft" onclick={() => ((drafts = []), useReply(d))}>{d}</button>{/each}
		</div>
	{/if}
	{#if quick.length && !text}
		<div class="th-quick">
			{#each quick as q, i (i)}
				{@const r = typeof q === 'string' ? { label: q, text: q, saved: false } : q}
				<button type="button" class="cat-chip" class:saved-chip={r.saved} title={r.text} onclick={() => useReply(r.text)} disabled={sending}><Icon name={r.saved ? 'edit' : 'spark'} />{r.label}</button>
			{/each}
		</div>
	{/if}
	<form class="th-box" onsubmit={(e) => (e.preventDefault(), send())}>
		<textarea
			class="inp"
			rows="1"
			placeholder="Write a message…"
			aria-label="Message to {otherName}"
			maxlength="4000"
			bind:value={text}
			bind:this={box}
			onkeydown={keydown}
			oninput={(e) => {
				const t = e.currentTarget;
				t.style.height = 'auto';
				t.style.height = Math.min(140, t.scrollHeight) + 'px';
			}}
		></textarea>
		<button class="btn grad send-btn" type="submit" disabled={!text.trim() || sending} aria-label="Send message"><Icon name="send" /></button>
	</form>
</div>
