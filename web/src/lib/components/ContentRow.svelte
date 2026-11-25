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
	const draftWhen = $derived.by(() => {
		if (!c.draft_date) return '';
		const n = diff(c.draft_date);
		if (Math.abs(n) <= 30) return relWord(n);
		const y = c.draft_date.slice(0, 4);
		return `${fmt(c.draft_date)}${y !== String(new Date().getFullYear()) ? ` ${y}` : ''}`;
	});
</script>

{#if scriptOpen}<ScriptSheet {c} onclose={() => (scriptOpen = false)} />{/if}

<div class="ct-row">
	<div class="ct-main">
		<Mono name={c.brand.name} size="sm" />
		<div class="ct-t">
			<button class="ct-name" onclick={() => (ui.openCollab = c.id)}>{c.brand.name}</button>
			<small>{delivText(owed.length ? owed : c.deliverables)}{hours ? ` · about ${hours} h` : ''}</small>
			<div class="ct-meta">
				{#if c.draft_date}<span class:late={diff(c.draft_date) < 0 || draftAfterLive}><Icon name="film" />Draft {draftWhen}</span>{/if}
				{#if c.live_date}<span><Icon name="spark" />Live {fmt(c.live_date)}</span>{/if}
				{#if c.product_received_at}<span class="ok"><Icon name="box" />Product here</span>{/if}
				{#if c.shot_at}<span class="ok"><Icon name="check" />Shot · editing</span>{/if}
			</div>
			{#if draftAfterLive}<button class="ct-warn" onclick={() => (ui.openCollab = c.id)}><Icon name="alert" />The draft is due after it goes live. Fix the dates</button>{/if}
		</div>
		<button class="btn sm ai-btn ct-script" onclick={() => (scriptOpen = true)} title="A ready-to-shoot script from the brief"><Icon name="spark" />{c.script ? 'Script' : 'Write script'}</button>
		<a class="btn sm ct-shots" href="/studio/content/{c.code}/shots">
			<Icon name="layers" /><span class="ct-shots-t">Shot list{#if shots.length}<em>{doneShots} of {shots.length}</em>{/if}</span><Icon name="chevR" />
		</a>
	</div>

	{#if !c.shot_at && c.shoot_date && diff(c.shoot_date) <= 0 && ['confirmed', 'creating'].includes(c.stage)}
		<div class="ct-plan">
			<span class="ct-plan-l">{diff(c.shoot_date) === 0 ? 'Shooting today' : `Shoot was ${fmt(c.shoot_date)}`}</span>
			<button class="btn sm primary" onclick={async () => (await updateCollab(c.id, { shot_at: new Date().toISOString() }), toast('Shoot done. Next: edit and send the draft', 'film'))}><Icon name="check" />Shoot done</button>
		</div>
	{/if}
	{#if plan}
		<div class="ct-plan">
			<span class="ct-plan-l">Shoot day</span>
			{#if !c.shoot_date}
				<button class="btn sm" onclick={() => updateCollab(c.id, { shoot_date: sug })}><Icon name="cal" />Shoot {fmt(sug)}</button>
				<span class="hint">or</span>
			{/if}
			<DatePicker size="sm" ariaLabel="Shoot day for {c.brand.name}" placeholder={c.shoot_date ? 'Pick a shoot day' : 'Another day'} value={c.shoot_date} onchange={(v) => updateCollab(c.id, { shoot_date: v || null })} />
		</div>
	{/if}
</div>

<style>
	.ct-warn {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 8px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--bad);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}
	.ct-warn :global(.ic) {
		flex: none;
		width: 15px;
		height: 15px;
	}
	.ct-shots-t {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
	}
	.ct-shots-t em {
		font-style: normal;
		font-size: 0.86em;
		font-weight: 500;
		opacity: 0.7;
	}
</style>
