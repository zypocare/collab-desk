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

	// One collab in her content plan: editorial production card with timeline rail, shot progress, and quick actions.
	let { c, plan = false }: { c: Collab; plan?: boolean } = $props();

	let scriptOpen = $state(false);
	const owed = $derived(c.deliverables.filter((d) => !d.done));
	const hours = $derived(hoursLeft(c, studio.settings));
	const shots = $derived(c.shot_list ?? []);
	const doneShots = $derived(shots.filter((x) => x.done).length);
	const shotPct = $derived(shots.length ? Math.round((doneShots / shots.length) * 100) : 0);
	const sug = $derived(suggestShoot(c));

	const draftAfterLive = $derived(!!c.draft_date && !!c.live_date && c.draft_date > c.live_date);
	const draftLate = $derived(!!c.draft_date && (diff(c.draft_date) < 0 || draftAfterLive));
	const draftWhen = $derived.by(() => {
		if (!c.draft_date) return 'Not set';
		const n = diff(c.draft_date);
		if (Math.abs(n) <= 30) return relWord(n);
		const y = c.draft_date.slice(0, 4);
		return `${fmt(c.draft_date)}${y !== String(new Date().getFullYear()) ? ` ${y}` : ''}`;
	});
	const shootDue = $derived(!c.shot_at && !!c.shoot_date && diff(c.shoot_date) <= 0 && ['confirmed', 'creating'].includes(c.stage));
</script>

