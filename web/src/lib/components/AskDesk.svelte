<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { askAi } from '../ai';
	import { askData } from '../askData';
	import { nudgesFor, type Nudge } from '../nudges';
	import { portal } from '../portal';
	import { byCode, markPaid, studio } from '../studio.svelte';
	import { toast, ui } from '../ui.svelte';
	import { todayIso } from '../util';
	import AiThinking from './AiThinking.svelte';
	import Icon from './Icon.svelte';
	import NudgeSheet from './NudgeSheet.svelte';

	// "Ask your desk": she asks about her own collabs and money (typed or spoken), the free AI answers
	// from her data and can offer a few actions as buttons. Nothing happens without her tap, and money
	// actions still ask first.
	let { onclose }: { onclose: () => void } = $props();

	type Action = { type: string; code: string; path: string; text: string; label: string };
	type Turn = { q: string; a: string; actions: Action[] };
	const KEY = 'ask-desk-chat';
	let turns = $state<Turn[]>([]);
	let q = $state('');
	let busy = $state(false);
	let list = $state<HTMLElement>();
	let box = $state<HTMLTextAreaElement>();
	let nudging = $state<Nudge | null>(null);

	const IDEAS = ['What’s due this week?', 'Who hasn’t paid me yet?', 'How much did I earn this month?', 'Which collabs need a draft from me?', 'Which brands should I follow up with?'];

	onMount(() => {
		try {
			turns = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
		} catch {
			/* storage blocked */
		}
		tick().then(() => (list?.scrollTo({ top: list.scrollHeight }), box?.focus()));
	});
	$effect(() => {
		const snap = JSON.stringify(turns.slice(-10));
		try {
			sessionStorage.setItem(KEY, snap);
		} catch {
			/* storage blocked */
		}
	});

	async function send(text = q) {
		const question = text.trim();
		if (!question || busy) return;
		q = '';
		busy = true;
		turns = [...turns, { q: question, a: '', actions: [] }];
		await tick();
		list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
		try {
			const r = await askAi<{ answer: string; actions: Action[] }>('ask', {
				question,
				today: todayIso(),
				data: askData(studio.collabs, studio.settings),
				history: turns.slice(-4, -1).map((t) => ({ q: t.q, a: t.a }))
			});
			turns[turns.length - 1] = { q: question, a: r.answer, actions: r.actions.filter((a) => !a.code || byCode(a.code)) };
		} catch (e) {
			turns = turns.slice(0, -1);
			q = question;
			toast((e as Error).message, 'alert');
		}
		busy = false;
		await tick();
		list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
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

	// Speak instead of typing (the phone's own speech recognition; free).
	type Rec = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };
	const SR = typeof window !== 'undefined' ? ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition) : undefined;
	let listening = $state(false);
	let rec: Rec | null = null;
	function listen() {
		if (!SR) return;
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
	const ICON: Record<string, string> = { open_collab: 'arrow', mark_paid: 'wallet', new_invoice: 'doc', nudge: 'spark', go: 'arrow', new_collab: 'plus' };
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !nudging && onclose()} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog ng ask" role="dialog" aria-modal="true" aria-labelledby="ask-title">
		<header class="ng-h">
			<div>
				<span class="eb">Ask your desk <span class="ai-tag"><Icon name="spark" />AI</span></span>
				<h2 id="ask-title">What would you like to know?</h2>
			</div>
			<div class="ask-hd">
				{#if turns.length}<button class="btn sm ghost" onclick={() => (turns = [])}>Clear</button>{/if}
				<button class="icon-btn" onclick={onclose} aria-label="Close"><Icon name="x" /></button>
			</div>
		</header>

		<div class="ask-list" bind:this={list} aria-live="polite">
			{#if !turns.length}
				<p class="ask-hint">Ask about your collabs, money and plans, in English, Hinglish, Hindi or Kannada. Try:</p>
				<div class="ask-ideas">
					{#each IDEAS as idea (idea)}<button class="lang-chip" onclick={() => send(idea)}>{idea}</button>{/each}
				</div>
			{/if}
			{#each turns as t, i (i)}
				<div class="ask-q"><p>{t.q}</p></div>
				{#if t.a}
					<div class="ask-a">
						<p>{t.a}</p>
						{#if t.actions.length}
							<div class="ask-acts">
								{#each t.actions as a, k (k)}<button class="btn sm" onclick={() => act(a)}><Icon name={ICON[a.type] ?? 'arrow'} />{a.label || a.type}</button>{/each}
							</div>
						{/if}
					</div>
				{:else if busy && i === turns.length - 1}
					<div class="ask-a"><AiThinking label="Looking through your desk" /></div>
				{/if}
			{/each}
		</div>

		<form class="ask-box" onsubmit={(e) => (e.preventDefault(), send())}>
			<textarea class="inp" rows="1" placeholder={listening ? 'Listening…' : 'Ask anything about your collabs…'} aria-label="Your question" bind:value={q} bind:this={box} onkeydown={keydown}></textarea>
			{#if SR}<button type="button" class="ask-mic" class:on={listening} onclick={listen} aria-label={listening ? 'Stop listening' : 'Speak your question'}><Icon name="mic" /></button>{/if}
			<button class="btn grad ask-send" type="submit" disabled={!q.trim() || busy} aria-label="Ask"><Icon name="send" /></button>
		</form>
	</div>
</div>
{#if nudging}<NudgeSheet n={nudging} onclose={() => (nudging = null)} />{/if}
