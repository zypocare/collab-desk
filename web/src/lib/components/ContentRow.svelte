<script lang="ts">
	import type { Collab } from '../types';
	import { hoursLeft, suggestShoot } from '../content';
	import { studio, updateCollab } from '../studio.svelte';
	import { toast, ui } from '../ui.svelte';
	import { delivText, diff, fmt, relWord } from '../util';
	import DatePicker from './DatePicker.svelte';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';
	import ScriptSheet from './ScriptSheet.svelte';

	// One collab in her content plan: what's left to make, when she shoots it, and a link to its Shot List page.
	let { c, plan = false }: { c: Collab; plan?: boolean } = $props();

	let scriptOpen = $state(false);
	const owed = $derived(c.deliverables.filter((d) => !d.done));
	const hours = $derived(hoursLeft(c, studio.settings));
	const shots = $derived(c.shot_list ?? []);
	const doneShots = $derived(shots.filter((x) => x.done).length);
	const sug = $derived(suggestShoot(c));

	const draftAfterLive = $derived(!!c.draft_date && !!c.live_date && c.draft_date > c.live_date);
	const draftLate = $derived(!!c.draft_date && (diff(c.draft_date) < 0 || draftAfterLive));
	const draftWhen = $derived.by(() => {
		if (!c.draft_date) return '';
		const n = diff(c.draft_date);
		if (Math.abs(n) <= 30) return relWord(n);
		const y = c.draft_date.slice(0, 4);
		return `${fmt(c.draft_date)}${y !== String(new Date().getFullYear()) ? ` ${y}` : ''}`;
	});
	const shootDue = $derived(!c.shot_at && !!c.shoot_date && diff(c.shoot_date) <= 0 && ['confirmed', 'creating'].includes(c.stage));
</script>