{#if scriptOpen}<ScriptSheet {c} onclose={() => (scriptOpen = false)} />{/if}

<article class="ct3-card" class:is-shot={!!c.shot_at} class:is-due={shootDue}>
	<!-- Editorial Brand Header -->
	<div class="ct3-top">
		<Mono name={c.brand.name} size="sm" />
		<div class="ct3-id">
			<button type="button" class="ct3-name" onclick={() => (ui.openCollab = c.id)}>{c.brand.name}</button>
			<div class="ct3-sub">
				<span>{delivText(owed.length ? owed : c.deliverables)}</span>
				{#if hours}<i>·</i><span>~{hours}h</span>{/if}
				{#if c.product_received_at}<i>·</i><span class="ct3-ok">Product in hand</span>{/if}
			</div>
		</div>
		{#if c.shot_at}
			<span class="ct3-pill ok"><Icon name="check" />Editing</span>
		{:else if shootDue}
			<span class="ct3-pill due">{diff(c.shoot_date!) === 0 ? 'Shoot today' : 'Missed'}</span>
		{:else if !c.shoot_date}
			<span class="ct3-pill plan">Unplanned</span>
		{/if}
	</div>

	{#if draftAfterLive}
		<button type="button" class="ct3-warn" onclick={() => (ui.openCollab = c.id)}>
			<Icon name="alert" /><span>Draft date is after live date — tap to fix</span>
		</button>
	{/if}

	<!-- Structured 3-Cell Production Timeline Rail -->
	<div class="ct3-rail">
		<div class="ct3-cell">
			<small>Draft due</small>
			<b class:late={draftLate} class:muted={!c.draft_date}>{draftWhen}</b>
		</div>
		<div class="ct3-cell">
			<small>Goes live</small>
			<b class:muted={!c.live_date}>{c.live_date ? fmt(c.live_date) : 'Not set'}</b>
		</div>
		<div class="ct3-cell">
			<small>Shots</small>
			<b>{shots.length ? `${doneShots} of ${shots.length}` : 'Not built'}</b>
		</div>
	</div>

	{#if shots.length}
		<div class="ct3-prog" aria-label="Shot list progress: {doneShots} of {shots.length}">
			<i style="width:{shotPct}%"></i>
		</div>
	{/if}

	<!-- Split Action Row -->
	<div class="ct3-acts">
		<button type="button" class="ct3-btn ct3-btn-ai" onclick={() => (scriptOpen = true)} title="A ready-to-shoot script from the brief">
			<Icon name="spark" /><span>{c.script ? 'Open script' : 'Write script'}</span>
		</button>
		<a class="ct3-btn ct3-btn-shots" href="/studio/content/{c.code}/shots">
			<Icon name="layers" />
			<span>Shot list</span>
			{#if shots.length}<em class="ct3-cnt">{doneShots}/{shots.length}</em>{/if}
			<Icon name="chevR" />
		</a>
	</div>

	<!-- Shoot Day Footer / Action -->
	{#if shootDue || plan}
		<div class="ct3-foot">
			{#if shootDue}
				<span class="ct3-due-txt">{diff(c.shoot_date!) === 0 ? 'Scheduled today' : `Planned for ${fmt(c.shoot_date)}`}</span>
				<button
					type="button"
					class="ct3-neo"
					onclick={async () => {
						await updateCollab(c.id, { shot_at: new Date().toISOString() });
						toast('Shoot done. Next: edit and send the draft', 'film');
					}}
				>
					<Icon name="check" /><span>Mark shot</span>
				</button>
			{:else if plan}
				<span class="ct3-fl">Shoot day</span>
				<div class="ct3-fr">
					{#if !c.shoot_date}
						<button type="button" class="ct3-sug" onclick={() => updateCollab(c.id, { shoot_date: sug })}>
							<Icon name="cal" /><span>{fmt(sug)}</span>
						</button>
					{/if}
					<DatePicker
						size="sm"
						ariaLabel="Shoot day for {c.brand.name}"
						placeholder={c.shoot_date ? 'Change day' : 'Pick day'}
						value={c.shoot_date}
						onchange={(v) => updateCollab(c.id, { shoot_date: v || null })}
					/>
				</div>
			{/if}
		</div>
	{/if}
</article>

<style>
	.ct3-card {
		position: relative;
		background:
			radial-gradient(220px 110px at 100% 0%, color-mix(in oklab, var(--g1) 11%, transparent), transparent 70%),
			var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: 20px;
		padding: 15px;
		display: grid;
		gap: 12px;
		margin-bottom: 11px;
		overflow: hidden;
	}
	.ct3-card.is-shot {
		background:
			radial-gradient(220px 110px at 100% 0%, color-mix(in oklab, var(--ok) 11%, transparent), transparent 70%),
			var(--surface);
	}
	.ct3-card.is-due {
		background:
			radial-gradient(220px 110px at 100% 0%, color-mix(in oklab, var(--g2) 14%, transparent), transparent 70%),
			var(--surface);
		border-color: color-mix(in oklab, var(--g2) 38%, var(--line-strong));
	}
	.ct3-top {
		display: flex;
		align-items: center;
		gap: 11px;
		min-width: 0;
	}
	.ct3-top :global(.mono) {
		flex: none;
	}
	.ct3-id {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.ct3-name {
		border: 0;
		background: none;
		padding: 0;
		text-align: left;
		font: 400 22px/1.12 var(--f-serif, Georgia, serif);
		color: var(--ink);
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ct3-sub {
		display: flex;
		align-items: center;
		gap: 5px;
		flex-wrap: wrap;
		font-size: 13px;
		color: var(--ink-3);
	}
	.ct3-sub i {
		font-style: normal;
		opacity: 0.55;
	}
	.ct3-ok {
		color: var(--ok);
		font-weight: 500;
	}
	.ct3-pill {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border-radius: 99px;
		font: 700 10.5px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.ct3-pill :global(.ic) {
		width: 12px;
		height: 12px;
	}
	.ct3-pill.ok {
		color: var(--ok);
		background: color-mix(in oklab, var(--ok) 13%, transparent);
		border: 1px solid color-mix(in oklab, var(--ok) 30%, var(--line));
	}
	.ct3-pill.due {
		color: var(--g2);
		background: color-mix(in oklab, var(--g2) 14%, transparent);
		border: 1px solid color-mix(in oklab, var(--g2) 34%, var(--line));
	}
	.ct3-pill.plan {
		color: var(--g1);
		background: color-mix(in oklab, var(--g1) 14%, transparent);
		border: 1px solid color-mix(in oklab, var(--g1) 34%, var(--line));
	}
	.ct3-warn {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 8px 11px;
		border-radius: 11px;
		border: 1px solid color-mix(in oklab, var(--bad) 36%, var(--line));
		background: color-mix(in oklab, var(--bad) 10%, transparent);
		color: var(--bad);
		font: 600 13px/1.35 var(--f-body, inherit);
		text-align: left;
		cursor: pointer;
	}
	.ct3-warn :global(.ic) {
		width: 15px;
		height: 15px;
		flex: none;
	}
	.ct3-rail {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1px;
		border-radius: 13px;
		overflow: hidden;
		background: var(--line);
		border: 1px solid var(--line);
	}
	.ct3-cell {
		background: var(--surface-2);
		padding: 9px 10px;
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.ct3-cell small {
		font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.ct3-cell b {
		font-size: 13.5px;
		font-weight: 600;
		color: var(--ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ct3-cell b.late {
		color: var(--bad);
	}
	.ct3-cell b.muted {
		color: var(--ink-3);
		font-weight: 500;
	}
	.ct3-prog {
		height: 4px;
		border-radius: 99px;
		background: var(--surface-2);
		overflow: hidden;
		margin-top: -4px;
	}
	.ct3-prog i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--grad);
	}
	.ct3-acts {
		display: grid;
		grid-template-columns: 1fr 1.15fr;
		gap: 8px;
	}
	.ct3-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 40px;
		padding: 0 12px;
		border-radius: 11px;
		font: 600 13.5px/1 var(--f-body, inherit);
		text-decoration: none;
		cursor: pointer;
	}
	.ct3-btn :global(.ic) {
		width: 15px;
		height: 15px;
		flex: none;
	}
	.ct3-btn-ai {
		border: 1px solid color-mix(in oklab, var(--g1) 42%, var(--line));
		background: color-mix(in oklab, var(--g1) 12%, var(--surface-2));
		color: var(--ink);
	}
	.ct3-btn-ai :global(.ic) {
		color: var(--g1);
	}
	.ct3-btn-shots {
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		color: var(--ink);
		justify-content: flex-start;
	}
	.ct3-btn-shots span {
		flex: 1;
	}
	.ct3-cnt {
		font-style: normal;
		padding: 2px 7px;
		border-radius: 99px;
		background: var(--surface);
		border: 1px solid var(--line);
		font: 600 11.5px/1.2 var(--f-mono, ui-monospace, monospace);
		color: var(--ink-2);
	}
	.ct3-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding-top: 10px;
		border-top: 1px dashed var(--line-strong);
	}
	.ct3-fl {
		font: 700 11px/1 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.ct3-fr {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.ct3-sug {
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
	.ct3-sug :global(.ic) {
		width: 14px;
		height: 14px;
		color: var(--g2);
	}
	.ct3-due-txt {
		font-size: 13px;
		font-weight: 600;
		color: var(--g2);
	}
	.ct3-neo {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-height: 36px;
		padding: 0 13px;
		border-radius: 0;
		border: 1px solid var(--ink);
		background: var(--ink);
		color: var(--bg);
		font: 700 13px var(--f-body, inherit);
		box-shadow: 2.5px 2.5px 0 var(--ok);
		cursor: pointer;
	}
	.ct3-neo :global(.ic) {
		width: 14px;
		height: 14px;
	}
</style>
