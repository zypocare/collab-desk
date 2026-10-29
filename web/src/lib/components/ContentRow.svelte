<script lang="ts">
	import { ask } from '../confirm.svelte';
	import type { Collab } from '../types';
	import { hoursLeft, makeShotList, suggestShoot, type Shot } from '../content';
	import { studio, updateCollab } from '../studio.svelte';
	import { copyText, toast, ui } from '../ui.svelte';
	import { delivText, diff, fmt, relWord } from '../util';
	import DatePicker from './DatePicker.svelte';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';
	import ScriptSheet from './ScriptSheet.svelte';

	// One collab in her content plan: what's left to make, when she shoots it, and its shot list.
	let { c, plan = false }: { c: Collab; plan?: boolean } = $props();

	let open = $state(false);
	let scriptOpen = $state(false);
	let adding = $state('');
	const owed = $derived(c.deliverables.filter((d) => !d.done));
	const hours = $derived(hoursLeft(c, studio.settings));
	const shots = $derived(c.shot_list ?? []);
	const doneShots = $derived(shots.filter((x) => x.done).length);
	const sug = $derived(suggestShoot(c));
	// The draft's date in words: "in 3 days" when it's close, the date itself when it's far off, and a warning when
	// it falls after the go-live date (a mistyped year, usually).
	const draftAfterLive = $derived(!!c.draft_date && !!c.live_date && c.draft_date > c.live_date);
	const draftWhen = $derived.by(() => {
		if (!c.draft_date) return '';
		const n = diff(c.draft_date);
		if (Math.abs(n) <= 30) return relWord(n);
		const y = c.draft_date.slice(0, 4);
		return `${fmt(c.draft_date)}${y !== String(new Date().getFullYear()) ? ` ${y}` : ''}`;
	});

	const save = (list: Shot[]) => updateCollab(c.id, { shot_list: list });
	function addShot(e: SubmitEvent) {
		e.preventDefault();
		if (!adding.trim()) return;
		save([...shots, { t: adding.trim(), done: false }]);
		adding = '';
	}
</script>

