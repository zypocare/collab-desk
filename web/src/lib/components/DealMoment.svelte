<script lang="ts">
	import { onMount } from 'svelte';
	import { money } from '../currency';
	import { studio } from '../studio.svelte';
	import { confetti } from '../ui.svelte';
	import { firstName, fmt, inr, payTerms, plural, usageLabel } from '../util';
	import type { Collab, Quote } from '../types';
	import Icon from './Icon.svelte';

	// The moment a brand says yes, on a phone: an ACCEPTED stamp, confetti and a buzz, and the agreement
	// rising from the bottom with its terms ticking in one by one.
	let { c, q, advance = 0, onadvance, onclose }: { c: Collab; q: Quote; advance?: number; onadvance: () => void; onclose: () => void } = $props();

	const what = $derived(q.items.map((i) => `${i.qty} ${plural(i.kind, i.qty)}`).join(' + ') || 'The collab');
	const rows = $derived([
		{ t: what, v: money(q.total, q.currency) },
		q.advance_pct > 0 && q.advance_pct < 100 ? { t: `${q.advance_pct}% up front, the rest ${q.pay_days ? `${q.pay_days} days after posting` : 'after posting'}`, v: money(Math.round((q.total * q.advance_pct) / 100), q.currency) } : { t: payTerms(q), v: '' },
		{ t: c.draft_date || c.live_date ? [c.draft_date && `Draft due ${fmt(c.draft_date)}`, c.live_date && `live ${fmt(c.live_date)}`].filter(Boolean).join(' · ') : 'Dates to agree', v: `${q.revision_rounds} round${q.revision_rounds === 1 ? '' : 's'}` },
		{ t: usageLabel(q.usage), v: q.usage_fee ? `+${inr(q.usage_fee)}` : 'included' }
	]);
	const name = $derived(firstName(studio.settings?.display_name ?? ''));

	onMount(() => {
		const t = setTimeout(() => confetti(innerWidth / 2, innerHeight * 0.32), 250);
		const esc = (e: KeyboardEvent) => e.key === 'Escape' && onclose();
		addEventListener('keydown', esc);
		return () => (clearTimeout(t), removeEventListener('keydown', esc));
	});
</script>

