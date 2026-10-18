<script lang="ts">
	import type { Collab, Stage } from '../types';
	import { ui } from '../ui.svelte';
	import { delivText, diff, fmt, inr, inrS, nextLine, stageIndex, stageName, unreadFor } from '../util';
	import { priorityOf } from '../studio.svelte';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';
	import PayPill from './PayPill.svelte';

	// Laptop list view: every collab as one row, sortable, with the next step and money at a glance.
	let {
		list,
		selecting = false,
		picked,
		onpick
	}: { list: Collab[]; selecting?: boolean; picked?: Set<string>; onpick?: (id: string) => void } = $props();

	type Sort = 'stage' | 'brand' | 'value' | 'date';
	let sort = $state<Sort>('stage');
	let desc = $state(false);
	function by(k: Sort) {
		if (sort === k) desc = !desc;
		else {
			sort = k;
			desc = k === 'value';
		}
	}
	const order = (s: Stage) => (s === 'declined' ? 99 : stageIndex(s));
	// The date that matters at this stage: draft, then go-live, then payment, else when it came in.
	const keyDate = (c: Collab) => c.draft_date || c.live_date || c.pay_due || c.received_on;
	const value = (c: Collab) => (Number(c.fee) || 0) + (Number(c.product_value) || 0);
	const rows = $derived(
		[...list].sort((a, b) => {
			let r = 0;
			if (sort === 'stage') r = order(a.stage) - order(b.stage) || (priorityOf(b)?.score ?? 0) - (priorityOf(a)?.score ?? 0);
			else if (sort === 'brand') r = a.brand.name.localeCompare(b.brand.name);
			else if (sort === 'value') r = value(a) - value(b);
			else r = (keyDate(a) ?? '').localeCompare(keyDate(b) ?? '');
			return desc ? -r : r;
		})
	);
	const open = (c: Collab) => (selecting ? onpick?.(c.id) : (ui.openCollab = c.id));
	const dateLabel = (c: Collab) => (c.draft_date && diff(c.draft_date) >= 0 ? 'Draft' : c.live_date ? 'Live' : c.pay_due ? 'Pay by' : 'Received');
	const COLS: [Sort | null, string][] = [
		['brand', 'Brand'],
		['stage', 'Stage'],
		[null, 'Deliverables'],
		['value', 'Value'],
		[null, 'Next step'],
		['date', 'Date'],
		[null, 'Payment']
	];
</script>

<div class="ct-wrap">
	<table class="ct">
		<thead>
			<tr>
				{#if selecting}<th class="ct-pick"><span class="sr">Selected</span></th>{/if}
				{#each COLS as [k, label] (label)}
					<th class:num-col={k === 'value'} aria-sort={k && sort === k ? (desc ? 'descending' : 'ascending') : undefined}>
						{#if k}<button class="ct-sort" class:on={sort === k} onclick={() => by(k)}>{label}<Icon name={sort === k && desc ? 'chevD' : 'chevU'} /></button>{:else}{label}{/if}
					</th>
				{/each}
				<th class="ct-go"><span class="sr">Open</span></th>
			</tr>
		</thead>
		<tbody>
			{#each rows as c (c.id)}
				{@const n = nextLine(c)}
				{@const unread = unreadFor(c)}
				<tr class="st-{c.stage}" class:picked={picked?.has(c.id)} onclick={() => open(c)}>
					{#if selecting}<td class="ct-pick"><span class="pick-box" aria-hidden="true">{#if picked?.has(c.id)}<Icon name="check" />{/if}</span></td>{/if}
					<td>
						<div class="ct-brand">
							<Mono name={c.brand.name} />
							<span>
								<b>{c.brand.name}{#if unread}<span class="ct-unread" title="{unread} unread">{unread}</span>{/if}</b>
								<small><span class="num">{c.code}</span>{c.brand.category ? ` · ${c.brand.category}` : ''}</small>
							</span>
						</div>
					</td>
					<td><span class="ct-stage"><span class="dt" class:pulse={c.stage === 'request'}></span>{stageName(c, c.stage)}</span></td>
					<td class="ct-del">{delivText(c.deliverables) || '—'}</td>
					<td class="num-col">
						{#if c.type === 'barter'}<span class="ct-v">{c.product_value ? inrS(c.product_value) : '—'}</span><small>barter</small>
						{:else}<span class="ct-v" class:num={!!c.fee}>{c.fee ? inr(c.fee) : 'Quote needed'}</span>{#if c.type === 'hybrid'}<small>+ product</small>{/if}{/if}
					</td>
					<td class="ct-next {n.tone}"><Icon name={n.icon} /><span>{n.text}</span></td>
					<td class="ct-date">{#if keyDate(c)}<small>{dateLabel(c)}</small><span>{fmt(keyDate(c))}</span>{/if}</td>
					<td><PayPill {c} /></td>
					<td class="ct-go"><Icon name="chevR" /></td>
				</tr>
			{:else}
				<tr class="ct-none"><td colspan="9">No collabs match.</td></tr>
			{/each}
		</tbody>
	</table>
</div>
