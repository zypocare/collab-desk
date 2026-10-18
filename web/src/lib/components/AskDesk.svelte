<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { askAi } from '../ai';
	import { askData } from '../askData';
	import { nudgesFor, type Nudge } from '../nudges';
	import { phone } from '../phone.svelte';
	import { portal } from '../portal';
	import { byCode, markPaid, studio } from '../studio.svelte';
	import { toast, ui } from '../ui.svelte';
	import { firstName, todayIso } from '../util';
	import AiThinking from './AiThinking.svelte';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import NudgeSheet from './NudgeSheet.svelte';

	// "Ask your desk": she asks about her own collabs and money (typed or spoken), the free AI answers
	// from her data and can offer a few actions as buttons. Nothing happens without her tap, and money
	// actions still ask first. Past chats are kept on this device only.
	let { onclose }: { onclose: () => void } = $props();

	type Action = { type: string; code: string; path: string; text: string; label: string };
	type Turn = { q: string; a: string; actions: Action[] };
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
			const r = await askAi<{ answer: string; actions: Action[] }>('ask', {
				question,
				today: todayIso(),
				data: askData(studio.collabs, studio.settings),
				history: c.turns.slice(-4, -1).map((t) => ({ q: t.q, a: t.a }))
			});
			c.turns[c.turns.length - 1] = { q: question, a: r.answer, actions: r.actions.filter((a) => !a.code || byCode(a.code)) };
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
		if (!c) return toast('That collab isn’t here any more.', 'alert');
		if (a.type === 'open_collab' || a.type === 'new_invoice') return (onclose(), goto(`/studio/c/${c.code}`));
		if (a.type === 'mark_paid') return void markPaid(c);
		if (a.type === 'nudge') nudging = nudgesFor([c])[0] ?? { c, kind: 'quiet', days: 0, tries: 0, why: 'Checking in' };
	}

	// Speak instead of typing (the browser's own speech recognition; free).
	type Rec = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };
	const SR = typeof window !== 'undefined' ? ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition) : undefined;
	let listening = $state(false);
	let rec: Rec | null = null;
	function listen() {
		if (!SR) return toast('Speaking works in Chrome and Safari.', 'alert');
		if (listening) return rec?.stop();
		rec = new SR();
		rec.lang = 'en-IN';
		rec.interimResults = true;
		rec.onresult = (e) => (q = Array.from(e.results).map((r) => r[0].transcript).join(' '));
		rec.onend = () => {
			listening = false;
			if (q.trim()) send();
		};
		rec.onerror = () => (listening = false);
		listening = true;
		rec.start();
	}
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
	const ICON: Record<string, string> = { open_collab: 'arrow', mark_paid: 'wallet', new_invoice: 'doc', nudge: 'spark', go: 'arrow', new_collab: 'plus' };
	const when = (t: number) => {
		const d = Math.floor((Date.now() - t) / 864e5);
		return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
	};
	const back = () => (activeId ? (activeId = null) : allHistory ? (allHistory = false) : onclose());
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !nudging && onclose()} />

