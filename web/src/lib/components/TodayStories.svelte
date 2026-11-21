<script lang="ts">
	import { topReels } from '../grow.svelte';
	import { bestSlot, postingEvidence, slotLabel } from '../postTime';
	import { studio } from '../studio.svelte';
	import type { Collab } from '../types';
	import { compact, fmt, inr, outstanding } from '../util';
	import Icon from './Icon.svelte';

	let { monthName, received, paidN, od, nextPayout }: {
		monthName: string;
		received: number;
		paidN: number;
		od: Collab[];
		nextPayout?: Collab;
	} = $props();

	const slot = $derived(bestSlot(studio.media));
	const reel = $derived(topReels(studio.media, 1)[0]);
	const payment = $derived(od[0] ?? nextPayout);
	const stories = $derived([
		{ label: 'Wrapped', icon: 'spark', color: 'var(--g2)', title: monthName + ' wrapped',
			body: received ? `You received ${inr(received)} from ${paidN} ${paidN === 1 ? 'brand' : 'brands'} this month.` : 'Your monthly recap starts with your first recorded payment.',
			action: 'View money', href: '/studio/money' },
		{ label: 'AI Tips', icon: 'chart', color: 'var(--g1)', title: slot ? slotLabel(slot) : 'Find your posting time',
			body: slot ? postingEvidence(slot) : 'Grow uses your Instagram post history to suggest when to publish your next reel.',
			action: 'Open Grow', href: '/studio/grow' },
		{ label: 'Due soon', icon: 'wallet', color: 'var(--g3)', title: payment ? payment.brand.name : 'No payments due',
			body: payment ? `${inr(outstanding(payment))} ${od.length ? 'overdue' : 'outstanding'}${payment.pay_due ? ' · Due ' + fmt(payment.pay_due) : ''}.` : 'Upcoming payouts and overdue invoices appear here when they have a due date.',
			action: 'View payments', href: '/studio/payments' },
		{ label: 'Top Reel', icon: 'film', color: 'var(--ok)', title: reel ? 'Your top reel in 90 days' : 'Your reel highlights',
			body: reel ? [reel.views ? compact(reel.views) + ' views' : compact(reel.reach ?? 0) + ' accounts reached', reel.caption?.slice(0, 100)].filter(Boolean).join(' · ') : 'Your best-performing reel appears here once Instagram shares its numbers.',
			action: 'View insights', href: '/studio/grow/insights' },
		{ label: 'Briefs', icon: 'inbox', color: 'var(--sky, #75bbef)', title: 'Open brand briefs',
			body: 'Explore open briefs and pitch a brand with your idea.',
			action: 'Explore briefs', href: '/studio/pitches' }
	]);
	let dialog: HTMLDialogElement;
	let selected = $state(0);
	const story = $derived(stories[selected]);
	function openStory(index: number) {
		selected = index;
		dialog.showModal();
	}
</script>

<nav class="creator-stories" aria-label="Creator stories">
	{#each stories as item, i (item.label)}
		<button type="button" aria-haspopup="dialog" style:--story-color={item.color} style:--story-index={i} onclick={() => openStory(i)}>
			<span class="story-ring"><span><Icon name={item.icon} /></span></span>
			<small>{item.label}</small>
		</button>
	{/each}
</nav>

<dialog bind:this={dialog} aria-labelledby="today-story-title" aria-describedby="today-story-body" style:--story-color={story.color}>
	<div class="story-heading"><Icon name={story.icon} />{story.label}</div>
	<h2 id="today-story-title">{story.title}</h2>
	<p id="today-story-body">{story.body}</p>
	<div class="story-actions">
		<button type="button" onclick={() => dialog.close()}>Got it</button>
		<a href={story.href} onclick={() => dialog.close()}>{story.action} →</a>
	</div>
</dialog>

<style>
	.creator-stories { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; margin: 14px 0; }
	.creator-stories button { display: grid; justify-items: center; gap: 5px; min-width: 0; padding: 2px 0; border: 0; background: transparent; color: var(--ink-2); cursor: pointer; }
	.story-ring { position: relative; display: grid; width: min(52px, 100%); aspect-ratio: 1; padding: 2px; box-sizing: border-box; border-radius: 50%; background: var(--story-color); }
	.story-ring::before {
		content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
		background: conic-gradient(from -45deg, var(--story-color), var(--line) 25% 62%, var(--story-color) 85%, #fff 96%, var(--story-color));
	}
	.story-ring > span { position: relative; display: grid; place-items: center; border-radius: inherit; background: radial-gradient(at 30% 25%, var(--surface-2), var(--bg)); color: var(--story-color); }
	.creator-stories small { font-size: 10px; font-weight: 650; }
	@media (prefers-reduced-motion: no-preference) {
		.story-ring::before { animation: story-orbit 3.6s linear infinite; animation-delay: calc(var(--story-index) * -.65s); }
		.story-ring > span :global(svg) { animation: story-lift 3.6s ease-in-out infinite; animation-delay: calc(var(--story-index) * -.65s); }
		.creator-stories button:active .story-ring { transform: scale(.94); }
	}
	@keyframes story-orbit { to { transform: rotate(1turn); } }
	@keyframes story-lift { 50% { transform: translateY(-2px); } }
	dialog { box-sizing: border-box; margin: auto; width: min(360px, calc(100% - 36px)); padding: 22px; border: 1px solid color-mix(in srgb, var(--story-color) 50%, var(--line)); border-radius: 22px; background: var(--surface); color: var(--ink); }
	dialog::backdrop { background: rgb(14 9 16 / .82); backdrop-filter: blur(8px); }
	.story-heading { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--story-color); }
	dialog h2 { margin: 14px 0 8px; font: 400 30px/1.12 var(--f-serif, Georgia, serif); }
	dialog p { margin: 0; line-height: 1.5; color: var(--ink-2); overflow-wrap: anywhere; }
	.story-actions { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 20px; }
	.story-actions :is(button, a) { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 12px; font: inherit; font-weight: 650; cursor: pointer; }
	.story-actions button { background: transparent; border: 1px solid var(--line-strong); color: var(--ink); }
	.story-actions a { background: var(--ink); color: var(--bg); text-decoration: none; box-shadow: 3px 3px 0 var(--story-color); }
</style>
