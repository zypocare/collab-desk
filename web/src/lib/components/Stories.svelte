<script lang="ts">
	import { studio } from '../studio.svelte';
	import { copyText } from '../ui.svelte';
	import { delivText, stageLabel, tasks, type Task } from '../util';
	import type { Collab } from '../types';
	import Icon from './Icon.svelte';

	// Top of Today on a phone: a row of collab tickets, each with the brand's full name. Collabs that
	// need her come first; the rest of the active ones follow.
	const need = $derived([...new Map(tasks(studio.collabs).map((t) => [t.c.id, t])).values()]);
	const rest = $derived(studio.collabs.filter((c) => !need.some((t) => t.c.id === c.id) && !['wrapped', 'declined', 'cancelled'].includes(c.stage)));
	const fee = (c: Collab) => (c.type === 'barter' ? 'Barter' : c.fee > 0 ? `₹${c.fee.toLocaleString('en-IN')}` : 'No fee yet');
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

<style>
	.tix {
		margin: 0 -16px 8px;
		padding: 14px 0 16px;
		border-bottom: 1px solid var(--ig-sep, var(--line));
	}
	.tix-h {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding: 0 20px 10px;
	}
	.tix-h span {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.tix-h a {
		font-size: 13px;
		color: var(--ink-2);
		text-decoration: none;
	}
	.tix-row {
		display: flex;
		gap: 12px;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scroll-padding-inline: 20px;
		padding: 0 20px;
		scrollbar-width: none;
	}
	.tix-row::-webkit-scrollbar {
		display: none;
	}
	/* A ticket: two round cut-outs where the dashed tear line runs. */
	.tix-t {
		--tint: transparent;
		flex: none;
		width: 172px;
		height: 150px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		padding: 14px 14px 12px;
		border: 0;
		border-radius: 18px;
		background:
			radial-gradient(120% 80% at 0% 0%, var(--tint), transparent 60%),
			var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink);
		text-align: left;
		font: inherit;
		text-decoration: none;
		scroll-snap-align: start;
		-webkit-mask:
			radial-gradient(circle at 0 64%, #0000 8px, #000 8.5px) left / 51% 100% no-repeat,
			radial-gradient(circle at 100% 64%, #0000 8px, #000 8.5px) right / 51% 100% no-repeat;
		mask:
			radial-gradient(circle at 0 64%, #0000 8px, #000 8.5px) left / 51% 100% no-repeat,
			radial-gradient(circle at 100% 64%, #0000 8px, #000 8.5px) right / 51% 100% no-repeat;
		transition: transform 0.2s;
	}
	.tix-t:active {
		transform: scale(0.97);
	}
	.tix-n {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 23px;
		line-height: 1.02;
	}
	.tix-l {
		margin-top: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
		color: var(--ink-3);
	}
	.tix-cut {
		margin-top: auto;
		border-top: 1.5px dashed var(--line-strong);
	}
	.tix-f {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding-top: 10px;
	}
	.tix-f strong {
		font-size: 17px;
		font-weight: 700;
		white-space: nowrap;
	}
	.tix-f em {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 4px 8px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--ink) 8%, transparent);
		color: var(--ink-2);
		font-size: 11px;
		font-style: normal;
		font-weight: 700;
	}
	.tone-ok {
		--tint: color-mix(in oklab, var(--ok) 16%, transparent);
	}
	.tone-ok em {
		background: color-mix(in oklab, var(--ok) 16%, transparent);
		color: var(--ok);
	}
	.tone-now {
		--tint: color-mix(in oklab, var(--g3) 18%, transparent);
	}
	.tone-now em {
		background: color-mix(in oklab, var(--g3) 16%, transparent);
		color: var(--g3);
	}
	.tone-late {
		--tint: color-mix(in oklab, var(--bad) 16%, transparent);
	}
	.tone-late em {
		background: color-mix(in oklab, var(--bad) 16%, transparent);
		color: var(--bad);
	}
	.tix-tip {
		height: 120px;
		-webkit-mask: none;
		mask: none;
		cursor: pointer;
		gap: 2px;
	}
	.tix-tip :global(.ic) {
		width: 20px;
		height: 20px;
		margin-bottom: auto;
		color: var(--g2);
	}
	.tix-tip .tix-n {
		font-size: 21px;
	}
</style>