{#if scriptOpen}<ScriptSheet {c} onclose={() => (scriptOpen = false)} />{/if}

<div class="ct-row" class:open>
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
		<button class="btn sm ct-shots" aria-expanded={open} onclick={() => (open = !open)}>
			<Icon name="layers" /><span class="ct-shots-t">Shot list{#if shots.length}<em>{doneShots} of {shots.length}</em>{/if}</span><Icon name={open ? 'chevU' : 'chevD'} />
		</button>
	</div>
	{#if open}
		<div class="ct-list">
			{#if !shots.length}
				<p class="hint">Make a shot list from the brief: every shot for {delivText(c.deliverables)}, what to say, what to avoid and who to tag.</p>
				<button class="btn sm grad" onclick={() => save(makeShotList(c))}><Icon name="spark" />Make from the brief</button>
			{:else}
				<div class="ct-prog" aria-hidden="true"><i style="width:{(doneShots / shots.length) * 100}%"></i></div>
				{#each shots as s, i (i)}
					<label class="shot" class:done={s.done}>
						<input type="checkbox" checked={s.done} onchange={(e) => save(shots.map((x, j) => (j === i ? { ...x, done: (e.currentTarget as HTMLInputElement).checked } : x)))} />
						<span>{s.t}</span>
						<button class="shot-x" aria-label="Remove" onclick={(e) => (e.preventDefault(), save(shots.filter((_, j) => j !== i)))}><Icon name="x" /></button>
					</label>
				{/each}
				<form class="shot-add" onsubmit={addShot}>
					<label class="sr" for="shot-add-{c.id}">Add a shot or note</label>
					<input id="shot-add-{c.id}" placeholder="Add a shot or note" bind:value={adding} />
					<button type="submit" disabled={!adding.trim()} aria-label="Add"><Icon name="plus" /></button>
				</form>
				<div class="ct-links">
					<button onclick={() => copyText(`${c.brand.name} shot list\n` + shots.map((x) => `${x.done ? '☑' : '☐'} ${x.t}`).join('\n'), 'Shot list copied')}><Icon name="copy" />Copy list</button>
					<button onclick={async () => (await ask({ title: 'Start the shot list over?', body: 'A fresh list is made from the brief. Your ticks and edits are replaced.', ok: 'Start over', danger: true })) && save(makeShotList(c))}><Icon name="refresh" />Start over</button>
				</div>
			{/if}
		</div>
	{/if}
	{#if !c.shot_at && c.shoot_date && diff(c.shoot_date) <= 0 && ['confirmed', 'creating'].includes(c.stage)}
		<!-- The shoot day has come: once it's shot, editing is next (and it stops showing as late on Today). -->
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
			<DatePicker size="sm" ariaLabel="Shoot day for {c.brand.name}" placeholder={c.shoot_date ? "Pick a shoot day" : "Another day"} value={c.shoot_date} onchange={(v) => updateCollab(c.id, { shoot_date: v || null })} />
		</div>
	{/if}
</div>

<style>
	/* The shot list: a thin progress bar, then rows with a round tick, plain text and a quiet remove. */
	.ct-list { display: flex; flex-direction: column; }
	.ct-prog { height: 4px; margin: 2px 0 6px; border-radius: 4px; background: var(--line); overflow: hidden; }
	.ct-prog i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3)); transition: width .4s; }
	.ct-list .shot { display: flex; align-items: flex-start; gap: 12px; margin: 0; padding: 11px 0; border-top: 1px solid var(--line); font: inherit; letter-spacing: 0; text-transform: none; color: var(--ink); cursor: pointer; }
	.ct-prog + .shot { border-top: 0; }
	.shot input { appearance: none; -webkit-appearance: none; flex: none; width: 22px; height: 22px; margin: 0; border: 1.5px solid var(--line-strong); border-radius: 50%; background: transparent; display: grid; place-items: center; cursor: pointer; transition: background .2s, border-color .2s; }
	.shot input:checked { border-color: var(--ok); background: var(--ok); }
	.shot input:checked::after { content: ''; width: 9px; height: 5px; margin-top: -2px; border-left: 2px solid var(--bg); border-bottom: 2px solid var(--bg); transform: rotate(-45deg); }
	.shot input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	.shot > span { flex: 1; min-width: 0; padding-top: 1px; font-size: 15px; font-weight: 400; line-height: 1.45; color: var(--ink); overflow-wrap: anywhere; }
	.shot.done > span { color: var(--ink-3); text-decoration: line-through; }
	.ct-list .shot-x { flex: none; width: 30px; height: 30px; margin: -4px -6px 0 0; padding: 0; display: grid; place-items: center; border: 0; border-radius: 50%; background: none; color: var(--ink-3); opacity: .6; cursor: pointer; }
	.ct-list .shot-x:hover { opacity: 1; }
	.shot-x :global(.ic) { width: 14px; height: 14px; }
	.ct-list .shot-add { display: flex; align-items: center; gap: 8px; margin-top: 8px; padding: 4px 4px 4px 16px; border: 1px solid var(--line-strong); border-radius: 999px; background: transparent; }
	.shot-add:focus-within { border-color: var(--ink); }
	.shot-add input { flex: 1; min-width: 0; height: 36px; padding: 0; border: 0; outline: 0; background: none; color: var(--ink); font: inherit; font-size: 15px; }
	.shot-add input::placeholder { color: var(--ink-3); }
	.shot-add button { flex: none; width: 36px; height: 36px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--ink); color: var(--bg); cursor: pointer; transition: opacity .2s; }
	.shot-add button:disabled { opacity: .25; cursor: default; }
	.shot-add button :global(.ic) { width: 18px; height: 18px; }
	.ct-links { display: flex; flex-wrap: wrap; gap: 4px 20px; padding-top: 8px; }
	.ct-links button { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0; border: 0; background: none; color: var(--ink-2); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; }
	.ct-links button:hover { color: var(--ink); }
	.ct-links button :global(.ic) { width: 15px; height: 15px; }
	/* Draft after go-live: say so under the chips, and the tap opens the collab to fix it. */
	.ct-warn { display: flex; align-items: center; gap: 6px; margin-top: 8px; padding: 0; border: 0; background: none; color: var(--bad); font: inherit; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; }
	.ct-warn :global(.ic) { flex: none; width: 15px; height: 15px; }
	/* The shot-list button: its count sits under the label, and a chevron says it opens. */
	.ct-shots-t { display: inline-flex; align-items: baseline; gap: 6px; }
	.ct-shots-t em { font-style: normal; font-size: .86em; font-weight: 500; opacity: .7; }
</style>
