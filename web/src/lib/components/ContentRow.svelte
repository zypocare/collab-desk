<script lang="ts">
	import { ask } from '../confirm.svelte';
	import type { Collab } from '../types';
	import { hoursLeft, makeShotList, suggestShoot, type Shot } from '../content';
	import { studio, updateCollab } from '../studio.svelte';
	import { copyText, ui } from '../ui.svelte';
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
				{#if c.draft_date}<span class:late={diff(c.draft_date) < 0}><Icon name="film" />Draft {relWord(diff(c.draft_date))}</span>{/if}
				{#if c.live_date}<span><Icon name="spark" />Live {fmt(c.live_date)}</span>{/if}
				{#if c.product_received_at}<span class="ok"><Icon name="box" />Product here</span>{/if}
			</div>
		</div>
		<button class="btn sm ai-btn ct-script" onclick={() => (scriptOpen = true)} title="A ready-to-shoot script from the brief"><Icon name="spark" />{c.script ? 'Script' : 'Write script'}</button>
		<button class="btn sm ct-shots" aria-expanded={open} onclick={() => (open = !open)}>
			<Icon name="layers" />{shots.length ? `${doneShots}/${shots.length}` : 'Shot list'}
		</button>
	</div>
	{#if plan}
		<div class="ct-plan">
			{#if !c.shoot_date}
				<button class="btn sm" onclick={() => updateCollab(c.id, { shoot_date: sug })}><Icon name="cal" />Shoot {fmt(sug)}</button>
				<span class="hint">or</span>
			{/if}
			<DatePicker size="sm" ariaLabel="Shoot day for {c.brand.name}" placeholder="Pick a shoot day" value={c.shoot_date} onchange={(v) => updateCollab(c.id, { shoot_date: v || null })} />
		</div>
	{/if}
	{#if open}
		<div class="ct-list">
			{#if !shots.length}
				<p class="hint">Make a shot list from the brief: every shot for {delivText(c.deliverables)}, what to say, what to avoid and who to tag.</p>
				<button class="btn sm grad" onclick={() => save(makeShotList(c))}><Icon name="spark" />Make from the brief</button>
			{:else}
				{#each shots as s, i (i)}
					<label class="shot" class:done={s.done}>
						<input type="checkbox" class="cbx" checked={s.done} onchange={(e) => save(shots.map((x, j) => (j === i ? { ...x, done: (e.currentTarget as HTMLInputElement).checked } : x)))} />
						<span>{s.t}</span>
						<button class="shot-x" aria-label="Remove" onclick={(e) => (e.preventDefault(), save(shots.filter((_, j) => j !== i)))}><Icon name="x" /></button>
					</label>
				{/each}
				<form class="shot-add" onsubmit={addShot}>
					<input class="inp sm" placeholder="Add a shot or note" bind:value={adding} />
					<button class="btn sm" type="submit" disabled={!adding.trim()}><Icon name="plus" />Add</button>
				</form>
				<div class="row-btns" style="border:0;padding:8px 0 0">
					<button class="btn sm" onclick={() => copyText(`${c.brand.name} shot list\n` + shots.map((x) => `${x.done ? '☑' : '☐'} ${x.t}`).join('\n'), 'Shot list copied')}><Icon name="copy" />Copy</button>
					<button class="btn sm ghost" onclick={async () => (await ask({ title: 'Start the shot list over?', body: 'A fresh list is made from the brief. Your ticks and edits are replaced.', ok: 'Start over', danger: true })) && save(makeShotList(c))}><Icon name="refresh" />Start over</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
