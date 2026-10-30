<script lang="ts">
	import { studio } from '../studio.svelte';
	import { copyText } from '../ui.svelte';
	import { delivText, fmt, inrS, stageLabel, tasks, type Task } from '../util';
	import type { Collab } from '../types';
	import Icon from './Icon.svelte';
	import CycleText from './CycleText.svelte';

	// Pending Instagram collabs take the home row. Otherwise, show
	// collabs that need her first, followed by the rest of the active ones.
	const leads = $derived([...studio.leads].sort((a, b) => Number(b.collab_flag === 'likely') - Number(a.collab_flag === 'likely')));
	const need = $derived([...new Map(tasks(studio.collabs).map((t) => [t.c.id, t])).values()]);
	const rest = $derived(studio.collabs.filter((c) => !need.some((t) => t.c.id === c.id) && !c.someday && !['wrapped', 'declined', 'cancelled'].includes(c.stage)));
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
	// Each card comes alive like Money's round shortcuts: a light runs round its edge in its own colour, and its line
	// turns through a few facts about it (CycleText), each card a beat after the one before.
	// Its colour: the card's tone when it has one, else the theme's hues in turn, so the row isn't all one colour.
	const HUES = ['var(--g2)', 'var(--g1)', 'var(--g3)', 'var(--h-live)', 'var(--h-request)'];
	const TONE_HUE: Record<string, string> = { now: 'var(--g3)', late: 'var(--bad)', ok: 'var(--ok)' };
	const hue = (tone: string, i: number) => TONE_HUE[tone] ?? HUES[i % HUES.length];
	const facts = (...xs: (string | null | undefined | false)[]) => [...new Set(xs.filter((x): x is string => !!x && !!x.trim()))];
	const dateLine = (c: Collab) => (c.live_date ? `Live ${fmt(c.live_date)}` : c.draft_date ? `Draft ${fmt(c.draft_date)}` : stageLabel(c.stage));
	const ago = (at: string | null) => {
		if (!at) return '';
		const m = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60000));
		return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
	};
	const all = $derived([
		...need.map((t) => ({ id: t.c.id, name: t.c.brand.name, money: fee(t.c), href: t.kind === 'msg' ? `/studio/inbox/${t.c.code}` : `/studio/c/${t.c.code}`, line: t.title, pill: status(t), tone: tone(t), lines: facts(t.title, t.c.deliverables.length > 0 && delivText(t.c.deliverables), dateLine(t.c)) })),
		...rest.map((c) => ({ id: c.id, name: c.brand.name, money: fee(c), href: `/studio/c/${c.code}`, line: delivText(c.deliverables), pill: stageLabel(c.stage), tone: c.stage === 'live' ? 'ok' : '', lines: facts(c.deliverables.length > 0 && delivText(c.deliverables), dateLine(c)) }))
	]);
	const leadName = (l: (typeof studio.leads)[number]) => /^([^:@][^:]{0,40}):\s/.exec(l.collab_hint)?.[1].trim() || l.name || (l.username ? `@${l.username}` : 'Instagram');
	// A long handle may break after its dots and underscores (@bhawna. / barcode), not in the middle of a word.
	const soft = (name: string) => name.replace(/([._])(?=\S)/g, '$1\u200b');
	const shown = $derived(leads.length ? leads.map((l) => ({
		id: `dm-${l.igsid}`,
		name: leadName(l),
		money: 'From DM',
		href: `/studio/inbox/ig/${l.igsid}`,
		line: l.collab_hint || 'Asking about working together',
		pill: 'Review DM',
		tone: 'dm',
		lines: facts(l.collab_hint || 'Asking about working together', [l.username && leadName(l) !== `@${l.username}` ? `@${l.username}` : '', ago(l.last_at)].filter(Boolean).join(' · '), l.unread ? `${l.unread} new message${l.unread === 1 ? '' : 's'}` : '', 'Tap to turn it into a collab')
	})) : all);
</script>

<section class="tix" aria-label="Your collabs">
	<div class="tix-h">
		<span>Your collabs</span>
		{#if shown.length}<a href="/studio/collabs">See all</a>{/if}
	</div>
	<div class="tix-row">
		{#each shown as k, i (k.id)}
			<a class="tix-t tone-{k.tone || 'calm'}" class:tix-dm={leads.length > 0} style="--rt:{hue(k.tone, i)};--k:{i}" href={k.href} aria-label="{k.name}: {k.line}, {k.money}, {k.pill}">
				<b class="tix-n">{soft(k.name)}</b>
				<span class="tix-l" aria-hidden="true"><CycleText {i} items={k.lines} /></span>
				<i class="tix-cut" aria-hidden="true"></i>
				<span class="tix-f"><strong>{k.money}</strong><em>{#if leads.length}<i class="tix-attention" aria-hidden="true"></i>{/if}{k.pill}</em></span>
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

