<script lang="ts">
	import { studio } from '../studio.svelte';
	import { copyText, ui } from '../ui.svelte';
	import { stageLabel, tasks, type Task } from '../util';
	import type { Collab } from '../types';
	import Avatar from './Avatar.svelte';
	import Mono from './Mono.svelte';
	import Icon from './Icon.svelte';

	// Top of Today on a phone: a row of circles like stories. Collabs that need her come first
	// with a coloured ring; the rest of the active ones follow with a quiet ring.
	const need = $derived([...new Map(tasks(studio.collabs).map((t) => [t.c.id, t])).values()]);
	const rest = $derived(studio.collabs.filter((c) => !need.some((t) => t.c.id === c.id) && !['wrapped', 'declined'].includes(c.stage)));
	// Under each circle: what it's worth, then where it stands (the initials already say which brand).
	const worth = (c: Collab) => (c.type === 'barter' ? 'Barter' : c.fee > 0 ? `₹${c.fee >= 1000 ? `${+(c.fee / 1000).toFixed(1)}k` : c.fee}` : '·');
	const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const when = (d: number) => (d < 0 ? 'late' : d === 0 ? 'today' : d === 1 ? 'tmrw' : DAYS[new Date(Date.now() + d * 864e5).getDay()]);
	const NEXT: Record<Task['kind'], string> = {
		new: 'Review', msg: 'Reply', quote: 'Quote edits', revise: 'Revise', follow: 'Follow up', draft: 'Draft', shoot: 'Shoot', live: 'Live',
		product: 'Parcel', pay: 'Unpaid', claim: 'Paid?', usage: 'Usage', tds: 'TDS'
	};
	const dated = new Set<Task['kind']>(['draft', 'shoot', 'live', 'follow']);
	const status = (t: Task) => (dated.has(t.kind) ? `${NEXT[t.kind]} ${when(t.d)}` : NEXT[t.kind]);
	// new requests and messages are "do this now" (amber), never "late"; red is for missed dates and unpaid money
	const tone = (t: Task) => (t.kind === 'new' || t.kind === 'msg' ? 'now' : t.d < 0 || t.kind === 'pay' ? 'late' : t.d === 0 ? 'now' : '');
</script>

<div class="stories" aria-label="Collabs that need you">
	<button class="story st-me" onclick={() => (ui.newCollab = true)}>
		<span class="st-ring plain"><Avatar name={studio.settings?.display_name ?? ''} src={studio.ig?.connected ? studio.ig.profile_picture_url : ''} size="62px" /><i class="st-plus">+</i></span>
		<span class="st-l">New collab</span>
	</button>
	{#each need as t (t.c.id)}
		<a class="story" href={t.kind === 'msg' ? `/studio/inbox/${t.c.code}` : `/studio/c/${t.c.code}`} title="{t.c.brand.name}: {t.title}" aria-label="{t.c.brand.name}: {t.title}">
			<span class="st-ring"><Mono name={t.c.brand.name} size="lg" /></span>
			<span class="st-l st-d"><b>{worth(t.c)}</b><small class={tone(t)}>{status(t)}</small></span>
		</a>
	{/each}
	{#if !need.length && !rest.length}
		<!-- Nothing active yet: ways to get the first collabs in. -->
		<button class="story" onclick={() => copyText((studio.settings?.site_url || location.origin).replace(/\/$/, ''), 'Your link is copied. Put it in your Instagram bio.')}>
			<span class="st-ring st-tip"><span class="st-ic"><Icon name="link" /></span></span>
			<span class="st-l">Share link</span>
		</button>
		<a class="story" href="/studio/import">
			<span class="st-ring st-tip"><span class="st-ic"><Icon name="layers" /></span></span>
			<span class="st-l">Import DMs</span>
		</a>
		<a class="story" href="/insights" target="_blank" rel="noopener">
			<span class="st-ring st-tip"><span class="st-ic"><Icon name="chart" /></span></span>
			<span class="st-l">Insights</span>
		</a>
		<a class="story" href="/studio/settings?s=rates">
			<span class="st-ring st-tip"><span class="st-ic"><Icon name="rupee" /></span></span>
			<span class="st-l">Rate card</span>
		</a>
	{/if}
	{#each rest as c (c.id)}
		<a class="story seen" href="/studio/c/{c.code}" title="{c.brand.name}: {stageLabel(c.stage)}" aria-label="{c.brand.name}: {stageLabel(c.stage)}">
			<span class="st-ring"><Mono name={c.brand.name} size="lg" /></span>
			<span class="st-l st-d"><b>{worth(c)}</b><small>{stageLabel(c.stage)}</small></span>
		</a>
	{/each}
</div>

<style>
	/* Two short lines under a collab's circle: its worth, then where it stands. */
	.st-d { display: grid; justify-items: center; gap: 1px; line-height: 1.15; }
	.st-d b { font-size: 13px; font-weight: 700; color: var(--ink); }
	.st-d small { max-width: 70px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; font-weight: 600; color: var(--ink-3); }
	.st-d small.now { color: var(--g3); }
	.st-d small.late { color: var(--bad); }
</style>