{#if scriptOpen}<ScriptSheet {c} onclose={() => (scriptOpen = false)} />{/if}

<article class="ct2-card" class:shot={!!c.shot_at} class:overdue={shootDue}>
	<div class="ct2-top">
		<Mono name={c.brand.name} size="sm" />
		<div class="ct2-head">
			<button type="button" class="ct2-brand" onclick={() => (ui.openCollab = c.id)}>{c.brand.name}</button>
			<small class="ct2-deliv">{delivText(owed.length ? owed : c.deliverables)}{hours ? ` · ~${hours} h` : ''}</small>
		</div>
		{#if c.shot_at}
			<span class="ct2-badge ok"><Icon name="check" />Editing</span>
		{:else if shootDue}
			<span class="ct2-badge late">{diff(c.shoot_date!) === 0 ? 'Today' : 'Missed'}</span>
		{:else if c.product_received_at}
			<span class="ct2-badge prod"><Icon name="box" />In hand</span>
		{/if}
	</div>

	{#if c.draft_date || c.live_date || c.product_received_at || c.shot_at}
		<div class="ct2-meta">
			{#if c.draft_date}
				<span class:late={draftLate}><Icon name="film" />Draft {draftWhen}</span>
			{/if}
			{#if c.live_date}
				<span><Icon name="spark" />Live {fmt(c.live_date)}</span>
			{/if}
			{#if c.product_received_at}
				<span class="ok"><Icon name="box" />Product here</span>
			{/if}
		</div>
	{/if}

	{#if draftAfterLive}
		<button type="button" class="ct2-warn" onclick={() => (ui.openCollab = c.id)}>
			<Icon name="alert" /><span>The draft is due after it goes live. Fix the dates</span>
		</button>
	{/if}

	<div class="ct2-actions">
		<button type="button" class="ct2-btn ct2-btn-ai" onclick={() => (scriptOpen = true)} title="A ready-to-shoot script from the brief">
			<Icon name="spark" /><span>{c.script ? 'Script' : 'Write script'}</span>
		</button>
		<a class="ct2-btn ct2-btn-shots" href="/studio/content/{c.code}/shots">
			<Icon name="layers" />
			<span>Shot list{#if shots.length} <em>{doneShots}/{shots.length}</em>{/if}</span>
			<Icon name="chevR" />
		</a>
	</div>

	{#if shootDue}
		<div class="ct2-bar ct2-bar-due">
			<span>{diff(c.shoot_date!) === 0 ? 'Shooting today' : `Shoot was ${fmt(c.shoot_date)}`}</span>
			<button
				type="button"
				class="ct2-done"
				onclick={async () => {
					await updateCollab(c.id, { shot_at: new Date().toISOString() });
					toast('Shoot done. Next: edit and send the draft', 'film');
				}}
			>
				<Icon name="check" /><span>Shoot done</span>
			</button>
		</div>
	{/if}

	{#if plan}
		<div class="ct2-bar">
			<span class="ct2-bar-l">Shoot day</span>
			<div class="ct2-bar-r">
				{#if !c.shoot_date}
					<button type="button" class="ct2-sug" onclick={() => updateCollab(c.id, { shoot_date: sug })}>
						<Icon name="cal" /><span>{fmt(sug)}</span>
					</button>
				{/if}
				<DatePicker
					size="sm"
					ariaLabel="Shoot day for {c.brand.name}"
					placeholder={c.shoot_date ? 'Pick a shoot day' : 'Pick day'}
					value={c.shoot_date}
					onchange={(v) => updateCollab(c.id, { shoot_date: v || null })}
				/>
			</div>
		</div>
	{/if}
</article>

<style>
	.ct2-card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-left: 3px solid var(--g1);
		border-radius: 16px;
		padding: 14px;
		display: grid;
		gap: 11px;
		margin-bottom: 10px;
	}
	.ct2-card.shot {
		border-left-color: var(--ok);
	}
	.ct2-card.overdue {
		border-left-color: var(--g2);
	}
	.ct2-top {
		display: flex;
		align-items: center;
		gap: 11px;
		min-width: 0;
	}
	.ct2-top :global(.mono) {
		flex: none;
	}
	.ct2-head {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.ct2-brand {
		border: 0;
		background: none;
		padding: 0;
		text-align: left;
		font: 700 16.5px/1.25 var(--f-body, inherit);
		color: var(--ink);
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ct2-deliv {
		font-size: 13.5px;
		color: var(--ink-3);
	}
	.ct2-badge {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 9px;
		border-radius: 99px;
		font: 700 11px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.ct2-badge :global(.ic) {
		width: 12px;
		height: 12px;
	}
	.ct2-badge.ok {
		color: var(--ok);
		background: color-mix(in oklab, var(--ok) 14%, transparent);
		border: 1px solid color-mix(in oklab, var(--ok) 32%, var(--line));
	}
	.ct2-badge.late {
		color: var(--g2);
		background: color-mix(in oklab, var(--g2) 14%, transparent);
		border: 1px solid color-mix(in oklab, var(--g2) 34%, var(--line));
	}
	.ct2-badge.prod {
		color: var(--g1);
		background: color-mix(in oklab, var(--g1) 14%, transparent);
		border: 1px solid color-mix(in oklab, var(--g1) 34%, var(--line));
	}
	.ct2-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		font-size: 13px;
		color: var(--ink-2);
	}
	.ct2-meta span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.ct2-meta :global(.ic) {
		width: 14px;
		height: 14px;
		color: var(--ink-3);
	}
	.ct2-meta span.late {
		color: var(--bad);
		font-weight: 600;
	}
	.ct2-meta span.late :global(.ic) {
		color: var(--bad);
	}
	.ct2-meta span.ok {
		color: var(--ok);
	}
	.ct2-meta span.ok :global(.ic) {
		color: var(--ok);
	}
	.ct2-warn {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 8px 10px;
		border-radius: 10px;
		border: 1px solid color-mix(in oklab, var(--bad) 36%, var(--line));
		background: color-mix(in oklab, var(--bad) 10%, transparent);
		color: var(--bad);
		font: 600 13px/1.35 var(--f-body, inherit);
		text-align: left;
		cursor: pointer;
	}
	.ct2-warn :global(.ic) {
		flex: none;
		width: 15px;
		height: 15px;
	}
	.ct2-actions {
		display: grid;
		grid-template-columns: 1fr 1.15fr;
		gap: 8px;
	}
	.ct2-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 40px;
		padding: 0 12px;
		border-radius: 11px;
		font: 600 13.5px/1 var(--f-body, inherit);
		text-decoration: none;
		cursor: pointer;
	}
	.ct2-btn :global(.ic) {
		width: 15px;
		height: 15px;
		flex: none;
	}
	.ct2-btn-ai {
		border: 1px solid color-mix(in oklab, var(--g1) 42%, var(--line));
		background: color-mix(in oklab, var(--g1) 12%, var(--surface-2));
		color: var(--ink);
	}
	.ct2-btn-ai :global(.ic) {
		color: var(--g1);
	}
	.ct2-btn-shots {
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		color: var(--ink);
		justify-content: space-between;
	}
	.ct2-btn-shots span {
		flex: 1;
		text-align: left;
	}
	.ct2-btn-shots em {
		font-style: normal;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 12px;
		color: var(--ink-3);
	}
	.ct2-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding-top: 10px;
		border-top: 1px dashed var(--line-strong);
		font-size: 13.5px;
	}
	.ct2-bar-l {
		font: 700 11.5px/1 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.ct2-bar-r {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.ct2-sug {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-height: 34px;
		padding: 0 10px;
		border-radius: 9px;
		border: 1px solid color-mix(in oklab, var(--g2) 40%, var(--line));
		background: color-mix(in oklab, var(--g2) 12%, transparent);
		color: var(--ink);
		font: 600 13px var(--f-body, inherit);
		cursor: pointer;
	}
	.ct2-sug :global(.ic) {
		width: 14px;
		height: 14px;
		color: var(--g2);
	}
	.ct2-bar-due {
		color: var(--g2);
		font-weight: 600;
	}
	.ct2-done {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-height: 34px;
		padding: 0 12px;
		border-radius: 0;
		border: 1px solid var(--ink);
		background: var(--ink);
		color: var(--bg);
		font: 700 13px var(--f-body, inherit);
		box-shadow: 2.5px 2.5px 0 var(--ok);
		cursor: pointer;
	}
	.ct2-done :global(.ic) {
		width: 14px;
		height: 14px;
	}
</style>
