<script lang="ts">
	import { onMount } from 'svelte';
	import { isRanked } from '../priority';
	import { supabase } from '../supabase';
	import { decisionOf, studio } from '../studio.svelte';
	import { ui } from '../ui.svelte';
	import AiThinking from './AiThinking.svelte';
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
	let left = $state<number | null>(null);
	onMount(() => {
		supabase.rpc('ai_left').then(({ data }) => (left = typeof data === 'number' ? data : null));
	});
</script>

<section class="ai-desk {phone ? 'hs' : 'panel rv'}" style={phone ? '' : '--i:3'}>
	<span class="ai-desk-fx" aria-hidden="true"></span>
	<header class="ai-desk-h">
		<span class="ai-desk-ic"><Icon name="spark" /></span>
		<div>
			<h2>Your AI assistant</h2>
			<small>{open.length ? `Read ${open.length === 1 ? 'your new request' : `your ${open.length} open requests`} and scored ${open.length === 1 ? 'it' : 'them'}` : "When a brand writes, I'll read it and tell you if it's worth it"}</small>
		</div>
		{#if left !== null}<span class="ai-left" title="Free AI uses left today">{left}<small>left today</small></span>{/if}
	</header>
	{#if open.length}
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
	<div class="ai-desk-acts">
		<button class="btn sm ai-btn" onclick={() => (ui.newCollab = true)}><Icon name="spark" />Read a DM or screenshot</button>
		<a class="btn sm ghost" href="/studio/inbox">Check messages</a>
	</div>
</section>
