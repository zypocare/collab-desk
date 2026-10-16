<script lang="ts">
	import { downloadIcs, milestones } from '../campaign';
	import type { BrandRequest } from '../types';
	import { toast } from '../ui.svelte';
	import { fmt, relWord, diff } from '../util';
	import Icon from './Icon.svelte';

	// The campaign's key dates, with what the brand has to do highlighted, and an "add to calendar" file.
	let { r, creator }: { r: BrandRequest; creator: string } = $props();
	const items = $derived(milestones(r, creator));
	const yours = $derived(items.filter((m) => m.who === 'you'));
	const ahead = $derived(items.some((m) => m.date && m.who !== 'done'));
	function ics() {
		const n = downloadIcs(r, creator, location.href);
		toast(n ? `${n} date${n > 1 ? 's' : ''} ready to add to your calendar` : 'No upcoming dates yet', 'cal');
	}
</script>

<section class="panel rv tl-panel" style="--i:2">
	<div class="panel-h">
		<h2>Timeline</h2>
		{#if ahead}<button class="btn sm" onclick={ics}><Icon name="cal" />Add to my calendar</button>{/if}
	</div>
	{#if yours.length}
		<div class="tl-need"><Icon name="alert" /><span><b>Needs you:</b> {yours.map((m) => m.title.toLowerCase()).join(', ')}</span></div>
	{/if}
	<ol class="tl">
		{#each items as m (m.key)}
			<li class="tl-{m.who}">
				<span class="tl-dot">{#if m.who === 'done'}<Icon name="check" />{/if}</span>
				<div>
					<b>{m.title}</b>
					<small>
						{#if m.date}{fmt(m.date)}{#if m.who !== 'done'}{' · '}{relWord(diff(m.date))}{/if}{:else if m.who !== 'done'}date to be set{/if}{m.note ? ` · ${m.note}` : ''}
					</small>
				</div>
				{#if m.who === 'you'}<span class="pill tint k-new">You</span>{:else if m.who === 'creator'}<span class="pill tint plain">{creator}</span>{/if}
			</li>
		{/each}
	</ol>
</section>
