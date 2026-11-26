<script lang="ts">
	import { onMount } from 'svelte';
	import type { Collab } from '../types';
	import { setChecklist, setStage, updateCollab } from '../studio.svelte';
	import { ask } from '../confirm.svelte';
	import { captionStarter } from '../suggest';
	import { timeLabel, timeOptions } from '../postTime';
	import { copyText, ui } from '../ui.svelte';
	import { CHECKLIST, checklistMissing, delivText, diff, hueOf, initials, latestDraft, relWord } from '../util';
	import DatePicker from './DatePicker.svelte';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';

	let { c, focus = false }: { c: Collab; focus?: boolean } = $props();

	const approved = $derived(latestDraft(c)?.status === 'approved' ? latestDraft(c)?.caption.trim() : '');
	const caption = $derived(approved || captionStarter(c, 'short'));
	const d = $derived(c.brief_details ?? {});
	const handle = $derived(c.brand.instagram ? `@${c.brand.instagram.replace(/^@/, '')}` : '');
	const promo = $derived(d.promo?.trim().split(/\s/)[0].toUpperCase() ?? '');
	let el = $state<HTMLElement>();
	let busy = $state(false);
	let expanded = $state(false);

	onMount(() => {
		if (focus) {
			expanded = true;
			setTimeout(() => el?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
		}
	});

	const missing = $derived(checklistMissing(c));
	async function posted() {
		if (
			missing.length &&
			!(await ask({
				title: 'Posting checklist not finished',
				body: `Still unticked: ${missing.join('; ')}. Indian ad rules need paid posts clearly marked.`,
				ok: 'Mark posted anyway',
				cancel: 'Go back'
			}))
		)
			return;
		busy = true;
		await setStage(c, 'live');
		busy = false;
	}

	const ticked = $derived(CHECKLIST.filter((x) => !!c.checklist?.[x.key]).length);
	const allTicked = $derived(ticked === CHECKLIST.length);
	const daysDiff = $derived(c.live_date ? diff(c.live_date) : null);
	const urgent = $derived(daysDiff !== null && daysDiff <= 1);
	const when = $derived(c.live_date ? relWord(diff(c.live_date)) : 'No date');
</script>

<article class="pc2" class:focus class:open={expanded} id="post-{c.code}" bind:this={el} style="--h: var(--m{hueOf(c.brand.name)})">
	<!-- Compact Header Row (scales cleanly for 4-5+ collabs) -->
	<div class="pc2-top">
		<button type="button" class="pc2-who" onclick={() => (ui.openCollab = c.id)}>
			<span class="pc2-tile">{initials(c.brand.name)}</span>
			<span class="pc2-id">
				<b>{c.brand.name}</b>
				<small>{delivText(c.deliverables)}{#if handle} · {handle}{/if}</small>
			</span>
		</button>
		<div class="pc2-right">
			<span class="pc2-when-pill" class:urgent>
				<b>{when}</b>
				{#if c.live_time}<small>{timeLabel(c.live_time)}</small>{/if}
			</span>
			<button
				type="button"
				class="pc2-tog"
				aria-expanded={expanded}
				aria-label={expanded ? 'Collapse posting checklist' : 'Expand posting checklist'}
				onclick={() => (expanded = !expanded)}
			>
				<Icon name="chevR" />
			</button>
		</div>
	</div>

	<!-- Compact Readiness Rail -->
	<button type="button" class="pc2-rail" onclick={() => (expanded = !expanded)}>
		<span class="pc2-seg" aria-hidden="true">
			{#each CHECKLIST as item, i (item.key)}<i class:on={i < ticked}></i>{/each}
		</span>
		<span class="pc2-rmeta">
			<b class:ok={allTicked}>{ticked}/{CHECKLIST.length} checks</b>
			<em class:ok={!!approved}>{approved ? 'Caption approved' : 'Brief caption'}</em>
		</span>
	</button>

	<!-- Compact Quick Action Bar (always visible) -->
	{#if !expanded}
		<div class="pc2-qacts">
			<button type="button" class="pc2-btn" onclick={() => copyText(caption, 'Caption copied. Paste it in Instagram')}>
				<Icon name="copy" /><span>Copy caption</span>
			</button>
			<button type="button" class="pc2-btn" onclick={() => (expanded = true)}>
				<Icon name="edit" /><span>Checklist</span>
			</button>
			<button type="button" class="pc2-neo sm" disabled={busy} onclick={posted}>
				{#if busy}<span class="spinner"></span>{:else}<Icon name="check" />{/if}
				<span>Posted</span>
			</button>
		</div>
	{/if}

	<!-- Expandable Full Posting Drawer -->
	{#if expanded}
		<div class="pc2-drawer">
			<div class="pc2-when">
				<DatePicker size="sm" ariaLabel="Go-live date" placeholder="Go-live date" value={c.live_date} onchange={(v) => updateCollab(c.id, { live_date: v || null })} />
				<Select size="sm" ariaLabel="Post at" placeholder="Time" value={c.live_time?.slice(0, 5) ?? undefined} options={timeOptions(c.live_time)} onchange={(v) => updateCollab(c.id, { live_time: v })} />
			</div>

			<section class="pc2-cap">
				<div class="pc2-eb">
					<span>Caption</span>
					<i class:ok={!!approved}>{approved ? 'Approved by brand' : 'From brief · not approved yet'}</i>
				</div>
				<p>{caption}</p>
				<div class="pc2-copy">
					<button type="button" class="pc2-neo sm" onclick={() => copyText(caption, 'Caption copied. Paste it in Instagram')}>
						<Icon name="copy" /><span>Copy caption</span>
					</button>
					{#if handle}<button type="button" class="pc2-btn" onclick={() => copyText(handle, `${handle} copied`)}>{handle}</button>{/if}
					{#if promo}<button type="button" class="pc2-btn" onclick={() => copyText(promo, 'Code copied')}>Code {promo}</button>{/if}
					{#if d.link}<button type="button" class="pc2-btn" onclick={() => copyText(d.link!, 'Link copied')}><Icon name="link" /><span>Link</span></button>{/if}
				</div>
			</section>

			<section class="pc2-check">
				<div class="pc2-eb">
					<span>Before you post</span>
					<b>{ticked} of {CHECKLIST.length}</b>
				</div>
				{#each CHECKLIST as item (item.key)}
					<label class="pc2-row" class:done={!!c.checklist?.[item.key]}>
						<input type="checkbox" checked={!!c.checklist?.[item.key]} onchange={(e) => setChecklist(c, { [item.key]: (e.currentTarget as HTMLInputElement).checked })} />
						<span class="pc2-box" aria-hidden="true"><Icon name="check" /></span>
						<span>{item.label}</span>
					</label>
				{/each}
			</section>

			<div class="pc2-foot">
				<button type="button" class="pc2-btn" onclick={() => (expanded = false)}>Collapse</button>
				<button type="button" class="pc2-neo go" disabled={busy} onclick={posted}>
					{#if busy}<span class="spinner"></span>{:else}<Icon name="check" />{/if}
					<span>I've posted it</span>
				</button>
			</div>
		</div>
	{/if}
</article>

<style>
	.pc2 {
		display: grid;
		gap: 11px;
		padding: 14px 15px;
		margin: 0 0 10px;
		border-radius: 18px;
		border: 1px solid rgba(156, 123, 255, 0.2);
		background:
			radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--h) 14%, transparent), transparent 60%),
			var(--paper, var(--surface));
		color: var(--ink);
		transition: border-color 0.18s ease;
	}
	.pc2.focus,
	.pc2.open {
		border-color: rgba(242, 90, 144, 0.36);
	}

	/* Compact Header */
	.pc2-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.pc2-who {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.pc2-tile {
		flex: none;
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		border-radius: 11px;
		background: color-mix(in oklab, var(--h) 24%, rgba(255, 255, 255, 0.06));
		border: 1px solid color-mix(in oklab, var(--h) 42%, rgba(255, 255, 255, 0.12));
		font-weight: 700;
		font-size: 13.5px;
		color: var(--ink);
	}
	.pc2-id {
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.pc2-id b {
		font: 400 22px/1.08 var(--f-serif, Georgia, serif);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--ink);
	}
	.pc2-id small {
		font-size: 12.5px;
		color: var(--ink-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.pc2-right {
		flex: none;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.pc2-when-pill {
		display: grid;
		justify-items: end;
		padding: 5px 9px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.09);
		background: rgba(255, 255, 255, 0.04);
	}
	.pc2-when-pill.urgent {
		border-color: rgba(242, 90, 144, 0.36);
		background: rgba(242, 90, 144, 0.12);
	}
	.pc2-when-pill b {
		font-size: 12.5px;
		font-weight: 700;
		text-transform: capitalize;
		color: var(--ink);
	}
	.pc2-when-pill.urgent b {
		color: #f79fc0;
	}
	.pc2-when-pill small {
		font-family: var(--mono);
		font-size: 10.5px;
		color: var(--ink-3);
	}
	.pc2-tog {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 9px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.04);
		color: var(--ink-2);
		cursor: pointer;
	}
	.pc2-tog :global(.ic) {
		width: 15px;
		height: 15px;
		transition: transform 0.18s ease;
	}
	.pc2.open .pc2-tog :global(.ic) {
		transform: rotate(90deg);
	}

	/* Compact Readiness Rail */
	.pc2-rail {
		display: grid;
		gap: 6px;
		padding: 0;
		border: 0;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}
	.pc2-seg {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 4px;
	}
	.pc2-seg i {
		height: 4px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.09);
		transition: background 0.25s ease;
	}
	.pc2-seg i.on {
		background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3));
	}
	.pc2-rmeta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-family: var(--mono);
		font-size: 11px;
	}
	.pc2-rmeta b {
		font-weight: 600;
		color: var(--ink-2);
	}
	.pc2-rmeta b.ok,
	.pc2-rmeta em.ok {
		color: #7ee8a5;
	}
	.pc2-rmeta em {
		font-style: normal;
		color: #ffc896;
	}

	/* Quick Action Bar (Collapsed) */
	.pc2-qacts {
		display: flex;
		align-items: center;
		gap: 7px;
		padding-top: 2px;
	}
	.pc2-qacts .pc2-neo {
		margin-left: auto;
	}

	/* Expandable Drawer */
	.pc2-drawer {
		display: grid;
		gap: 14px;
		padding-top: 12px;
		border-top: 1px dashed rgba(255, 255, 255, 0.12);
	}
	.pc2-when {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.pc2-eb {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-family: var(--mono);
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.pc2-eb i {
		font-style: normal;
		letter-spacing: 0.06em;
		color: #ffc896;
	}
	.pc2-eb i.ok {
		color: #7ee8a5;
	}
	.pc2-eb b {
		color: var(--ink-2);
	}

	.pc2-cap {
		display: grid;
		gap: 8px;
	}
	.pc2-cap p {
		margin: 0;
		padding: 12px 13px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.03);
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink);
		white-space: pre-wrap;
		max-height: 140px;
		overflow: auto;
	}
	.pc2-copy {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
	}

	.pc2-check {
		display: grid;
		gap: 4px;
	}
	.pc2-row {
		position: relative;
		display: grid;
		grid-template-columns: 22px minmax(0, 1fr);
		align-items: center;
		gap: 10px;
		padding: 8px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		font-size: 14px;
		line-height: 1.35;
		color: var(--ink);
		cursor: pointer;
	}
	.pc2-row:last-of-type {
		border-bottom: 0;
	}
	.pc2-row input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.pc2-box {
		width: 20px;
		height: 20px;
		display: grid;
		place-items: center;
		border-radius: 5px;
		border: 1.5px solid rgba(255, 255, 255, 0.24);
		color: transparent;
		transition: background 0.18s ease, border-color 0.18s ease;
	}
	.pc2-box :global(.ic) {
		width: 13px;
		height: 13px;
		stroke-width: 3;
	}
	.pc2-row.done .pc2-box {
		border-color: transparent;
		background: linear-gradient(135deg, var(--g1), var(--g2));
		color: #fff;
	}
	.pc2-row.done > span:last-child {
		color: var(--ink-3);
		text-decoration: line-through;
	}

	.pc2-foot {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-top: 2px;
	}
	.pc2-foot .pc2-neo.go {
		flex: 1;
	}

	/* Buttons */
	.pc2-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 36px;
		padding: 0 11px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.04);
		color: var(--ink);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.pc2-btn :global(.ic) {
		width: 14px;
		height: 14px;
	}
	.pc2-neo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		height: 42px;
		padding: 0 15px;
		border: 0;
		border-radius: 0;
		background: var(--ink);
		color: var(--bg);
		font: 700 13.5px/1 var(--f-sans, inherit);
		box-shadow: 3px 3px 0 var(--g2);
		cursor: pointer;
	}
	.pc2-neo.sm {
		height: 36px;
		padding: 0 13px;
		font-size: 13px;
	}
	.pc2-neo.go {
		background: linear-gradient(110deg, var(--g1), var(--g2) 55%, var(--g3));
		color: #fff;
		box-shadow: 3px 3px 0 #5c3ea0;
	}
	.pc2-neo:disabled {
		opacity: 0.6;
	}
	.pc2-neo :global(.ic) {
		width: 14px;
		height: 14px;
	}
</style>
