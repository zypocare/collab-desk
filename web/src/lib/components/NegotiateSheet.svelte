<script lang="ts">
	import { untrack } from 'svelte';
	import { askAi, collabFacts } from '../ai';
	import { portal } from '../portal';
	import { decisionOf, studio } from '../studio.svelte';
	import type { Collab } from '../types';
	import { copyText, toast } from '../ui.svelte';
	import { inr } from '../util';
	import AiThinking from './AiThinking.svelte';
	import Icon from './Icon.svelte';

	// Negotiation helper: when a brand pushes back on price. The numbers are worked out here (their
	// offer, her ask, her walk-away point); the free AI writes three replies that only use them.
	let {
		c,
		thread = [],
		onuse,
		onclose
	}: {
		c: Collab;
		/** The chat so far, oldest first. */
		thread?: { from: 'creator' | 'brand'; text: string }[];
		/** Put a reply in the message box (the chat), so she can tweak it and send. */
		onuse?: (text: string) => void;
		onclose: () => void;
	} = $props();

	type Option = { key: string; label: string; amount: number; changes: string; text: string };
	const r500 = (n: number) => Math.round(n / 500) * 500;
	/** The last amount in what the brand said ("can you do 25k?", "₹18,000", "1.2 lakh"). */
	function amountIn(text: string): number {
		const all = [...text.matchAll(/(?:₹|rs\.?|inr)?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|l|lakhs?|lac)?\b/gi)]
			.map((m) => {
				const n = Number(m[1].replace(/,/g, ''));
				const u = (m[2] ?? '').toLowerCase();
				return u === 'k' ? n * 1000 : u ? n * 100000 : n;
			})
			.filter((n) => n >= 500 && n < 1e8);
		return all.length ? Math.round(all[all.length - 1]) : 0;
	}

	const d = $derived(decisionOf(c));
	const lastBrand = untrack(() => [...thread].reverse().find((m) => m.from === 'brand')?.text ?? '');
	// Starting numbers (she can change all three).
	const start = untrack(() => {
		const dd = decisionOf(c);
		const quoted = c.quotes[0]?.total ?? 0;
		const fair = dd?.money.fair ?? 0;
		const ask = quoted || dd?.counterFee || fair || c.fee || 0;
		const offer = amountIn(lastBrand) || (c.type !== 'barter' ? c.fee : 0) || 0;
		const floor = r500(Math.min(ask, fair || ask) * 0.85);
		return { offer, ask, floor, base: c.type !== 'barter' ? c.fee : 0 };
	});
	let offer = $state(start.offer);
	let ask = $state(start.ask);
	let floor = $state(start.floor);
	let said = $state(lastBrand);
	// Their offer follows what they said ("can you do 22k?") until she types her own number.
	let offerTouched = $state(false);
	$effect(() => {
		const n = amountIn(said);
		if (!untrack(() => offerTouched)) offer = n || start.base || 0;
	});

	let busy = $state(false);
	let res = $state<{ read: string; options: Option[]; tip: string } | null>(null);
	let picked = $state(0);
	let edited = $state<string[]>([]);

	// What she's done with this brand before: helps the AI (and her) hold the line.
	const history = $derived.by(() => {
		const past = studio.collabs.filter((x) => x.brand_id === c.brand_id && x.id !== c.id && x.stage !== 'declined' && x.fee > 0);
		return past.length ? { past_collabs: past.length, past_avg_fee: Math.round(past.reduce((a, x) => a + x.fee, 0) / past.length) } : { past_collabs: 0 };
	});
	const gap = $derived(ask > 0 && offer > 0 ? Math.round((1 - offer / ask) * 100) : null);

	async function draft() {
		if (busy) return;
		if (!ask) return toast('Add the price you want to ask first.', 'alert');
		busy = true;
		try {
			const s = studio.settings;
			const msgs = thread.length ? thread : said.trim() ? [{ from: 'brand' as const, text: said.trim() }] : [];
			if (thread.length && said.trim() && said.trim() !== lastBrand) msgs.push({ from: 'brand', text: said.trim() });
			res = await askAi<{ read: string; options: Option[]; tip: string }>('negotiate', {
				facts: { ...collabFacts(c, s), quote: c.quotes[0] ? { total: c.quotes[0].total, usage: c.quotes[0].usage, advance_pct: c.quotes[0].advance_pct, exclusivity_days: c.quotes[0].exclusivity_days } : undefined },
				thread: msgs.slice(-10),
				said: said.trim(),
				offer,
				ask,
				floor: Math.min(floor, ask),
				stats: { followers: s?.followers, engagement: s?.engagement, niche: s?.niche, city: s?.city },
				history
			});
			edited = res.options.map((o) => o.text);
			picked = 0;
			if (!res.options.length) toast("The AI didn't have a suggestion this time. Try again.", 'alert');
		} catch (e) {
			toast((e as Error).message, 'alert');
		}
		busy = false;
	}
	const ICON: Record<string, string> = { hold: 'shield', middle: 'scale', trade: 'swap' };
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog ng" role="dialog" aria-modal="true" aria-labelledby="ng-title">
		<header class="ng-h">
			<div>
				<span class="eb">Negotiate <span class="ai-tag"><Icon name="spark" />AI</span></span>
				<h2 id="ng-title">{c.brand.name}</h2>
			</div>
			<button class="icon-btn" onclick={onclose} aria-label="Close"><Icon name="x" /></button>
		</header>

		<div class="ng-nums">
			<label class="ng-n">
				<small>They offer</small>
				<span class="ng-in"><i>₹</i><input type="number" inputmode="numeric" min="0" step="500" bind:value={offer} oninput={() => (offerTouched = true)} aria-label="Their offer in rupees" /></span>
			</label>
			<label class="ng-n ask">
				<small>You ask</small>
				<span class="ng-in"><i>₹</i><input type="number" inputmode="numeric" min="0" step="500" bind:value={ask} aria-label="Your ask in rupees" /></span>
			</label>
			<label class="ng-n floor">
				<small>Walk away below</small>
				<span class="ng-in"><i>₹</i><input type="number" inputmode="numeric" min="0" step="500" bind:value={floor} aria-label="Your walk-away point in rupees" /></span>
			</label>
		</div>
		<p class="ng-sub">
			{#if gap !== null && gap > 0}They're {gap}% below your ask.{:else if gap !== null}Their offer already meets your ask.{:else}Add their offer to see the gap.{/if}
			{#if d?.money.fair}Fair price for the whole job: <b>{inr(d.money.fair)}</b>.{/if}
			The walk-away point is never shown to the brand.
		</p>

		{#if !thread.length || !res}
			<div class="f ng-said">
				<label for="ng-said">What did they say?</label>
				<textarea id="ng-said" class="inp" rows="2" placeholder="e.g. Our budget is only 20k, can you do it for that?" bind:value={said}></textarea>
			</div>
		{/if}

		{#if busy}
			<div class="ng-busy"><AiThinking label="Working out your replies" /></div>
		{:else if res}
			{#if res.read}<p class="ng-read"><Icon name="spark" />{res.read}</p>{/if}
			<div class="ng-tabs" role="tablist">
				{#each res.options as o, i (i)}
					<button role="tab" aria-selected={picked === i} class:on={picked === i} onclick={() => (picked = i)}>
						<Icon name={ICON[o.key] ?? 'send'} /><span>{o.label || o.key}</span>{#if o.amount}<b>{inr(o.amount)}</b>{/if}
					</button>
				{/each}
			</div>
			{#if res.options[picked]}
				{@const o = res.options[picked]}
				{#if o.changes}<p class="ng-changes"><Icon name="swap" />{o.changes}</p>{/if}
				<textarea class="inp ng-text" rows="6" aria-label="Reply" bind:value={edited[picked]}></textarea>
				<div class="ng-acts">
					{#if onuse}<button class="btn grad" onclick={() => (onuse?.(edited[picked]), onclose())}><Icon name="send" />Use this reply</button>{/if}
					<button class="btn" onclick={() => copyText(edited[picked], 'Reply copied')}><Icon name="copy" />Copy</button>
					<button class="btn ghost" onclick={draft}><Icon name="spark" />Try again</button>
				</div>
			{/if}
			{#if res.tip}<p class="ng-tip"><b>Tip</b> {res.tip}</p>{/if}
		{:else}
			<div class="ng-acts">
				<button class="btn grad" onclick={draft} disabled={!ask}><Icon name="spark" />Draft my replies</button>
				<span class="hint">Three ways to answer: hold your price, meet in the middle, or trade instead of discounting.</span>
			</div>
		{/if}
	</div>
</div>
