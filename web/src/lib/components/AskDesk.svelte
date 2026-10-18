<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { askAi } from '../ai';
	import { askData } from '../askData';
	import { nudgesFor, type Nudge } from '../nudges';
	import { phone } from '../phone.svelte';
	import { portal } from '../portal';
	import { byCode, markPaid, reloadCollabs, setStage, studio, updateCollab } from '../studio.svelte';
	import { indexDesk, searchDesk, type Source } from '../desk';
	import { supabase } from '../supabase';
	import type { Collab, Stage } from '../types';
	import { toast, ui } from '../ui.svelte';
	import { errMessage, firstName, fmt, stageLabel, todayIso } from '../util';
	import AiThinking from './AiThinking.svelte';
	import Icon from './Icon.svelte';
	import NudgeSheet from './NudgeSheet.svelte';
	import { canSpeak, listen as hear, type Listening } from '../speak';

	// "Ask your desk": she asks about her own collabs and money (typed or spoken), the free AI answers
	// from her data and can offer a few actions as buttons. Nothing happens without her tap, and money
	// actions still ask first. Past chats are kept on this device only.
	let { onclose }: { onclose: () => void } = $props();

	type Action = { type: string; code: string; codes?: string[]; stage?: string; date?: string; path: string; text: string; label: string };
	type Turn = { q: string; a: string; actions: Action[]; sources?: Source[] };
	type Chat = { id: string; title: string; at: number; turns: Turn[] };
	const KEY = 'ask-desk-chats';
	let chats = $state<Chat[]>([]);
	let activeId = $state<string | null>(null);
	let q = $state('');
	let busy = $state(false);
	let list = $state<HTMLElement>();
	let box = $state<HTMLTextAreaElement>();
	let nudging = $state<Nudge | null>(null);
	let allHistory = $state(false);
	let menuOpen = $state(false);

	const active = $derived(chats.find((c) => c.id === activeId) ?? null);
	const turns = $derived(active?.turns ?? []);
	const name = $derived(firstName(studio.settings?.display_name ?? ''));

	const TOOLS = [
		{ icon: 'wallet', label: 'Who owes me', hint: 'Unpaid invoices', q: 'Who hasn’t paid me yet?' },
		{ icon: 'cal', label: 'This week', hint: 'Drafts, go-lives, payments', q: 'What’s due this week?' },
		{ icon: 'chart', label: 'My earnings', hint: 'This month so far', q: 'How much did I earn this month?' },
		{ icon: 'film', label: 'Drafts due', hint: 'What to make next', q: 'Which collabs need a draft from me?' },
		{ icon: 'bell', label: 'Follow-ups', hint: 'Brands gone quiet', q: 'Which brands should I follow up with?' }
	];

	onMount(() => {
		try {
			chats = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		} catch {
			/* storage blocked */
		}
		if (!phone.on) tick().then(() => box?.focus());
		// New messages and notes get their search fingerprints while she reads.
		indexDesk();
	});
	function save() {
		try {
			localStorage.setItem(KEY, JSON.stringify(chats.slice(0, 20)));
		} catch {
			/* storage blocked */
		}
	}
	const scrollEnd = async (smooth = true) => {
		await tick();
		list?.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
	};
	function newChat() {
		activeId = null;
		q = '';
		tick().then(() => box?.focus());
	}
	function openChat(id: string) {
		activeId = id;
		allHistory = false;
		scrollEnd(false);
	}
	function removeChat(id: string) {
		chats = chats.filter((c) => c.id !== id);
		if (activeId === id) activeId = null;
		save();
	}

	async function send(text = q) {
		const question = text.trim();
		if (!question || busy) return;
		q = '';
		busy = true;
		let chat = active;
		if (!chat) {
			chat = { id: crypto.randomUUID(), title: question.slice(0, 60), at: Date.now(), turns: [] };
			chats = [chat, ...chats];
			activeId = chat.id;
		}
		const c = chats.find((x) => x.id === chat!.id)!;
		c.turns.push({ q: question, a: '', actions: [] });
		c.at = Date.now();
		await scrollEnd();
		try {
			// The messages, emails, briefs and notes closest to the question go along, to quote from.
			const sources = await searchDesk(question);
			const r = await askAi<{ answer: string; cites?: number[]; actions: Action[] }>('ask', {
				question,
				today: todayIso(),
				data: askData(studio.collabs, studio.settings),
				history: c.turns.slice(-4, -1).map((t) => ({ q: t.q, a: t.a })),
				sources: sources.map((x) => ({ kind: x.kind, brand: x.brand, code: x.code, date: x.date, text: x.text }))
			});
			const used = (r.cites ?? []).map((n) => sources[n - 1]).filter(Boolean);
			c.turns[c.turns.length - 1] = { q: question, a: r.answer, actions: r.actions.filter((a) => !a.code || byCode(a.code)), sources: used };
			chats = [c, ...chats.filter((x) => x.id !== c.id)];
			save();
		} catch (e) {
			c.turns.pop();
			if (!c.turns.length) {
				chats = chats.filter((x) => x.id !== c.id);
				activeId = null;
			}
			q = question;
			toast((e as Error).message, 'alert');
		}
		busy = false;
		await scrollEnd();
	}

	async function act(a: Action) {
		const c = a.code ? byCode(a.code) : undefined;
		if (a.type === 'go') return (onclose(), goto(a.path));
		if (a.type === 'new_collab') {
			ui.pasteText = a.text;
			ui.newCollab = true;
			return onclose();
		}
		if (a.type === 'remind') {
			const items = (a.codes ?? []).map((k) => byCode(k)).filter((x): x is Collab => !!x);
			if (!items.length) return toast('Those collabs aren’t here any more.', 'alert');
			return (confirming = { a, items });
		}
		if (!c) return toast('That collab isn’t here any more.', 'alert');
		if (a.type === 'move_stage' || a.type === 'shoot_day') return (confirming = { a, items: [c] });
		if (a.type === 'open_collab' || a.type === 'new_invoice') return (onclose(), goto(`/studio/c/${c.code}`));
		if (a.type === 'mark_paid') return void markPaid(c);
		if (a.type === 'nudge') nudging = nudgesFor([c])[0] ?? { c, kind: 'quiet', days: 0, tries: 0, why: 'Checking in' };
	}

	// Speak instead of typing (the browser's own speech recognition, or the free AI where there is none).
	let listening = $state(false);
	let rec: Listening | null = null;
	function listen() {
		if (listening) return rec?.stop();
		if (!canSpeak()) return toast('This browser has no microphone access.', 'alert');
		listening = true;
		rec = hear({
			onText: (t) => (q = t),
			onDone: (t) => {
				listening = false;
				if (t) q = t;
				if (q.trim()) send();
			},
			onError: (m) => {
				listening = false;
				toast(m, 'alert');
			}
		});
	}
	// Actions that change things wait for her yes on a card first.
	let confirming = $state<{ a: Action; items: Collab[] } | null>(null);
	let doing = $state(false);
	const confirmTitle = (x: { a: Action; items: Collab[] }) =>
		x.a.type === 'remind'
			? `Send ${x.items.length} reminder${x.items.length > 1 ? 's' : ''}?`
			: x.a.type === 'move_stage'
				? `Move ${x.items[0].brand.name} to ${stageLabel(x.a.stage as Stage)}?`
				: `Plan the ${x.items[0].brand.name} shoot for ${fmt(x.a.date ?? '')}?`;
	const why = (c: Collab) =>
		c.invoices.some((i) => i.status === 'sent' || i.status === 'partly_paid') ? 'unpaid invoice' : c.quotes?.some((q) => q.status === 'sent') ? 'quote waiting' : c.stage === 'creating' ? 'draft waiting' : stageLabel(c.stage);
	async function doConfirmed() {
		if (!confirming) return;
		const { a, items } = confirming;
		doing = true;
		if (a.type === 'remind') {
			const { data, error } = await supabase.rpc('send_reminders', { p_ids: items.map((c) => c.id) });
			if (error) toast(`Couldn't send: ${errMessage(error)}`, 'alert');
			else {
				const r = data as { payment: number; quote: number; draft: number; skipped: number };
				const sent = r.payment + r.quote + r.draft;
				toast(sent ? `${sent} reminder${sent > 1 ? 's' : ''} sent${r.skipped ? `. ${r.skipped} had nothing to remind about` : ''}` : 'Nothing to remind about (or reminded in the last day).', sent ? 'send' : 'alert');
				await reloadCollabs();
			}
		} else if (a.type === 'move_stage') await setStage(items[0], a.stage as Stage);
		else if (a.type === 'shoot_day') {
			await updateCollab(items[0].id, { shoot_date: a.date });
			toast(`Shoot planned for ${fmt(a.date ?? '')}`, 'cal');
		}
		doing = false;
		confirming = null;
	}
	const clean = (t: string) => t.replace(/\s?\[\d+\](?:\s?\[\d+\])*/g, '');

	function keydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) {
			e.preventDefault();
			send();
		}
	}
	function grow(e: Event) {
		const t = e.currentTarget as HTMLTextAreaElement;
		t.style.height = 'auto';
		t.style.height = Math.min(160, t.scrollHeight) + 'px';
	}
	const ICON: Record<string, string> = { open_collab: 'arrow', mark_paid: 'wallet', new_invoice: 'doc', nudge: 'spark', go: 'arrow', new_collab: 'plus', remind: 'bell', move_stage: 'layers', shoot_day: 'cal' };
	const SRC_ICON: Record<string, string> = { Message: 'send', Instagram: 'send', Email: 'mail', Brief: 'doc', 'Your note': 'edit' };
	const when = (t: number) => {
		const d = Math.floor((Date.now() - t) / 864e5);
		return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
	};
	const back = () => (activeId ? (activeId = null) : allHistory ? (allHistory = false) : onclose());
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !nudging && (menuOpen ? (menuOpen = false) : onclose())} />