{#snippet conversation()}
	{#each turns as t, i (i)}
		<div class="ad-q"><p>{t.q}</p></div>
		{#if t.a}
			<div class="ad-a">
				<span class="ad-a-ic" aria-hidden="true"><Icon name="spark" /></span>
				<div>
					<p>{t.a}</p>
					{#if t.actions.length}
						<div class="ad-acts">{#each t.actions as a, k (k)}<button class="ad-act" onclick={() => act(a)}><Icon name={ICON[a.type] ?? 'arrow'} />{a.label || a.type}</button>{/each}</div>
					{/if}
				</div>
			</div>
		{:else if busy && i === turns.length - 1}
			<div class="ad-a"><span class="ad-a-ic" aria-hidden="true"><Icon name="spark" /></span><div><AiThinking label="Looking through your desk" /></div></div>
		{/if}
	{/each}
{/snippet}

{#snippet composer(big: boolean)}
	<form class="ad-box" class:big onsubmit={(e) => (e.preventDefault(), send())}>
		{#if big}<span class="ad-box-ic" aria-hidden="true"><Icon name="spark" /></span>{/if}
		<textarea rows="1" placeholder={listening ? 'Listening…' : big ? 'Ask your desk anything about your collabs, money or plans…' : 'Your message…'} aria-label="Your question" bind:value={q} bind:this={box} onkeydown={keydown} oninput={grow}></textarea>
		<div class="ad-box-r">
			{#if big}<span class="ad-lang">English · Hinglish · ಕನ್ನಡ</span>{/if}
			<button type="button" class="ad-mic" class:on={listening} onclick={listen} aria-label={listening ? 'Stop listening' : 'Speak your question'}><Icon name="mic" /></button>
			{#if big}<button class="ad-send" type="submit" disabled={!q.trim() || busy} aria-label="Ask"><Icon name="send" /></button>{/if}
		</div>
	</form>
{/snippet}

<div class="ad-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && onclose()}>
	{#if phone.on}
		<!-- Phone: a soft lilac assistant, like a chat app of its own. -->
		<div class="ad-ph" role="dialog" aria-modal="true" aria-label="Ask your desk">
			<span class="ad-blob b1" aria-hidden="true"></span><span class="ad-blob b2" aria-hidden="true"></span>
			{#if active}
				<header class="ad-ph-h">
					<button class="ad-round" onclick={back} aria-label="Back"><Icon name="chevL" /></button>
					<b>{active.title}</b>
					<button class="ad-round" onclick={newChat} aria-label="New chat"><Icon name="edit" /></button>
				</header>
				<div class="ad-ph-list" bind:this={list} aria-live="polite">{@render conversation()}</div>
				<div class="ad-ph-foot">{@render composer(false)}{#if q.trim()}<button class="ad-mic-big send" onclick={() => send()} disabled={busy} aria-label="Ask"><Icon name="send" /></button>{:else}<button class="ad-mic-big" class:on={listening} onclick={listen} aria-label="Speak your question"><Icon name="mic" /></button>{/if}</div>
			{:else}
				<header class="ad-ph-top">
					<Avatar name={studio.settings?.display_name ?? ''} src={studio.ig?.connected ? studio.ig.profile_picture_url : ''} size="44px" />
					<span><b>Hi {name}</b><small>How can I help you today?</small></span>
					<button class="ad-round" onclick={onclose} aria-label="Close"><Icon name="x" /></button>
				</header>
				<div class="ad-ph-list">
					{#if !allHistory}
						<section class="ad-pro">
							<div><b>Ask your desk</b><p>Money, deadlines and brands, answered from your own collabs.</p></div>
							<span class="ad-gem g1" aria-hidden="true"></span><span class="ad-gem g2" aria-hidden="true"></span><span class="ad-gem g3" aria-hidden="true"></span>
						</section>
						<div class="ad-tiles">
							{#each TOOLS as t (t.label)}
								<button class="ad-tile" onclick={() => send(t.q)}><span class="ad-tile-ic"><Icon name={t.icon} /></span><b>{t.label}</b></button>
							{/each}
						</div>
					{/if}
					{#if chats.length}
						<div class="ad-hist-h"><b>History</b>{#if chats.length > 3}<button onclick={() => (allHistory = !allHistory)}>{allHistory ? 'Less' : 'View all'}</button>{/if}</div>
						{#each allHistory ? chats : chats.slice(0, 3) as c (c.id)}
							<button class="ad-hist" onclick={() => openChat(c.id)}><b>{c.title}</b><small>{c.turns[c.turns.length - 1]?.a || c.turns[0]?.q}</small></button>
						{/each}
					{/if}
				</div>
				<div class="ad-ph-foot">{@render composer(false)}{#if q.trim()}<button class="ad-mic-big send" onclick={() => send()} disabled={busy} aria-label="Ask"><Icon name="send" /></button>{:else}<button class="ad-mic-big" class:on={listening} onclick={listen} aria-label="Speak your question"><Icon name="mic" /></button>{/if}</div>
			{/if}
		</div>
	{:else}
		<!-- Laptop: a full-screen assistant with its own menu. -->
		<div class="ad-lp" role="dialog" aria-modal="true" aria-label="Ask your desk">
			<span class="ad-beam" aria-hidden="true"></span>
			<aside class="ad-menu">
				<div class="ad-brand"><span class="ad-orb sm" aria-hidden="true"><Icon name="spark" /></span><b>Ask your desk</b></div>
				<button class="ad-newchat" onclick={newChat}><Icon name="plus" />New chat</button>
				<div class="ad-mlbl">Quick asks</div>
				{#each TOOLS as t (t.label)}
					<button class="ad-mi" onclick={() => send(t.q)}><Icon name={t.icon} /><span>{t.label}</span></button>
				{/each}
				<div class="ad-mlbl">Recent</div>
				<div class="ad-recent">
					{#each chats as c (c.id)}
						<div class="ad-ri" class:on={c.id === activeId}>
							<button class="ad-rb" onclick={() => openChat(c.id)}><b>{c.title}</b><small>{when(c.at)}</small></button>
							<button class="ad-rx" onclick={() => removeChat(c.id)} aria-label="Delete chat"><Icon name="x" /></button>
						</div>
					{:else}
						<p class="ad-none">Your questions show up here.</p>
					{/each}
				</div>
				<p class="ad-priv"><Icon name="shield" />Answers come from your own data. Chats stay on this device.</p>
			</aside>
			<main class="ad-main">
				<button class="ad-close" onclick={onclose} aria-label="Close"><Icon name="x" /></button>
				{#if active}
					<header class="ad-th"><b>{active.title}</b></header>
					<div class="ad-list" bind:this={list} aria-live="polite">{@render conversation()}</div>
				{:else}
					<div class="ad-hello">
						<span class="ad-orb" aria-hidden="true"><Icon name="spark" /></span>
						<span class="ad-welcome">Welcome to your desk, {name}</span>
						<h2>How can I help you today?</h2>
						<div class="ad-cards">
							{#each TOOLS.slice(0, 3) as t (t.label)}
								<button class="ad-card" onclick={() => send(t.q)}><span>{t.q}</span><small>{t.hint}</small><Icon name={t.icon} /></button>
							{/each}
						</div>
					</div>
				{/if}
				<div class="ad-foot">{@render composer(true)}</div>
			</main>
		</div>
	{/if}
</div>
{#if nudging}<NudgeSheet n={nudging} onclose={() => (nudging = null)} />{/if}

<style>
	.ad-scrim { position: fixed; inset: 0; z-index: 70; display: grid; background: rgba(8, 4, 8, .55); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); animation: adf .25s ease; }
	@keyframes adf { from { opacity: 0; } }

	/* ---------- shared conversation ---------- */
	.ad-q { display: flex; justify-content: flex-end; }
	.ad-q p { margin: 0; max-width: 78%; padding: 12px 16px; border-radius: 20px 20px 6px 20px; font-size: 15px; line-height: 1.45; white-space: pre-wrap; }
	.ad-a { display: flex; gap: 10px; align-items: flex-start; }
	.ad-a > div { min-width: 0; max-width: 86%; }
	.ad-a p { margin: 0; padding: 12px 16px; border-radius: 20px 20px 20px 6px; font-size: 15px; line-height: 1.55; white-space: pre-wrap; }
	.ad-a-ic { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: conic-gradient(from 200deg, var(--g1), var(--g2), var(--g3), var(--g1)); }
	.ad-a-ic :global(.ic) { width: 15px; height: 15px; }
	.ad-acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
	.ad-act { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 999px; font: 600 13px var(--f-body, inherit); cursor: pointer; }
	.ad-act :global(.ic) { width: 14px; height: 14px; }

	/* ---------- laptop ---------- */
	.ad-lp { position: relative; overflow: hidden; display: grid; grid-template-columns: 280px minmax(0, 1fr); width: 100%; height: 100%; background: radial-gradient(1200px 500px at 80% -10%, color-mix(in oklab, var(--g1) 22%, transparent), transparent 60%), #0e0b10; color: #f1ecf2; }
	.ad-beam { position: absolute; top: -20%; right: 4%; width: 46%; height: 70%; background: conic-gradient(from 200deg at 70% 0%, transparent 0deg, color-mix(in oklab, #b9a3ff 40%, transparent) 18deg, transparent 40deg); filter: blur(40px); opacity: .7; pointer-events: none; }
	.ad-menu { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 2px; min-height: 0; padding: 20px 14px; border-right: 1px solid rgba(255, 255, 255, .07); background: rgba(255, 255, 255, .02); }
	.ad-brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 18px; font-size: 16px; }
	.ad-newchat { display: flex; align-items: center; gap: 10px; height: 42px; margin-bottom: 14px; padding: 0 14px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, .12); background: rgba(255, 255, 255, .04); color: inherit; font: 600 14.5px var(--f-body, inherit); cursor: pointer; }
	.ad-newchat:hover { background: rgba(255, 255, 255, .08); }
	.ad-newchat :global(.ic) { width: 17px; height: 17px; }
	.ad-mlbl { padding: 14px 10px 6px; font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: rgba(241, 236, 242, .45); }
	.ad-mi { display: flex; align-items: center; gap: 12px; height: 38px; padding: 0 10px; border: 0; border-radius: 10px; background: none; color: rgba(241, 236, 242, .82); font: 500 14.5px var(--f-body, inherit); cursor: pointer; text-align: left; }
	.ad-mi:hover { background: rgba(255, 255, 255, .06); color: #fff; }
	.ad-mi :global(.ic) { width: 17px; height: 17px; color: #c9b6ff; }
	.ad-recent { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; scrollbar-width: thin; }
	.ad-ri { display: flex; align-items: center; border-radius: 10px; }
	.ad-ri:hover, .ad-ri.on { background: rgba(255, 255, 255, .07); }
	.ad-rb { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; padding: 8px 10px; border: 0; background: none; color: inherit; text-align: left; cursor: pointer; font: inherit; }
	.ad-rb b { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ad-rb small { font-size: 12px; color: rgba(241, 236, 242, .45); }
	.ad-rx { width: 28px; height: 28px; margin-right: 4px; border: 0; border-radius: 8px; background: none; color: rgba(241, 236, 242, .4); display: grid; place-items: center; cursor: pointer; opacity: 0; }
	.ad-ri:hover .ad-rx { opacity: 1; }
	.ad-rx:hover { color: #fff; background: rgba(255, 255, 255, .08); }
	.ad-rx :global(.ic) { width: 14px; height: 14px; }
	.ad-none { margin: 4px 10px; font-size: 13px; color: rgba(241, 236, 242, .4); }
	.ad-priv { display: flex; gap: 8px; align-items: flex-start; margin: 10px 6px 0; font-size: 12px; line-height: 1.45; color: rgba(241, 236, 242, .45); }
	.ad-priv :global(.ic) { width: 14px; height: 14px; flex: none; margin-top: 1px; }
	.ad-main { position: relative; z-index: 1; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
	.ad-close { position: absolute; top: 18px; right: 20px; z-index: 2; width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, .12); background: rgba(255, 255, 255, .04); color: inherit; display: grid; place-items: center; cursor: pointer; }
	.ad-close:hover { background: rgba(255, 255, 255, .1); }
	.ad-close :global(.ic) { width: 18px; height: 18px; }
	.ad-orb { position: relative; width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: radial-gradient(circle at 30% 25%, #fff6 0, transparent 40%), conic-gradient(from 210deg, var(--g1), var(--g2), var(--g3), var(--g1)); box-shadow: 0 0 40px color-mix(in oklab, var(--g1) 70%, transparent), 0 0 80px color-mix(in oklab, var(--g2) 35%, transparent); }
	.ad-orb :global(.ic) { width: 28px; height: 28px; }
	.ad-orb.sm { width: 32px; height: 32px; box-shadow: 0 0 18px color-mix(in oklab, var(--g1) 60%, transparent); }
	.ad-orb.sm :global(.ic) { width: 16px; height: 16px; }
	.ad-hello { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 40px 32px 10px; text-align: center; }
	.ad-welcome { margin-top: 18px; font-size: 16px; color: rgba(241, 236, 242, .6); }
	.ad-hello h2 { margin: 0 0 26px; font-size: clamp(32px, 3.4vw, 46px); font-weight: 500; letter-spacing: -.03em; color: #fff; }
	.ad-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 220px)); gap: 12px; }
	.ad-card { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-height: 120px; padding: 16px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, .09); background: rgba(255, 255, 255, .035); color: rgba(241, 236, 242, .88); font: 500 14.5px/1.4 var(--f-body, inherit); text-align: left; cursor: pointer; transition: border-color .2s, background .2s, transform .3s; }
	.ad-card:hover { border-color: color-mix(in oklab, #b9a3ff 55%, transparent); background: rgba(255, 255, 255, .06); transform: translateY(-2px); }
	.ad-card small { font-size: 12.5px; color: rgba(241, 236, 242, .45); }
	.ad-card :global(.ic) { margin-top: auto; width: 20px; height: 20px; color: #c9b6ff; }
	.ad-th { padding: 24px 80px 14px 36px; border-bottom: 1px solid rgba(255, 255, 255, .06); }
	.ad-th b { font-size: 17px; font-weight: 600; }
	.ad-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 26px max(36px, calc((100% - 820px) / 2)); scrollbar-width: thin; }
	.ad-lp .ad-q p { background: linear-gradient(135deg, var(--g1), var(--g2)); color: #fff; }
	.ad-lp .ad-a p { background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .08); color: #f1ecf2; }
	.ad-lp .ad-act { border: 1px solid rgba(255, 255, 255, .16); background: rgba(255, 255, 255, .05); color: #fff; }
	.ad-lp .ad-act:hover { background: rgba(255, 255, 255, .12); }
	.ad-lp :global(.ai-think) { color: rgba(241, 236, 242, .7); }
	.ad-foot { padding: 12px max(32px, calc((100% - 840px) / 2)) 26px; }
	.ad-box.big { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 14px 14px 12px 46px; border-radius: 20px; background: rgba(20, 16, 24, .85); border: 1px solid color-mix(in oklab, #b9a3ff 45%, transparent); box-shadow: 0 0 0 1px rgba(255, 255, 255, .03), 0 0 40px -6px color-mix(in oklab, var(--g1) 55%, transparent); }
	.ad-box.big:focus-within { border-color: color-mix(in oklab, #c9b6ff 80%, transparent); }
	.ad-box-ic { position: absolute; left: 16px; top: 16px; color: #c9b6ff; }
	.ad-box-ic :global(.ic) { width: 18px; height: 18px; }
	.ad-box.big textarea { min-height: 26px; max-height: 160px; border: 0; outline: 0; resize: none; background: none; color: #fff; font: 400 16px/1.5 var(--f-body, inherit); }
	.ad-box.big textarea::placeholder { color: rgba(241, 236, 242, .4); }
	.ad-box-r { display: flex; align-items: center; gap: 8px; }
	.ad-lang { margin-right: auto; font-size: 12.5px; color: rgba(241, 236, 242, .4); }
	.ad-mic, .ad-send { width: 36px; height: 36px; border-radius: 10px; border: 0; display: grid; place-items: center; cursor: pointer; }
	.ad-mic { background: none; color: rgba(241, 236, 242, .7); }
	.ad-mic:hover { background: rgba(255, 255, 255, .08); color: #fff; }
	.ad-mic.on { background: var(--bad); color: #fff; }
	.ad-send { border: 1px solid color-mix(in oklab, #b9a3ff 60%, transparent); background: color-mix(in oklab, var(--g1) 30%, transparent); color: #fff; }
	.ad-send:disabled { opacity: .4; cursor: default; }
	.ad-mic :global(.ic), .ad-send :global(.ic) { width: 18px; height: 18px; }

	/* ---------- phone ---------- */
	.ad-ph { position: relative; overflow: hidden; display: flex; flex-direction: column; width: 100%; height: var(--vv-h, 100dvh); margin-top: var(--vv-top, 0); --lil: #f3e8f6; --card: rgba(255, 255, 255, .62); --ink-ph: #241a2a; --mut: #7a6b80; background: linear-gradient(170deg, #f7eef8 0%, #ecdff4 45%, #f6dbe8 100%); color: var(--ink-ph); animation: adup .35s cubic-bezier(.2, .8, .2, 1); }
	:global(:root[data-theme='dark']) .ad-ph { --card: rgba(255, 255, 255, .07); --ink-ph: #f4eef2; --mut: #b4a6b8; background: linear-gradient(170deg, #1d1220 0%, #170f1c 50%, #24111c 100%); }
	@media (prefers-color-scheme: dark) { :global(:root:not([data-theme='light'])) .ad-ph { --card: rgba(255, 255, 255, .07); --ink-ph: #f4eef2; --mut: #b4a6b8; background: linear-gradient(170deg, #1d1220 0%, #170f1c 50%, #24111c 100%); } }
	@keyframes adup { from { transform: translateY(30px); opacity: 0; } }
	.ad-blob { position: absolute; border-radius: 50%; filter: blur(30px); pointer-events: none; opacity: .75; }
	.ad-blob.b1 { width: 260px; height: 260px; right: -90px; top: -60px; background: radial-gradient(circle, color-mix(in oklab, var(--g2) 55%, transparent), transparent 70%); }
	.ad-blob.b2 { width: 300px; height: 300px; left: -120px; bottom: 60px; background: radial-gradient(circle, color-mix(in oklab, var(--g1) 45%, transparent), transparent 70%); }
	.ad-ph-top, .ad-ph-h { position: relative; z-index: 1; display: flex; align-items: center; gap: 12px; padding: calc(14px + env(safe-area-inset-top, 0px)) 18px 10px; }
	.ad-ph-top > span { flex: 1; display: flex; flex-direction: column; }
	.ad-ph-top b { font-size: 16px; }
	.ad-ph-top small { font-size: 13px; color: var(--mut); }
	.ad-ph-h b { flex: 1; text-align: center; font-size: 15.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ad-round { flex: none; width: 42px; height: 42px; border-radius: 50%; border: 0; background: var(--card); color: var(--ink-ph); display: grid; place-items: center; box-shadow: 0 4px 14px -6px rgba(60, 20, 60, .25); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
	.ad-round :global(.ic) { width: 20px; height: 20px; }
	.ad-ph-list { position: relative; z-index: 1; flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 8px 18px 16px; }
	.ad-pro { position: relative; overflow: hidden; min-height: 150px; padding: 20px; border-radius: 26px; background: var(--card); border: 1px solid rgba(255, 255, 255, .55); box-shadow: 0 10px 30px -18px rgba(80, 30, 90, .35); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
	.ad-pro > div { position: relative; z-index: 1; max-width: 62%; }
	.ad-pro b { display: block; font-size: 26px; font-weight: 500; line-height: 1.12; letter-spacing: -.02em; }
	.ad-pro p { margin: 8px 0 0; font-size: 13.5px; line-height: 1.4; color: var(--mut); }
	.ad-gem { position: absolute; display: block; background: linear-gradient(135deg, #ffd6f0, var(--g2) 45%, var(--g1)); clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%); filter: drop-shadow(0 6px 10px rgba(180, 60, 140, .4)); animation: gem 6s ease-in-out infinite; }
	.ad-gem.g1 { width: 92px; height: 108px; right: 18px; top: 26px; }
	.ad-gem.g2 { width: 48px; height: 56px; right: 104px; top: 14px; animation-delay: -2s; opacity: .85; }
	.ad-gem.g3 { width: 40px; height: 46px; right: 92px; bottom: 16px; animation-delay: -4s; opacity: .8; }
	@keyframes gem { 50% { transform: translateY(-6px) rotate(6deg); } }
	.ad-tiles { display: flex; gap: 10px; overflow-x: auto; scrollbar-width: none; margin: 0 -18px; padding: 2px 18px; }
	.ad-tiles::-webkit-scrollbar { display: none; }
	.ad-tile { flex: none; width: 112px; height: 112px; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-start; padding: 14px; border-radius: 22px; border: 1px solid rgba(255, 255, 255, .55); background: var(--card); color: var(--ink-ph); font: 600 13.5px/1.25 var(--f-body, inherit); text-align: left; -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); box-shadow: 0 8px 22px -16px rgba(80, 30, 90, .4); }
	.ad-tile-ic { width: 40px; height: 40px; border-radius: 13px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #f7a8d8, var(--g2) 55%, var(--g1)); box-shadow: 0 6px 14px -6px color-mix(in oklab, var(--g2) 70%, transparent); }
	.ad-tile-ic :global(.ic) { width: 20px; height: 20px; }
	.ad-hist-h { display: flex; align-items: baseline; justify-content: space-between; margin-top: 6px; }
	.ad-hist-h b { font-size: 24px; font-weight: 500; letter-spacing: -.02em; }
	.ad-hist-h button { border: 0; background: none; color: var(--mut); font: 500 13.5px var(--f-body, inherit); }
	.ad-hist { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, .55); background: var(--card); color: var(--ink-ph); text-align: left; font: inherit; -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
	.ad-hist b { font-size: 16px; font-weight: 600; }
	.ad-hist small { font-size: 13.5px; color: var(--mut); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ad-ph .ad-q p { background: var(--card); color: var(--ink-ph); border: 1px solid rgba(255, 255, 255, .6); box-shadow: 0 6px 16px -12px rgba(80, 30, 90, .4); }
	.ad-ph .ad-a p { background: rgba(255, 255, 255, .9); color: #241a2a; box-shadow: 0 6px 16px -12px rgba(80, 30, 90, .4); }
	:global(:root[data-theme='dark']) .ad-ph .ad-a p { background: rgba(255, 255, 255, .1); color: #f4eef2; }
	.ad-ph .ad-act { border: 0; background: linear-gradient(135deg, var(--g1), var(--g2)); color: #fff; }
	.ad-ph-foot { position: relative; z-index: 1; display: flex; align-items: center; gap: 10px; padding: 10px 16px calc(14px + env(safe-area-inset-bottom, 0px)); }
	.ad-ph-foot .ad-box { flex: 1; display: flex; align-items: center; min-height: 52px; padding: 4px 6px 4px 18px; border-radius: 999px; background: var(--card); border: 1px solid rgba(255, 255, 255, .6); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); box-shadow: 0 8px 22px -16px rgba(80, 30, 90, .45); }
	.ad-ph-foot textarea { flex: 1; min-width: 0; max-height: 120px; border: 0; outline: 0; resize: none; background: none; color: var(--ink-ph); font: 400 16px/1.4 var(--f-body, inherit); padding: 10px 0; }
	.ad-ph-foot textarea::placeholder { color: var(--mut); }
	.ad-ph-foot .ad-box-r .ad-mic { display: none; }
	.ad-mic-big { flex: none; width: 56px; height: 56px; border-radius: 50%; border: 0; display: grid; place-items: center; background: #fff; color: #241a2a; box-shadow: 0 10px 24px -10px rgba(80, 30, 90, .5); }
	.ad-mic-big.send { background: linear-gradient(135deg, var(--g1), var(--g2)); color: #fff; }
	.ad-mic-big.on { background: var(--bad); color: #fff; animation: pulse 1.4s ease-in-out infinite; }
	.ad-mic-big :global(.ic) { width: 22px; height: 22px; }
</style>
