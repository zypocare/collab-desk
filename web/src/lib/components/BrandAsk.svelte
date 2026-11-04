<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { auth } from '../auth.svelte';
	import { allRequests, brandHome } from '../brand.svelte';
	import { askBrandDesk, brandChatData } from '../brandAi';
	import { addressFor } from '../creatorHost';
	import { portal } from '../portal';
	import { pageSlug } from '../supabase';
	import { errMessage, todayIso } from '../util';
	import AiThinking from './AiThinking.svelte';
	import Icon from './Icon.svelte';

	// "Ask your desk" for a brand team: a question about their requests, drafts, payments and go-live
	// dates across every creator, answered by the free AI from their own data, with links to open.
	// It reads and points; it never changes anything. The chat is kept on this device only.
	let { onclose }: { onclose: () => void } = $props();

	type Turn = { q: string; a: string; codes: string[]; page: string; err?: boolean };
	const KEY = 'brand-ask-chat';
	let turns = $state<Turn[]>([]);
	let q = $state('');
	let busy = $state(false);
	let list = $state<HTMLElement>();
	let box = $state<HTMLTextAreaElement>();

	const acct = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const company = $derived(acct?.brand?.name || acct?.profile?.name || 'your brand');
	const byCode = $derived(new Map(allRequests.list.map((r) => [r.code, r])));
	const at = (slug: string, path: string) => (slug === pageSlug ? path : addressFor(slug, path));

	const PAGES: Record<string, { label: string; href: string; icon: string }> = {
		requests: { label: 'Requests', href: '/brand/requests', icon: 'board' },
		inbox: { label: 'Messages', href: '/brand/inbox', icon: 'send' },
		discover: { label: 'Find creators', href: '/brand/creators?tab=discover', icon: 'search' },
		new_campaign: { label: 'New campaign', href: '/brand/campaigns/new', icon: 'plus' },
		reports: { label: 'Reports', href: '/brand/reports', icon: 'chart' },
		payments: { label: 'Payments', href: '/brand/business/money', icon: 'wallet' },
		calendar: { label: 'Calendar', href: '/brand/business/calendar', icon: 'cal' }
	};
	const STARTERS = [
		{ icon: 'check', label: 'What needs me?', q: 'What is waiting for me right now?' },
		{ icon: 'film', label: 'Drafts to approve', q: 'Which drafts are waiting for my approval?' },
		{ icon: 'wallet', label: 'Invoices to pay', q: 'Which invoices do I still have to pay, and when are they due?' },
		{ icon: 'cal', label: 'Going live', q: 'What goes live in the next two weeks?' },
		{ icon: 'chart', label: 'This month', q: 'How much have we spent on creators this month?' }
	];

	onMount(() => {
		try {
			turns = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		} catch {
			/* storage blocked */
		}
		scrollEnd(false);
		if (matchMedia('(min-width: 761px)').matches) tick().then(() => box?.focus());
	});
	function save() {
		try {
			localStorage.setItem(KEY, JSON.stringify(turns.filter((t) => !t.err).slice(-20)));
		} catch {
			/* storage blocked */
		}
	}
	async function scrollEnd(smooth = true) {
		await tick();
		list?.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
	}
	function clear() {
		turns = [];
		save();
	}

	async function send(text = q) {
		const question = text.trim();
		if (!question || busy) return;
		q = '';
		busy = true;
		turns.push({ q: question, a: '', codes: [], page: '' });
		await scrollEnd();
		try {
			const history = turns.slice(-4, -1).filter((t) => !t.err).map((t) => ({ q: t.q, a: t.a }));
			const r = await askBrandDesk(question, brandChatData(allRequests.list, brandHome.dash), company, todayIso(), history);
			turns[turns.length - 1] = { q: question, a: r.answer, codes: r.codes.filter((c) => byCode.has(c)), page: r.page };
			save();
		} catch (e) {
			turns[turns.length - 1] = { q: question, a: errMessage(e), codes: [], page: '', err: true };
		} finally {
			busy = false;
			scrollEnd();
		}
	}
	function key(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog ba" role="dialog" aria-modal="true" aria-labelledby="ba-title">
		<header class="ba-h">
			<span class="ba-orb" aria-hidden="true"><Icon name="spark" /></span>
			<div class="ba-ht"><h2 id="ba-title">Ask your desk</h2><small>About your creators, drafts, payments and dates</small></div>
			{#if turns.length}<button class="ba-ib" onclick={clear} aria-label="Start a new chat" title="New chat"><Icon name="refresh" /></button>{/if}
			<button class="ba-ib" onclick={onclose} aria-label="Close"><Icon name="x" /></button>
		</header>

		<div class="ba-list" bind:this={list} aria-live="polite">
			{#if !turns.length}
				<p class="ba-hi">Ask anything about {company}'s collabs. I answer from your requests and payments, and link you to the right one.</p>
				<div class="ba-starters">
					{#each STARTERS as s (s.label)}<button class="ba-chip" onclick={() => send(s.q)}><Icon name={s.icon} />{s.label}</button>{/each}
				</div>
			{/if}
			{#each turns as t, i (i)}
				<div class="ba-q">{t.q}</div>
				{#if t.a}
					<div class="ba-a" class:err={t.err}>
						<p>{t.a}</p>
						{#if t.codes.length || (t.page && PAGES[t.page])}
							<div class="ba-links">
								{#each t.codes as c (c)}
									{@const r = byCode.get(c)}
									{#if r}<a class="ba-link" href={at(r.creator.slug, `/brand/r/${c}`)} onclick={onclose}><b>{r.creator.name}</b><small>{r.stage_label} · {c}</small><Icon name="chevR" /></a>{/if}
								{/each}
								{#if t.page && PAGES[t.page]}<a class="ba-link ba-page" href={PAGES[t.page].href} onclick={onclose}><Icon name={PAGES[t.page].icon} /><b>{PAGES[t.page].label}</b><Icon name="chevR" /></a>{/if}
							</div>
						{/if}
					</div>
				{:else}
					<div class="ba-a"><AiThinking /></div>
				{/if}
			{/each}
		</div>

		<form class="ba-in" onsubmit={(e) => (e.preventDefault(), send())}>
			<textarea id="ba-q" bind:this={box} bind:value={q} onkeydown={key} rows="1" maxlength="400" placeholder="Ask about a creator or a payment…" aria-label="Your question"></textarea>
			<button class="ba-send" type="submit" disabled={!q.trim() || busy} aria-label="Ask"><Icon name="send" /></button>
		</form>
		<small class="ba-note">Free AI, from your data. It can't change anything; it shows you where to tap.</small>
	</div>
</div>

<style>
	.ba { width: min(560px, 100%); max-height: min(720px, calc(100dvh - 32px)); display: flex; flex-direction: column; gap: 12px; padding: 18px; }
	.ba-h { display: flex; align-items: center; gap: 12px; }
	.ba-orb { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, var(--g1), var(--g2) 60%, var(--g3)); }
	.ba-ht { flex: 1; min-width: 0; display: grid; gap: 2px; }
	.ba-ht h2 { margin: 0; font-size: 19px; }
	.ba-ht small { color: var(--ink-3); font-size: 13px; }
	.ba-ib { flex: none; width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); display: grid; place-items: center; cursor: pointer; }
	.ba-list { flex: 1; min-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 4px 2px; overscroll-behavior: contain; }
	.ba-hi { margin: 4px 0 2px; color: var(--ink-2); font-size: 15px; line-height: 1.5; }
	.ba-starters { display: flex; flex-wrap: wrap; gap: 8px; }
	.ba-chip { display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); font: 600 14px/1 var(--f-body); cursor: pointer; }
	.ba-chip :global(.ic) { width: 16px; height: 16px; color: var(--g2); }
	.ba-q { align-self: flex-end; max-width: 85%; padding: 10px 14px; border-radius: 18px 18px 4px 18px; background: var(--ink); color: var(--bg); font-size: 15px; line-height: 1.45; overflow-wrap: anywhere; }
	.ba-a { align-self: flex-start; max-width: 92%; padding: 12px 14px; border-radius: 18px 18px 18px 4px; background: var(--surface-2); border: 1px solid var(--line); display: grid; gap: 10px; }
	.ba-a p { margin: 0; white-space: pre-line; font-size: 15px; line-height: 1.5; overflow-wrap: anywhere; }
	.ba-a.err p { color: var(--bad); }
	.ba-links { display: grid; gap: 6px; }
	.ba-link { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 8px; padding: 9px 12px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); text-decoration: none; }
	.ba-link b { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ba-link small { grid-column: 1; color: var(--ink-3); font-size: 12.5px; }
	.ba-link :global(.ic) { grid-row: 1 / span 2; grid-column: 2; width: 16px; height: 16px; color: var(--ink-3); }
	.ba-page { grid-template-columns: auto minmax(0, 1fr) auto; }
	.ba-page :global(.ic:first-child) { grid-row: 1; grid-column: 1; color: var(--g2); }
	.ba-page b { grid-column: 2; }
	.ba-page :global(.ic:last-child) { grid-row: 1; grid-column: 3; }
	.ba-in { display: flex; align-items: flex-end; gap: 8px; padding: 6px 6px 6px 14px; border-radius: 22px; border: 1px solid var(--line-strong); background: var(--surface); }
	.ba-in:focus-within { border-color: var(--g2); }
	.ba-in textarea { flex: 1; min-width: 0; border: 0; outline: 0; resize: none; background: transparent; color: var(--ink); font: 400 16px/1.4 var(--f-body); padding: 8px 0; max-height: 120px; field-sizing: content; }
	.ba-send { flex: none; width: 40px; height: 40px; border-radius: 50%; border: 0; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, var(--g1), var(--g2) 60%, var(--g3)); cursor: pointer; }
	.ba-send:disabled { opacity: .45; cursor: default; }
	.ba-note { color: var(--ink-3); font-size: 12px; text-align: center; }
</style>
