<script lang="ts">
	import { studio } from '../studio.svelte';
	import { copyText } from '../ui.svelte';
	import { delivText, inrS, stageLabel, tasks, type Task } from '../util';
	import type { Collab } from '../types';
	import Icon from './Icon.svelte';

	// Top of Today on a phone: a row of collab tickets, each with the brand's full name. Collabs that
	// need her come first; the rest of the active ones follow.
	const need = $derived([...new Map(tasks(studio.collabs).map((t) => [t.c.id, t])).values()]);
	const rest = $derived(studio.collabs.filter((c) => !need.some((t) => t.c.id === c.id) && !['wrapped', 'declined', 'cancelled'].includes(c.stage)));
	// Short amounts (₹85k) so the next-step chip beside it fits on a narrow card.
	const fee = (c: Collab) => (c.type === 'barter' ? 'Barter' : c.fee > 0 ? inrS(c.fee) : 'No fee');
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
	const all = $derived([
		...need.map((t) => ({ c: t.c, href: t.kind === 'msg' ? `/studio/inbox/${t.c.code}` : `/studio/c/${t.c.code}`, line: t.title, pill: status(t), tone: tone(t) })),
		...rest.map((c) => ({ c, href: `/studio/c/${c.code}`, line: delivText(c.deliverables), pill: stageLabel(c.stage), tone: c.stage === 'live' ? 'ok' : '' }))
	]);
</script>

<section class="tix" aria-label="Your collabs">
	<div class="tix-h">
		<span>Your collabs</span>
		{#if all.length}<a href="/studio/collabs">See all</a>{/if}
	</div>
	<div class="tix-row">
		{#each all as k (k.c.id)}
			<a class="tix-t tone-{k.tone || 'calm'}" href={k.href} aria-label="{k.c.brand.name}: {k.line}, {fee(k.c)}, {k.pill}">
				<b class="tix-n">{k.c.brand.name}</b>
				<span class="tix-l">{k.line}</span>
				<i class="tix-cut" aria-hidden="true"></i>
				<span class="tix-f"><strong>{fee(k.c)}</strong><em>{k.pill}</em></span>
			</a>
		{:else}
			<!-- Nothing active yet: ways to get the first collabs in. -->
			<button class="tix-t tix-tip" onclick={() => copyText((studio.settings?.site_url || location.origin).replace(/\/$/, ''), 'Your link is copied. Put it in your Instagram bio.')}>
				<Icon name="link" /><b class="tix-n">Share your link</b><span class="tix-l">Put it in your bio</span>
			</button>
			<a class="tix-t tix-tip" href="/studio/import"><Icon name="layers" /><b class="tix-n">Import DMs</b><span class="tix-l">Turn chats into collabs</span></a>
			<a class="tix-t tix-tip" href="/studio/settings?s=rates"><Icon name="rupee" /><b class="tix-n">Rate card</b><span class="tix-l">Set your prices</span></a>
		{/each}
	</div>
</section>

