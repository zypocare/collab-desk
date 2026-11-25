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
	const pct = $derived(shots.length ? Math.round((doneShots / shots.length) * 100) : 0);
	const sug = $derived(suggestShoot(c));

	const draftAfterLive = $derived(!!c.draft_date && !!c.live_date && c.draft_date > c.live_date);
	const draftWhen = $derived.by(() => {
		if (!c.draft_date) return '';
		const n = diff(c.draft_date);
		if (Math.abs(n) <= 30) return relWord(n);
		const y = c.draft_date.slice(0, 4);
		return `${fmt(c.draft_date)}${y !== String(new Date().getFullYear()) ? ` ${y}` : ''}`;
	});

	type ParsedShot = { time: string; visual: string; spoken: string };

	// Parses strings like: `0-3s · Creator holding a gift hamper (say: "I'm so excited...")`
	// into structured timecode, visual shot direction, and spoken line while keeping plain notes intact.
	function parseShot(raw: string): ParsedShot {
		let rest = raw.trim();
		let time = '';
		let spoken = '';

		const timeMatch = rest.match(/^(\d+\s*[-–]\s*\d+\s*s|\d+\s*s)\s*[·:\-–—]\s*/i);
		if (timeMatch) {
			time = timeMatch[1].replace(/\s+/g, '').replace('-', '–');
			rest = rest.slice(timeMatch[0].length).trim();
		}

		const sayParen = rest.match(/\s*\(\s*say\s*:\s*["“]?([\s\S]*?)["”]?\s*\)\s*$/i);
		if (sayParen) {
			spoken = sayParen[1].trim();
			rest = rest.slice(0, sayParen.index).trim();
		} else {
			const sayInline = rest.match(/\s*[·—-]\s*say\s*:\s*["“]?([\s\S]*?)["”]?\s*$/i);
			if (sayInline) {
				spoken = sayInline[1].trim();
				rest = rest.slice(0, sayInline.index).trim();
			}
		}

		return { time, visual: rest || raw.trim(), spoken };
	}

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
				<div class="ct-empty">
					<p class="hint">Make a storyboard shot list from the brief: every shot for {delivText(c.deliverables)}, what to say, and what to frame.</p>
					<button class="btn sm grad" onclick={() => save(makeShotList(c))}><Icon name="spark" />Make from the brief</button>
				</div>
			{:else}
				<div class="ct-prog-wrap">
					<div class="ct-prog-hd">
						<span class="ct-prog-lbl">Shoot storyboard</span>
						<span class="ct-prog-stat">{doneShots} of {shots.length} filmed · {pct}%</span>
					</div>
					<div class="ct-prog" aria-hidden="true"><i style="width:{pct}%"></i></div>
				</div>

				<div class="shot-deck">
					{#each shots as s, i (i)}
						{@const ps = parseShot(s.t)}
						<div class="shot-card" class:done={s.done}>
							<label class="shot-check" aria-label="Mark shot {i + 1} filmed">
								<input
									type="checkbox"
									checked={s.done}
									onchange={(e) => save(shots.map((x, j) => (j === i ? { ...x, done: (e.currentTarget as HTMLInputElement).checked } : x)))}
								/>
							</label>

							<div class="shot-body">
								<div class="shot-top">
									<span class="shot-num">SHOT {String(i + 1).padStart(2, '0')}</span>
									{#if ps.time}<span class="shot-time">{ps.time}</span>{/if}
									<button
										class="shot-x"
										type="button"
										aria-label="Remove shot"
										onclick={() => save(shots.filter((_, j) => j !== i))}
									>
										<Icon name="x" />
									</button>
								</div>

								<p class="shot-vis">{ps.visual}</p>

								{#if ps.spoken}
									<div class="shot-say">
										<span class="shot-say-ic"><Icon name="mic" /></span>
										<span>“{ps.spoken}”</span>
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>

				<form class="shot-add" onsubmit={addShot}>
					<label class="sr" for="shot-add-{c.id}">Add a shot or note</label>
					<input id="shot-add-{c.id}" placeholder="Add a shot (e.g. 22–26s · Close-up product)" bind:value={adding} />
					<button type="submit" disabled={!adding.trim()} aria-label="Add"><Icon name="plus" /></button>
				</form>

				<div class="ct-links">
					<button type="button" onclick={() => copyText(`${c.brand.name} shot list\n` + shots.map((x) => `${x.done ? '☑' : '☐'} ${x.t}`).join('\n'), 'Shot list copied')}><Icon name="copy" />Copy list</button>
					<button type="button" onclick={async () => (await ask({ title: 'Start the shot list over?', body: 'A fresh list is made from the brief. Your ticks and edits are replaced.', ok: 'Start over', danger: true })) && save(makeShotList(c))}><Icon name="refresh" />Start over</button>
				</div>
			{/if}
		</div>
	{/if}

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
	.ct-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-top: 6px;
	}
	.ct-empty {
		display: grid;
		gap: 10px;
		justify-items: start;
		padding: 14px;
		border-radius: 14px;
		border: 1px dashed var(--line-strong);
		background: var(--surface-2, var(--surface));
	}
	.ct-prog-wrap {
		display: grid;
		gap: 6px;
	}
	.ct-prog-hd {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}
	.ct-prog-lbl {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.ct-prog-stat {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 11.5px;
		font-weight: 600;
		color: var(--ink-2);
		font-variant-numeric: tabular-nums;
	}
	.ct-prog {
		height: 5px;
		border-radius: 99px;
		background: var(--line);
		overflow: hidden;
	}
	.ct-prog i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3));
		transition: width 0.35s ease;
	}

	.shot-deck {
		display: grid;
		gap: 10px;
	}
	.shot-card {
		display: grid;
		grid-template-columns: 26px minmax(0, 1fr);
		gap: 11px;
		align-items: start;
		padding: 12px 13px;
		border-radius: 15px;
		border: 1px solid var(--line);
		background: linear-gradient(180deg, color-mix(in oklab, var(--surface-2) 92%, var(--g1) 4%), var(--surface));
		transition: border-color 0.2s, opacity 0.2s, background 0.2s;
	}
	.shot-card.done {
		border-color: color-mix(in oklab, var(--ok) 35%, var(--line));
		background: color-mix(in oklab, var(--ok) 5%, var(--surface));
		opacity: 0.72;
	}
	.shot-check {
		display: grid;
		place-items: center;
		padding-top: 2px;
		cursor: pointer;
	}
	.shot-check input {
		appearance: none;
		-webkit-appearance: none;
		width: 22px;
		height: 22px;
		margin: 0;
		border: 1.5px solid var(--line-strong);
		border-radius: 50%;
		background: var(--surface);
		display: grid;
		place-items: center;
		cursor: pointer;
		transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
	}
	.shot-check input:checked {
		border-color: var(--ok);
		background: var(--ok);
		box-shadow: 0 0 12px color-mix(in oklab, var(--ok) 45%, transparent);
	}
	.shot-check input:checked::after {
		content: '';
		width: 9px;
		height: 5px;
		margin-top: -2px;
		border-left: 2px solid var(--bg);
		border-bottom: 2px solid var(--bg);
		transform: rotate(-45deg);
	}
	.shot-check input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.shot-body {
		min-width: 0;
		display: grid;
		gap: 7px;
	}
	.shot-top {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.shot-num {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--ink-3);
	}
	.shot-time {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 11px;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 99px;
		color: var(--g1);
		background: color-mix(in oklab, var(--g1) 14%, var(--surface));
		border: 1px solid color-mix(in oklab, var(--g1) 34%, var(--line));
	}
	.shot-x {
		margin-left: auto;
		width: 26px;
		height: 26px;
		padding: 0;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--ink-3);
		opacity: 0.55;
		cursor: pointer;
	}
	.shot-x:hover {
		opacity: 1;
		background: var(--surface-2);
	}
	.shot-x :global(.ic) {
		width: 13px;
		height: 13px;
	}

	.shot-vis {
		margin: 0;
		font-size: 14.5px;
		font-weight: 600;
		line-height: 1.4;
		color: var(--ink);
		overflow-wrap: anywhere;
	}
	.shot-card.done .shot-vis {
		color: var(--ink-3);
		text-decoration: line-through;
	}

	.shot-say {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 10px;
		background: color-mix(in oklab, var(--g2) 8%, var(--surface-2));
		border: 1px solid color-mix(in oklab, var(--g2) 24%, var(--line));
		font-size: 13px;
		line-height: 1.45;
		color: var(--ink-2);
	}
	.shot-say-ic {
		color: var(--g2);
		padding-top: 2px;
		flex-shrink: 0;
	}
	.shot-say-ic :global(.ic) {
		width: 14px;
		height: 14px;
	}

	.shot-add {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 4px 4px 14px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: var(--surface-2);
	}
	.shot-add:focus-within {
		border-color: var(--g1);
	}
	.shot-add input {
		flex: 1;
		min-width: 0;
		height: 36px;
		padding: 0;
		border: 0;
		outline: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 14px;
	}
	.shot-add input::placeholder {
		color: var(--ink-3);
	}
	.shot-add button {
		flex: none;
		width: 34px;
		height: 34px;
		padding: 0;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 9px;
		background: var(--ink);
		color: var(--bg);
		cursor: pointer;
		transition: opacity 0.2s;
	}
	.shot-add button:disabled {
		opacity: 0.25;
		cursor: default;
	}
	.shot-add button :global(.ic) {
		width: 17px;
		height: 17px;
	}

	.ct-links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.ct-links button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 12px;
		border-radius: 99px;
		border: 1px solid var(--line-strong);
		background: var(--surface);
		color: var(--ink-2);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.ct-links button:hover {
		color: var(--ink);
		border-color: var(--ink-3);
	}
	.ct-links button :global(.ic) {
		width: 14px;
		height: 14px;
	}
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
