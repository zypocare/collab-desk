<script lang="ts">
	import { studio } from '../studio.svelte';
	import { copyText } from '../ui.svelte';
	import { delivText, inrS, stageLabel, tasks, type Task } from '../util';
	import type { Collab } from '../types';
	import Icon from './Icon.svelte';

	// Pending Instagram collabs take the home row. Otherwise, show
	// collabs that need her first, followed by the rest of the active ones.
	const leads = $derived([...studio.leads].sort((a, b) => Number(b.collab_flag === 'likely') - Number(a.collab_flag === 'likely')));
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
		...need.map((t) => ({ id: t.c.id, name: t.c.brand.name, money: fee(t.c), href: t.kind === 'msg' ? `/studio/inbox/${t.c.code}` : `/studio/c/${t.c.code}`, line: t.title, pill: status(t), tone: tone(t) })),
		...rest.map((c) => ({ id: c.id, name: c.brand.name, money: fee(c), href: `/studio/c/${c.code}`, line: delivText(c.deliverables), pill: stageLabel(c.stage), tone: c.stage === 'live' ? 'ok' : '' }))
	]);
	const shown = $derived(leads.length ? leads.map((l) => ({
		id: `dm-${l.igsid}`,
		name: /^([^:@][^:]{0,40}):\s/.exec(l.collab_hint)?.[1].trim() || l.name || (l.username ? `@${l.username}` : 'Instagram'),
		money: 'From DM',
		href: `/studio/inbox/ig/${l.igsid}`,
		line: l.collab_hint || 'Asking about working together',
		pill: 'Review',
		tone: 'now'
	})) : all);
</script>

<section class="tix" aria-label="Your collabs">
	<div class="tix-h">
		<span>Your collabs</span>
		{#if shown.length}<a href="/studio/collabs">See all</a>{/if}
	</div>
	<div class="tix-row">
		{#each shown as k (k.id)}
			<a class="tix-t tone-{k.tone || 'calm'}" href={k.href} aria-label="{k.name}: {k.line}, {k.money}, {k.pill}">
				<b class="tix-n">{k.name}</b>
				<span class="tix-l">{k.line}</span>
				<i class="tix-cut" aria-hidden="true"></i>
				<span class="tix-f"><strong>{k.money}</strong><em>{k.pill}</em></span>
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

