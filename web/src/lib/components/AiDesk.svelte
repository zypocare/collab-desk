<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
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
	import { addLeadAsCollab, lastBrandLines } from '../leads';
	import { relWord, diff } from '../util';

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

	// Phone: the Desk AI card. A one-line read of what's waiting, the Instagram leads one at a time
	// (with what the brand actually wrote), and the open requests as swipeable score cards.
	const phoneLeads = $derived([...studio.leads].sort((a, b) => Number(b.collab_flag === 'likely') - Number(a.collab_flag === 'likely')).slice(0, 3));
	let leadI = $state(0);
	// Which way the card slides (1 = to the next one, -1 = back).
	let dir = $state(1);
	function goLead(i: number) {
		const n = phoneLeads.length;
		if (n < 2) return;
		const to = (i + n) % n;
		dir = i > leadI ? 1 : -1;
		leadI = to;
		navigator.vibrate?.(8);
	}
	// Swipe left or right on the card to see the next possible collab (a tap still opens things).
	function swipe(node: HTMLElement) {
		let x0 = 0, y0 = 0, on = false;
		const down = (e: PointerEvent) => {
			if (e.pointerType === 'mouse') return;
			x0 = e.clientX; y0 = e.clientY; on = true;
		};
		const up = (e: PointerEvent) => {
			if (!on) return;
			on = false;
			const dx = e.clientX - x0, dy = e.clientY - y0;
			if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
			goLead(dx < 0 ? leadI + 1 : leadI - 1);
			// A swipe isn't a tap: swallow a click that follows straight away (never a later one).
			const block = (ev: Event) => (ev.stopPropagation(), ev.preventDefault());
			node.addEventListener('click', block, { capture: true, once: true });
			setTimeout(() => node.removeEventListener('click', block, { capture: true }), 350);
		};
		const cancel = () => (on = false);
		node.addEventListener('pointerdown', down);
		node.addEventListener('pointerup', up);
		node.addEventListener('pointercancel', cancel);
		return { destroy() { node.removeEventListener('pointerdown', down); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', cancel); } };
	}
	const lead = $derived(phoneLeads[Math.min(leadI, Math.max(0, phoneLeads.length - 1))]);
	let said = $state<Record<string, string>>({});
	$effect(() => {
		if (!phone) return;
		const ids = phoneLeads.map((l) => l.igsid);
		if (ids.length) lastBrandLines(ids).then((r) => (said = r));
	});
	let adding = $state(false);
	async function addLead() {
		if (!lead) return;
		adding = true;
		await addLeadAsCollab(lead.igsid, lead.username, lead.name);
		adding = false;
	}
	const VERDICT_WORD: Record<string, string> = { take: 'worth a yes', negotiate: 'worth a counter', pass: 'likely a pass' };
	// The line at the top, in pieces so two words can stand out.
	const say = $derived.by(() => {
		const parts: { t: string; em?: 'g' | 'w' }[] = [];
		const n = studio.leads.length;
		if (n) parts.push({ t: n === 1 ? 'A brand slid into your ' : `${n} brands slid into your ` }, { t: 'DMs', em: 'g' }, { t: '. ' });
		const best = open[0];
		if (best) parts.push({ t: `${best.c.brand.name} looks ` }, { t: VERDICT_WORD[best.d!.verdict] ?? 'worth a look', em: 'w' }, { t: '.' });
		if (!parts.length) parts.push({ t: 'A quiet desk. Time to ' }, { t: 'pitch', em: 'g' }, { t: ' a brand you love.' });
		return parts;
	});
	const forYou = $derived(Math.min(studio.leads.length, 3) + open.length);
	const ago = (at: string | null) => (at ? relWord(diff(at.slice(0, 10))) : '');
	const gauge = (score: number) => `${((2 * Math.PI * 27 * score) / 100).toFixed(1)} ${(2 * Math.PI * 27).toFixed(1)}`;
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
	<section class="hs dk2">
		<header class="dk2-h">
			<span class="ai-mark" aria-hidden="true"><i></i><svg viewBox="0 0 24 24"><path d="M12 2.5c.7 4.6 3.9 7.8 8.5 8.5-4.6.7-7.8 3.9-8.5 8.5-.7-4.6-3.9-7.8-8.5-8.5 4.6-.7 7.8-3.9 8.5-8.5z"/><path class="s2" d="M19 15.5c.25 1.6 1.4 2.75 3 3-1.6.25-2.75 1.4-3 3-.25-1.6-1.4-2.75-3-3 1.6-.25 2.75-1.4 3-3z"/></svg></span>
			<span class="dk2-eb">Desk AI</span>
			{#if forYou}<span class="dk2-eb dk2-mute">· {forYou} for you</span>{/if}
			{#if left}<span class="dk2-left" title={leftTitle}><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="14" /><circle class="dk2-arc" cx="18" cy="18" r="14" style="stroke-dasharray:{(88 * left.pct) / 100} 88" /></svg>{left.pct}% free</span>{/if}
		</header>
		<h2 class="dk2-say">{#each say as p, i (i)}{#if p.em}<em class="dk2-{p.em}">{p.t}</em>{:else}{p.t}{/if}{/each}</h2>

		{#if lead}
			<div class="dk2-lead" use:swipe>
				{#key lead.igsid}
				<div class="dk2-lead-in" in:fly={{ x: 40 * dir, duration: 220 }}>
					<div class="dk2-lt">
						<Icon name="send" />
						<span>Spotted in your DMs{#if phoneLeads.length > 1}<b class="dk2-of">{Math.min(leadI, phoneLeads.length - 1) + 1} of {phoneLeads.length}</b>{/if}</span>
						<em class:maybe={lead.collab_flag !== 'likely'}><i></i>{lead.collab_flag === 'likely' ? 'Likely' : 'Maybe'}</em>
					</div>
					<a class="dk2-who" href="/studio/inbox/ig/{lead.igsid}">
						<span class="dk2-av">{#if lead.picture}<img src={lead.picture} alt="" referrerpolicy="no-referrer" />{:else}<b>{(lead.username || 'IG').slice(0, 1).toUpperCase()}</b>{/if}</span>
						<span class="dk2-wt"><b>@{lead.username || 'someone'}</b><small>{lead.collab_hint || (lead.collab_flag === 'likely' ? 'May want to work with you' : 'Might be asking about a collab')}</small></span>
					</a>
					{#if said[lead.igsid]}
						<p class="dk2-dm">{said[lead.igsid]}<small>Instagram{lead.last_at ? ` · ${ago(lead.last_at)}` : ''}</small></p>
					{/if}
					<div class="dk2-acts">
						<button class="btn primary dk2-add" disabled={adding} onclick={addLead}>{#if adding}<span class="spinner"></span>{:else}<Icon name="plus" />{/if}Add as collab</button>
						<a class="btn dk2-open" href="/studio/inbox/ig/{lead.igsid}" aria-label="Open the chat"><Icon name="arrow" /></a>
					</div>
					{#if phoneLeads.length > 1}
						<div class="dk2-dots">
							<button class="dk2-step" onclick={() => goLead(leadI - 1)} aria-label="Previous possible collab"><Icon name="chevL" /></button>
							{#each phoneLeads as l, i (l.igsid)}<button class="dk2-dot" class:on={i === leadI} onclick={() => goLead(i)} aria-label="Show @{l.username || 'lead'}"><i></i></button>{/each}
							<button class="dk2-step" onclick={() => goLead(leadI + 1)} aria-label="Next possible collab"><Icon name="chevR" /></button>
						</div>
					{/if}
				</div>
				{/key}
			</div>
			{#if studio.leads.length > 3}<a class="ail-more" href="/studio/inbox">+{studio.leads.length - 3} more possible collabs in Messages<Icon name="chevR" /></a>{/if}
		{/if}

		{#if open.length}
			<div class="dk2-sh"><span>Open requests · scored</span>{#if open.length > 1}<small>swipe</small>{/if}</div>
			<div class="dk2-deck">
				{#each open as { c, d } (c.id)}
					<button class="dk2-sc v-{d!.verdict}" onclick={() => (ui.openCollab = c.id)}>
						<span class="dk2-g">
							<svg viewBox="0 0 66 66" aria-hidden="true"><circle cx="33" cy="33" r="27" /><circle class="dk2-arc" cx="33" cy="33" r="27" style="stroke-dasharray:{gauge(d!.score)}" /></svg>
							<b>{d!.score}</b>
						</span>
						<em>{d!.label}</em>
						<strong>{c.brand.name}</strong>
						{#if studio.reading.includes(c.id)}<AiThinking label="Reading" />{:else}<small>{d!.line}</small>{/if}
					</button>
				{/each}
			</div>
		{/if}

		{#if new Date().getDate() <= 10}
			<a class="ai-desk-review" href="/studio/reports?m={prevMonth()}"><Icon name="chart" /><span><b>Your {monthLabel(prevMonth()).split(' ')[0]} in review</b><small>What you earned, what worked, what to charge next</small></span><Icon name="chevR" /></a>
		{/if}
		<div class="ai-desk-acts">
			<button class="btn sm ai-btn" onclick={() => (ui.askOpen = true)}><Icon name="spark" />Ask your desk</button>
			<a class="btn sm ghost" href="/studio/inbox"><Icon name="send" />Messages{#if unread}<span class="ai-acts-n" aria-label="{unread} unread">{unread}</span>{/if}</a>
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