{#snippet conversation()}
	{#each turns as t, i (i)}
		<div class="gm-q"><p>{t.q}</p></div>
		<div class="gm-a">
			<span class="gm-spark" class:busy={!t.a} aria-hidden="true"><Icon name="spark" /></span>
			<div class="gm-a-b">
				{#if t.a}
					<p>{clean(t.a)}</p>
					{#if t.sources?.length}
						<div class="gm-srcs" aria-label="Where this comes from">
							{#each t.sources as s, k (k)}
								<button class="gm-src" title={s.text} disabled={!s.code} onclick={() => s.code && (onclose(), goto(`/studio/c/${s.code}`))}>
									<Icon name={SRC_ICON[s.kind] ?? 'doc'} /><span>{s.kind} · {s.date}{s.brand ? ` · ${s.brand}` : ''}</span>
								</button>
							{/each}
						</div>
					{/if}
					{#if t.actions.length}
						<div class="gm-acts">{#each t.actions as a, k (k)}<button class="gm-chip" onclick={() => act(a)}><Icon name={ICON[a.type] ?? 'arrow'} />{a.label || a.type}</button>{/each}</div>
					{/if}
				{:else if busy && i === turns.length - 1}
					<div class="gm-think"><i></i><i></i><i></i></div>
				{/if}
			</div>
		</div>
	{/each}
{/snippet}

{#snippet recent()}
	<button class="gm-new" onclick={() => (newChat(), (menuOpen = false))}><Icon name="edit" />New chat</button>
	<div class="gm-rlbl">Recent</div>
	<div class="gm-recent">
		{#each chats as c (c.id)}
			<div class="gm-ri" class:on={c.id === activeId}>
				<button class="gm-rb" onclick={() => (openChat(c.id), (menuOpen = false))}>{c.title}</button>
				<button class="gm-rx" onclick={() => removeChat(c.id)} aria-label="Delete chat"><Icon name="x" /></button>
			</div>
		{:else}
			<p class="gm-none">Your chats show up here.</p>
		{/each}
	</div>
{/snippet}

<div class="gm" class:gm-phone={phone.on} role="dialog" aria-modal="true" aria-label="Ask your desk" use:portal>
	{#if !phone.on}
		<aside class="gm-side">
			<div class="gm-brand"><span class="gm-spark lg" aria-hidden="true"><Icon name="spark" /></span><b>Ask your desk</b></div>
			{@render recent()}
			<p class="gm-priv"><Icon name="shield" />Answers come from your own data. Chats stay on this device.</p>
		</aside>
	{/if}
	<main class="gm-main">
		<header class="gm-top">
			{#if phone.on}<button class="gm-ib" onclick={() => (menuOpen = true)} aria-label="Recent chats"><Icon name="menu" /></button>{/if}
			<b class="gm-title">{active ? active.title : 'Ask your desk'}</b>
			{#if active}<button class="gm-ib" onclick={newChat} aria-label="New chat" title="New chat"><Icon name="edit" /></button>{/if}
			<button class="gm-ib" onclick={onclose} aria-label="Close"><Icon name="x" /></button>
		</header>

		<div class="gm-body" bind:this={list} aria-live="polite">
			{#if active}
				<div class="gm-conv">{@render conversation()}</div>
			{:else}
				<div class="gm-hello">
					<h2><span class="gm-grad">Hello, {name}</span><span class="gm-sub">How can I help today?</span></h2>
					<div class="gm-sugg">
						{#each TOOLS as t (t.label)}
							<button class="gm-pill" onclick={() => send(t.q)}><Icon name={t.icon} /><span>{t.q}</span></button>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		{#if confirming}
			<div class="gm-confirm" role="group" aria-label={confirmTitle(confirming)}>
				<b>{confirmTitle(confirming)}</b>
				{#if confirming.a.type === 'remind'}
					<ul>{#each confirming.items as c (c.id)}<li><span>{c.brand.name}</span><small>{why(c)}</small></li>{/each}</ul>
					<p>Each gets the reminder that fits. Nobody gets two in a day.</p>
				{/if}
				<div class="gm-confirm-b">
					<button class="gm-yes" disabled={doing} onclick={doConfirmed}>{#if doing}<span class="spinner"></span>{/if}{confirming.a.type === 'remind' ? 'Send' : confirming.a.type === 'move_stage' ? 'Move it' : 'Plan it'}</button>
					<button class="gm-no" disabled={doing} onclick={() => (confirming = null)}>Cancel</button>
				</div>
			</div>
		{/if}
		<form class="gm-box" onsubmit={(e) => (e.preventDefault(), send())}>
			<textarea rows="1" placeholder={listening ? 'Listening…' : 'Ask your desk'} aria-label="Your question" bind:value={q} bind:this={box} onkeydown={keydown} oninput={grow}></textarea>
			<div class="gm-box-r">
				<span class="gm-hint">English · Hinglish · ಕನ್ನಡ · हिंदी</span>
				<button type="button" class="gm-ib" class:rec={listening} onclick={listen} aria-label={listening ? 'Stop listening' : 'Speak your question'}><Icon name="mic" /></button>
				<button class="gm-send" type="submit" disabled={!q.trim() || busy} aria-label="Ask"><Icon name="send" /></button>
			</div>
		</form>
		<p class="gm-foot">Answers come from your own collabs and money. Check anything important.</p>
	</main>

	{#if phone.on && menuOpen}
		<div class="gm-scrim" role="presentation" onclick={() => (menuOpen = false)}></div>
		<aside class="gm-drawer">
			<div class="gm-brand"><span class="gm-spark lg" aria-hidden="true"><Icon name="spark" /></span><b>Ask your desk</b></div>
			{@render recent()}
		</aside>
	{/if}
</div>
{#if nudging}<NudgeSheet n={nudging} onclose={() => (nudging = null)} />{/if}

<style>
	/* Gemini-like: flat, airy, no boxes. Tonal surfaces, pills, a gradient greeting, answers as plain text. */
	.gm { --bg: #ffffff; --s1: #f0f4f9; --s2: #e4e9f2; --ink: #1f1f1f; --mut: #5f6368; --line: #e3e3e3; position: fixed; inset: 0; z-index: 70; display: grid; grid-template-columns: 280px minmax(0, 1fr); background: var(--bg); color: var(--ink); font-family: var(--f-body, system-ui); animation: gmf .25s ease; }
	:global(:root[data-theme='dark']) .gm { --bg: #131314; --s1: #1e1f20; --s2: #282a2c; --ink: #e3e3e3; --mut: #9aa0a6; --line: #2d2f31; }
	@media (prefers-color-scheme: dark) { :global(:root:not([data-theme='light'])) .gm { --bg: #131314; --s1: #1e1f20; --s2: #282a2c; --ink: #e3e3e3; --mut: #9aa0a6; --line: #2d2f31; } }
	.gm.gm-phone { grid-template-columns: minmax(0, 1fr); height: var(--vv-h, 100dvh); top: var(--vv-top, 0); bottom: auto; }
	@keyframes gmf { from { opacity: 0; } }

	.gm-side { display: flex; flex-direction: column; gap: 4px; min-height: 0; padding: 16px 12px; background: var(--s1); }
	.gm-brand { display: flex; align-items: center; gap: 10px; padding: 6px 10px 18px; font-size: 17px; }
	.gm-brand b { font-weight: 500; }
	.gm-new { display: inline-flex; align-items: center; gap: 12px; align-self: flex-start; height: 44px; padding: 0 18px; border: 0; border-radius: 999px; background: var(--s2); color: var(--ink); font: 500 14.5px var(--f-body, inherit); cursor: pointer; margin-bottom: 18px; }
	.gm-new:hover { filter: brightness(.97); }
	.gm-new :global(.ic) { width: 18px; height: 18px; }
	.gm-rlbl { padding: 6px 14px 8px; font-size: 14px; font-weight: 500; color: var(--ink); }
	.gm-recent { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; scrollbar-width: thin; }
	.gm-ri { display: flex; align-items: center; border-radius: 999px; }
	.gm-ri:hover { background: var(--s2); }
	.gm-ri.on { background: color-mix(in oklab, var(--g2) 18%, var(--s2)); }
	.gm-rb { flex: 1; min-width: 0; height: 40px; padding: 0 14px; border: 0; background: none; color: var(--ink); font: 400 14px var(--f-body, inherit); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
	.gm-rx { width: 32px; height: 32px; margin-right: 4px; border: 0; border-radius: 50%; background: none; color: var(--mut); display: grid; place-items: center; cursor: pointer; opacity: 0; }
	.gm-ri:hover .gm-rx, .gm.gm-phone .gm-rx { opacity: 1; }
	.gm-rx :global(.ic) { width: 15px; height: 15px; }
	.gm-none { margin: 2px 14px; font-size: 13.5px; color: var(--mut); }
	.gm-priv { display: flex; gap: 8px; margin: 10px 10px 0; font-size: 12px; line-height: 1.45; color: var(--mut); }
	.gm-priv :global(.ic) { width: 14px; height: 14px; flex: none; margin-top: 1px; }

	.gm-main { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
	.gm-top { display: flex; align-items: center; gap: 6px; min-height: 64px; padding: calc(8px + env(safe-area-inset-top, 0px)) 12px 8px 16px; }
	.gm-title { flex: 1; min-width: 0; font-size: 18px; font-weight: 400; text-transform: none; letter-spacing: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.gm-ib { flex: none; width: 44px; height: 44px; border: 0; border-radius: 50%; background: none; color: var(--ink); display: grid; place-items: center; cursor: pointer; }
	.gm-ib:hover { background: var(--s1); }
	.gm-ib :global(.ic) { width: 22px; height: 22px; }
	.gm-ib.rec { background: var(--bad); color: #fff; animation: pulse 1.4s ease-in-out infinite; }

	.gm-spark { flex: none; width: 28px; height: 28px; display: grid; place-items: center; color: var(--g2); }
	.gm-spark :global(.ic) { width: 24px; height: 24px; }
	.gm-spark.lg :global(.ic) { width: 26px; height: 26px; }
	.gm-spark.busy { animation: spin 1.6s linear infinite; }

	.gm-body { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
	.gm-hello { display: flex; flex-direction: column; justify-content: center; min-height: 100%; max-width: 820px; margin: 0 auto; padding: 24px 28px; box-sizing: border-box; }
	.gm-hello h2 { margin: 0 0 30px; display: flex; flex-direction: column; font-size: clamp(32px, 4.2vw, 52px); font-weight: 500; line-height: 1.15; letter-spacing: -.02em; }
	.gm-grad { background: linear-gradient(90deg, var(--g1), var(--g2) 55%, var(--g3)); -webkit-background-clip: text; background-clip: text; color: transparent; width: max-content; max-width: 100%; }
	.gm-sub { color: color-mix(in oklab, var(--mut) 80%, var(--bg)); }
	.gm-sugg { display: flex; flex-wrap: wrap; gap: 10px; }
	.gm-pill { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 10px 18px; border: 0; border-radius: 999px; background: var(--s1); color: var(--ink); font: 400 14.5px var(--f-body, inherit); text-align: left; cursor: pointer; transition: background .15s; }
	.gm-pill:hover { background: var(--s2); }
	.gm-pill :global(.ic) { width: 18px; height: 18px; flex: none; color: var(--g2); }

	.gm-conv { display: flex; flex-direction: column; gap: 26px; max-width: 780px; margin: 0 auto; padding: 18px 24px 30px; }
	.gm-q { display: flex; justify-content: flex-end; }
	.gm-q p { margin: 0; max-width: 80%; padding: 12px 18px; border-radius: 24px 6px 24px 24px; background: var(--s1); font-size: 16px; line-height: 1.5; white-space: pre-wrap; }
	.gm-a { display: flex; gap: 14px; align-items: flex-start; }
	.gm-a-b { flex: 1; min-width: 0; padding-top: 2px; }
	.gm-a-b p { margin: 0; font-size: 16px; line-height: 1.65; white-space: pre-wrap; }
	.gm-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
	.gm-chip { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--ink); font: 500 14px var(--f-body, inherit); cursor: pointer; }
	.gm-chip:hover { background: var(--s1); }
	.gm-chip :global(.ic) { width: 16px; height: 16px; color: var(--g2); }
	.gm-think { display: flex; flex-direction: column; gap: 9px; padding-top: 6px; }
	.gm-think i { display: block; height: 14px; border-radius: 99px; background: linear-gradient(90deg, color-mix(in oklab, var(--g1) 30%, var(--s1)), color-mix(in oklab, var(--g2) 25%, var(--s1)), var(--s1)); background-size: 200% 100%; animation: gmsh 1.4s linear infinite; }
	.gm-think i:nth-child(2) { width: 82%; }
	.gm-think i:nth-child(3) { width: 58%; }
	@keyframes gmsh { to { background-position: -200% 0; } }

	.gm-srcs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
	.gm-src { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; height: 30px; padding: 0 12px; border: 0; border-radius: 999px; background: var(--s1); color: var(--ink); font: 500 12.5px var(--f-body, inherit); cursor: pointer; }
	.gm-src:disabled { cursor: default; }
	.gm-src span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.gm-src :global(.ic) { width: 14px; height: 14px; flex: none; color: var(--g2); }
	.gm-confirm { width: calc(100% - 32px); max-width: 780px; margin: 0 auto 10px; box-sizing: border-box; display: grid; gap: 10px; padding: 18px 20px; border-radius: 24px; background: var(--s1); }
	.gm-confirm b { font-size: 16px; }
	.gm-confirm ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
	.gm-confirm li { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-top: 1px solid var(--s2); font-size: 14.5px; }
	.gm-confirm li:first-child { border-top: 0; }
	.gm-confirm small { color: var(--mut); font-size: 13px; }
	.gm-confirm p { margin: 0; font-size: 13px; color: var(--mut); }
	.gm-confirm-b { display: flex; gap: 8px; }
	.gm-yes { display: inline-flex; align-items: center; gap: 8px; height: 42px; padding: 0 22px; border: 0; border-radius: 999px; background: linear-gradient(135deg, var(--g1), var(--g2)); color: #fff; font: 600 14.5px var(--f-body, inherit); cursor: pointer; }
	.gm-no { height: 42px; padding: 0 18px; border: 0; border-radius: 999px; background: var(--bg); color: var(--ink); font: 600 14.5px var(--f-body, inherit); cursor: pointer; }
	.gm-box { width: calc(100% - 32px); max-width: 780px; margin: 6px auto 0; box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; padding: 14px 10px 8px 22px; border-radius: 28px; background: var(--s1); transition: background .15s; }
	.gm-box:focus-within { background: var(--s2); }
	.gm-box textarea { width: 100%; min-height: 26px; max-height: 160px; border: 0; outline: 0; resize: none; background: none; color: var(--ink); font: 400 16.5px/1.5 var(--f-body, inherit); padding: 0; }
	.gm-box textarea::placeholder { color: var(--mut); }
	.gm-box-r { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
	.gm-hint { flex: 1; font-size: 12.5px; color: var(--mut); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.gm-send { width: 44px; height: 44px; border: 0; border-radius: 50%; display: grid; place-items: center; background: linear-gradient(135deg, var(--g1), var(--g2)); color: #fff; cursor: pointer; transition: opacity .15s, transform .15s; }
	.gm-send:disabled { opacity: 0; transform: scale(.6); pointer-events: none; }
	.gm-send :global(.ic) { width: 19px; height: 19px; }
	.gm-foot { margin: 8px 0 calc(12px + env(safe-area-inset-bottom, 0px)); text-align: center; font-size: 12px; color: var(--mut); }

	.gm-scrim { position: fixed; inset: 0; z-index: 1; background: rgba(0, 0, 0, .4); animation: gmf .2s; }
	.gm-drawer { position: fixed; top: 0; bottom: 0; left: 0; z-index: 2; width: min(84vw, 320px); display: flex; flex-direction: column; gap: 4px; padding: calc(16px + env(safe-area-inset-top, 0px)) 12px 16px; background: var(--s1); border-radius: 0 24px 24px 0; animation: gmin .25s cubic-bezier(.2, .8, .2, 1); }
	@keyframes gmin { from { transform: translateX(-100%); } }

	@media (max-width: 760px) {
		.gm-hello { justify-content: flex-end; padding: 20px 20px 18px; }
		.gm-hello h2 { font-size: 34px; margin-bottom: 22px; }
		.gm-sugg { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -20px; padding: 0 20px; }
		.gm-sugg::-webkit-scrollbar { display: none; }
		.gm-pill { flex: none; flex-direction: column; align-items: flex-start; width: 156px; min-height: 104px; padding: 14px 16px; border-radius: 20px; white-space: normal; }
		.gm-conv { padding: 12px 18px 24px; gap: 22px; }
		.gm-hint { display: none; }
		.gm-box { width: calc(100% - 24px); border-radius: 30px; padding: 12px 8px 6px 20px; }
		.gm-foot { display: none; }
		.gm-box { margin-bottom: calc(10px + env(safe-area-inset-bottom, 0px)); }
	}
</style>
