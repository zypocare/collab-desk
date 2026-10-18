<script lang="ts">
	import { onMount } from 'svelte';
	import { isRanked } from '../priority';
	import { askAi } from '../ai';
	import { monthLabel, prevMonth } from '../monthSummary';
	import { supabase } from '../supabase';
	import { decisionOf, studio } from '../studio.svelte';
	import { ui } from '../ui.svelte';
	import { unreadFor } from '../util';
	import AiThinking from './AiThinking.svelte';
	import CollabLeads from './CollabLeads.svelte';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';
	import ScoreRing from './ScoreRing.svelte';

	// Today's AI assistant: every open request, read and scored ("Should you take it?"), and how
	// many free AI uses are left today.
	let { phone = false }: { phone?: boolean } = $props();
	const open = $derived(
		studio.collabs
			.filter(isRanked)
			.map((c) => ({ c, d: decisionOf(c) }))
			.filter((x) => x.d)
			.sort((a, b) => b.d!.score - a.d!.score)
			.slice(0, 4)
	);
	// Free AI left today: Cloudflare's daily amount as a percentage, and whether the Gemini backup is on.
	type Left = { pct: number; gemini?: boolean; gemini_left?: number };
	let left = $state<Left | null>(null);
	onMount(() => {
		askAi<Left>('status', {})
			.then((r) => (left = r))
			.catch(() => supabase.rpc('ai_left').then(({ data }) => (left = (data as Left | null) ?? null)));
	});
	const leftTitle = $derived(
		left ? `Free AI left today: ${left.pct}%. Resets at 5:30 am.${left.gemini ? ` Then the free Gemini backup (${left.gemini_left ?? 0} uses left).` : ''} Never charged.` : ''
	);
	const leads = $derived(studio.leads.length);
	// The badge on Messages: messages she hasn't read yet (brands in the app, and Instagram DMs that may be collabs).
	const unread = $derived(studio.collabs.reduce((a, c) => a + unreadFor(c), 0) + studio.leads.reduce((a, l) => a + (Number(l.unread) || 0), 0));
	const sub = $derived(
		leads
			? open.length
				? 'I spotted these in your Instagram DMs and scored your open requests.'
				: 'I spotted these in your Instagram DMs.'
			: open.length ? `Read ${open.length === 1 ? 'your new request' : `your ${open.length} open requests`} and scored ${open.length === 1 ? 'it' : 'them'}.` : "When a brand writes, I'll read it and tell you if it's worth it."
	);
</script>

{#snippet body()}
	<CollabLeads />
	{#if open.length}
		{#if leads}<p class="ai-desk-lbl">Open requests, scored</p>{/if}
		<ul class="ai-desk-list">
			{#each open as { c, d } (c.id)}
				<li>
					<button onclick={() => (ui.openCollab = c.id)}>
						<Mono name={c.brand.name} />
						<span class="ai-desk-t">
							<b>{c.brand.name}</b>
							{#if studio.reading.includes(c.id)}<AiThinking label="Reading the request" />{:else}<small>{d!.line}</small>{/if}
						</span>
						<span class="ai-desk-v v-{d!.verdict}"><ScoreRing score={d!.score} verdict={d!.verdict} size={40} /><small>{d!.label}</small></span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if new Date().getDate() <= 10}
		<a class="ai-desk-review" href="/studio/reports?m={prevMonth()}"><Icon name="chart" /><span><b>Your {monthLabel(prevMonth()).split(' ')[0]} in review</b><small>What you earned, what worked, what to charge next</small></span><Icon name="chevR" /></a>
	{/if}
	<div class="ai-desk-acts">
		<button class="btn sm ai-btn" onclick={() => (ui.askOpen = true)}><Icon name="spark" />Ask your desk</button>
		<a class="btn sm ghost" href="/studio/inbox"><Icon name="send" />Messages{#if unread}<span class="ai-acts-n" aria-label="{unread} unread">{unread}</span>{/if}</a>
	</div>
{/snippet}

{#if phone}
	<section class="hs">
		<header class="hs-h"><h2>AI assistant</h2>{#if left}<span class="ai-left-chip" title={leftTitle}><Icon name="spark" />{left.pct}% free left{left.gemini ? ' + backup' : ''}</span>{/if}</header>
		<div class="ai-desk ai-desk-m">
			<span class="ai-desk-fx" aria-hidden="true"></span>
			<div class="ai-desk-h">
				<span class="ai-desk-ic"><Icon name="spark" /></span>
				<p>{sub}</p>
			</div>
			{@render body()}
		</div>
	</section>
{:else}
	<section class="ai-desk panel rv" style="--i:3">
		<span class="ai-desk-fx" aria-hidden="true"></span>
		<header class="ai-desk-h">
			<span class="ai-desk-ic"><Icon name="spark" /></span>
			<div><h2>Your AI assistant</h2><small>{sub}</small></div>
			{#if left}<span class="ai-left" title={leftTitle}>{left.pct}%<small>free AI left today{left.gemini ? ' + backup' : ''}</small></span>{/if}
		</header>
		{@render body()}
	</section>
{/if}