<div class="dm" role="dialog" aria-modal="true" aria-label="{c.brand.name} accepted your quote">
	<button class="dm-scrim" onclick={onclose} aria-label="Close"></button>
	<div class="dm-top" aria-hidden="true">
		<span class="dm-stamp">ACCEPTED</span>
		<span class="dm-wave"></span>
	</div>
	<section class="dm-sheet">
		<span class="dm-grab" aria-hidden="true"></span>
		<p class="dm-eb">Agreement · saved for both of you</p>
		<h2>It’s a deal{name ? ',' : '.'} {#if name}<em>{name}.</em>{/if}</h2>
		<p class="dm-by">{c.brand.name}{q.accepted_name ? ` · accepted by ${q.accepted_name}` : ''}</p>
		<ul>
			{#each rows as r, i (i)}
				<li style="--i:{i}"><span class="dm-ck" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 5 5L20 7" /></svg></span><span class="dm-t">{r.t}</span>{#if r.v}<b>{r.v}</b>{/if}</li>
			{/each}
		</ul>
		<div class="dm-acts">
			<a class="dm-btn ghost" href="/agreement/{q.id}"><Icon name="eye" />Agreement</a>
			{#if advance > 0}
				<button class="dm-btn ink" onclick={onadvance}>Ask for the {inr(advance)} advance</button>
			{:else}
				<button class="dm-btn ink" onclick={onclose}>On to the shoot</button>
			{/if}
		</div>
	</section>
</div>

<style>
	.dm { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; justify-content: flex-end; }
	.dm-scrim { position: absolute; inset: 0; border: 0; background: rgba(9, 7, 10, .62); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); animation: dm-dim .35s ease both; cursor: pointer; }
	@keyframes dm-dim { from { opacity: 0; } }
	.dm-top { position: absolute; left: 0; right: 0; top: calc(env(safe-area-inset-top, 0px) + 18%); display: grid; place-items: center; pointer-events: none; }
	.dm-stamp { padding: 12px 22px; border: 4px solid var(--ok); border-radius: 12px; color: var(--ok); font: 800 36px/1 var(--f-body, inherit); letter-spacing: .14em; background: rgba(17, 13, 17, .6); animation: dm-slam .55s cubic-bezier(.2, 1.5, .35, 1) .1s both; }
	@keyframes dm-slam { 0% { transform: scale(2.6) rotate(-3deg); opacity: 0; } 60% { opacity: 1; } 100% { transform: scale(1) rotate(-9deg); opacity: 1; } }
	.dm-wave { position: absolute; width: 24px; height: 24px; border-radius: 50%; border: 3px solid color-mix(in oklab, var(--ok) 80%, transparent); animation: dm-wave .9s cubic-bezier(.2, .8, .2, 1) .3s both; }
	@keyframes dm-wave { from { transform: scale(1); opacity: 1; } to { transform: scale(16); opacity: 0; } }
	.dm-sheet { position: relative; padding: 12px 20px calc(24px + env(safe-area-inset-bottom, 0px)); border-radius: 28px 28px 0 0; background: #f4eef2; color: #1e171c; box-shadow: 0 -30px 60px -20px rgba(0, 0, 0, .8); animation: dm-up .75s cubic-bezier(.2, 1.15, .3, 1) .45s both; }
	@keyframes dm-up { from { transform: translateY(105%); } }
	.dm-grab { display: block; width: 40px; height: 5px; margin: 0 auto 14px; border-radius: 5px; background: #c9bfc6; }
	.dm-eb { margin: 0; font: 700 11px/1.2 var(--f-body, inherit); letter-spacing: .2em; text-transform: uppercase; color: #7a6e76; }
	h2 { margin: 6px 0 4px; font: 400 32px/1 var(--f-serif, Georgia, serif); color: #1e171c; }
	h2 em { font-style: italic; color: #d4296a; }
	.dm-by { margin: 0 0 6px; font-size: 13px; color: #6a5e66; }
	ul { margin: 0; padding: 0; list-style: none; }
	li { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-top: 1px solid #e2d8de; font-size: 14px; opacity: 0; animation: dm-row .5s ease both; animation-delay: calc(.95s + var(--i) * .2s); }
	@keyframes dm-row { from { opacity: 0; translate: -10px 0; } to { opacity: 1; translate: 0 0; } }
	.dm-t { flex: 1; min-width: 0; }
	li b { flex: none; font-weight: 700; }
	.dm-ck { width: 24px; height: 24px; flex: none; border-radius: 50%; display: grid; place-items: center; background: #1e171c; }
	.dm-ck svg { width: 14px; height: 14px; fill: none; stroke: var(--ok); stroke-width: 3.4; stroke-linecap: round; stroke-linejoin: round; }
	.dm-ck path { stroke-dasharray: 24; stroke-dashoffset: 24; animation: dm-draw .45s ease forwards; animation-delay: calc(1.15s + var(--i) * .2s); }
	@keyframes dm-draw { to { stroke-dashoffset: 0; } }
	.dm-acts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; margin-top: 16px; }
	.dm-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 52px; padding: 0 16px; border: 0; font: 700 12.5px/1.2 var(--f-body, inherit); letter-spacing: .1em; text-transform: uppercase; text-decoration: none; cursor: pointer; transition: transform .12s, box-shadow .12s; }
	.dm-btn :global(.ic) { width: 17px; height: 17px; }
	.dm-btn.ink { background: #1e171c; color: #f4eef2; box-shadow: 5px 5px 0 var(--g2); }
	.dm-btn.ghost { background: transparent; color: #1e171c; box-shadow: inset 0 0 0 1.5px #c9bfc6, 5px 5px 0 #e2d8de; }
	.dm-btn:active { transform: translate(5px, 5px); box-shadow: none; }
	@media (prefers-reduced-motion: reduce) {
		.dm *, .dm-sheet, .dm-scrim { animation-duration: .01ms !important; animation-delay: 0s !important; }
	}
</style>
