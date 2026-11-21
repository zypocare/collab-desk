<script lang="ts">
	import { studio } from '../studio.svelte';
	import { copyText } from '../ui.svelte';
	import { delivText, fmt, inrS, isActive, stageIndex, stageLabel, tasks, type Task } from '../util';
	import type { Collab } from '../types';
	import Icon from './Icon.svelte';
	import CycleText from './CycleText.svelte';

	// Pending Instagram collabs and active collabs in a stage-aware living ticket rail.
	const leads = $derived([...studio.leads].sort((a, b) => Number(b.collab_flag === 'likely') - Number(a.collab_flag === 'likely')));
	const nextTasks = $derived.by(() => {
		const byCollab = new Map<string, Task>();
		for (const task of tasks(studio.collabs)) {
			if (!byCollab.has(task.c.id)) byCollab.set(task.c.id, task);
		}
		return byCollab;
	});
	const need = $derived([...nextTasks.values()]);
	const rest = $derived(studio.collabs.filter((c) => isActive(c) && !nextTasks.has(c.id)));
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
	const allItems = $derived([
		...need.map((t) => ({
			id: t.c.id,
			name: t.c.brand.name,
			money: fee(t.c),
			href: t.kind === 'msg' ? `/studio/inbox/${t.c.code}` : `/studio/c/${t.c.code}`,
			line: t.title,
			pill: status(t),
			tone: tone(t),
			group: 'need' as const,
			active: isActive(t.c),
			stage: stageLabel(t.c.stage),
			stageIdx: stageIndex(t.c.stage),
			lines: facts(t.title, t.c.deliverables.length > 0 && delivText(t.c.deliverables), dateLine(t.c))
		})),
		...rest.map((c) => ({
			id: c.id,
			name: c.brand.name,
			money: fee(c),
			href: `/studio/c/${c.code}`,
			line: delivText(c.deliverables),
			pill: stageLabel(c.stage),
			tone: c.stage === 'live' ? 'ok' : '',
			group: 'active' as const,
			active: true,
			stage: stageLabel(c.stage),
			stageIdx: stageIndex(c.stage),
			lines: facts(c.deliverables.length > 0 && delivText(c.deliverables), dateLine(c))
		}))
	]);
	const leadName = (l: (typeof studio.leads)[number]) => /^([^:@][^:]{0,40}):\s/.exec(l.collab_hint)?.[1].trim() || l.name || (l.username ? `@${l.username}` : 'Instagram');
	const dmItems = $derived(
		leads.map((l) => ({
			id: `dm-${l.igsid}`,
			name: leadName(l),
			money: 'From DM',
			href: `/studio/inbox/ig/${l.igsid}`,
			line: l.collab_hint || 'Asking about working together',
			pill: 'Review DM',
			tone: 'dm',
			group: 'dm' as const,
			stage: 'IG DM lead',
			stageIdx: -1,
			meta: [l.username ? `@${l.username}` : '', ago(l.last_at)].filter(Boolean).join(' · '),
			lines: facts(l.collab_hint || 'Asking about working together', l.unread ? `${l.unread} new message${l.unread === 1 ? '' : 's'}` : '')
		}))
	);

	const activeItems = $derived(allItems.filter((item) => item.active));
	const needItems = $derived(allItems.filter((item) => item.group === 'need'));
	type Filter = 'all' | 'need' | 'dm';
	let selected = $state<Filter | null>(null);
	const filter = $derived(selected ?? (activeItems.length ? 'all' : needItems.length ? 'need' : dmItems.length ? 'dm' : 'all'));
	const filters = $derived([
		{ id: 'all' as const, label: 'All active', count: activeItems.length },
		{ id: 'need' as const, label: 'Needs action', count: needItems.length },
		{ id: 'dm' as const, label: 'DM leads', count: dmItems.length }
	]);
	let railEl = $state<HTMLElement>();
	function setFilter(next: Filter) {
		selected = next;
		if (railEl) railEl.scrollLeft = 0;
	}
	const shown = $derived(filter === 'dm' ? dmItems : filter === 'need' ? needItems : activeItems);
</script>

<section class="tix" id="sec-collabs" aria-label="Your collabs">
	<div class="tix-h">
		<h2>Your collabs</h2>
		<a href="/studio/collabs">See board →</a>
	</div>
	{#if allItems.length || dmItems.length}
		<div class="tix-filters" role="group" aria-label="Filter collaborations">
			{#each filters as f (f.id)}
				<button type="button" class="tix-flt" class:on={filter === f.id} aria-pressed={filter === f.id} onclick={() => setFilter(f.id)}>
					{f.label} <b>{f.count}</b>
				</button>
			{/each}
		</div>
	{/if}
	<div class="tix-row" bind:this={railEl}>
		{#each shown as k, i (k.id)}
			<a class="tix-t tone-{k.tone || 'calm'}" class:tix-dm={k.group === 'dm'} style="--rt:{hue(k.tone, i)};--k:{i}" href={k.href} aria-label="{k.name}, {k.stage}: {k.line}, {k.money}, {k.pill}">
				<span class="tix-top">
					<span class="tix-av">{k.name.replace(/^@/, '').trim().slice(0, 1).toUpperCase() || 'C'}</span>
					<small class="tix-step">{k.stage}{k.stageIdx >= 0 ? ` · ${k.stageIdx + 1}/6` : ''}</small>
				</span>
				<b class="tix-n">{k.name}</b>
				<span class="tix-l" aria-hidden="true"><CycleText {i} items={k.lines} /></span>
				{#if k.stageIdx >= 0}
					<span class="tix-prog" aria-hidden="true">
						{#each [0, 1, 2, 3, 4, 5] as s (s)}
							<i class:done={s < k.stageIdx} class:curr={s === k.stageIdx}></i>
						{/each}
					</span>
				{:else if k.group === 'dm' && k.meta}
					<small class="lead-meta">{k.meta}</small>
				{/if}
				<i class="tix-cut" aria-hidden="true"></i>
				<span class="tix-f"><strong>{k.money}</strong><em>{#if k.group === 'dm'}<i class="tix-attention" aria-hidden="true"></i>{/if}{k.pill}</em></span>
			</a>
		{:else}
			{#if allItems.length || dmItems.length}
				<p class="rail-empty">{filter === 'dm' ? 'No Instagram leads to review.' : filter === 'need' ? 'You’re caught up. No collabs need action.' : 'No active collabs right now.'}</p>
			{:else}
				<button class="tix-t tix-tip" onclick={() => copyText((studio.settings?.site_url || location.origin).replace(/\/$/, ''), 'Your link is copied. Put it in your Instagram bio.')}>
					<Icon name="link" /><b class="tix-n">Share your link</b><span class="tix-l">Put it in your bio</span>
				</button>
				<a class="tix-t tix-tip" href="/studio/import"><Icon name="layers" /><b class="tix-n">Import DMs</b><span class="tix-l">Turn chats into collabs</span></a>
				<a class="tix-t tix-tip" href="/studio/settings?s=rates"><Icon name="rupee" /><b class="tix-n">Rate card</b><span class="tix-l">Set your prices</span></a>
			{/if}
		{/each}
	</div>
</section>
